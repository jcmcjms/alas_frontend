import { describe, expect, it } from "vitest"

import { makeLoanCreateSchema, type ProductRule } from "./loan-create.schema"

const C34: ProductRule = {
  code: "C34",
  description: "ATM Salary Loan — Regular",
  minAmount: 20_000,
  maxAmount: 200_000,
  minTermDays: 180,
  maxTermDays: 1080,
  defaultAnnualRatePercent: 12,
  isRetired: false,
  notarialFee: 500,
  docStampFee: 200,
  insuranceFee: 1_200,
  applicationChargeRate: 0.01,
}

const RETIRED: ProductRule = { ...C34, code: "OLD", isRetired: true }

function line(overrides: Record<string, unknown> = {}) {
  return {
    productCode: "C34",
    purpose: "Home renovation",
    proposedAmount: 150_000,
    termDays: 360,
    annualRatePercent: 12,
    deviations: [],
    ...overrides,
  }
}

describe("loan creation schema (server catalog drives the rules)", () => {
  const schema = makeLoanCreateSchema([C34, RETIRED])

  it("accepts a compliant application", () => {
    const result = schema.safeParse({
      cisNo: "100234",
      accountNo: "0118-2034-55",
      loanType: "New",
      loans: [line()],
      documentsHeld: ["APP-FORM"],
    })
    expect(result.success).toBe(true)
  })

  it("requires a selected client and account", () => {
    const result = schema.safeParse({
      cisNo: "",
      accountNo: "",
      loanType: "New",
      loans: [line()],
      documentsHeld: [],
    })
    expect(result.success).toBe(false)
  })

  it("requires at least one loan line", () => {
    const result = schema.safeParse({
      cisNo: "100234",
      accountNo: "ACC",
      loanType: "New",
      loans: [],
      documentsHeld: [],
    })
    expect(result.success).toBe(false)
  })

  it("enforces the product amount range", () => {
    const tooSmall = schema.safeParse({
      cisNo: "1",
      accountNo: "A",
      loanType: "New",
      loans: [line({ proposedAmount: 10_000 })],
      documentsHeld: [],
    })
    expect(tooSmall.success).toBe(false)

    const tooBig = schema.safeParse({
      cisNo: "1",
      accountNo: "A",
      loanType: "New",
      loans: [line({ proposedAmount: 250_000 })],
      documentsHeld: [],
    })
    expect(tooBig.success).toBe(false)
  })

  it("enforces the whole-hundreds denomination", () => {
    const result = schema.safeParse({
      cisNo: "1",
      accountNo: "A",
      loanType: "New",
      loans: [line({ proposedAmount: 150_050 })],
      documentsHeld: [],
    })
    expect(result.success).toBe(false)
  })

  it("enforces the product term window", () => {
    const result = schema.safeParse({
      cisNo: "1",
      accountNo: "A",
      loanType: "New",
      loans: [line({ termDays: 90 })],
      documentsHeld: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects retired products", () => {
    const result = schema.safeParse({
      cisNo: "1",
      accountNo: "A",
      loanType: "New",
      loans: [line({ productCode: "OLD" })],
      documentsHeld: [],
    })
    expect(result.success).toBe(false)
  })

  it("requires an interest-rate deviation when undercutting the product default", () => {
    const without = schema.safeParse({
      cisNo: "1",
      accountNo: "A",
      loanType: "New",
      loans: [line({ annualRatePercent: 10.5 })],
      documentsHeld: [],
    })
    expect(without.success).toBe(false)

    const withDeviation = schema.safeParse({
      cisNo: "1",
      accountNo: "A",
      loanType: "New",
      loans: [
        line({
          annualRatePercent: 10.5,
          deviations: [
            {
              code: "RATE-01",
              justification: "Retention memo RO7-2026-14 applies.",
            },
          ],
        }),
      ],
      documentsHeld: [],
    })
    expect(withDeviation.success).toBe(true)
  })

  it("requires justifications of at least 10 characters on deviations", () => {
    const result = schema.safeParse({
      cisNo: "1",
      accountNo: "A",
      loanType: "New",
      loans: [
        line({ deviations: [{ code: "FEE-01", justification: "short" }] }),
      ],
      documentsHeld: [],
    })
    expect(result.success).toBe(false)
  })

  it("validates every line of a grouped submission", () => {
    const result = schema.safeParse({
      cisNo: "1",
      accountNo: "A",
      loanType: "New",
      loans: [line(), line({ proposedAmount: 10 })],
      documentsHeld: [],
    })
    expect(result.success).toBe(false)
  })
})
