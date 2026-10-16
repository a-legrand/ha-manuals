import { defineConfig } from "vite";

// Builds the panel and the card straight into the integration so HACS ships
// them as-is. Shared code (Lit) goes into a hashed chunk next to them, loaded
// through relative ES imports.
export default defineConfig({
  build: {
    outDir: "../custom_components/manuals/frontend",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        "manuals-panel": "src/manuals-panel.ts",
        "manuals-card": "src/manuals-card.ts",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
      preserveEntrySignatures: "strict",
    },
  },
});
