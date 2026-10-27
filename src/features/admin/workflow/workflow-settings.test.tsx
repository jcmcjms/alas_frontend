import { describe, expect, it } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"

import { renderApp, signInAs } from "@/test/test-utils"
import { setMockScenario } from "@/mocks/scenarios"

/**
 * Configurable recommendation stage (spec §5.2). The setting affects only NEW
 * applications; in-flight applications keep their route; saves are confirmed by
 * the server (no optimistic flips); concurrent changes surface as conflicts.
 */
describe("workflow settings — configurable recommendation", () => {
  it("shows the authoritative configuration and its audit trail", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "admin")
    app.router.navigate("/admin/workflow")

    expect(
      await screen.findByRole("heading", { name: /workflow settings/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/^on$/i)).toBeInTheDocument()
    expect(screen.getByText(/changed by carla villanueva/i)).toBeInTheDocument()
    // Pipeline preview states the current route for new applications.
    expect(
      screen.getByRole("img", {
        name: /encoder, recommender, evaluator, approver/i,
      })
    ).toBeInTheDocument()
    expect(screen.getByText(/for recommendation/i)).toBeInTheDocument()
    expect(
      screen.getByRole("switch", { name: /require recommendation/i })
    ).toBeChecked()
  })

  it("explains the impact and warns about the backlog before disabling", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "admin")
    app.router.navigate("/admin/workflow")
    await screen.findByRole("heading", { name: /workflow settings/i })

    await app.user.click(
      screen.getByRole("switch", { name: /require recommendation/i })
    )

    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent(
      /skip the branch head and go straight to the evaluator/i
    )
    // Impact on EXISTING applications is stated, and the backlog count loads.
    expect(
      await within(dialog).findByText(/already waiting for recommendation/i)
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/keep the recommender stage/i)
    ).toBeInTheDocument()

    // Cancel keeps the saved configuration untouched.
    await app.user.click(
      within(dialog).getByRole("button", { name: /^cancel$/i })
    )
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    )
    expect(
      screen.getByRole("switch", { name: /require recommendation/i })
    ).toBeChecked()
  })

  it("saves the change and displays only the server-confirmed value", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "admin")
    app.router.navigate("/admin/workflow")
    await screen.findByRole("heading", { name: /workflow settings/i })

    await app.user.click(
      screen.getByRole("switch", { name: /require recommendation/i })
    )
    const dialog = await screen.findByRole("alertdialog")
    // Wait for the backlog query so the save button is enabled deterministically.
    await within(dialog).findByText(/already waiting for recommendation/i)
    await app.user.click(
      within(dialog).getByRole("button", { name: /disable step/i })
    )

    expect(
      await screen.findByText(/recommendation step disabled/i)
    ).toBeInTheDocument()
    // The displayed setting is the authoritative saved configuration.
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: /require recommendation/i })
      ).not.toBeChecked()
    )
    expect(screen.getByText(/changed by carla villanueva/i)).toBeInTheDocument()
    // Pipeline preview now excludes the Recommender for new applications.
    expect(
      screen.getByRole("img", {
        name: /pipeline for new applications: encoder, evaluator, approver/i,
      })
    ).toBeInTheDocument()
  })

  it("does NOT reroute applications already in progress", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "admin")
    app.router.navigate("/admin/workflow")
    await screen.findByRole("heading", { name: /workflow settings/i })
    await app.user.click(
      screen.getByRole("switch", { name: /require recommendation/i })
    )
    const dialog = await screen.findByRole("alertdialog")
    await within(dialog).findByText(/already waiting for recommendation/i)
    await app.user.click(
      within(dialog).getByRole("button", { name: /disable step/i })
    )
    await screen.findByText(/recommendation step disabled/i)

    // Applications already routed to the Recommender keep their stage.
    const { apiClient } = await import("@/lib/api/api-client")
    const list = await apiClient.get<{
      items: { lamId: string; status: string }[]
    }>("/api/loans?status=ForRecommendation&pageSize=10")
    expect(list.items.length).toBe(3)
    expect(list.items.map((item) => item.lamId)).toContain("LAM-2026-0001")
  })

  it("surfaces a concurrent configuration change instead of overwriting it", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "admin")
    app.router.navigate("/admin/workflow")
    await screen.findByRole("heading", { name: /workflow settings/i })

    // Another admin changes the setting while this dialog is being confirmed.
    setMockScenario("workflow-stale")
    await app.user.click(
      await screen.findByRole("switch", { name: /require recommendation/i })
    )
    const dialog = await screen.findByRole("alertdialog")
    await app.user.click(
      within(dialog).getByRole("button", { name: /disable step/i })
    )

    expect(
      await screen.findByText(/setting changed by another administrator/i)
    ).toBeInTheDocument()
    // The switch still shows the server's value (On) — nothing optimistic stuck.
    await waitFor(async () =>
      expect(
        await screen.findByRole("switch", { name: /require recommendation/i })
      ).toBeChecked()
    )
    setMockScenario("default")
  })

  it("keeps the old visible value when the save fails", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "admin")
    app.router.navigate("/admin/workflow")
    await screen.findByRole("heading", { name: /workflow settings/i })

    setMockScenario("mutation-failure")
    await app.user.click(
      await screen.findByRole("switch", { name: /require recommendation/i })
    )
    const dialog = await screen.findByRole("alertdialog")
    await app.user.click(
      within(dialog).getByRole("button", { name: /disable step/i })
    )

    // The failure is reported in-screen (alert + toast) and the switch keeps
    // the last server-confirmed value — nothing optimistic is left visible.
    expect(await screen.findByText(/save failed/i)).toBeInTheDocument()
    expect(
      (
        await screen.findAllByText(
          /the workflow service could not persist the change/i
        )
      ).length
    ).toBeGreaterThan(0)
    expect(
      screen.getByRole("switch", { name: /require recommendation/i })
    ).toBeChecked()
    setMockScenario("default")
  })

  it("hides workflow settings from non-administrators", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "approver")
    app.router.navigate("/admin/workflow")

    expect(await screen.findByRole("alert")).toHaveTextContent(/access denied/i)
    // And the server enforces it too.
    const { apiClient } = await import("@/lib/api/api-client")
    await expect(
      apiClient.put("/api/workflow/configuration", {
        requireRecommendation: false,
      })
    ).rejects.toMatchObject({
      status: 403,
    })
  })
})
