import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, test } from "vite-plus/test";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const directory = mkdtempSync(join(root, "node_modules", "mailflare-bounded-body-test-"));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

await build({
  stdin: {
    contents: `export { readBoundedBody, readBoundedStream, readFormDataBody, readJsonBody } from "./src/lib/http/request.ts";`,
    resolveDir: root,
    sourcefile: "bounded-body-entry.ts",
  },
  outfile: join(directory, "entry.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  tsconfig: join(root, "tsconfig.json"),
  logLevel: "silent",
});

const { readBoundedBody, readBoundedStream, readFormDataBody, readJsonBody } = await import(
  pathToFileURL(join(directory, "entry.mjs")).href
);

test("bounded body accepts a body exactly at the configured limit", async () => {
  const body = await readBoundedBody(
    new Request("https://example.test", { method: "POST", body: "1234" }),
    4,
  );

  assert.equal(new TextDecoder().decode(body), "1234");
});

test("bounded body rejects an oversized streamed body without Content-Length", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("1234"));
        controller.enqueue(new TextEncoder().encode("5"));
        controller.close();
      },
    }),
    duplex: "half",
  });

  await assert.rejects(readBoundedBody(request, 4), /too large/);
});

test("multipart parsing is bounded and retains valid fields", async () => {
  const form = new FormData();
  form.set("field", "value");
  const request = new Request("https://example.test", { method: "POST", body: form });
  assert.equal((await readFormDataBody(request, 1_000)).get("field"), "value");

  const oversized = new Request("https://example.test", {
    method: "POST",
    body: new FormData(),
  });

  await assert.rejects(readFormDataBody(oversized, 1), /too large/);
});

test("bounded stream accepts null and rejects oversized upstream responses", async () => {
  assert.equal((await readBoundedStream(null, 10)).byteLength, 0);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(5));
      controller.close();
    },
  });

  await assert.rejects(readBoundedStream(stream, 4), /too large/);
});

test("bounded JSON reader applies the default API body limit", async () => {
  const oversized = JSON.stringify({ value: "x".repeat(1024 * 1024) });
  await assert.rejects(
    readJsonBody(new Request("https://example.test", { method: "POST", body: oversized })),
    /too large/,
  );
});

test("bounded JSON reader parses valid JSON and enforces actual byte size", async () => {
  assert.deepEqual(
    await readJsonBody(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({ ok: true }),
      }),
      32,
    ),
    { ok: true },
  );
  await assert.rejects(
    readJsonBody(
      new Request("https://example.test", {
        method: "POST",
        body: '{"long":"value"}',
      }),
      4,
    ),
    /too large/,
  );
});
