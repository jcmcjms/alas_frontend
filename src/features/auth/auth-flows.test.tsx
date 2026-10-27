import { describe, expect, it } from "vitest"
import { screen, waitFor } from "@testing-library/react"

import { renderApp, signInAs, DEMO_PASSWORD } from "@/test/test-utils"
import { queryKeys } from "@/lib/query/keys"

describe("authentication flow", () => {
  it("signs in an encoder and lands on the dashboard", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")

    // Role-specific dashboard content for the Encoder.
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument()
    expect(await screen.findByText(/Returned to me/i)).toBeInTheDocument()
    // Sidebar shows the signed-in user (footer + user menu).
    expect(screen.getAllByText("Ana Reyes").length).toBeGreaterThan(0)
  })

  it("rejects a wrong password with an in-screen error and preserves input", async () => {
    const app = renderApp("/login")
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Sign in" })
      ).toBeInTheDocument()
    )

    await app.user.type(screen.getByLabelText("Username"), "encoder")
    await app.user.type(screen.getByLabelText(/^Password/), "WrongPass1!")
    await app.user.click(screen.getByRole("button", { name: /sign in/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /username or password is incorrect/i
    )
    // Input is preserved after the failed attempt.
    expect(screen.getByLabelText("Username")).toHaveValue("encoder")
    expect(screen.getByLabelText(/^Password/)).toHaveValue("WrongPass1!")
  })

  it("blocks a suspended account with a clear message", async () => {
    const app = renderApp("/login")
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Sign in" })
      ).toBeInTheDocument()
    )
    await app.user.type(screen.getByLabelText("Username"), "l.tan")
    await app.user.type(screen.getByLabelText(/^Password/), DEMO_PASSWORD)
    await app.user.click(screen.getByRole("button", { name: /sign in/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/suspended/i)
  })

  it("redirects unauthenticated visitors from protected routes to /login", async () => {
    const app = renderApp("/review-desk")
    // Guard bounces to the login screen while the restore attempt fails.
    expect(
      await screen.findByRole("heading", { name: "Sign in" })
    ).toBeInTheDocument()
    expect(app.router.state.location.pathname).toBe("/login")
  })

  it("hides review desks and admin areas from encoders (permission-aware nav)", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")

    // Encoder navigation offers loans + monitoring but no desks or admin.
    expect(
      await screen.findByRole("link", { name: /new application/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: /review desk/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: /workflow settings/i })
    ).not.toBeInTheDocument()
  })

  it("denies direct URL access to admin screens with an access-denied state", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/admin/users")

    expect(await screen.findByRole("alert")).toHaveTextContent(/access denied/i)
    // And the backend agrees — this is not just a hidden button.
    expect(screen.getByText(/enforces this independently/i)).toBeInTheDocument()
  })

  it("shows the review desk to reviewers", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "evaluator")

    expect(
      await screen.findByRole("link", { name: /review desk/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: /new application/i })
    ).not.toBeInTheDocument()
  })
})

describe("session lifecycle & cache isolation", () => {
  it("clears user-specific cache on logout so the next user never sees stale data", async () => {
    const app = renderApp("/login")

    // --- first user loads account data into the cache
    await signInAs(app.user, "encoder")
    app.router.navigate("/account")
    expect(await screen.findByText("ana.reyes@alas.mock")).toBeInTheDocument()
    expect(app.queryClient.getQueryData(queryKeys.account.profile)).toBeTruthy()

    // --- log out through the user menu
    await app.user.click(screen.getByRole("button", { name: /account menu/i }))
    await app.user.click(
      await screen.findByRole("menuitem", { name: /sign out/i })
    )

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Sign in" })
      ).toBeInTheDocument()
    )
    // Cache fully cleared: no account profile left behind.
    expect(
      app.queryClient.getQueryData(queryKeys.account.profile)
    ).toBeUndefined()
    expect(app.queryClient.getQueryCache().getAll()).toHaveLength(0)

    // --- second user signs in on the same client
    await signInAs(app.user, "evaluator")
    app.router.navigate("/account")

    // The evaluator sees only their own data — never the encoder's.
    expect(
      await screen.findByText("maria.domingo@alas.mock")
    ).toBeInTheDocument()
    expect(screen.queryByText("ana.reyes@alas.mock")).not.toBeInTheDocument()
  })

  it("treats a 401 mid-session as an expired session and returns to login", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")

    // Simulate the server revoking the token: the next authorized call 401s.
    // The API client's unauthorized handler must end the session and clear the cache.
    app.queryClient.clear()
    const { apiClient, setAuthTokenProvider } =
      await import("@/lib/api/api-client")
    setAuthTokenProvider(() => "revoked-token")
    await expect(apiClient.get("/api/account/me")).rejects.toMatchObject({
      status: 401,
    })

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Sign in" })
      ).toBeInTheDocument()
    )
    // The login screen explains the expired session (role=status banner).
    expect(await screen.findByRole("status")).toHaveTextContent(
      /session expired/i
    )
  })
})
