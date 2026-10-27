import "@testing-library/jest-dom/vitest"
import { cleanup, configure } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest"
import { Blob as NodeBlob, File as NodeFile } from "node:buffer"
import { FormData as UndiciFormData } from "undici"

import { server } from "@/mocks/server"
import { resetDb } from "@/mocks/db"
import {
  rearmExpiredSession,
  rearmStaleConfig,
  setMockScenario,
} from "@/mocks/scenarios"

// Mock handlers add realistic latency; give async utilities room.
configure({ asyncUtilTimeout: 15000 })

// Fail on unhandled requests so a missing mock handler can never silently
// become a real network call during tests (Frontend Auto.md §10).
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => {
  // Deterministic fixtures: reset mutable handler state between tests.
  resetDb()
  setMockScenario("default")
  rearmStaleConfig()
  rearmExpiredSession()
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

// jsdom lacks matchMedia (used by the theme provider and useIsMobile).
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// jsdom gaps that Radix primitives rely on (menus, selects, dialogs).
if (typeof window !== "undefined") {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
  }
  if (typeof window.ResizeObserver === "undefined") {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => {}
  }
}

// Multipart uploads: Node's fetch (undici) cannot serialize jsdom's File/Blob
// classes (bytes are lost in transit), and jsdom's FormData stringifies Node
// Files. Align the three globals with Node's implementations so the app's
// `new FormData()` + native fetch path works exactly like in a real browser.
// Test-only concern; the browser build uses the platform classes.
globalThis.FormData = UndiciFormData as unknown as typeof FormData
globalThis.Blob = NodeBlob as unknown as typeof Blob
globalThis.File = NodeFile as unknown as typeof File

// Silence the act() warning noise from TanStack Query background refetches
// only when a test forgets to await them; real errors still surface.
const originalError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const first = args[0]
    if (typeof first === "string" && first.includes("not wrapped in act(")) {
      return
    }
    originalError(...(args as []))
  }
})
afterAll(() => {
  console.error = originalError
})
