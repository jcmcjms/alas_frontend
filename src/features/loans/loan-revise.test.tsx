import { describe, expect, it } from "vitest"
import { screen, waitFor } from "@testing-library/react"

import { renderApp, signInAs } from "@/test/test-utils"

/**
 * Correction & resubmission (spec §6): reviewer feedback is shown with author
 * and stage, resolution notes are required, resubmission returns the
 * application to the stage that issued the return, and history is preserved.
 */
describe("correction workflow", () => {
  it("shows the return reasons and resubmits to the returning stage", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/loans/1007/revise")

    // The reviewer feedback is presented with author, role and sections.
    expect(
      await screen.findByText(/returned by maria domingo \(evaluator\)/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/second latest payslip missing/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/service record not on file/i)).toBeInTheDocument()

    // Missing documents are actionable right here (name appears in feedback and checklist).
    expect(screen.getByText(/2 missing/i)).toBeInTheDocument()
    expect(
      screen.getAllByText(/second latest payslip/i).length
    ).toBeGreaterThanOrEqual(2)

    // Resolution notes are required (min 10 characters).
    await app.user.click(
      screen.getByRole("button", { name: /resubmit application/i })
    )
    expect(
      await screen.findByText(/describe what you corrected/i)
    ).toBeInTheDocument()

    await app.user.type(
      screen.getByLabelText(/what did you correct\?/i),
      "Uploaded the second payslip and the service record; verified against HR certification."
    )
    await app.user.click(
      screen.getByRole("button", { name: /resubmit application/i })
    )

    // Success navigates to the application, now back at the returning stage.
    expect(
      await screen.findByText(/resubmitted for review/i)
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "LAM-2026-0007" })
      ).toBeInTheDocument()
    )
    expect(screen.getByText("For Checking")).toBeInTheDocument()

    // Previous decisions are preserved — the pushback stays in the timeline.
    expect(screen.getAllByText(/pushback/i).length).toBeGreaterThan(0)
    expect(
      screen.getByText(/missing payslip and service record\./i)
    ).toBeInTheDocument()
  })

  it("rejects resubmission server-side when the application already moved on", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/loans/1007/revise")
    await screen.findByText(/returned by maria domingo/i)

    // Somebody else acted first: the row version changed.
    const { apiClient } = await import("@/lib/api/api-client")
    await expect(
      apiClient.post("/api/loans/1007/revise", {
        rowVersion: "stale-version",
        resolutionNotes: "Everything corrected as requested by the reviewer.",
      })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("blocks resubmission for applications that were never returned", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder")
    app.router.navigate("/loans/1001/revise")

    // 1001 is ForRecommendation — nothing to correct.
    expect(await screen.findByText(/no correction needed/i)).toBeInTheDocument()
    expect(
      screen.getByText(/not waiting for a correction/i)
    ).toBeInTheDocument()
  })

  it("surfaces incomplete-document flags on the correction screen", async () => {
    const app = renderApp("/login")
    await signInAs(app.user, "encoder2")
    app.router.navigate("/loans/1008/revise")

    expect(
      await screen.findByText(/flagged: incomplete documents/i)
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/bank statement and CIBI documentation not uploaded/i)
        .length
    ).toBeGreaterThan(0)
  })
})
