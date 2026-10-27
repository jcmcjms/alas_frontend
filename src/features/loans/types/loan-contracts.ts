/**
 * Typed API contracts for loan applications.
 * Shapes mirror the legacy ALAS backend contract; fields added for the ALAS v3
 * disbursement-timeout requirement are marked and documented as mock contracts
 * pending backend confirmation (see docs/WORKFLOW.md §Disbursement timeout).
 */
import type { LoanStatus } from "./loan-status"

export interface PagedResult<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface LoanListRow {
  id: string
  lamId: string
  applicationGroupNo: string
  clientName: string
  branchCode: string
  productCode: string
  product: string
  loanType: "New" | "Reloan"
  proposedAmount: number
  termDays: number
  status: LoanStatus
  applicationDate: string
  lastActionDate: string
  lastActionBy: string | null
  assignedTo: string | null
  documentsComplete: boolean | null
  flagged: boolean
  /** Disbursement deadline (approvedAt + 30 days) when the loan is approved. */
  disbursementDeadlineUtc: string | null
}

export interface LoanHistoryEntry {
  id: number
  action: string
  fromStatus: string | null
  toStatus: string | null
  comments: string | null
  actionDate: string
  actionByUserName: string
  actionByRole: string
}

export interface ObligationRow {
  id: string
  pn: string
  name: string | null
  principalBalance: number
  amortization: number
  outstandingBalance: number
  dateGranted: string | null
  dateMaturity: string | null
  status: string
  productWithDescription: string | null
}

export interface ChecklistDocumentDto {
  code: string
  name: string
  status: "Uploaded" | "Missing" | "NotRequired"
  uploadedAt: string | null
  uploadedBy: string | null
  contentType: string | null
  sizeBytes: number | null
}

export interface DeviationRemarkDto {
  id: string
  authorName: string
  authorRole: string
  body: string
  createdAt: string
}

export interface LoanDeviationDto {
  id: string
  code: string
  reasonText: string
  encoderJustification: string
  isFeeOverride: boolean
  severity: 0 | 1 | 2
  remarks: DeviationRemarkDto[]
}

export interface DocumentFlagDto {
  flaggedAt: string
  flaggedByName: string | null
  reason: string | null
  missingCount: number
}

export interface RoutingDto {
  requiredApprovalTier: number | null
  deviationSeverity: number
  totalExposure: number
  loanType: string
  matchedRule: string | null
  documentsComplete: boolean
  missingDocuments: string[]
  assignedApproverId: string | null
  assignedApproverName: string | null
  noAuthorityReason: string | null
}

export interface SignatureRecordDto {
  stage: string
  userId: string
  userName: string
  role: string
  signedAt: string
}

/** ALAS v3: disbursement tracking block (mock contract pending backend). */
export interface DisbursementDto {
  approvedAt: string | null
  deadlineUtc: string | null
  isOverdue: boolean
  daysRemaining: number | null
  disbursedAt: string | null
  disbursedBy: string | null
  disbursementReference: string | null
  voidedAt: string | null
  voidReason: string | null
}

export interface LoanDetail {
  id: string
  lamId: string
  applicationGroupNo: string
  branchCode: string
  loanNo: string | null
  productCode: string
  product: string
  loanType: "New" | "Reloan"
  status: LoanStatus
  rowVersion: string

  client: {
    cisNo: string
    firstName: string
    middleName: string | null
    lastName: string
    suffix: string | null
    birthDate: string | null
    address: string | null
    agency: string | null
    positionTitle: string | null
    employeeNumber: string | null
    netTakeHomePay: number | null
    lengthOfService: string | null
    accountNo: string | null
  }

  purpose: string | null
  proposedAmount: number
  termDays: number
  annualRatePercent: number
  computed: {
    termMonths: number
    monthlyAmortization: number
    applicationCharge: number
    notarialFee: number
    docStampFee: number
    insuranceFee: number
    totalUpfrontDeductions: number
    netProceeds: number
  }

  obligations: {
    outstandingLoans: ObligationRow[]
    buyOuts: ObligationRow[]
    ebiReloans: ObligationRow[]
    incomingLoans: ObligationRow[]
    totalMonthlyObligations: number
  }

  deviations: LoanDeviationDto[]
  documents: ChecklistDocumentDto[]
  documentsComplete: boolean | null
  documentFlag: DocumentFlagDto | null

