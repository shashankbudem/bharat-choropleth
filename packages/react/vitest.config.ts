import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // .ts as well as .tsx: the shared small-region geometry is plain TypeScript,
    // copied verbatim from the DOM package so the two cannot drift.
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
