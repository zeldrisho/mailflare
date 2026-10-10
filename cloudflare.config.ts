import { bindings, defineConfig, exports, triggers } from "cf/config";

export default defineConfig({
  worker: {
    name: "mailflare",
    compatibilityDate: "2026-05-20",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    entrypoint: "./worker.ts",
    observability: {
      enabled: true,
      logs: { headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
    assets: { notFoundHandling: "none" },
    exports: {
      RealtimeHub: exports.durableObject({ storage: "sqlite" }),
    },
    triggers: [
      triggers.scheduled({ schedule: "0 2 * * *" }),
      triggers.scheduled({ schedule: "*/5 * * * *" }),
      triggers.queue({
        deadLetterQueue: "mailflare-inbound-dlq",
        maxBatchSize: 5,
        maxRetries: 3,
        name: "mailflare-inbound",
      }),
      triggers.queue({
        deadLetterQueue: "mailflare-outbound-dlq",
        maxBatchSize: 5,
        maxRetries: 3,
        name: "mailflare-outbound",
      }),
      triggers.queue({
        deadLetterQueue: "mailflare-agent-dlq",
        maxBatchSize: 1,
        maxRetries: 3,
        name: "mailflare-agent",
      }),
    ],
    env: {
      DB: bindings.d1({ name: "mailflare" }),
      BUCKET: bindings.r2({ name: "mailflare-raw" }),
      EMAIL: bindings.sendEmail({ dev: { remote: false } }),
      INBOUND_QUEUE: bindings.queue({ name: "mailflare-inbound" }),
      OUTBOUND_QUEUE: bindings.queue({ name: "mailflare-outbound" }),
      AGENT_QUEUE: bindings.queue({ name: "mailflare-agent" }),
      WORKER_SELF_REFERENCE: bindings.worker({ worker: "mailflare" }),
      REALTIME: bindings.durableObject({
        worker: "mailflare",
        exportName: "RealtimeHub",
      }),
      AI: bindings.ai({ dev: { remote: true } }),
      IMAGES: bindings.images({}),
      LOGIN_RATE_LIMIT: bindings.rateLimit({
        namespace: "1001",
        simple: { limit: 20, period: 60 },
      }),
      AGENT_RATE_LIMIT: bindings.rateLimit({
        namespace: "1002",
        simple: { limit: 120, period: 60 },
      }),
      ASSETS: bindings.assets(),
    },
  },
});
