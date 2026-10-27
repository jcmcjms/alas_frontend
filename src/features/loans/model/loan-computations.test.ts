import { describe, expect, it } from "vitest"

import {
  atmHardCap,
  computeDisposableIncome,
  computeLoanTotals,
  computeMaximumLoanableAmount,
  computeMonthlyAmortization,
} from "./loan-computations"

describe("computeMonthlyAmortization (legacy rule: ceil of annuity PMT)", () => {
  it("computes the annuity payment rounded up to whole pesos", () => {
    // 100k @ 12%/yr over 360 days (12 months): PMT = 8,884.88 → 8,885
    expect(computeMonthlyAmortization(100_000, 12, 360)).toBe(8_885)
  })

  it("uses floor(termDays/30) months", () => {
    // 350 days → 11 months, not 12
    const eleven = computeMonthlyAmortization(100_000, 12, 330)
    const same = computeMonthlyAmortization(100_000, 12, 359)
    expect(eleven).toBe(same)
  })

  it("falls back to straight division at 0% interest", () => {
    expect(computeMonthlyAmortization(120_000, 0, 360)).toBe(10_000)
  })

  it("returns 0 for invalid inputs instead of NaN", () => {
    expect(computeMonthlyAmortization(0, 12, 360)).toBe(0)
    expect(computeMonthlyAmortization(100_000, 12, 0)).toBe(0)
    expect(computeMonthlyAmortization(Number.NaN, 12, 360)).toBe(0)
    expect(computeMonthlyAmortization(100_000, 12, 29)).toBe(0) // under one month
  })
})

describe("computeLoanTotals", () => {
  it("sums upfront deductions and nets them from the principal", () => {
    const totals = computeLoanTotals({
      principal: 150_000,
      annualRatePercent: 12,
      termDays: 360,
      notarialFee: 500,
      docStampFee: 200,
      insuranceFee: 1_200,
      applicationChargeRate: 0.01,
    })
    expect(totals.applicationCharge).toBe(1_500)
    expect(totals.totalUpfrontDeductions).toBe(500 + 200 + 1_200 + 1_500)
    expect(totals.netProceeds).toBe(150_000 - totals.totalUpfrontDeductions)
    expect(totals.termMonths).toBe(12)
    expect(totals.monthlyAmortization).toBeGreaterThan(0)
  })
})

describe("computeMaximumLoanableAmount", () => {
  it("inverts the annuity formula from monthly capacity", () => {
    // capacity 10,000/mo @ 12%/yr, 12 months → P = 112,550.88 → 112,500 (hundreds)
    expect(computeMaximumLoanableAmount(10_000, 12, 360)).toBe(112_500)
  })

  it("applies the ATM hard cap per product code", () => {
    expect(atmHardCap("C34")).toBe(200_000)
    expect(atmHardCap("c21")).toBe(215_000)
    expect(atmHardCap("UNKNOWN")).toBeNull()
    // Huge capacity is still bounded by the product cap.
    expect(computeMaximumLoanableAmount(100_000, 12, 360, "C29")).toBe(100_000)
  })

  it("denominates to whole hundreds", () => {
    const amount = computeMaximumLoanableAmount(7_777, 13.5, 720)
    expect(amount % 100).toBe(0)
  })

  it("returns 0 for non-positive capacity or term", () => {
    expect(computeMaximumLoanableAmount(0, 12, 360)).toBe(0)
    expect(computeMaximumLoanableAmount(10_000, 12, 29)).toBe(0)
  })
})

describe("computeDisposableIncome", () => {
  it("flags amortization exceeding net take-home pay", () => {
    const result = computeDisposableIncome(
      { netTakeHomePay: 20_000, otherMonthlyObligations: 5_000 },
      25_000
    )
    expect(result.totalMonthlyObligations).toBe(30_000)
    expect(result.remainingDisposable).toBe(-10_000)
    // Legacy affordability rule: the amortization alone must not exceed NTHP.
    expect(result.isAmortizationExceedingIncome).toBe(true)
  })

  it("reports healthy capacity without flagging", () => {
    const result = computeDisposableIncome(
      { netTakeHomePay: 45_000, otherMonthlyObligations: 4_000 },
      8_000
    )
    expect(result.remainingDisposable).toBe(33_000)
    expect(result.isAmortizationExceedingIncome).toBe(false)
  })
})
