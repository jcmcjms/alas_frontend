import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    restoreMocks: true,
    testTimeout: 45_000,
    hookTimeout: 45_000,
    // Serial file execution: integration suites are render-heavy and small
    // CI sandboxes oversubscribe badly with parallel workers.
    maxWorkers: 1,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
})
