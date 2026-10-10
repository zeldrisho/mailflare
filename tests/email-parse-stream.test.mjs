import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, test } from "vite-plus/test";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const directory = mkdtempSync(join(root, "node_modules", "mailflare-email-stream-test-"));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

await build({
  stdin: {
    contents: `export { parseRawMime } from "./src/lib/email/parse.ts";`,
    resolveDir: root,
    sourcefile: "email-stream-entry.ts",
  },
  outfile: join(directory, "entry.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  tsconfig: join(root, "tsconfig.json"),
  packages: "external",
  logLevel: "silent",
});

const { parseRawMime } = await import(pathToFileURL(join(directory, "entry.mjs")).href);

const raw = [
  "From: sender@example.test",
  "To: recipient@example.test",
  "Subject: streamed message",
  "Message-ID: <stream@example.test>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="part"',
  "",
  "--part",
  'Content-Type: text/plain; charset="utf-8"',
  "",
  "hello from a stream",
  "--part",
  'Content-Type: text/plain; name="note.txt"',
  'Content-Disposition: attachment; filename="note.txt"',
  "Content-Transfer-Encoding: base64",
  "",
  "YXR0YWNobWVudA==",
  "--part--",
  "",
].join("\r\n");

test("MIME parsing supports streams and matches buffered parsing", async () => {
  const bytes = new TextEncoder().encode(raw);
  const buffered = await parseRawMime(bytes.buffer);

  const streamed = await parseRawMime(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 64));
        controller.enqueue(bytes.subarray(64));
        controller.close();
      },
    }),
  );

  assert.equal(streamed.subject, buffered.subject);
  assert.equal(streamed.text, buffered.text);
  assert.equal(streamed.messageId, buffered.messageId);
  assert.deepEqual(streamed.attachments, buffered.attachments);
});
