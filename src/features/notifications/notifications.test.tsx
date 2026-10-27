import { describe, expect, it } from "vitest"
import { screen, within } from "@testing-library/react"

import { renderApp, signInAs } from "@/test/test-utils"

describe("notifications", () => {
  it("lists unread items, marks one read and navigates to the application", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/notifications")

    expect(
      await screen.findByRole("heading", { name: /notifications/i })
    ).toBeInTheDocument()
    const returned = await screen.findByText(
      /application returned for revision/i
    )
    expect(returned).toBeInTheDocument()
    expect(screen.getByText(/2 unread of 3/i)).toBeInTheDocument()

    // "Open" marks the notification read and navigates to the affected loan.
    const item = returned.closest("li") as HTMLElement
    await app.user.click(within(item).getByRole("button", { name: /^open$/i }))

    await screen.findByRole("heading", { name: "LAM-2026-0007" })
    expect(app.router.state.location.pathname).toBe("/loans/1007")
  })

  it("filters unread and marks everything read", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/notifications")
    await screen.findByText(/2 unread of 3/i)

    await app.user.click(screen.getByRole("tab", { name: /^unread$/i }))
    expect(
      await screen.findByText(/application returned for revision/i)
    ).toBeInTheDocument()
    expect(screen.queryByText(/welcome to alas v3/i)).not.toBeInTheDocument()

    await app.user.click(screen.getByRole("button", { name: /mark all read/i }))
    expect(
      await screen.findByText(/2 notifications marked read/i)
    ).toBeInTheDocument()
    // The unread view empties out after everything is marked read.
    expect(await screen.findByText(/nothing unread/i)).toBeInTheDocument()

    // The full inbox keeps its history with read state (header revalidates).
    await app.user.click(screen.getByRole("tab", { name: /^all$/i }))
    expect(await screen.findByText(/welcome to alas v3/i)).toBeInTheDocument()
    expect(await screen.findByText(/0 unread of 3/i)).toBeInTheDocument()
  })
})