  routing: RoutingDto
  signatures: SignatureRecordDto[]
  disbursement: DisbursementDto

  remarks: string | null
  evaluationVerdict: "Recommended" | "NotRecommended" | null
  createdById: string
  createdByName: string
  applicationDate: string
  lastActionDate: string
  history: LoanHistoryEntry[]
}

export type RevisionSectionId =
  | "client-info"
  | "loan-params"
  | "obligations"
  | "deviations"
  | "documents"
  | "verification"

export interface RevisionSectionFeedback {
  sectionId: RevisionSectionId
  comments: string
}

export interface RevisionRequest {
  id: string
  loanId: string
  requestedByName: string
  requestedByRole: string
  overallComments: string
  /** Status the application held when returned — resubmission returns here. */
  fromStatus: LoanStatus
  requestedAt: string
  isResolved: boolean
  resolvedAt: string | null
  sections: RevisionSectionFeedback[]
}

/** Payload to create one or more grouped applications for a client. */
export interface LoanLineInput {
  productCode: string
  purpose: string
  proposedAmount: number
  termDays: number
  annualRatePercent: number
  deviations: { code: string; justification: string }[]
}

export interface SubmitLoanApplicationsRequest {
  applicationGroupNo?: string
  idempotencyKey: string
  cisNo: string
  accountNo: string
  branchCode: string
  loanType: "New" | "Reloan"
  /** Checklist codes the encoder physically holds at encoding time. */
  documentsHeld: string[]
  client: {
    firstName: string
    middleName: string | null
    lastName: string
    suffix: string | null
    birthDate: string | null
    address: string | null
    agency: string | null
    positionTitle: string | null
    employeeNumber: string | null
    netTakeHomePay: number | null
    lengthOfService: string | null
  }
  obligations: {
    outstandingLoans: ObligationRow[]
    buyOuts: ObligationRow[]
    ebiReloans: ObligationRow[]
    incomingLoans: ObligationRow[]
  }
  loans: LoanLineInput[]
}

export interface CreatedLoanSummary {
  id: string
  lamId: string
  productCode: string
  product: string
  proposedAmount: number
  /** Initial status assigned by the backend from the workflow configuration. */
  status: LoanStatus
}

export interface LoanSubmissionResult {
  applicationGroupNo: string
  loans: CreatedLoanSummary[]
}

/** Payload to resubmit a corrected (returned) application. */
export interface ReviseLoanRequest {
  rowVersion: string
  purpose?: string
  proposedAmount?: number
  termDays?: number
  annualRatePercent?: number
  deviations?: { code: string; justification: string }[]
  resolutionNotes: string
}

export interface DeskLoanDto {
  loanId: string
  lamId: string
  clientName: string
  status: LoanStatus
  productCode: string
  product: string
  loanType: "New" | "Reloan"
  proposedAmount: number
  termDays: number
  applicationDate: string
  hasDeviations: boolean
  documentsComplete: boolean | null
  branchCode: string
}

/** One client bundle waiting at a desk. Claiming takes the whole bundle. */
export interface DeskGroupDto {
  groupNo: string
  clientName: string
  cisNo: string
  position: number
  ownerUserId: string | null
  ownerName: string | null
  enqueuedAt: string
  applications: DeskLoanDto[]
}

export interface DeskQueueResponse {
  deskLabel: string
  scopeDescription: string
  queueStatus: LoanStatus
  items: DeskGroupDto[]
  /** Every bundle the current officer holds. */
  currentClaims: DeskGroupDto[]
}

export interface ClaimResponse {
  groupNo: string
  /** Primary application to open first. */
  loanId: string
  lamId: string
  clientName: string
  status: LoanStatus
  applications: { loanId: string; lamId: string; status: LoanStatus }[]
}

export interface WorkflowConfigurationDto {
  requireRecommendation: boolean
  initialStatus: LoanStatus
  stages: string[]
  source: "Database" | "AppConfig"
  updatedAt: string | null
  updatedByName: string | null
  /** Concurrency token echoed on update; a mismatch yields 409. */
  version: number
}

export interface WorkflowActionRequest {
  remarks?: string
  rowVersion?: string
}

export interface EvaluationActionRequest extends WorkflowActionRequest {
  recommend: boolean
}

export interface PushbackActionRequest {
  sections: { sectionId: RevisionSectionId; comments: string }[]
  overallComments: string
  rowVersion?: string
}

export interface ExpireLoanRequest {
  reason: string
}
