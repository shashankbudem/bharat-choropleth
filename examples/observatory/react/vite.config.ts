import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served under /react/ in the published bundle, and at the root in dev.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/react/" : "/",
  plugins: [react()],
  build: { outDir: "dist" },
}));
