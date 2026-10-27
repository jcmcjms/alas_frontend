import { describe, expect, it } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"

import { renderApp, signInAs } from "@/test/test-utils"
import { setMockScenario } from "@/mocks/scenarios"

/**
 * Grouped review desk (spec §7): bundles of client applications, claim/release
 * at bundle level, ownership refresh, and conflict handling.
 */
describe("review desk — grouped queues", () => {
  it("groups a client's applications into one bundle and claims them together", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "recommender")
    app.router.navigate("/review-desk")

    // The desk shows bundles, not loose loans.
    const bundleRow = await screen.findByRole("row", {
      name: /Roberto Bautista/i,
    })
    expect(within(bundleRow).getByText("GRP-2026-0001")).toBeInTheDocument()
    // The bundle carries BOTH applications of the client (count column).
    expect(
      within(bundleRow).getAllByRole("cell", { name: "2" }).length
    ).toBeGreaterThan(0)

    // Claim the whole bundle.
    await app.user.click(
      within(bundleRow).getByRole("button", { name: /claim bundle/i })
    )

    // Now serving: both applications appear under one claim.
    const serving = await screen.findByRole("region", {
      name: /your current claims/i,
    })
    expect(within(serving).getByText(/Now serving/i)).toBeInTheDocument()
    expect(within(serving).getByText("LAM-2026-0001")).toBeInTheDocument()
    expect(within(serving).getByText("LAM-2026-0002")).toBeInTheDocument()
    // The bundle left the waiting list.
    expect(
      within(
        screen.getByRole("region", { name: /waiting queue/i })
      ).queryByText("GRP-2026-0001")
    ).not.toBeInTheDocument()
  })

  it("releases a claim and returns the bundle to the queue", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "recommender")
    app.router.navigate("/review-desk")

    const bundleRow = await screen.findByRole("row", {
      name: /Roberto Bautista/i,
    })
    await app.user.click(
      within(bundleRow).getByRole("button", { name: /claim bundle/i })
    )
    const serving = await screen.findByRole("region", {
      name: /your current claims/i,
    })

    await app.user.click(
      within(serving).getByRole("button", { name: /^release$/i })
    )

    // Back in the waiting queue; ownership indicator cleared.
    await waitFor(() => {
      expect(
        screen.queryByRole("region", { name: /your current claims/i })
      ).not.toBeInTheDocument()
    })
    const queue = screen.getByRole("region", { name: /waiting queue/i })
    await waitFor(() =>
      expect(within(queue).getByText("GRP-2026-0001")).toBeInTheDocument()
    )
    expect(screen.getByText(/claim released/i)).toBeInTheDocument()
  })

  it("surfaces a concurrent claim conflict and refreshes the queue", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "recommender")
    app.router.navigate("/review-desk")

    const bundleRow = await screen.findByRole("row", {
      name: /Roberto Bautista/i,
    })
    setMockScenario("claim-conflict")
    await app.user.click(
      within(bundleRow).getByRole("button", { name: /claim bundle/i })
    )

    // The failure is visible and the claim did NOT succeed locally.
    expect(
      await screen.findByText(
        /another officer claimed this client bundle first/i
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("region", { name: /your current claims/i })
    ).not.toBeInTheDocument()
    setMockScenario("default")
  })

  it("shows the evaluator only the ForChecking desk", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "evaluator")
    app.router.navigate("/review-desk")

    expect(
      await screen.findByRole("heading", { name: /evaluation desk/i })
    ).toBeInTheDocument()
    // Only the ForChecking bundle is queued for this desk.
    const row = await screen.findByRole("row", { name: /Fernando Delgado/i })
    expect(within(row).getByText("GRP-2026-0003")).toBeInTheDocument()
    expect(screen.queryByText("GRP-2026-0001")).not.toBeInTheDocument()

    // Claiming surfaces the deviation flag on the served application card.
    await app.user.click(
      within(row).getByRole("button", { name: /claim bundle/i })
    )
    const serving = await screen.findByRole("region", {
      name: /your current claims/i,
    })
    expect(await within(serving).findByText(/deviations/i)).toBeInTheDocument()
  })

  it("renders an honest empty state when the queue is clear", async () => {
    setMockScenario("empty-queue")
    const app = renderApp("/login")
    await signInAs(app.user, "recommender")
    app.router.navigate("/review-desk")

    expect(await screen.findByText(/your queue is clear/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /serve next client/i })
    ).toBeDisabled()
    setMockScenario("default")
  })

  it("shows a retryable error when the desk cannot load", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "recommender")
    setMockScenario("network-error")
    app.router.navigate("/review-desk")

    expect(
      await screen.findByText(/couldn't load your desk/i, undefined, {
        timeout: 15000,
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument()
    setMockScenario("default")
  })
})
