import { bindings, defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "mailflare-email-relay",
    compatibilityDate: "2026-05-20",
    entrypoint: "src/index.ts",
    observability: {
      enabled: true,
    },
    env: {
      MAILFLARE_URL: bindings.secret(),
      INBOUND_WEBHOOK_SECRET: bindings.secret(),
    },
  },
});
