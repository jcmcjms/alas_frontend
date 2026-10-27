import { describe, expect, it } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"

import { renderApp, signInAs } from "@/test/test-utils"

/**
 * Approval decisions (spec §5.5): authority-gated approval, terminal rejection
 * with mandatory remarks, and the 30-day disbursement window opening on approve.
 */
describe("approval workflow", () => {
  it("lets the assigned approver approve and starts the 30-day window", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "approver") // Jose Mendoza — Tier 1/2, assigned to LAM-2026-0005
    app.router.navigate("/loans/1005/approve")

    expect(
      await screen.findByRole("heading", { name: "LAM-2026-0005" })
    ).toBeInTheDocument()
    expect(screen.getByText(/evaluator recommended/i)).toBeInTheDocument()
    // Evaluation evidence is shown before the decision.
    expect(
      screen.getAllByText(/capacity check passed/i).length
    ).toBeGreaterThan(0)

    await app.user.click(screen.getByRole("button", { name: /^approve$/i }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent(/must be released within 30 days/i)

    await app.user.click(
      within(dialog).getByRole("button", { name: /approve loan/i })
    )

    expect(
      await screen.findByText(/disbursement window: 30 days/i)
    ).toBeInTheDocument()
    // The screen switches to post-approval processing.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /prepare disbursement/i })
      ).toBeInTheDocument()
    )
    expect(screen.getByText(/deadline/i)).toBeInTheDocument()
  })

  it("blocks a non-assigned approver in the UI and on the server", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "approver") // app-01; LAM-2026-0006 routes to Tier 3 (app-02)
    app.router.navigate("/loans/1006/approve")

    expect(
      await screen.findByRole("heading", { name: "LAM-2026-0006" })
    ).toBeInTheDocument()
    // Authority gate is explained, and the Approve control is disabled.
    expect(screen.getByRole("status")).toHaveTextContent(
      /assigned to cecilia navarro/i
    )
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeDisabled()

    // The server agrees — a hidden button is not the security boundary.
    const { apiClient } = await import("@/lib/api/api-client")
    await expect(
      apiClient.post("/api/loans/1006/approve", {})
    ).rejects.toMatchObject({ status: 403 })
  })

  it("allows the routed Tier-3 approver to act on a not-recommended application", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "approver2") // Cecilia Navarro — Tier 3
    app.router.navigate("/loans/1006/approve")

    expect(
      await screen.findByRole("heading", { name: "LAM-2026-0006" })
    ).toBeInTheDocument()
    expect(screen.getByText(/evaluator did not recommend/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeEnabled()

    // Reject requires substantive remarks.
    await app.user.click(screen.getByRole("button", { name: /^reject$/i }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent(/cannot be reopened/i)
    await app.user.type(
      within(dialog).getByLabelText(/rejection reason/i),
      "Combined obligations exceed capacity; reapply after PN-2025-0410 matures."
    )
    await app.user.click(
      within(dialog).getByRole("button", { name: /reject application/i })
    )

    expect(await screen.findByText(/rejected/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText(/nothing to approve/i)).toBeInTheDocument()
    )
  })

  it("rejects a too-short rejection reason client-side and server-side", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "approver2")
    app.router.navigate("/loans/1006/approve")
    expect(
      await screen.findByRole("heading", { name: "LAM-2026-0006" })
    ).toBeInTheDocument()

    await app.user.click(screen.getByRole("button", { name: /^reject$/i }))
    const dialog = await screen.findByRole("dialog")
    await app.user.type(
      within(dialog).getByLabelText(/rejection reason/i),
      "no"
    )
    await app.user.click(
      within(dialog).getByRole("button", { name: /reject application/i })
    )

    // Client-side guard fires first (min 10 chars).
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      /at least 10 characters/i
    )

    // The backend independently enforces it.
    const { apiClient } = await import("@/lib/api/api-client")
    await expect(
      apiClient.post("/api/loans/1006/reject", { remarks: "no" })
    ).rejects.toMatchObject({
      status: 400,
    })
    await app.user.click(
      within(dialog).getByRole("button", { name: /^cancel$/i })
    )
  })

  it("returns for correction from the approval stage", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "approver")
    app.router.navigate("/loans/1005/approve")
    expect(
      await screen.findByRole("heading", { name: "LAM-2026-0005" })
    ).toBeInTheDocument()

    await app.user.click(
      screen.getByRole("button", { name: /return for correction/i })
    )
    const dialog = await screen.findByRole("dialog")
    await app.user.click(
      within(dialog).getByRole("checkbox", { name: /loan parameters/i })
    )
    await app.user.type(
      within(dialog).getByLabelText(/correction details for loan parameters/i),
      "Requested term exceeds the client's payroll deduction window."
    )
    await app.user.type(
      within(dialog).getByLabelText(/overall reason/i),
      "Adjust the term so deductions fit the payroll cycle."
    )
    await app.user.click(
      within(dialog).getByRole("button", { name: /return to encoder/i })
    )

    expect(
      await screen.findByText(/returned to the encoder/i)
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText(/nothing to approve/i)).toBeInTheDocument()
    )

    // History is preserved — the previous evaluation stays on the record.
    app.router.navigate("/loans/1005")
    expect(
      await screen.findByText(/capacity check passed/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Adjust the term so deductions fit the payroll cycle\./i)
    ).toBeInTheDocument()
  })
})
