import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, test } from "vite-plus/test";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const directory = mkdtempSync(join(root, "node_modules", "mailflare-worker-utils-test-"));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

await build({
  stdin: {
    contents: `export { getQueueRetryDelaySeconds, isAgentDraftMessage, isInboundQueueMessage, isOutboundQueueMessage, isWebhookRetryMessage } from "./worker-utils.ts";`,
    resolveDir: root,
    sourcefile: "worker-utils-entry.ts",
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

const utils = await import(pathToFileURL(join(directory, "entry.mjs")).href);

test("queue retry delays back off and cap at five minutes", () => {
  assert.equal(utils.getQueueRetryDelaySeconds(0), 10);
  assert.equal(utils.getQueueRetryDelaySeconds(1), 10);
  assert.equal(utils.getQueueRetryDelaySeconds(2), 20);
  assert.equal(utils.getQueueRetryDelaySeconds(20), 300);
});

test("queue payload guards accept only complete supported messages", () => {
  assert.equal(utils.isInboundQueueMessage({ from: "a", to: "b", rawR2Key: "key" }), true);
  assert.equal(utils.isInboundQueueMessage({ from: "a", to: "b" }), false);
  assert.equal(utils.isAgentDraftMessage({ kind: "agent.draft", jobId: "job" }), true);
  assert.equal(utils.isAgentDraftMessage({ kind: "agent.draft", jobId: 5 }), false);
  assert.equal(
    utils.isWebhookRetryMessage({ kind: "webhook.retry", deliveryId: "delivery" }),
    true,
  );
  assert.equal(
    utils.isOutboundQueueMessage({
      kind: "email.scheduled",
      jobId: "job",
      messageId: "message",
      scheduledAt: "now",
    }),
    true,
  );
  assert.equal(utils.isOutboundQueueMessage({ kind: "email.scheduled", jobId: "job" }), false);
});
