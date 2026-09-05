import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served under /react/ in the published bundle, and at the root in dev.
export default defineConfig(({ command }) => ({
  // Relative, so the built bundle is mountable at any path.
  base: command === "build" ? "./" : "/",
  plugins: [react()],
  build: { outDir: "dist" },
}));
