import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./app/app"

async function prepareApp() {
  // Mock mode is DEVELOPMENT ONLY and explicitly configured. A production
  // build never imports the mock modules and never falls back to mock data:
  // real API failures stay real errors (spec §11).
  const shouldMock =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK_API === "true"

  if (shouldMock) {
    const { worker, exposeMockControls } = await import("./mocks/browser")
    await worker.start({ onUnhandledRequest: "warn" })
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
