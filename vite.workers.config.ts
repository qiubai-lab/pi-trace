import { defineConfig } from "vite";
export default defineConfig({
  build: {
    ssr: true,
    target: "node22",
    outDir: "dist/workers",
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: {
        writer: "src/workers/writer.ts",
        execution: "src/workers/execution.ts",
      },
      output: {
        format: "es",
        entryFileNames: "[name].mjs",
        chunkFileNames: "chunks/[name]-[hash].mjs",
      },
    },
  },
});
