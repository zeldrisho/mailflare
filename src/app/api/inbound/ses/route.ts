import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/cloudflare";
import { requireAwsConfig } from "@/lib/aws/config";
import { deleteObject, getObject } from "@/lib/aws/s3";
import { getSesReceivingState, SES_OBJECT_PREFIX } from "@/lib/aws/ses-receiving";
import { intakeProviderMail } from "@/lib/email/provider-intake";
import { parseSesNotification, safeEqual, type SnsEnvelope } from "@/lib/aws/ses-notification";
import { readBoundedBody } from "@/lib/http/request";
import { RequestBodyTooLargeError } from "@/lib/http/errors";

export const dynamic = "force-dynamic";

const snsEnvelopeSchema = z.object({
  Type: z.string().optional(),
  TopicArn: z.string().optional(),
  Message: z.string().optional(),
  SubscribeURL: z.string().optional(),
});

/**
 * Amazon SNS endpoint for SES inbound mail. SNS posts JSON as text/plain.
 * Trust comes from three things rather than SNS's certificate signature: the
 * secret token in the URL that only the subscription we created knows, the topic
 * ARN matching ours, and the message itself being read from our own S3 bucket
 * with our credentials, so a forged notification cannot inject content.
 */
export async function POST(request: Request) {
  const env = getEnv();
  const state = await getSesReceivingState(env);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!state || !safeEqual(token, state.token))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let envelope: SnsEnvelope;
  try {
    const body = await readBoundedBody(request, 1024 * 1024);
    envelope = snsEnvelopeSchema.parse(JSON.parse(new TextDecoder().decode(body)));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof RequestBodyTooLargeError ? "Request body is too large" : "Invalid body",
      },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }
  if (envelope.TopicArn !== state.topicArn)
    return NextResponse.json({ error: "Unknown topic" }, { status: 403 });

  if (envelope.Type === "SubscriptionConfirmation") {
    let url: URL | null = null;
    try {
      url = envelope.SubscribeURL ? new URL(envelope.SubscribeURL) : null;
    } catch {
      return NextResponse.json({ error: "Invalid subscription URL" }, { status: 400 });
    }
    if (
      !url ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      !/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(url.hostname)
    ) {
      return NextResponse.json({ error: "Invalid subscription URL" }, { status: 400 });
    }

    const confirmed = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });

    return NextResponse.json({ confirmed: confirmed.ok }, { status: confirmed.ok ? 200 : 502 });
  }
  if (envelope.Type !== "Notification") return NextResponse.json({ ignored: true });

  const notification = parseSesNotification(envelope.Message ?? "");
  if (!notification) return NextResponse.json({ ignored: true });
  if (notification.bucket !== state.bucket || !notification.key.startsWith(SES_OBJECT_PREFIX)) {
    return NextResponse.json({ error: "Unexpected object" }, { status: 400 });
  }

  const config = await requireAwsConfig(env);
  if (notification.virusFailed) {
    await deleteObject(config, state.bucket, notification.key);
    return NextResponse.json({ dropped: "Message failed the virus scan" });
  }
  const raw = await getObject(config, state.bucket, notification.key);
  const result = await intakeProviderMail(env, {
    from: notification.from,
    recipients: notification.recipients,
    raw,
    headers: notification.headers,
  });
  // Only after intake succeeded: a failure above returns 500 so SNS retries with the object intact.
  await deleteObject(config, state.bucket, notification.key);
  return NextResponse.json(result);
}
