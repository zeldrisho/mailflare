import { NextResponse } from "next/server";
import { assertPrimaryAdmin } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/cookies";
import { restoreDatabaseRecords } from "@/lib/backups/export";
import { getEnv } from "@/lib/cloudflare";
import { readFormDataBody } from "@/lib/http/request";
import { RequestBodyTooLargeError } from "@/lib/http/errors";

// Keep multipart parsing and the restore buffer comfortably below the Workers memory ceiling.
const MAX_BACKUP_UPLOAD_BYTES = 32 * 1024 * 1024;

export async function POST(request: Request) {
  const env = getEnv();
  try {
    const user = await requireUser(env, request);
    assertPrimaryAdmin(user);
    const form = await readFormDataBody(request, MAX_BACKUP_UPLOAD_BYTES);
    const file = form.get("backup");
    if (!(file instanceof File))
      return NextResponse.json({ error: "Choose a backup file" }, { status: 400 });
    await restoreDatabaseRecords(env.DB, await file.arrayBuffer());
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to restore backup";

    return NextResponse.json(
      { error: message },
      {
        status: error instanceof RequestBodyTooLargeError ? 413 : 400,
      },
    );
  }
}
