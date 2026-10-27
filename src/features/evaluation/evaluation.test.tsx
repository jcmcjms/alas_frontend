import { describe, expect, it } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"

import { renderApp, signInAs } from "@/test/test-utils"
import { setMockScenario } from "@/mocks/scenarios"

/**
 * Evaluation decisions (spec §5.4): permitted transitions only, remarks
 * requirements, the preserved "NotRecommended still advances" business rule,
 * returns for correction, and document flags.
 */
describe("evaluation workflow", () => {
  it("recommends an application for approval with signed remarks", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "evaluator")
    app.router.navigate("/loans/1004/evaluate")

    // The review screen shows the evidence set.
    expect(
      await screen.findByRole("heading", { name: "LAM-2026-0004" })
    ).toBeInTheDocument()
    expect(screen.getByText(/Interest-rate reduction/i)).toBeInTheDocument()

    await app.user.click(
      screen.getByRole("button", { name: /recommend for approval/i })
    )
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent(/goes to the approver/i)

    // Remarks are required for a positive evaluation.
    await app.user.click(
      within(dialog).getByRole("button", { name: /^recommend$/i })
    )
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      /at least 10 characters/i
    )

    await app.user.type(
      within(dialog).getByLabelText(/evaluation findings/i),
      "Rate deviation verified against retention memo RO7-2026-14."
    )
    await app.user.click(
      within(dialog).getByRole("button", { name: /^recommend$/i })
    )

    // Backend moved it to ForApproval; the screen reports nothing left to evaluate.
    expect(
      await screen.findByText(/recommended for approval/i)
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByText(/not waiting for credit checking/i)
      ).toBeInTheDocument()
    )
    expect(screen.getByText("For Approval")).toBeInTheDocument()
  })

  it("keeps a not-recommended evaluation advancing to the Approver (legacy rule)", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "evaluator")
    app.router.navigate("/loans/1004/evaluate")
    expect(
      await screen.findByRole("heading", { name: "LAM-2026-0004" })
    ).toBeInTheDocument()

    await app.user.click(
      screen.getByRole("button", { name: /mark not recommended/i })
    )
    const dialog = await screen.findByRole("dialog")
    // The consequence is stated honestly before confirming.
    expect(dialog).toHaveTextContent(/still goes to the approver/i)

    await app.user.type(
      within(dialog).getByLabelText(/adverse findings/i),
      "Existing obligation amortizations leave thin headroom."
    )
    await app.user.click(
      within(dialog).getByRole("button", { name: /mark not recommended/i })
    )

    expect(
      await screen.findByText(/marked not recommended/i)
    ).toBeInTheDocument()
  })

  it("returns an application for correction with section feedback", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "evaluator")
    app.router.navigate("/loans/1004/evaluate")
    expect(
      await screen.findByRole("heading", { name: "LAM-2026-0004" })
    ).toBeInTheDocument()

    await app.user.click(
      screen.getByRole("button", { name: /return for correction/i })
    )
    const dialog = await screen.findByRole("dialog")

    // Needs at least one section + comment and an overall reason.
    await app.user.click(
      within(dialog).getByRole("button", { name: /return to encoder/i })
    )
    expect(
      within(dialog).getByText(/select at least one section/i)
    ).toBeInTheDocument()

    await app.user.click(
      within(dialog).getByRole("checkbox", { name: /documents/i })
    )
    await app.user.type(
      within(dialog).getByLabelText(/correction details for documents/i),
      "Latest bank statement is older than 3 months."
    )
    await app.user.type(
      within(dialog).getByLabelText(/overall reason/i),
      "Documentation is stale; refresh the bank statement before approval."
    )
    await app.user.click(
      within(dialog).getByRole("button", { name: /return to encoder/i })
    )

    expect(
      await screen.findByText(/returned to the encoder/i)
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText(/nothing to evaluate/i)).toBeInTheDocument()
    )
    expect(screen.getByText("For Revision")).toBeInTheDocument()
  })

  it("survives a failed workflow mutation without pretending success", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "evaluator")
    app.router.navigate("/loans/1004/evaluate")
    expect(
      await screen.findByRole("heading", { name: "LAM-2026-0004" })
    ).toBeInTheDocument()

    setMockScenario("mutation-failure")
    await app.user.click(
      screen.getByRole("button", { name: /recommend for approval/i })
    )
    const dialog = await screen.findByRole("dialog")
    await app.user.type(
      within(dialog).getByLabelText(/evaluation findings/i),
      "All requirements verified and complete."
    )
    await app.user.click(
      within(dialog).getByRole("button", { name: /^recommend$/i })
    )

    // The failure is visible INSIDE the dialog; remarks preserved; no status change.
    expect(
      await within(dialog).findByText(/action failed/i)
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/evaluation findings/i)).toHaveValue(
      "All requirements verified and complete."
    )
    setMockScenario("default")
    await app.user.click(
      within(dialog).getByRole("button", { name: /^cancel$/i })
    )
    expect(screen.getByText("For Checking")).toBeInTheDocument()
  })

  it("denies the evaluation screen to roles without the permission", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/loans/1004/evaluate")

    expect(await screen.findByRole("alert")).toHaveTextContent(/access denied/i)
  })
})
