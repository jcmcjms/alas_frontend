import { setupWorker } from "msw/browser"

import { handlers } from "./handlers"
import {
  getMockScenario,
  listMockScenarios,
  setMockScenario,
} from "./scenarios"
import { resetDb } from "./db"

export const worker = setupWorker(...handlers)

declare global {
  interface Window {
    __alasMock?: {
      scenarios: ReturnType<typeof listMockScenarios>
      current: () => string
      setScenario: typeof setMockScenario
      resetDb: typeof resetDb
    }
  }
}

/**
 * Dev-only control surface. In a production build this module is never
 * imported (main.tsx guards with import.meta.env.DEV && VITE_ENABLE_MOCK_API).
 */
export function exposeMockControls(): void {
  window.__alasMock = {
    scenarios: listMockScenarios(),
    current: getMockScenario,
    setScenario: setMockScenario,
    resetDb,
  }
  console.info(
    `[ALAS mock] scenario="${getMockScenario()}". Switch with __alasMock.setScenario("network-error"); reset data with __alasMock.resetDb().`
  )
}
