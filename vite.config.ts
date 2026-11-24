import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Le site entier est compilé en UN seul fichier index.html (JS + CSS intégrés).
export default defineConfig({
  root: "client",
  plugins: [react(), viteSingleFile()],
  build: { outDir: "../dist", emptyOutDir: true, assetsInlineLimit: 100000000, chunkSizeWarningLimit: 5000 },
  server: { proxy: { "/api": "http://localhost:8888" } },
});
