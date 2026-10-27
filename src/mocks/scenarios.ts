/**
 * Deterministic mock scenarios (spec §11). A scenario changes how the mock API
 * responds so failure states can be exercised deliberately in development and
 * in tests.
 *
 * - Development: set `localStorage["alas.mock.scenario"]` before load, or call
 *   `window.__alasMock.setScenario("network-error")` at runtime.
 * - Tests: import { setMockScenario } and reset to "default" after the test,
 *   or use per-test `server.use(...)` overrides for finer control.
 */
export type MockScenario =
  /** Normal operation with success and honest failure paths. */
  | "default"
  /** Every API call fails at the network layer. */
  | "network-error"
  /** Every API call takes ~2.5s (loading skeletons, timeouts). */
  | "slow"
  /** Desk queues return no bundles. */
  | "empty-queue"
  /** Every claim attempt collides with another officer (409). */
  | "claim-conflict"
  /** The next workflow-configuration save fails with a stale-version 409 once. */
  | "workflow-stale"
  /** Workflow decision mutations fail with 500. */
  | "mutation-failure"
  /** The next session check fails with 401 (expired session). */
  | "expired-session"

const STORAGE_KEY = "alas.mock.scenario"

let scenario: MockScenario = "default"
let initialized = false

const SCENARIOS: MockScenario[] = [
  "default",
  "network-error",
  "slow",
  "empty-queue",
  "claim-conflict",
  "workflow-stale",
  "mutation-failure",
  "expired-session",
]

function isScenario(value: unknown): value is MockScenario {
  return typeof value === "string" && (SCENARIOS as string[]).includes(value)
}

function initialize(): void {
  if (initialized) return
  initialized = true
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isScenario(stored)) scenario = stored
  }
}

export function getMockScenario(): MockScenario {
  initialize()
  return scenario
}

export function setMockScenario(next: MockScenario): void {
  initialized = true
  scenario = next
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, next)
  }
}

export function listMockScenarios(): MockScenario[] {
  return [...SCENARIOS]
}

/** One-shot flag consumed by the workflow-stale scenario. */
let staleConfigArmed = true
export function consumeStaleConfig(): boolean {
  const armed = staleConfigArmed
  staleConfigArmed = false
  return armed
}
export function rearmStaleConfig(): void {
  staleConfigArmed = true
}

/** One-shot flag consumed by the expired-session scenario. */
let expiredSessionArmed = true
export function consumeExpiredSession(): boolean {
  const armed = expiredSessionArmed
  expiredSessionArmed = false
  return armed
}
export function rearmExpiredSession(): void {
  expiredSessionArmed = true
}
