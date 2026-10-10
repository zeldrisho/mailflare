import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/cloudflare";
import { getEmailAddress, getEmailAddressList } from "@/lib/email/address";
import { getResendApiKey } from "@/lib/email/outbound-provider";
import { intakeProviderMail } from "@/lib/email/provider-intake";
import { getReceivedEmail } from "@/lib/email/resend-api";
import { verifySvixSignature } from "@/lib/email/svix";
import { getResendWebhookSecret } from "@/lib/domains/resend-receiving";
import { readBoundedBody, readBoundedStream } from "@/lib/http/request";
import { RequestBodyTooLargeError } from "@/lib/http/errors";

export const dynamic = "force-dynamic";

const receivedEventSchema = z.object({
  type: z.string().optional(),
  data: z.object({ email_id: z.string().optional(), id: z.string().optional() }).optional(),
});

/**
 * Resend's `email.received` webhook. The event only names the message, so fetch
 * it, download the raw MIME and run it through the normal intake. Authenticated
 * by the Svix signature of the secret Resend returned when the webhook was created.
 */
export async function POST(request: Request) {
  const env = getEnv();
  const secret = await getResendWebhookSecret(env);
  if (!secret)
    return NextResponse.json({ error: "Resend receiving is not set up" }, { status: 503 });
  let body: string;

  try {
    body = new TextDecoder().decode(await readBoundedBody(request, 64 * 1024));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof RequestBodyTooLargeError ? "Webhook body is too large" : "Invalid body",
      },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }

  const valid = await verifySvixSignature(
    secret,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    body,
  );
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let event: z.infer<typeof receivedEventSchema>;

  try {
    event = receivedEventSchema.parse(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (event.type !== "email.received") return NextResponse.json({ ignored: true });
  const emailId = event.data?.email_id ?? event.data?.id;
  if (!emailId) return NextResponse.json({ error: "Missing email id" }, { status: 400 });

  const apiKey = await getResendApiKey(env);
  const email = await getReceivedEmail(apiKey, emailId);
  const download = email.raw?.download_url;
  if (!download)
    return NextResponse.json({ error: "Resend did not provide the raw message" }, { status: 502 });
  const rawResponse = await fetch(download, { signal: AbortSignal.timeout(20_000) });

  if (!rawResponse.ok)
    return NextResponse.json({ error: "Could not download the raw message" }, { status: 502 });

  let raw: ArrayBuffer;

  try {
    raw = await readBoundedStream(rawResponse.body, 25 * 1024 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      return NextResponse.json(
        { error: "Downloaded message exceeds the 25 MiB receiving limit" },
        { status: 502 },
      );
    throw error;
  }

  const recipients = [...(email.to ?? []), ...(email.cc ?? []), ...(email.bcc ?? [])].flatMap(
    (value) => getEmailAddressList(value),
  );
  const result = await intakeProviderMail(env, {
    from: getEmailAddress(email.from),
    recipients,
    raw,
  });
  return NextResponse.json(result);
}
