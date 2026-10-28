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
        screen.getByRole("heading", { name: "Welcome back" })
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
        screen.getByRole("heading", { name: "Welcome back" })
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
      await screen.findByRole("heading", { name: "Welcome back" })
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
        screen.getByRole("heading", { name: "Welcome back" })
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
        screen.getByRole("heading", { name: "Welcome back" })
      ).toBeInTheDocument()
    )
    // The login screen explains the expired session (role=status banner).
    expect(await screen.findByRole("status")).toHaveTextContent(
      /session expired/i
    )
  })

  it("transparently retries once after a single-flight token refresh", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/account")
    await screen.findByText("ana.reyes@alas.mock")

    // The access token expires server-side: the NEXT call 401s once, then the
    // client must refresh (single flight) and replay — no session loss.
    const { server } = await import("@/mocks/server")
    const { http, HttpResponse } = await import("msw")
    let forced = false
    server.use(
      http.get("*/api/account/me", () => {
        if (!forced) {
          forced = true
          return HttpResponse.json(
            { title: "Unauthorized", detail: "Access token expired." },
            { status: 401 }
          )
        }
        return undefined // fall through to the real handler on replay
      })
    )

    // A refetch survives the 401 without landing on the login screen.
    await app.queryClient.refetchQueries({ queryKey: ["account", "profile"] })
    await waitFor(() =>
      expect(screen.getByText("ana.reyes@alas.mock")).toBeInTheDocument()
    )
    expect(
      screen.queryByRole("heading", { name: "Welcome back" })
    ).not.toBeInTheDocument()
  })

  it("ends the session when BOTH access and refresh are rejected", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")

    const { server } = await import("@/mocks/server")
    const { http, HttpResponse } = await import("msw")
    server.use(
      http.post("*/api/auth/refresh", () =>
        HttpResponse.json({ title: "Session expired" }, { status: 401 })
      )
    )

    const { apiClient, setAuthTokenProvider } =
      await import("@/lib/api/api-client")
    setAuthTokenProvider(() => "revoked-token")
    await expect(apiClient.get("/api/account/me")).rejects.toMatchObject({
      status: 401,
    })

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Welcome back" })
      ).toBeInTheDocument()
    )
    expect(await screen.findByRole("status")).toHaveTextContent(
      /session expired/i
    )
  })

  it("identity switch with a request in flight never surfaces the old user's data", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")

    // Slow responses so the profile request is still in flight at logout.
    const { setMockScenario } = await import("@/mocks/scenarios")
    setMockScenario("slow")
    app.router.navigate("/account")
    await new Promise((resolve) => setTimeout(resolve, 300))

    // Log out mid-flight: in-flight queries are cancelled, cache cleared.
    await app.user.click(screen.getByRole("button", { name: /account menu/i }))
    await app.user.click(
      await screen.findByRole("menuitem", { name: /sign out/i })
    )
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument()
    )
    setMockScenario("default")

    // Second user signs in; the first user's data must never render, and the
    // late in-flight response cannot repopulate the cleared cache.
    await signInAs(app.user, "evaluator")
    app.router.navigate("/account")
    expect(await screen.findByText("maria.domingo@alas.mock")).toBeInTheDocument()
    expect(screen.queryByText("ana.reyes@alas.mock")).not.toBeInTheDocument()
    // The cache holds ONLY the second user's profile — the cancelled in-flight
    // response for user A never landed.
    await waitFor(() => {
      const cached = app.queryClient.getQueryData<{ email: string }>([
        "account",
        "profile",
      ])
      expect(cached?.email).toBe("maria.domingo@alas.mock")
    })
  })
})

describe("login screen contract", () => {
  it("presents Enterprise Bank branding and the application identity", async () => {
    renderApp("/login")
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Welcome back" })
      ).toBeInTheDocument()
    )
    // Logo appears in the desktop brand panel and the compact mobile header.
    expect(screen.getAllByAltText("Enterprise Bank").length).toBeGreaterThan(0)
    expect(
      screen.getAllByText("Automated Loan Application System").length
    ).toBeGreaterThan(0)
    expect(screen.getByText("Authorized personnel only.")).toBeInTheDocument()
  })

  it("toggles password visibility through an accessible, tab-reachable control", async () => {
    const app = renderApp("/login")
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Welcome back" })
      ).toBeInTheDocument()
    )
    const password = screen.getByLabelText(/^Password/)
    await app.user.type(password, DEMO_PASSWORD)

    const show = screen.getByRole("button", { name: "Show password" })
    // The toggle stays in the tab order (no negative tabindex).
    expect(show.tabIndex).toBeGreaterThanOrEqual(0)
    expect(password).toHaveAttribute("type", "password")

    await app.user.click(show)
    expect(password).toHaveAttribute("type", "text")
    expect(password).toHaveValue(DEMO_PASSWORD)
    await app.user.click(screen.getByRole("button", { name: "Hide password" }))
    expect(password).toHaveAttribute("type", "password")
  })

  it("validates empty fields with per-field errors", async () => {
    const app = renderApp("/login")
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Welcome back" })
      ).toBeInTheDocument()
    )
    await app.user.click(screen.getByRole("button", { name: /^sign in$/i }))

    const alerts = await screen.findAllByRole("alert")
    const messages = alerts.map((node) => node.textContent).join(" ")
    expect(messages).toMatch(/username is required/i)
    expect(messages).toMatch(/password is required/i)
    expect(screen.getByLabelText("Username")).toHaveAttribute(
      "aria-invalid",
      "true"
    )
  })

  it("keeps the forgot-password route linked from the password field", async () => {
    renderApp("/login")
    const link = await screen.findByRole("link", { name: /forgot password/i })
    expect(link).toHaveAttribute("href", "/forgot-password")
  })

  it("shows signing progress and blocks duplicate submission", async () => {
    const app = renderApp("/login")
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Welcome back" })
      ).toBeInTheDocument()
    )
    const { setMockScenario } = await import("@/mocks/scenarios")
    setMockScenario("slow")
    try {
      await app.user.type(screen.getByLabelText("Username"), "encoder")
      await app.user.type(screen.getByLabelText(/^Password/), DEMO_PASSWORD)
      await app.user.click(screen.getByRole("button", { name: /^sign in$/i }))

      const busy = await screen.findByRole("button", { name: /signing in/i })
      expect(busy).toBeDisabled()
      // A disabled submit cannot fire a second request while in flight.
      await app.user.click(busy)
      expect(screen.getAllByRole("button", { name: /signing in/i })).toHaveLength(1)

      // The slow login still completes and lands on the dashboard.
      expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument()
    } finally {
      setMockScenario("default")
    }
  })

  it("walks the expected keyboard order through the form", async () => {
    const app = renderApp("/login")
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Welcome back" })
      ).toBeInTheDocument()
    )
    expect(screen.getByLabelText("Username")).toHaveFocus()
    await app.user.tab()
    expect(screen.getByLabelText(/^Password/)).toHaveFocus()
    await app.user.tab()
    expect(screen.getByRole("button", { name: "Show password" })).toHaveFocus()
    await app.user.tab()
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveFocus()
    await app.user.tab()
    expect(screen.getByRole("button", { name: /^sign in$/i })).toHaveFocus()
  })

  it("redirects authenticated users away from the login route", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/login")
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "Welcome back" })
    ).not.toBeInTheDocument()
  })

  it("sends mustChangePassword accounts straight to the change flow", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "newhire")
    expect(app.router.state.location.pathname).toBe("/change-password")
  })
})
