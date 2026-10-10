import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs"],
    environment: "node",
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
  },
});
