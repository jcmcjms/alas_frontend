import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./app/app"

// Compile-time literal from vite `define`: in production builds this branch
// (and therefore every mock module) is eliminated at bundle time.
declare const __ALAS_MOCKS__: boolean

async function prepareApp() {
  // Mock mode is DEVELOPMENT ONLY and explicitly configured. A production
  // build never imports the mock modules and never falls back to mock data:
  // real API failures stay real errors (spec §11).
  const shouldMock = __ALAS_MOCKS__

  if (shouldMock) {
    const { worker, exposeMockControls } = await import("./mocks/browser")
    await worker.start({
      onUnhandledRequest: "warn",
      // Dev-only: Firefox re-checks the worker script on every navigation
      // (updateViaCache: "none" is MSW's default) and can stall full-page
      // reloads in dev. Caching the worker script per session keeps reloads
      // responsive; edits to mockServiceWorker.js still apply on a manual
      // unregister or browser restart.
      serviceWorker: { options: { updateViaCache: "all" } },
    })
    exposeMockControls()
  }

  const rootElement = document.getElementById("root")
  if (!rootElement) {
    throw new Error("Root element was not found.")
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void prepareApp()
