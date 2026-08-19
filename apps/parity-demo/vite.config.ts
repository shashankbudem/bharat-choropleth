import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Served from a subdirectory of the static repo server, alongside the other
  // two demos, so the built asset URLs have to be relative.
  base: "./",
});
