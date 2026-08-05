import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    outDir: "dist/client",
    // Keep the large, independently versioned recipe catalogue out of the UI
    // chunk. This preserves the synchronous data API while allowing browsers to
    // cache catalogue changes separately from application-code changes.
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.endsWith("/src/data/recettes-anti-inflammatoires.json")) return "catalogue";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
  plugins: [react()],
});
