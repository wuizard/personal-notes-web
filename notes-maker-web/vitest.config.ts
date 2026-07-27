import {defineConfig} from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // Registers a fake IndexedDB on globalThis before any module imports Dexie.
    setupFiles: ["fake-indexeddb/auto"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: { "@": path.join(import.meta.dirname, "src") },
  },
});
