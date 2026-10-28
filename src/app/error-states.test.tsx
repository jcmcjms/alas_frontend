import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"

import { renderApp, signInAs } from "@/test/test-utils"
import { setMockScenario } from "@/mocks/scenarios"
import { ApiError } from "@/lib/api/api-error"
import { apiClient } from "@/lib/api/api-client"

/**
 * Failure and edge states (spec §11/§15): network failure, missing resources,
 * forbidden calls, and the guarantee that failures never fall back to mock or
 * cached data silently.
 */
describe("application error states", () => {
  it("reports a network failure at login without leaking internals", async () => {
    const app = renderApp("/login")
    setMockScenario("network-error")

    await screen.findByRole("heading", { name: "Welcome back" })
    await app.user.type(screen.getByLabelText("Username"), "encoder")
    await app.user.type(screen.getByLabelText(/^Password/), "Passw0rd!")
    await app.user.click(screen.getByRole("button", { name: /sign in/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /cannot reach the server/i
    )
    // No stack traces or server internals leak into the UI.
    expect(screen.queryByText(/fetch failed/i)).not.toBeInTheDocument()
    setMockScenario("default")
  })

  it("shows a not-found state for a missing application", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/loans/999999")

    expect(
      await screen.findByText(/couldn't load this application/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/no application matches/i)).toBeInTheDocument()
  })

  it("enforces forbidden API calls even for signed-in users", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")

    // Encoders cannot list users — the server says 403 regardless of the UI.
    let caught: unknown = null
    try {
      await apiClient.get("/api/users")
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(403)
  })

  it("keeps production failures real: no silent mock fallback", async () => {
    // The browser worker is never started in production builds (main.tsx
    // guards on DEV && VITE_ENABLE_MOCK_API). This test asserts the guard's
    // configuration contract: the test environment flag disables mocking.
    expect(import.meta.env.VITE_ENABLE_MOCK_API).toBe("false")
    // And an unauthenticated call fails for real — no cached/mock substitute.
    await expect(apiClient.get("/api/account/me")).rejects.toBeInstanceOf(
      ApiError
    )
  })

  it("recovers when the network returns and the user retries", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "recommender")

    setMockScenario("network-error")
    app.router.navigate("/review-desk")
    expect(
      await screen.findByText(/couldn't load your desk/i)
    ).toBeInTheDocument()

    setMockScenario("default")
    await app.user.click(screen.getByRole("button", { name: /try again/i }))
    expect(
      await screen.findByRole("heading", { name: /recommendation desk/i })
    ).toBeInTheDocument()
  })
})
