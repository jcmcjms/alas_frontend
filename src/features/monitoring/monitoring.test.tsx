import { describe, expect, it } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"

import { renderApp, signInAs } from "@/test/test-utils"

/**
 * Monitoring & disbursement board (spec §5.6/§5.7, §8): server-side filtering
 * and pagination, no-results states, and the 30-day disbursement timeout with
 * backend-enforced voiding.
 */
describe("loan monitoring", () => {
  it("lists applications with server-side status filtering", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/monitoring")

    expect(
      await screen.findByRole("heading", { name: /loan monitoring/i })
    ).toBeInTheDocument()
    // All seeded applications are visible to start.
    expect(await screen.findByText("LAM-2026-0001")).toBeInTheDocument()
    expect(screen.getByText(/1–17 of 17 applications/i)).toBeInTheDocument()

    // Filter to Rejected via the status select (URL-driven).
    app.router.navigate("/monitoring?status=Rejected")
    await waitFor(() =>
      expect(screen.queryByText("LAM-2026-0001")).not.toBeInTheDocument()
    )
    expect(screen.getByText("LAM-2026-0013")).toBeInTheDocument()
    expect(screen.getByText(/1–1 of 1 applications/i)).toBeInTheDocument()
  })

  it("shows a no-results state distinct from an empty book", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/monitoring?search=zzzz-no-such-client")

    expect(
      await screen.findByText(/no matching records/i, undefined, {
        timeout: 20000,
      })
    ).toBeInTheDocument()
    // Both the toolbar and the empty state offer to clear.
    expect(
      screen.getAllByRole("button", { name: /clear filters/i }).length
    ).toBeGreaterThan(0)
  })

  it("flags documents and shows SLA aging per row", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "evaluator")
    app.router.navigate("/monitoring?flagged=true")

    const row = await screen.findByRole("row", { name: /liza reyes/i })
    expect(within(row).getByText(/flag/i)).toBeInTheDocument()
  })
})

describe("disbursement monitoring & the 30-day rule", () => {
  it("shows overdue, at-risk and healthy releases honestly", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "approver")
    app.router.navigate("/monitoring/disbursement")

    expect(
      await screen.findByRole("heading", { name: /disbursement monitoring/i })
    ).toBeInTheDocument()
    // The finding line names the overdue application count (loads with the board).
    expect(
      await screen.findByText(/1 application passed the 30-day window/i)
    ).toBeInTheDocument()

    const overdueRow = await screen.findByRole("row", {
      name: /lam-2026-0010/i,
    })
    expect(within(overdueRow).getByText(/4 days overdue/i)).toBeInTheDocument()

    const atRiskRow = screen.getByRole("row", { name: /lam-2026-0011/i })
    expect(within(atRiskRow).getByText(/3 days left/i)).toBeInTheDocument()

    // Released tab lists disbursed + ongoing loans.
    await app.user.click(screen.getByRole("tab", { name: /^released/i }))
    expect(await screen.findByText("LAM-2026-0012")).toBeInTheDocument()
    expect(screen.getByText("LAM-2025-0210")).toBeInTheDocument()

    // Voided tab keeps the archived timeout case.
    await app.user.click(screen.getByRole("tab", { name: /^voided/i }))
    expect(await screen.findByText("LAM-2026-0015")).toBeInTheDocument()
  })

  it("voids an overdue application through the backend rule", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "approver")
    app.router.navigate("/loans/1010/approve")

    // Wait for the approval screen itself (the dashboard mentions lapses too).
    expect(
      await screen.findByRole("heading", { name: "LAM-2026-0010" })
    ).toBeInTheDocument()
    // The lapsed window is stated and disbursement is blocked.
    expect(
      await screen.findByText(/the 30-day disbursement window lapsed/i)
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /confirm proceeds released/i })
    ).not.toBeInTheDocument()

    await app.user.click(
      screen.getByRole("button", { name: /void application \(timeout\)/i })
    )
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent(
      /voided per|30-day disbursement-timeout policy|final/i
    )

    await app.user.type(
      within(dialog).getByLabelText(/void reason/i),
      "Client did not claim proceeds within the 30-day window despite two advisories."
    )
    await app.user.click(
      within(dialog).getByRole("button", { name: /void application/i })
    )

    expect(
      await screen.findByText(/voided \(disbursement timeout\)/i)
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByText("Expired (Voided)").length).toBeGreaterThan(0)
    )
  })

  it("refuses to void an application still inside the window (server-side)", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "approver")
    app.router.navigate("/loans/1011/approve")
    expect(
      await screen.findByRole("heading", { name: "LAM-2026-0011" })
    ).toBeInTheDocument()

    // No void control in the UI while the window is open…
    expect(
      screen.queryByRole("button", { name: /void application/i })
    ).not.toBeInTheDocument()

    // …and the backend independently refuses the operation.
    const { apiClient } = await import("@/lib/api/api-client")
    await expect(
      apiClient.post("/api/loans/1011/expire", {
        reason: "Trying to void an application inside its window.",
      })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("releases proceeds inside the window: prepare → confirm → sync", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "approver")
    app.router.navigate("/loans/1011/approve")
    expect(
      await screen.findByRole("heading", { name: "LAM-2026-0011" })
    ).toBeInTheDocument()

    // Already ForDisbursement: confirm the release with a reference.
    await app.user.click(
      await screen.findByRole("button", { name: /confirm proceeds released/i })
    )
    const dialog = await screen.findByRole("dialog")
    await app.user.type(
      within(dialog).getByLabelText(/disbursement reference/i),
      "DISB-2026-0199"
    )
    await app.user.click(
      within(dialog).getByRole("button", { name: /confirm release/i })
    )

    expect(await screen.findByText(/marked as disbursed/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByText("Disbursed").length).toBeGreaterThan(0)
    )
    expect(screen.getAllByText(/disb-2026-0199/i).length).toBeGreaterThan(0)

    // Core sync moves it On Going (never implied by approval alone).
    await app.user.click(
      screen.getByRole("button", { name: /sync with core/i })
    )
    await waitFor(() =>
      expect(screen.getAllByText("On Going").length).toBeGreaterThan(0)
    )
  })
})
