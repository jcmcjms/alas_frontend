import { z } from "zod"

export interface ProductRule {
  code: string
  description: string
  minAmount: number
  maxAmount: number
  minTermDays: number
  maxTermDays: number
  defaultAnnualRatePercent: number
  isRetired: boolean
  /** Fee schedule (product-driven; never invented client-side). */
  notarialFee: number
  docStampFee: number
  insuranceFee: number
  applicationChargeRate: number
}

export const deviationSchema = z.object({
  code: z.string().min(1, "Select the deviation reason."),
  justification: z
    .string()
    .trim()
    .min(10, "Justify the deviation for the reviewer (min 10 characters).")
    .max(500),
})

export const loanLineSchema = z.object({
  productCode: z.string().min(1, "Select a loan product."),
  purpose: z
    .string()
    .trim()
    .min(4, "State the loan purpose (min 4 characters).")
    .max(200, "Keep the purpose under 200 characters."),
  proposedAmount: z.number({ message: "Enter the loan amount." }),
  termDays: z.number({ message: "Enter the term in days." }),
  annualRatePercent: z
    .number({ message: "Enter the annual interest rate." })
    .min(0, "Rate cannot be negative.")
    .max(30, "Rate above 30% requires head-office approval."),
  deviations: z.array(deviationSchema),
})

export type LoanLineValues = z.infer<typeof loanLineSchema>

/**
 * Schema factory: product limits come from the server catalog (never invented
 * client-side), so validation stays aligned with the backend contract.
 */
export function makeLoanCreateSchema(products: ProductRule[]) {
  const line = loanLineSchema.superRefine((line, ctx) => {
    const product = products.find(
      (candidate) => candidate.code === line.productCode
    )
    if (!product) {
      ctx.addIssue({
        code: "custom",
        path: ["productCode"],
        message: "Select a valid, active product.",
      })
      return
    }
    if (product.isRetired) {
      ctx.addIssue({
        code: "custom",
        path: ["productCode"],
        message: "This product is retired and cannot accept new applications.",
      })
    }
    if (!Number.isFinite(line.proposedAmount) || line.proposedAmount <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["proposedAmount"],
        message: "Amount must be greater than zero.",
      })
      return
    }
    if (
      line.proposedAmount < product.minAmount ||
      line.proposedAmount > product.maxAmount
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["proposedAmount"],
        message: `${product.code} accepts ₱${product.minAmount.toLocaleString()}–₱${product.maxAmount.toLocaleString()}.`,
      })
    }
    if (line.proposedAmount % 100 !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["proposedAmount"],
        message: "Amounts are released in whole hundreds of pesos.",
      })
    }
    if (
      !Number.isFinite(line.termDays) ||
      line.termDays < product.minTermDays ||
      line.termDays > product.maxTermDays
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["termDays"],
        message: `Term must be ${product.minTermDays}–${product.maxTermDays} days for ${product.code}.`,
      })
    }
    if (
      product.defaultAnnualRatePercent != null &&
      line.annualRatePercent < product.defaultAnnualRatePercent
    ) {
      const hasRateDeviation = line.deviations.some(
        (deviation) => deviation.code === "RATE-01"
      )
      if (!hasRateDeviation) {
        ctx.addIssue({
          code: "custom",
          path: ["annualRatePercent"],
          message: `A rate below the product default (${product.defaultAnnualRatePercent}%) requires the "Interest-rate reduction" deviation.`,
        })
      }
    }
  })

  return z.object({
    cisNo: z.string().min(1, "Select the client from CIS."),
    accountNo: z.string().min(1, "Select the client account."),
    loanType: z.enum(["New", "Reloan"]),
    loans: z.array(line).min(1, "Add at least one loan application."),
    documentsHeld: z.array(z.string()),
  })
}

export type LoanCreateFormValues = z.infer<
  ReturnType<typeof makeLoanCreateSchema>
>

export const LOAN_CREATE_DEFAULTS: LoanCreateFormValues = {
  cisNo: "",
  accountNo: "",
  loanType: "New",
  loans: [],
  documentsHeld: [],
}

export const REVISION_SECTION_LABELS: Record<string, string> = {
  "client-info": "Client information",
  "loan-params": "Loan parameters",
  obligations: "Obligations",
  deviations: "Deviations",
  documents: "Documents",
  verification: "Verification",
}
