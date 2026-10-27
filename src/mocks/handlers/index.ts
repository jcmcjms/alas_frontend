import { http, HttpResponse } from "msw"

import { getMockScenario } from "../scenarios"
import { accountHandlers } from "./account.handlers"
import { adminHandlers } from "./admin.handlers"
import { authHandlers } from "./auth.handlers"
import { cisHandlers } from "./cis.handlers"
import { dashboardHandlers } from "./dashboard.handlers"
import { deskHandlers } from "./desk.handlers"
import { loansHandlers } from "./loans.handlers"
import { notificationHandlers } from "./notifications.handlers"
import { workflowActionHandlers } from "./workflow-actions.handlers"
import { workflowConfigHandlers } from "./workflow-config.handlers"

/**
 * Scenario gate: evaluated per request so scenarios can be switched at runtime
 * (dev tools / tests) without re-registering handlers. Returning `undefined`
 * falls through to the real handlers below (NOT passthrough(), which would
 * hit the actual network).
 */
const scenarioGate = http.all("*/api/*", () => {
  if (getMockScenario() === "network-error") {
    // Simulates a hard network failure (fetch rejects with TypeError).
    return HttpResponse.error()
  }
  return undefined
})

// Order matters: more specific paths are registered before generic ones.
export const handlers = [
  scenarioGate,
  ...authHandlers,
  ...cisHandlers,
  ...deskHandlers,
  ...workflowConfigHandlers,
  ...workflowActionHandlers,
  ...loansHandlers,
  ...adminHandlers,
  ...accountHandlers,
  ...notificationHandlers,
  ...dashboardHandlers,
]
