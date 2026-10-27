import { describe, expect, it } from "vitest"

import {
  CANCELLABLE_STATUSES,
  DISBURSEMENT_AT_RISK_DAYS,
  DISBURSEMENT_TIMEOUT_DAYS,
  LOAN_STATUS_META,
  LOAN_STATUSES,
  STATUS_FILTER_ORDER,
  TERMINAL_STATUSES,
  isLoanStatus,
  statusLabel,
} from "./loan-status"

describe("loan status model", () => {
  it("covers the full ALAS lifecycle including the v3 void state", () => {
    for (const status of [
      "Draft",
      "ForRecommendation",
      "ForChecking",
      "ForApproval",
      "ForRevision",
      "ForIncompleteDocuments",
      "Approved",
      "ForDisbursement",
      "Disbursed",
      "OnGoing",
      "Rejected",
      "Cancelled",
      "Expired",
    ]) {
      expect(LOAN_STATUSES).toContain(status)
    }
    expect(LOAN_STATUS_META.Expired.label).toMatch(/Expired/)
    expect(LOAN_STATUS_META.Expired.hint).toMatch(/30-day/i)
  })

  it("maps every status to a label, tone and hint", () => {
    for (const status of LOAN_STATUSES) {
      const meta = LOAN_STATUS_META[status]
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.hint.length).toBeGreaterThan(0)
      expect(["neutral", "info", "positive", "warning", "negative"]).toContain(
        meta.tone
      )
    }
  })

  it("never conveys status by colour alone (label text is the indicator)", () => {
    // Each status label is unique — a screen reader gets full state from text.
    const labels = LOAN_STATUSES.map((status) => LOAN_STATUS_META[status].label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it("lists every status exactly once in filter order", () => {
    expect(STATUS_FILTER_ORDER).toHaveLength(LOAN_STATUSES.length)
    for (const status of LOAN_STATUSES) {
      expect(STATUS_FILTER_ORDER).toContain(status)
    }
  })

  it("guards terminal and cancellable sets", () => {
    expect(TERMINAL_STATUSES).toContain("Rejected")
    expect(TERMINAL_STATUSES).toContain("Expired")
    expect(TERMINAL_STATUSES).not.toContain("ForApproval")
    expect(CANCELLABLE_STATUSES).toContain("Draft")
    expect(CANCELLABLE_STATUSES).not.toContain("Approved")
  })

  it("encodes the 30-day disbursement rule constants", () => {
    expect(DISBURSEMENT_TIMEOUT_DAYS).toBe(30)
    expect(DISBURSEMENT_AT_RISK_DAYS).toBeLessThan(DISBURSEMENT_TIMEOUT_DAYS)
  })

  it("validates unknown status strings safely", () => {
    expect(isLoanStatus("ForApproval")).toBe(true)
    expect(isLoanStatus("SomethingElse")).toBe(false)
    expect(statusLabel("SomethingElse")).toBe("SomethingElse")
    expect(statusLabel("ForChecking")).toBe("For Checking")
  })
})
