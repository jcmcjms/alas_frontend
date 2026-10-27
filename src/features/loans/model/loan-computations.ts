/**
 * Frontend loan computations mirrored from the legacy ALAS engine
 * (loan-computations.ts / loan-fee-rules.ts). They exist for immediate
 * data-entry feedback; the backend recomputes and remains authoritative.
 */
import { round2 } from "@/lib/format"

export interface LoanComputationInputs {
  principal: number
  /** Nominal annual interest rate in percent (e.g. 12 for 12%/yr). */
  annualRatePercent: number
  termDays: number
  notarialFee: number
  docStampFee: number
  insuranceFee: number
  /** Application/service charge rate as a fraction of principal (e.g. 0.01). */
  applicationChargeRate: number
}

export interface LoanComputationResults {
  termMonths: number
  monthlyAmortization: number
  applicationCharge: number
  totalUpfrontDeductions: number
  netProceeds: number
}

/**
 * Monthly amortization = ceil(PMT) with termMonths = floor(termDays / 30).
 * Legacy rule: rounded up to the whole peso so the final payment never
 * leaves a centavo balance.
 */
export function computeMonthlyAmortization(
  principal: number,
  annualRatePercent: number,
  termDays: number
): number {
  if (
    !Number.isFinite(principal) ||
    !Number.isFinite(annualRatePercent) ||
    !Number.isFinite(termDays)
  ) {
    return 0
  }
  if (principal <= 0 || termDays <= 0) return 0

  const termMonths = Math.floor(termDays / 30)
  if (termMonths <= 0) return 0
  if (annualRatePercent === 0) return round2(principal / termMonths)

  const r = Math.round((annualRatePercent / 100 / 12) * 1_000_000) / 1_000_000
  const pmt = (principal * r) / (1 - Math.pow(1 + r, -termMonths))
  return Math.ceil(pmt)
}

export function computeLoanTotals(
  input: LoanComputationInputs
): LoanComputationResults {
  const termMonths = Math.floor(input.termDays / 30)
  const monthlyAmortization = computeMonthlyAmortization(
    input.principal,
    input.annualRatePercent,
    input.termDays
  )
  const applicationCharge = round2(
    input.principal * input.applicationChargeRate
  )
  const totalUpfrontDeductions = round2(
    input.notarialFee +
      input.docStampFee +
      input.insuranceFee +
      applicationCharge
  )
  const netProceeds = round2(input.principal - totalUpfrontDeductions)
  return {
    termMonths,
    monthlyAmortization,
    applicationCharge,
    totalUpfrontDeductions,
    netProceeds,
  }
}

/** Hard caps per ATM product code (legacy table, backend revalidates). */
const ATM_HARD_CAPS: Readonly<Record<string, number>> = {
  C34: 200_000,
  C21: 215_000,
  C27: 120_000,
  C29: 100_000,
  C25: 200_000,
  C02: 100_000,
}

export function atmHardCap(
  productCode: string | null | undefined
): number | null {
  const code = (productCode ?? "").trim().toUpperCase()
  return ATM_HARD_CAPS[code] ?? null
}

/**
 * Maximum loanable amount from monthly capacity:
 * capacity amortized over the term at the given rate, bounded by the product
 * ATM hard cap where one exists.
 */
export function computeMaximumLoanableAmount(
  monthlyCapacity: number,
  annualRatePercent: number,
  termDays: number,
  productCode?: string | null
): number {
  if (!Number.isFinite(monthlyCapacity) || monthlyCapacity <= 0) return 0
  const termMonths = Math.floor(termDays / 30)
  if (termMonths <= 0) return 0

  let principal: number
  if (annualRatePercent <= 0) {
    principal = monthlyCapacity * termMonths
  } else {
    const r = annualRatePercent / 100 / 12
    // Inverse of PMT: P = A * (1 - (1+r)^-n) / r
    principal = (monthlyCapacity * (1 - Math.pow(1 + r, -termMonths))) / r
  }

  const cap = atmHardCap(productCode)
  if (cap != null) principal = Math.min(principal, cap)

  // Loan amounts are released in whole hundreds (legacy denomination rule).
  return Math.floor(principal / 100) * 100
}

export interface DisposableIncomeInputs {
  netTakeHomePay: number
  otherMonthlyObligations: number
}

export interface DisposableIncomeResult {
  monthlyAmortization: number
  totalMonthlyObligations: number
  remainingDisposable: number
  /** Legacy affordability rule: amortization must not exceed net take-home pay. */
  isAmortizationExceedingIncome: boolean
}

export function computeDisposableIncome(
  input: DisposableIncomeInputs,
  monthlyAmortization: number
): DisposableIncomeResult {
  const nthp = Number.isFinite(input.netTakeHomePay) ? input.netTakeHomePay : 0
  const obligations = Number.isFinite(input.otherMonthlyObligations)
    ? input.otherMonthlyObligations
    : 0
  const totalMonthlyObligations = round2(obligations + monthlyAmortization)
  const remainingDisposable = round2(nthp - totalMonthlyObligations)
  return {
    monthlyAmortization: round2(monthlyAmortization),
    totalMonthlyObligations,
    remainingDisposable,
    isAmortizationExceedingIncome: monthlyAmortization > nthp,
  }
}
