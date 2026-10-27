import { rmSync } from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { loadEnv } from "vite"
import { defineConfig, type Plugin } from "vitest/config"

/**
 * The MSW service worker is a development artifact. Production builds must
 * not ship it; development-mode builds (the E2E artifact) need it.
 */
function excludeMockServiceWorker(): Plugin {
  let mode = ""
  let outDir = "dist"
  return {
    name: "alas:exclude-mock-service-worker",
    apply: "build",
    configResolved(config) {
      mode = config.mode
      outDir = config.build.outDir
    },
    generateBundle(_options, bundle) {
      if (mode === "development") return
      for (const key of Object.keys(bundle)) {
        if (key.endsWith("mockServiceWorker.js")) {
          delete bundle[key]
        }
      }
    },
    closeBundle() {
      // publicDir is copied after generateBundle in Vite 8: unlink the worker
      // from the output directory for production builds.
      if (mode === "development") return
      rmSync(resolve(outDir, "mockServiceWorker.js"), { force: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Compile-time gate for ALL mock code. `define` inlines a literal, so the
  // production build dead-code-eliminates the dynamic mock imports (no mock
  // chunks on disk at all), while dev/test/E2E builds keep them.
  const mocksEnabled =
    (mode === "development" || mode === "test") &&
    loadEnv(mode, process.cwd(), "VITE_").VITE_ENABLE_MOCK_API === "true"

  return {
    define: {
      __ALAS_MOCKS__: JSON.stringify(mocksEnabled),
    },
    plugins: [react(), tailwindcss(), excludeMockServiceWorker()],
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
  }
})
