/**
 * Canonical loan application statuses.
 * Source: ALAS backend contract (mirrored from the legacy frontend's
 * LOAN_STATUS_META). `Expired` is the ALAS v3 void state for applications that
 * pass the 30-day disbursement timeout — the backend owns the transition; the
 * UI only displays it and requests it through the documented endpoint.
 */
export type LoanStatus =
  | "Draft"
  | "ForRecommendation"
  | "ForChecking"
  | "ForApproval"
  | "ForRevision"
  | "ForIncompleteDocuments"
  | "Approved"
  | "ForDisbursement"
  | "Disbursed"
  | "OnGoing"
  | "Rejected"
  | "Cancelled"
  | "Expired"

export type StatusTone =
  "neutral" | "info" | "positive" | "warning" | "negative"

export interface LoanStatusMeta {
  label: string
  tone: StatusTone
  /** Handling-time target in hours while the status is actionable; null when none. */
  defaultSlaHours: number | null
  hint: string
}

export const LOAN_STATUS_META: Record<LoanStatus, LoanStatusMeta> = {
  Draft: {
    label: "Draft",
    tone: "neutral",
    defaultSlaHours: null,
    hint: "Encoded, not yet submitted",
  },
  ForRecommendation: {
    label: "For Recommendation",
    tone: "info",
    defaultSlaHours: 4,
    hint: "With the Branch Head (Recommender)",
  },
  ForChecking: {
    label: "For Checking",
    tone: "info",
    defaultSlaHours: 8,
    hint: "With the Credit Checker (Evaluator)",
  },
  ForApproval: {
    label: "For Approval",
    tone: "info",
    defaultSlaHours: 8,
    hint: "With the Area Head (Approver)",
  },
  ForRevision: {
    label: "For Revision",
    tone: "warning",
    defaultSlaHours: 24,
    hint: "Returned to the Encoder for fixes",
  },
  ForIncompleteDocuments: {
    label: "For Incomplete Documents",
    tone: "warning",
    defaultSlaHours: 24,
    hint: "Returned because required documents are incomplete",
  },
  Approved: {
    label: "Approved",
    tone: "positive",
    defaultSlaHours: null,
    hint: "Approved, awaiting disbursement setup",
  },
  ForDisbursement: {
    label: "For Disbursement",
    tone: "info",
    defaultSlaHours: 24,
    hint: "Release of proceeds in progress",
  },
  Disbursed: {
    label: "Disbursed",
    tone: "positive",
    defaultSlaHours: null,
    hint: "Proceeds released",
  },
  OnGoing: {
    label: "On Going",
    tone: "positive",
    defaultSlaHours: null,
    hint: "Active receiving loan",
  },
  Rejected: {
    label: "Rejected",
    tone: "negative",
    defaultSlaHours: null,
    hint: "Declined, no further steps",
  },
  Cancelled: {
    label: "Cancelled",
    tone: "neutral",
    defaultSlaHours: null,
    hint: "Client withdrew, no further steps",
  },
  Expired: {
    label: "Expired (Voided)",
    tone: "negative",
    defaultSlaHours: null,
    hint: "Voided — proceeds were not released within the 30-day disbursement window",
  },
}

export const LOAN_STATUSES = Object.keys(LOAN_STATUS_META) as LoanStatus[]

export function isLoanStatus(value: unknown): value is LoanStatus {
  return typeof value === "string" && value in LOAN_STATUS_META
}

export function statusLabel(status: string): string {
  return isLoanStatus(status) ? LOAN_STATUS_META[status].label : status
}

/** Filter order for status pickers: actionable pipeline states first. */
export const STATUS_FILTER_ORDER: LoanStatus[] = [
  "ForRecommendation",
  "ForChecking",
  "ForApproval",
  "ForRevision",
  "ForIncompleteDocuments",
  "Approved",
  "ForDisbursement",
  "Disbursed",
  "OnGoing",
  "Draft",
  "Rejected",
  "Cancelled",
  "Expired",
]

/** Statuses in which the owning encoder may cancel the application. */
export const CANCELLABLE_STATUSES: LoanStatus[] = [
  "Draft",
  "ForRecommendation",
  "ForChecking",
  "ForApproval",
  "ForRevision",
  "ForIncompleteDocuments",
]

/** Terminal statuses: no workflow action may move the application again. */
export const TERMINAL_STATUSES: LoanStatus[] = [
  "Rejected",
  "Cancelled",
  "Expired",
  "OnGoing",
]

/** The 30-day disbursement window enforced by the backend (ALAS v3 rule). */
export const DISBURSEMENT_TIMEOUT_DAYS = 30

/** Days before the deadline at which the UI marks an application "at risk". */
export const DISBURSEMENT_AT_RISK_DAYS = 5
