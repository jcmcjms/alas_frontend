import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The demo-account surface on the login screen is compiled from the same
 * `MOCK_MODE_ENABLED` gate as the rest of the mock layer (vite `define`
 * literal; `.env.test` keeps it off for unit tests). These cases pin both
 * directions of the contract: production builds expose no demo credentials,
 * authorized development builds keep the picker available but secondary.
 */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent, { type UserEvent } from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"

async function renderLoginWithGate(mocksEnabled: boolean) {
  vi.resetModules()
  vi.doMock("@/lib/env", () => ({ MOCK_MODE_ENABLED: mocksEnabled }))
  // Import page AND provider from the same (fresh) module registry so the
  // React context instances match.
  const [{ LoginPage }, { SessionProvider }] = await Promise.all([
    import("@/features/auth/pages/login-page"),
    import("@/features/auth/session-context"),
  ])
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const user: UserEvent = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <LoginPage />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>
  )
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Welcome back" })
    ).toBeInTheDocument()
  )
  return { user }
}

afterEach(() => {
  vi.doUnmock("@/lib/env")
  vi.resetModules()
})

describe("login mock gating", () => {
  it("exposes no demo accounts or credentials when mocks are compiled out", async () => {
    await renderLoginWithGate(false)
    expect(
      screen.queryByRole("button", { name: /development mock accounts/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Passw0rd!/)).not.toBeInTheDocument()
    // The authentication form itself is unaffected by the gate.
    expect(screen.getByLabelText("Username")).toBeInTheDocument()
    expect(screen.getByLabelText(/^Password/)).toBeInTheDocument()
  })

  it("keeps the picker collapsed but available when mocks are enabled", async () => {
    const { user } = await renderLoginWithGate(true)

    // Secondary by default: no demo credentials on screen until expanded.
    expect(screen.queryByText(/Passw0rd!/)).not.toBeInTheDocument()
    const disclosure = screen.getByRole("button", {
      name: /development mock accounts/i,
    })
    expect(disclosure).toHaveAttribute("aria-expanded", "false")

    await user.click(disclosure)
    expect(disclosure).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText(/Passw0rd!/)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "encoder" }))
    expect(screen.getByLabelText("Username")).toHaveValue("encoder")
    expect(screen.getByLabelText(/^Password/)).toHaveValue("Passw0rd!")
  })
})
