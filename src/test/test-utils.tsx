import {
  render,
  screen,
  waitFor,
  type RenderResult,
} from "@testing-library/react"
import userEvent, { type UserEvent } from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryRouter, RouterProvider } from "react-router-dom"

import { routes } from "@/app/routes/router"
import { SessionProvider } from "@/features/auth/session-context"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

export interface TestApp extends RenderResult {
  queryClient: QueryClient
  user: UserEvent
  router: ReturnType<typeof createMemoryRouter>
}

/**
 * Mount the real application (same routes, guards, providers) on a memory
 * router with a per-test QueryClient. Retries disabled for deterministic tests.
 */
export function renderApp(
  initialRoute = "/",
  queryClient?: QueryClient
): TestApp {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    })
  const router = createMemoryRouter(routes, { initialEntries: [initialRoute] })

  const result = render(
    <ThemeProvider defaultTheme="light" storageKey="test-theme">
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <SessionProvider>
            <RouterProvider router={router} />
            <Toaster />
          </SessionProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )

  return { ...result, queryClient: client, user: userEvent.setup(), router }
}

export const DEMO_PASSWORD = "Passw0rd!"

/** Complete the login form flow; waits until the app leaves the login screen. */
export async function signInAs(
  user: UserEvent,
  username: string,
  password = DEMO_PASSWORD
) {
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument()
  )
  await user.type(screen.getByLabelText("Username"), username)
  await user.type(screen.getByLabelText(/^Password/), password)
  await user.click(screen.getByRole("button", { name: /sign in/i }))
  await waitFor(
    () => {
      expect(
        screen.queryByRole("heading", { name: "Sign in" })
      ).not.toBeInTheDocument()
    },
    { timeout: 5000 }
  )
}

/** Sign in through the real login form, then navigate to `route`. */
export async function renderSignedIn(
  username: string,
  route = "/",
  password = DEMO_PASSWORD
): Promise<TestApp> {
  const app = renderApp("/login")
  await signInAs(app.user, username, password)
  if (route !== "/") {
    app.router.navigate(route)
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe(route.split("?")[0])
    )
  }
  return app
}
