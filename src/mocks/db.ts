/**
 * In-memory mock database. Plays the role of the ALAS backend for development
 * and tests: it owns persisted state, enforces workflow transitions, approval
 * authority, concurrency (rowVersion) and the 30-day disbursement rule, so the
 * frontend can never fake a transition locally.
 *
 * All data is synthetic. `resetDb()` re-seeds deterministic state (used by the
 * test setup and the dev scenario switcher).
 */
import type { LoanStatus } from "@/features/loans/types/loan-status"
import { DISBURSEMENT_TIMEOUT_DAYS } from "@/features/loans/types/loan-status"
import type {
  ChecklistDocumentDto,
  DeskGroupDto,
  DisbursementDto,
  LoanDeviationDto,
  LoanHistoryEntry,
  ObligationRow,
  RevisionRequest,
  SignatureRecordDto,
} from "@/features/loans/types/loan-contracts"
import { computeLoanTotals } from "@/features/loans/model/loan-computations"
import {
  DOCUMENT_TEMPLATE,
  MOCK_APPROVAL_AUTHORITIES,
  MOCK_BRANCHES,
  MOCK_CIS_CLIENTS,
  MOCK_DEVIATION_CATALOG,
  MOCK_PRODUCTS,
  MOCK_USERS,
  type MockApprovalAuthority,
  type MockBranch,
  type MockCisClient,
  type MockDeviationCatalogEntry,
  type MockProduct,
  type MockUserRecord,
} from "./fixtures/base-data"

// ---------------------------------------------------------------- time utils
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function iso(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString()
}
export function daysAgo(days: number, hours = 0): string {
  return iso(-days * DAY - hours * HOUR)
}
export function daysFromNow(days: number): string {
  return iso(days * DAY)
}

// -------------------------------------------------------------------- records
export interface DbLoanClient {
  cisNo: string
  accountNo: string
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

export interface DbLoan {
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
  client: DbLoanClient
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
  documentFlag: {
    flaggedAt: string
    flaggedByName: string | null
    reason: string | null
    missingCount: number
  } | null
  remarks: string | null
  evaluationVerdict: "Recommended" | "NotRecommended" | null
  createdById: string
  createdByName: string
  applicationDate: string
  lastActionDate: string
  enqueuedAt: string | null
  ownerUserId: string | null
  history: LoanHistoryEntry[]
  revisionRequests: RevisionRequest[]
  signatures: SignatureRecordDto[]
  disbursement: {
    approvedAt: string | null
    deadlineUtc: string | null
    disbursedAt: string | null
    disbursedBy: string | null
    disbursementReference: string | null
    voidedAt: string | null
    voidReason: string | null
  }
}

export interface DbNotification {
  id: string
  userId: string
  title: string
  body: string
  type: "workflow" | "correction" | "disbursement" | "system"
  link: string | null
  createdAt: string
  readAt: string | null
}

export interface DbSession {
  id: string
  userId: string
  deviceInfo: string
  ipAddress: string
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

export interface DbActivity {
  id: string
  userId: string
  lamId: string
  loanClientName: string
  action: string
  fromStatus: string | null
  toStatus: string | null
  comments: string | null
  actionDate: string
}

export interface DbState {
  users: MockUserRecord[]
  branches: MockBranch[]
  products: MockProduct[]
  cisClients: MockCisClient[]
  deviationCatalog: MockDeviationCatalogEntry[]
  approvalAuthorities: MockApprovalAuthority[]
  loans: DbLoan[]
  notifications: DbNotification[]
  sessions: DbSession[]
  activities: DbActivity[]
  workflowConfig: {
    requireRecommendation: boolean
    source: "Database" | "AppConfig"
    updatedAt: string | null
    updatedByName: string | null
    version: number
  }
  lamSeq: number
  groupSeq: number
  historySeq: number
  notifSeq: number
  /** Idempotency-Key → previous result, so retries never duplicate groups. */
  idempotency: Map<string, { applicationGroupNo: string; loanIds: string[] }>
  /** Tokens issued by the mock auth (token → userId). */
  tokens: Map<string, { userId: string; expiresAt: number }>
}

let dbState: DbState | null = null

export function db(): DbState {
  if (!dbState) dbState = seed()
  return dbState
}

export function resetDb(): void {
  dbState = seed()
}

// --------------------------------------------------------------- seeding core
function product(code: string): MockProduct {
  const found = MOCK_PRODUCTS.find((p) => p.code === code)
  if (!found) throw new Error(`Unknown mock product ${code}`)
  return found
}

function clientSnapshot(cisNo: string, accountNo?: string): DbLoanClient {
  const client = MOCK_CIS_CLIENTS.find((c) => c.cisNo === cisNo)
  if (!client) throw new Error(`Unknown mock CIS client ${cisNo}`)
  return {
    cisNo,
    accountNo: accountNo ?? client.accounts[0].accountNo,
    firstName: client.firstName,
    middleName: client.middleName,
    lastName: client.lastName,
    suffix: client.suffix,
    birthDate: client.birthDate,
    address: client.address,
    agency: client.agency,
    positionTitle: client.positionTitle,
    employeeNumber: client.employeeNumber,
    netTakeHomePay: client.netTakeHomePay,
    lengthOfService: client.lengthOfService,
  }
}

function obligationsFor(cisNo: string): DbLoan["obligations"] {
  const client = MOCK_CIS_CLIENTS.find((c) => c.cisNo === cisNo)
  const rows: ObligationRow[] = (client?.outstanding ?? []).map(
    (loan, index) => ({
      id: `ob-${cisNo}-${index}`,
      pn: loan.pn,
      name: null,
      principalBalance: loan.principalBalance,
      amortization: loan.amortization,
      outstandingBalance: loan.outstandingBalance,
      dateGranted: loan.dateGranted,
      dateMaturity: loan.dateMaturity,
      status: loan.status,
      productWithDescription: loan.productWithDescription,
    })
  )
  return {
    outstandingLoans: rows,
    buyOuts: [],
    ebiReloans: [],
    incomingLoans: [],
    totalMonthlyObligations: rows.reduce(
      (sum, row) => sum + row.amortization,
      0
    ),
  }
}

function docsFor(
  status: "all-uploaded" | "some-missing",
  missingCodes: string[] = [],
  uploadedAt = daysAgo(6)
): ChecklistDocumentDto[] {
  return DOCUMENT_TEMPLATE.map((doc) => {
    const missing = status === "some-missing" && missingCodes.includes(doc.code)
    return {
      code: doc.code,
      name: doc.name,
      status: missing ? ("Missing" as const) : ("Uploaded" as const),
      uploadedAt: missing ? null : uploadedAt,
      uploadedBy: missing ? null : "Ana Reyes",
      contentType: missing ? null : "image/png",
      sizeBytes: missing ? null : 240_000,
    }
  })
}

interface SeedLoanInput {
  lamId: string
  groupNo: string
  cisNo: string
  branchCode: string
  productCode: string
  loanType?: "New" | "Reloan"
  purpose: string
  proposedAmount: number
  termDays: number
  annualRatePercent?: number
  status: LoanStatus
  encoderId?: string
  applicationDate: string
  lastActionDate: string
  enqueuedAt?: string | null
  ownerUserId?: string | null
  documents?: ChecklistDocumentDto[]
  deviations?: LoanDeviationDto[]
  evaluationVerdict?: "Recommended" | "NotRecommended" | null
  remarks?: string | null
  documentFlag?: DbLoan["documentFlag"]
  revisionRequests?: RevisionRequest[]
  history: Omit<LoanHistoryEntry, "id">[]
  signatures?: SignatureRecordDto[]
  disbursement?: Partial<DbLoan["disbursement"]>
}

function seedLoan(state: DbState, input: SeedLoanInput): DbLoan {
  const prod = product(input.productCode)
  const annualRatePercent =
    input.annualRatePercent ?? prod.defaultAnnualRatePercent
  const totals = computeLoanTotals({
    principal: input.proposedAmount,
    annualRatePercent,
    termDays: input.termDays,
    notarialFee: prod.notarialFee,
    docStampFee: prod.docStampFee,
    insuranceFee: prod.insuranceFee,
    applicationChargeRate: prod.applicationChargeRate,
  })
  const encoder = state.users.find(
    (u) => u.id === (input.encoderId ?? "enc-01")
  )
  const obligations = obligationsFor(input.cisNo)
  const documents = input.documents ?? docsFor("all-uploaded")
  const loan: DbLoan = {
    id: String(1000 + state.loans.length + 1),
    lamId: input.lamId,
    applicationGroupNo: input.groupNo,
    branchCode: input.branchCode,
    loanNo: null,
    productCode: input.productCode,
    product: prod.description,
    loanType: input.loanType ?? "New",
    status: input.status,
    rowVersion: String(input.history.length + 1),
    client: clientSnapshot(input.cisNo),
    purpose: input.purpose,
    proposedAmount: input.proposedAmount,
    termDays: input.termDays,
    annualRatePercent,
    computed: {
      ...totals,
      notarialFee: prod.notarialFee,
      docStampFee: prod.docStampFee,
      insuranceFee: prod.insuranceFee,
    },
    obligations,
    deviations: input.deviations ?? [],
    documents,
    documentsComplete: documents.every((d) => d.status !== "Missing"),
    documentFlag: input.documentFlag ?? null,
    remarks: input.remarks ?? null,
    evaluationVerdict: input.evaluationVerdict ?? null,
    createdById: encoder?.id ?? "enc-01",
    createdByName: encoder
      ? `${encoder.firstName} ${encoder.lastName}`
      : "Ana Reyes",
    applicationDate: input.applicationDate,
    lastActionDate: input.lastActionDate,
    enqueuedAt: input.enqueuedAt ?? null,
    ownerUserId: input.ownerUserId ?? null,
    history: input.history.map((entry) => ({
      ...entry,
      id: ++state.historySeq,
    })),
    revisionRequests: input.revisionRequests ?? [],
    signatures: input.signatures ?? [],
    disbursement: {
      approvedAt: null,
      deadlineUtc: null,
      disbursedAt: null,
      disbursedBy: null,
      disbursementReference: null,
      voidedAt: null,
      voidReason: null,
      ...input.disbursement,
    },
  }
  state.loans.push(loan)
  return loan
}

function seed(): DbState {
  const state: DbState = {
    users: structuredClone(MOCK_USERS),
    branches: structuredClone(MOCK_BRANCHES),
    products: structuredClone(MOCK_PRODUCTS),
    cisClients: structuredClone(MOCK_CIS_CLIENTS),
    deviationCatalog: structuredClone(MOCK_DEVIATION_CATALOG),
    approvalAuthorities: structuredClone(MOCK_APPROVAL_AUTHORITIES),
    loans: [],
    notifications: [],
    sessions: [],
    activities: [],
    workflowConfig: {
      requireRecommendation: true,
      source: "Database",
      updatedAt: daysAgo(9),
      updatedByName: "Carla Villanueva",
      version: 3,
    },
    lamSeq: 16,
    groupSeq: 16,
    historySeq: 0,
    notifSeq: 0,
    idempotency: new Map(),
    tokens: new Map(),
  }

  const submitted = (days: number) => [
    {
      action: "Submit",
      fromStatus: "Draft",
      toStatus: "ForRecommendation",
      comments: null,
      actionDate: daysAgo(days),
      actionByUserName: "Ana Reyes",
      actionByRole: "Encoder",
    },
  ]

  // 1-2: a two-application bundle waiting for recommendation (GRP-2026-0001)
  seedLoan(state, {
    lamId: "LAM-2026-0001",
    groupNo: "GRP-2026-0001",
    cisNo: "100234",
    branchCode: "B001",
    productCode: "C34",
    purpose: "Home renovation",
    proposedAmount: 150_000,
    termDays: 360,
    status: "ForRecommendation",
    applicationDate: daysAgo(1),
    lastActionDate: daysAgo(1),
    enqueuedAt: daysAgo(1, 2),
    history: submitted(1),
  })
  seedLoan(state, {
    lamId: "LAM-2026-0002",
    groupNo: "GRP-2026-0001",
    cisNo: "100234",
    branchCode: "B001",
    productCode: "C27",
    purpose: "Tuition assistance",
    proposedAmount: 80_000,
    termDays: 180,
    status: "ForRecommendation",
    applicationDate: daysAgo(1),
    lastActionDate: daysAgo(1),
    enqueuedAt: daysAgo(1, 2),
    history: submitted(1),
  })
  // 3: single application for recommendation, other branch's encoder
  seedLoan(state, {
    lamId: "LAM-2026-0003",
    groupNo: "GRP-2026-0002",
    cisNo: "100587",
    branchCode: "B002",
    productCode: "C29",
    purpose: "Medical expenses",
    proposedAmount: 90_000,
    termDays: 360,
    status: "ForRecommendation",
    encoderId: "enc-02",
    applicationDate: daysAgo(2),
    lastActionDate: daysAgo(2),
    enqueuedAt: daysAgo(2, 1),
    history: [
      {
        action: "Submit",
        fromStatus: "Draft",
        toStatus: "ForRecommendation",
        comments: null,
        actionDate: daysAgo(2),
        actionByUserName: "Paolo Garcia",
        actionByRole: "Encoder",
      },
    ],
  })
  // 4: for checking — reloan with rate-reduction deviation
  seedLoan(state, {
    lamId: "LAM-2026-0004",
    groupNo: "GRP-2026-0003",
    cisNo: "100912",
    branchCode: "B003",
    productCode: "C34",
    loanType: "Reloan",
    purpose: "Consolidate existing loan",
    proposedAmount: 200_000,
    termDays: 720,
    annualRatePercent: 10.5,
    status: "ForChecking",
    encoderId: "usr-08",
    applicationDate: daysAgo(3),
    lastActionDate: daysAgo(1, 5),
    enqueuedAt: daysAgo(1, 5),
    deviations: [
      {
        id: "dev-1",
        code: "RATE-01",
        reasonText: "Interest-rate reduction",
        encoderJustification:
          "Tenured client (18 yrs) with clean payment history on PN-2024-5567; area office pre-approved the 10.5% rate per retention memo RO7-2026-14.",
        isFeeOverride: true,
        severity: 2,
        remarks: [
          {
            id: "dr-1",
            authorName: "Ramon Cruz",
            authorRole: "Recommender",
            body: "Verified against retention memo. Endorsed for evaluation.",
            createdAt: daysAgo(1, 6),
          },
        ],
      },
    ],
    history: [
      ...submitted(3),
      {
        action: "Recommend",
        fromStatus: "ForRecommendation",
        toStatus: "ForChecking",
        comments: "Rate deviation supported by retention memo.",
        actionDate: daysAgo(1, 5),
        actionByUserName: "Ramon Cruz",
        actionByRole: "Recommender",
      },
    ],
    signatures: [
      {
        stage: "Recommendation",
        userId: "rec-01",
        userName: "Ramon Cruz",
        role: "Recommender",
        signedAt: daysAgo(1, 5),
      },
    ],
  })
  // 5: for approval — recommended
  seedLoan(state, {
    lamId: "LAM-2026-0005",
    groupNo: "GRP-2026-0004",
    cisNo: "101043",
    branchCode: "B004",
    productCode: "C21",
    purpose: "Vehicle down payment",
    proposedAmount: 180_000,
    termDays: 540,
    status: "ForApproval",
    encoderId: "enc-02",
    applicationDate: daysAgo(5),
    lastActionDate: daysAgo(1, 1),
    enqueuedAt: daysAgo(1, 1),
    evaluationVerdict: "Recommended",
    remarks:
      "Capacity check passed; NTHP covers amortization with 28% headroom.",
    history: [
      {
        action: "Submit",
        fromStatus: "Draft",
        toStatus: "ForRecommendation",
        comments: null,
        actionDate: daysAgo(5),
        actionByUserName: "Paolo Garcia",
        actionByRole: "Encoder",
      },
      {
        action: "Recommend",
        fromStatus: "ForRecommendation",
        toStatus: "ForChecking",
        comments: null,
        actionDate: daysAgo(3),
        actionByUserName: "Ramon Cruz",
        actionByRole: "Recommender",
      },
      {
        action: "Evaluate",
        fromStatus: "ForChecking",
        toStatus: "ForApproval",
        comments:
          "Capacity check passed; NTHP covers amortization with 28% headroom.",
        actionDate: daysAgo(1, 1),
        actionByUserName: "Maria Domingo",
        actionByRole: "Evaluator",
      },
    ],
    signatures: [
      {
        stage: "Recommendation",
        userId: "rec-01",
        userName: "Ramon Cruz",
        role: "Recommender",
        signedAt: daysAgo(3),
      },
      {
        stage: "Evaluation",
        userId: "eval-01",
        userName: "Maria Domingo",
        role: "Evaluator",
        signedAt: daysAgo(1, 1),
      },
    ],
  })
  // 6: for approval — evaluation NOT recommended (still advances; approver decides)
  seedLoan(state, {
    lamId: "LAM-2026-0006",
    groupNo: "GRP-2026-0005",
    cisNo: "101188",
    branchCode: "B002",
    productCode: "C25",
    purpose: "Business inventory",
    proposedAmount: 200_000,
    termDays: 720,
    status: "ForApproval",
    applicationDate: daysAgo(6),
    lastActionDate: daysAgo(1, 3),
    enqueuedAt: daysAgo(1, 3),
    evaluationVerdict: "NotRecommended",
    remarks:
      "Total exposure with two active loans reaches 68% of NTHP; above the 60% internal comfort threshold. Final call deferred to the Approver.",
    deviations: [
      {
        id: "dev-2",
        code: "AGE-01",
        reasonText: "Age outside prescribed parameters",
        encoderJustification:
          "Client turns 65 within the term; requested maturity shortened accordingly per HR certification.",
        isFeeOverride: false,
        severity: 2,
        remarks: [],
      },
    ],
    history: [
      ...submitted(6),
      {
        action: "Recommend",
        fromStatus: "ForRecommendation",
        toStatus: "ForChecking",
        comments: null,
        actionDate: daysAgo(4),
        actionByUserName: "Ramon Cruz",
        actionByRole: "Recommender",
      },
      {
        action: "Evaluate (NotRecommended)",
        fromStatus: "ForChecking",
        toStatus: "ForApproval",
        comments: "Total exposure with two active loans reaches 68% of NTHP.",
        actionDate: daysAgo(1, 3),
        actionByUserName: "Maria Domingo",
        actionByRole: "Evaluator",
      },
    ],
    signatures: [
      {
        stage: "Evaluation",
        userId: "eval-01",
        userName: "Maria Domingo",
        role: "Evaluator",
        signedAt: daysAgo(1, 3),
      },
    ],
  })
  // 7: returned for revision (evaluator pushback with section feedback)
  seedLoan(state, {
    lamId: "LAM-2026-0007",
    groupNo: "GRP-2026-0006",
    cisNo: "100234",
    branchCode: "B001",
    productCode: "C02",
    purpose: "Emergency medical",
    proposedAmount: 60_000,
    termDays: 360,
    status: "ForRevision",
    applicationDate: daysAgo(8),
    lastActionDate: daysAgo(2),
    documents: docsFor("some-missing", ["PAYS-2", "SERVICE-REC"]),
    revisionRequests: [
      {
        id: "rev-1",
        loanId: "1007",
        requestedByName: "Maria Domingo",
        requestedByRole: "Evaluator",
        overallComments:
          "Please complete the payslip set and service record before this can proceed to approval.",
        fromStatus: "ForChecking",
        requestedAt: daysAgo(2),
        isResolved: false,
        resolvedAt: null,
        sections: [
          {
            sectionId: "documents",
            comments:
              "Second latest payslip missing; ATM loans require the last two payslips.",
          },
          {
            sectionId: "client-info",
            comments:
              "Service record not on file — required for the length-of-service claim.",
          },
        ],
      },
    ],
    history: [
      ...submitted(8),
      {
        action: "Recommend",
        fromStatus: "ForRecommendation",
        toStatus: "ForChecking",
        comments: null,
        actionDate: daysAgo(5),
        actionByUserName: "Ramon Cruz",
        actionByRole: "Recommender",
      },
      {
        action: "PushBack",
        fromStatus: "ForChecking",
        toStatus: "ForRevision",
        comments: "Missing payslip and service record.",
        actionDate: daysAgo(2),
        actionByUserName: "Maria Domingo",
        actionByRole: "Evaluator",
      },
    ],
  })
  // 8: incomplete documents (flagged by evaluator)
  seedLoan(state, {
    lamId: "LAM-2026-0008",
    groupNo: "GRP-2026-0007",
    cisNo: "100587",
    branchCode: "B002",
    productCode: "C34",
    purpose: "Dental procedure",
    proposedAmount: 120_000,
    termDays: 540,
    status: "ForIncompleteDocuments",
    encoderId: "enc-02",
    applicationDate: daysAgo(7),
    lastActionDate: daysAgo(1, 8),
    documents: docsFor("some-missing", ["BANK-STMT", "CIBI"]),
    documentFlag: {
      flaggedAt: daysAgo(1, 8),
      flaggedByName: "Maria Domingo",
      reason: "Bank statement and CIBI documentation not uploaded",
      missingCount: 2,
    },
    history: [
      {
        action: "Submit",
        fromStatus: "Draft",
        toStatus: "ForRecommendation",
        comments: null,
        actionDate: daysAgo(7),
        actionByUserName: "Paolo Garcia",
        actionByRole: "Encoder",
      },
      {
        action: "Recommend",
        fromStatus: "ForRecommendation",
        toStatus: "ForChecking",
        comments: null,
        actionDate: daysAgo(4),
        actionByUserName: "Ramon Cruz",
        actionByRole: "Recommender",
      },
      {
        action: "FlagDocuments",
        fromStatus: "ForChecking",
        toStatus: "ForIncompleteDocuments",
        comments: "Bank statement and CIBI documentation not uploaded",
        actionDate: daysAgo(1, 8),
        actionByUserName: "Maria Domingo",
        actionByRole: "Evaluator",
      },
    ],
  })
  // 9: approved 12 days ago — disbursement window healthy
  seedLoan(state, {
    lamId: "LAM-2026-0009",
    groupNo: "GRP-2026-0008",
    cisNo: "100912",
    branchCode: "B003",
    productCode: "SAL-REG",
    loanType: "Reloan",
    purpose: "House extension",
    proposedAmount: 300_000,
    termDays: 1080,
    status: "Approved",
    encoderId: "usr-08",
    applicationDate: daysAgo(20),
    lastActionDate: daysAgo(12),
    evaluationVerdict: "Recommended",
    remarks:
      "Strong capacity, collateral-free product within Tier 3 authority.",
    history: [
      {
        action: "Submit",
        fromStatus: "Draft",
        toStatus: "ForRecommendation",
        comments: null,
        actionDate: daysAgo(20),
        actionByUserName: "Luis Tan",
        actionByRole: "Encoder",
      },
      {
        action: "Recommend",
        fromStatus: "ForRecommendation",
        toStatus: "ForChecking",
        comments: null,
        actionDate: daysAgo(17),
        actionByUserName: "Ramon Cruz",
        actionByRole: "Recommender",
      },
      {
        action: "Evaluate",
        fromStatus: "ForChecking",
        toStatus: "ForApproval",
        comments: "Strong capacity.",
        actionDate: daysAgo(14),
        actionByUserName: "Maria Domingo",
        actionByRole: "Evaluator",
      },
      {
        action: "Approve",
        fromStatus: "ForApproval",
        toStatus: "Approved",
        comments: "Approved within Tier 3 authority.",
        actionDate: daysAgo(12),
        actionByUserName: "Cecilia Navarro",
        actionByRole: "Approver",
      },
    ],
    signatures: [
      {
        stage: "Evaluation",
        userId: "eval-01",
        userName: "Maria Domingo",
        role: "Evaluator",
        signedAt: daysAgo(14),
      },
      {
        stage: "Approval",
        userId: "app-02",
        userName: "Cecilia Navarro",
        role: "Approver",
        signedAt: daysAgo(12),
      },
    ],
    disbursement: { approvedAt: daysAgo(12), deadlineUtc: daysFromNow(18) },
  })
  // 10: for disbursement, approved 34 days ago — OVERDUE (void-eligible)
  seedLoan(state, {
    lamId: "LAM-2026-0010",
    groupNo: "GRP-2026-0009",
    cisNo: "101043",
    branchCode: "B004",
    productCode: "C21",
    purpose: "Appliance purchase",
    proposedAmount: 100_000,
    termDays: 360,
    status: "ForDisbursement",
    encoderId: "enc-02",
    applicationDate: daysAgo(45),
    lastActionDate: daysAgo(34),
    evaluationVerdict: "Recommended",
    history: [
      {
        action: "Submit",
        fromStatus: "Draft",
        toStatus: "ForRecommendation",
        comments: null,
        actionDate: daysAgo(45),
        actionByUserName: "Paolo Garcia",
        actionByRole: "Encoder",
      },
      {
        action: "Recommend",
        fromStatus: "ForRecommendation",
        toStatus: "ForChecking",
        comments: null,
        actionDate: daysAgo(40),
        actionByUserName: "Ramon Cruz",
        actionByRole: "Recommender",
      },
      {
        action: "Evaluate",
        fromStatus: "ForChecking",
        toStatus: "ForApproval",
        comments: null,
        actionDate: daysAgo(37),
        actionByUserName: "Maria Domingo",
        actionByRole: "Evaluator",
      },
      {
        action: "Approve",
        fromStatus: "ForApproval",
        toStatus: "Approved",
        comments: null,
        actionDate: daysAgo(34),
        actionByUserName: "Jose Mendoza",
        actionByRole: "Approver",
      },
      {
        action: "PrepareDisbursement",
        fromStatus: "Approved",
        toStatus: "ForDisbursement",
        comments: "Proceeds release scheduled.",
        actionDate: daysAgo(33),
        actionByUserName: "Jose Mendoza",
        actionByRole: "Approver",
      },
    ],
    signatures: [
      {
        stage: "Approval",
        userId: "app-01",
        userName: "Jose Mendoza Jr",
        role: "Approver",
        signedAt: daysAgo(34),
      },
    ],
    disbursement: { approvedAt: daysAgo(34), deadlineUtc: daysFromNow(-4) },
  })
  // 11: for disbursement, 3 days left — at risk
  seedLoan(state, {
    lamId: "LAM-2026-0011",
    groupNo: "GRP-2026-0010",
    cisNo: "101188",
    branchCode: "B002",
    productCode: "C34",
    purpose: "School fees",
    proposedAmount: 160_000,
    termDays: 540,
    status: "ForDisbursement",
    applicationDate: daysAgo(36),
    lastActionDate: daysAgo(27),
    evaluationVerdict: "Recommended",
    history: [
      {
        action: "Submit",
        fromStatus: "Draft",
        toStatus: "ForRecommendation",
        comments: null,
        actionDate: daysAgo(36),
        actionByUserName: "Ana Reyes",
        actionByRole: "Encoder",
      },
      {
        action: "Recommend",
        fromStatus: "ForRecommendation",
        toStatus: "ForChecking",
        comments: null,
        actionDate: daysAgo(33),
        actionByUserName: "Ramon Cruz",
        actionByRole: "Recommender",
      },
      {
        action: "Evaluate",
        fromStatus: "ForChecking",
        toStatus: "ForApproval",
        comments: null,
        actionDate: daysAgo(30),
        actionByUserName: "Maria Domingo",
        actionByRole: "Evaluator",
      },
      {
        action: "Approve",
        fromStatus: "ForApproval",
        toStatus: "Approved",
        comments: null,
        actionDate: daysAgo(27),
        actionByUserName: "Jose Mendoza",
        actionByRole: "Approver",
      },
      {
        action: "PrepareDisbursement",
        fromStatus: "Approved",
        toStatus: "ForDisbursement",
        comments: null,
        actionDate: daysAgo(26),
        actionByUserName: "Jose Mendoza",
        actionByRole: "Approver",
      },
    ],
    signatures: [
      {
        stage: "Approval",
        userId: "app-01",
        userName: "Jose Mendoza Jr",
        role: "Approver",
        signedAt: daysAgo(27),
      },
    ],
    disbursement: { approvedAt: daysAgo(27), deadlineUtc: daysFromNow(3) },
  })
  // 12: disbursed
  seedLoan(state, {
    lamId: "LAM-2026-0012",
    groupNo: "GRP-2026-0011",
    cisNo: "100234",
    branchCode: "B001",
    productCode: "C25",
    purpose: "Refinance credit card",
    proposedAmount: 140_000,
    termDays: 540,
    status: "Disbursed",
    applicationDate: daysAgo(30),
    lastActionDate: daysAgo(5),
    evaluationVerdict: "Recommended",
    history: [
      {
        action: "Submit",
        fromStatus: "Draft",
        toStatus: "ForRecommendation",
        comments: null,
        actionDate: daysAgo(30),
        actionByUserName: "Ana Reyes",
        actionByRole: "Encoder",
      },
      {
        action: "Recommend",
        fromStatus: "ForRecommendation",
        toStatus: "ForChecking",
        comments: null,
        actionDate: daysAgo(26),
        actionByUserName: "Ramon Cruz",
        actionByRole: "Recommender",
      },
      {
        action: "Evaluate",
        fromStatus: "ForChecking",
        toStatus: "ForApproval",
        comments: null,
        actionDate: daysAgo(22),
        actionByUserName: "Maria Domingo",
        actionByRole: "Evaluator",
      },
      {
        action: "Approve",
        fromStatus: "ForApproval",
        toStatus: "Approved",
        comments: null,
        actionDate: daysAgo(18),
        actionByUserName: "Jose Mendoza",
        actionByRole: "Approver",
      },
      {
        action: "PrepareDisbursement",
        fromStatus: "Approved",
        toStatus: "ForDisbursement",
        comments: null,
        actionDate: daysAgo(16),
        actionByUserName: "Jose Mendoza",
        actionByRole: "Approver",
      },
      {
        action: "Disburse",
        fromStatus: "ForDisbursement",
        toStatus: "Disbursed",
        comments: "Credited to 0118-2034-55.",
        actionDate: daysAgo(5),
        actionByUserName: "Jose Mendoza",
        actionByRole: "Approver",
      },
    ],
    disbursement: {
      approvedAt: daysAgo(18),
      deadlineUtc: daysFromNow(12),
      disbursedAt: daysAgo(5),
      disbursedBy: "Jose Mendoza Jr",
      disbursementReference: "DISB-2026-0143",
    },
  })
  // 13: ongoing
  seedLoan(state, {
    lamId: "LAM-2025-0210",
    groupNo: "GRP-2025-0140",
    cisNo: "100912",
    branchCode: "B003",
    productCode: "C25",
    loanType: "Reloan",
    purpose: "Lot payment",
    proposedAmount: 180_000,
    termDays: 720,
    status: "OnGoing",
    encoderId: "usr-08",
    applicationDate: daysAgo(200),
    lastActionDate: daysAgo(150),
    history: [
      {
        action: "Submit",
        fromStatus: "Draft",
        toStatus: "ForRecommendation",
        comments: null,
        actionDate: daysAgo(200),
        actionByUserName: "Luis Tan",
        actionByRole: "Encoder",
      },
      {
        action: "Approve",
        fromStatus: "ForApproval",
        toStatus: "Approved",
        comments: null,
        actionDate: daysAgo(170),
        actionByUserName: "Cecilia Navarro",
        actionByRole: "Approver",
      },
      {
        action: "Disburse",
        fromStatus: "ForDisbursement",
        toStatus: "Disbursed",
        comments: null,
        actionDate: daysAgo(160),
        actionByUserName: "Cecilia Navarro",
        actionByRole: "Approver",
      },
      {
        action: "CoreSync",
        fromStatus: "Disbursed",
        toStatus: "OnGoing",
        comments: "First amortization posted by core system.",
        actionDate: daysAgo(150),
        actionByUserName: "System",
        actionByRole: "System",
      },
    ],
    disbursement: {
      approvedAt: daysAgo(170),
      deadlineUtc: daysAgo(140),
      disbursedAt: daysAgo(160),
      disbursedBy: "Cecilia Navarro",
      disbursementReference: "DISB-2025-0911",
    },
  })
  // 14: rejected
  seedLoan(state, {
    lamId: "LAM-2026-0013",
    groupNo: "GRP-2026-0013",
    cisNo: "100587",
    branchCode: "B002",
    productCode: "C02",
    purpose: "Personal",
    proposedAmount: 95_000,
    termDays: 360,
    status: "Rejected",
    encoderId: "enc-02",
    applicationDate: daysAgo(25),
    lastActionDate: daysAgo(15),
    evaluationVerdict: "NotRecommended",
    history: [
      {
        action: "Submit",
        fromStatus: "Draft",
        toStatus: "ForRecommendation",
        comments: null,
        actionDate: daysAgo(25),
        actionByUserName: "Paolo Garcia",
        actionByRole: "Encoder",
      },
      {
        action: "Recommend",
        fromStatus: "ForRecommendation",
        toStatus: "ForChecking",
        comments: null,
        actionDate: daysAgo(22),
        actionByUserName: "Ramon Cruz",
        actionByRole: "Recommender",
      },
      {
        action: "Evaluate (NotRecommended)",
        fromStatus: "ForChecking",
        toStatus: "ForApproval",
        comments: "Existing amortizations exceed capacity.",
        actionDate: daysAgo(18),
        actionByUserName: "Maria Domingo",
        actionByRole: "Evaluator",
      },
      {
        action: "Reject",
        fromStatus: "ForApproval",
        toStatus: "Rejected",
        comments:
          "Capacity insufficient; client advised to reapply after existing loan matures.",
        actionDate: daysAgo(15),
        actionByUserName: "Cecilia Navarro",
        actionByRole: "Approver",
      },
    ],
  })
  // 15: cancelled by client
  seedLoan(state, {
    lamId: "LAM-2026-0014",
    groupNo: "GRP-2026-0014",
    cisNo: "101043",
    branchCode: "B004",
    productCode: "C27",
    purpose: "Travel",
    proposedAmount: 50_000,
    termDays: 180,
    status: "Cancelled",
    encoderId: "enc-02",
    applicationDate: daysAgo(40),
    lastActionDate: daysAgo(38),
    history: [
      {
        action: "Submit",
        fromStatus: "Draft",
        toStatus: "ForRecommendation",
        comments: null,
        actionDate: daysAgo(40),
        actionByUserName: "Paolo Garcia",
        actionByRole: "Encoder",
      },
      {
        action: "Cancel",
        fromStatus: "ForRecommendation",
        toStatus: "Cancelled",
        comments: "Client withdrew the application.",
        actionDate: daysAgo(38),
        actionByUserName: "Paolo Garcia",
        actionByRole: "Encoder",
      },
    ],
  })
  // 16: EXPIRED — voided after the 30-day disbursement window lapsed
  seedLoan(state, {
    lamId: "LAM-2026-0015",
    groupNo: "GRP-2026-0015",
    cisNo: "101188",
    branchCode: "B002",
    productCode: "C29",
    purpose: "Storefront lease",
    proposedAmount: 70_000,
    termDays: 360,
    status: "Expired",
    applicationDate: daysAgo(70),
    lastActionDate: daysAgo(30),
    history: [
      {
        action: "Submit",
        fromStatus: "Draft",
        toStatus: "ForRecommendation",
        comments: null,
        actionDate: daysAgo(70),
        actionByUserName: "Ana Reyes",
        actionByRole: "Encoder",
      },
      {
        action: "Approve",
        fromStatus: "ForApproval",
        toStatus: "Approved",
        comments: null,
        actionDate: daysAgo(64),
        actionByUserName: "Jose Mendoza",
        actionByRole: "Approver",
      },
      {
        action: "PrepareDisbursement",
        fromStatus: "Approved",
        toStatus: "ForDisbursement",
        comments: null,
        actionDate: daysAgo(63),
        actionByUserName: "Jose Mendoza",
        actionByRole: "Approver",
      },
      {
        action: "Expire",
        fromStatus: "ForDisbursement",
        toStatus: "Expired",
        comments:
          "Not disbursed within 30 days of approval; voided per disbursement-timeout policy.",
        actionDate: daysAgo(30),
        actionByUserName: "System",
        actionByRole: "System",
      },
    ],
    disbursement: {
      approvedAt: daysAgo(64),
      deadlineUtc: daysAgo(34),
      voidedAt: daysAgo(30),
      voidReason:
        "Not disbursed within 30 days of approval; voided per disbursement-timeout policy.",
    },
  })
  // 17: encoder's own draft
  seedLoan(state, {
    lamId: "LAM-2026-0016",
    groupNo: "GRP-2026-0016",
    cisNo: "100234",
    branchCode: "B001",
    productCode: "C21",
    purpose: "Dental implant",
    proposedAmount: 120_000,
    termDays: 540,
    status: "Draft",
    applicationDate: daysAgo(0, 5),
    lastActionDate: daysAgo(0, 5),
    history: [
      {
        action: "Create",
        fromStatus: null,
        toStatus: "Draft",
        comments: null,
        actionDate: daysAgo(0, 5),
        actionByUserName: "Ana Reyes",
        actionByRole: "Encoder",
      },
    ],
  })

  // Notifications (unread for relevant users, tied to real seeded events)
  pushNotification(
    state,
    "enc-01",
    "Application returned for revision",
    "LAM-2026-0007 (Roberto Bautista) was returned by the Evaluator: missing payslip and service record.",
    "correction",
    "/loans/1007",
    daysAgo(2)
  )
  pushNotification(
    state,
    "enc-02",
    "Application flagged: incomplete documents",
    "LAM-2026-0008 (Liza Reyes) is missing 2 required documents.",
    "correction",
    "/loans/1008",
    daysAgo(1, 8)
  )
  pushNotification(
    state,
    "app-01",
    "Disbursement overdue",
    "LAM-2026-0010 passed its 30-day disbursement deadline and is eligible for voiding.",
    "disbursement",
    "/monitoring/disbursement",
    daysAgo(0, 6)
  )
  pushNotification(
    state,
    "rec-01",
    "2 bundles waiting at your desk",
    "GRP-2026-0001 (2 applications) and GRP-2026-0002 are waiting for recommendation.",
    "workflow",
    "/review-desk",
    daysAgo(1)
  )
  pushNotification(
    state,
    "eval-01",
    "Reloan awaiting checking",
    "LAM-2026-0004 carries an interest-rate deviation for review.",
    "workflow",
    "/review-desk",
    daysAgo(1, 5)
  )
  pushNotification(
    state,
    "enc-01",
    "Application approved",
    "LAM-2026-0012 (Roberto Bautista) was approved and disbursed.",
    "workflow",
    "/loans/1012",
    daysAgo(5)
  )
  // Read sample
  pushNotification(
    state,
    "enc-01",
    "Welcome to ALAS v3",
    "Your account was migrated from the legacy system.",
    "system",
    null,
    daysAgo(30)
  )
  state.notifications.find((n) => n.title === "Welcome to ALAS v3")!.readAt =
    daysAgo(29)

  // Account sessions + activity
  state.sessions = [
    {
      id: "ses-1",
      userId: "enc-01",
      deviceInfo: "Chrome 141 — Windows 11 (MKT-WKS-14)",
      ipAddress: "10.12.4.31",
      createdAt: daysAgo(0, 3),
      expiresAt: daysFromNow(1),
      isCurrent: true,
    },
    {
      id: "ses-2",
      userId: "enc-01",
      deviceInfo: "Edge 140 — Windows 11 (MKT-WKS-14)",
      ipAddress: "10.12.4.31",
      createdAt: daysAgo(2),
      expiresAt: daysFromNow(1),
      isCurrent: false,
    },
    {
      id: "ses-3",
      userId: "app-01",
      deviceInfo: "Chrome 141 — Windows 11 (AREA-WKS-2)",
      ipAddress: "10.12.9.8",
      createdAt: daysAgo(0, 1),
      expiresAt: daysFromNow(1),
      isCurrent: true,
    },
  ]
  for (const loan of state.loans) {
    for (const entry of loan.history) {
      const actor = state.users.find((u) =>
        `${u.firstName} ${u.lastName}`.startsWith(
          entry.actionByUserName.split(" ")[0]
        )
      )
      if (!actor) continue
      state.activities.push({
        id: `act-${state.activities.length + 1}`,
        userId: actor.id,
        lamId: loan.lamId,
        loanClientName: `${loan.client.firstName} ${loan.client.lastName}`,
        action: entry.action,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        comments: entry.comments,
        actionDate: entry.actionDate,
      })
    }
  }
  state.activities.sort((a, b) => b.actionDate.localeCompare(a.actionDate))

  return state
}

// ------------------------------------------------------------------- helpers
export function findUser(
  state: DbState,
  id: string
): MockUserRecord | undefined {
  return state.users.find((user) => user.id === id)
}

export function userName(user: MockUserRecord): string {
  return [user.firstName, user.lastName, user.suffix].filter(Boolean).join(" ")
}

export function findLoan(state: DbState, id: string): DbLoan | undefined {
  return state.loans.find((loan) => loan.id === id || loan.lamId === id)
}

export function pushHistory(
  loan: DbLoan,
  entry: Omit<LoanHistoryEntry, "id">,
  state: DbState
): void {
  loan.history.push({ ...entry, id: ++state.historySeq })
  loan.lastActionDate = entry.actionDate
  loan.rowVersion = String(Number(loan.rowVersion) + 1)
}

export function changeStatus(
  state: DbState,
  loan: DbLoan,
  action: string,
  toStatus: LoanStatus,
  actor: { name: string; role: string },
  comments: string | null = null
): void {
  const fromStatus = loan.status
  loan.status = toStatus
  pushHistory(
    loan,
    {
      action,
      fromStatus,
      toStatus,
      comments,
      actionDate: new Date().toISOString(),
      actionByUserName: actor.name,
      actionByRole: actor.role,
    },
    state
  )
  if (toStatus === "Approved") {
    loan.disbursement.approvedAt = new Date().toISOString()
    loan.disbursement.deadlineUtc = new Date(
      Date.now() + DISBURSEMENT_TIMEOUT_DAYS * DAY
    ).toISOString()
  }
  // Leaving a desk stage releases any bundle claim on it.
  if (
    toStatus !== "ForRecommendation" &&
    toStatus !== "ForChecking" &&
    toStatus !== "ForApproval"
  ) {
    loan.ownerUserId = null
  }
}

export function pushNotification(
  state: DbState,
  userId: string,
  title: string,
  body: string,
  type: DbNotification["type"],
  link: string | null,
  createdAt: string = new Date().toISOString()
): void {
  state.notifications.unshift({
    id: `ntf-${++state.notifSeq}-${Date.now() % 100000}`,
    userId,
    title,
    body,
    type,
    link,
    createdAt,
    readAt: null,
  })
}

/** Derived disbursement view (deadline maths is backend-owned; this mirrors it). */
export function disbursementView(loan: DbLoan): DisbursementDto {
  const {
    approvedAt,
    deadlineUtc,
    disbursedAt,
    disbursedBy,
    disbursementReference,
    voidedAt,
    voidReason,
  } = loan.disbursement
  const now = Date.now()
  const deadlineMs = deadlineUtc ? new Date(deadlineUtc).getTime() : null
  const isOverdue =
    deadlineMs != null &&
    voidedAt == null &&
    disbursedAt == null &&
    (loan.status === "Approved" || loan.status === "ForDisbursement") &&
    now > deadlineMs
  const daysRemaining =
    deadlineMs != null && voidedAt == null && disbursedAt == null
      ? Math.ceil((deadlineMs - now) / DAY)
      : null
  return {
    approvedAt,
    deadlineUtc,
    isOverdue,
    daysRemaining,
    disbursedAt,
    disbursedBy,
    disbursementReference,
    voidedAt,
    voidReason,
  }
}

/** Routing / approval-authority evaluation (mirrors the backend routing rules). */
export function computeRouting(state: DbState, loan: DbLoan) {
  const severity = loan.deviations.reduce<number>(
    (max, deviation) => Math.max(max, deviation.severity),
    0
  )
  const exposure =
    loan.proposedAmount +
    loan.obligations.outstandingLoans.reduce(
      (sum, row) => sum + row.outstandingBalance,
      0
    ) +
    loan.obligations.ebiReloans.reduce(
      (sum, row) => sum + row.outstandingBalance,
      0
    )

  const sorted = [...state.approvalAuthorities].sort((a, b) => a.tier - b.tier)
  const matched = sorted.find(
    (authority) =>
      severity <= authority.maxSeverity &&
      exposure <= authority.maxTotalExposure &&
      (loan.loanType === "New" ? authority.allowNew : authority.allowRenewal)
  )

  let assignedApproverId: string | null = null
  let assignedApproverName: string | null = null
  let noAuthorityReason: string | null = null
  if (matched) {
    const approver = matched.assignedUserIds
      .map((id) => findUser(state, id))
      .find((user) => user && user.isActive)
    if (approver) {
      assignedApproverId = approver.id
      assignedApproverName = userName(approver)
    } else {
      noAuthorityReason = `No active approver is assigned to ${matched.displayName}.`
    }
  } else {
    noAuthorityReason = `No approval authority covers severity ${severity} at ₱${Math.round(exposure).toLocaleString()} exposure.`
  }

  const missingDocuments = loan.documents
    .filter((doc) => doc.status === "Missing")
    .map((doc) => doc.name)

  return {
    requiredApprovalTier: matched?.tier ?? null,
    deviationSeverity: severity,
    totalExposure: exposure,
    loanType: loan.loanType,
    matchedRule: matched?.displayName ?? null,
    documentsComplete: missingDocuments.length === 0,
    missingDocuments,
    assignedApproverId,
    assignedApproverName,
    noAuthorityReason,
  }
}

/** Build the role desk queue grouped into client bundles. */
export function buildDeskQueue(
  state: DbState,
  queueStatus: LoanStatus,
  actorId: string
) {
  const actor = findUser(state, actorId)
  const inQueue = state.loans
    .filter((loan) => loan.status === queueStatus)
    .sort((a, b) =>
      (a.enqueuedAt ?? a.lastActionDate).localeCompare(
        b.enqueuedAt ?? b.lastActionDate
      )
    )

  const groups = new Map<string, DbLoan[]>()
  for (const loan of inQueue) {
    const list = groups.get(loan.applicationGroupNo) ?? []
    list.push(loan)
    groups.set(loan.applicationGroupNo, list)
  }

  const items: DeskGroupDto[] = []
  let position = 1
  for (const [groupNo, loans] of groups) {
    const head = loans[0]
    // Unclaimed bundles queue by arrival; the actor's own claims are listed too
    // (they render as "yours" in the UI). Other officers' claims stay hidden.
    if (head.ownerUserId && head.ownerUserId !== actorId) continue
    items.push({
      groupNo,
      clientName: `${head.client.firstName} ${head.client.lastName}`,
      cisNo: head.client.cisNo,
      position: head.ownerUserId === actorId ? 0 : position++,
      ownerUserId: head.ownerUserId,
      ownerName: head.ownerUserId
        ? findUser(state, head.ownerUserId)
          ? userName(findUser(state, head.ownerUserId)!)
          : null
        : null,
      enqueuedAt: head.enqueuedAt ?? head.lastActionDate,
      applications: loans.map((loan) => ({
        loanId: loan.id,
        lamId: loan.lamId,
        clientName: `${loan.client.firstName} ${loan.client.lastName}`,
        status: loan.status,
        productCode: loan.productCode,
        product: loan.product,
        loanType: loan.loanType,
        proposedAmount: loan.proposedAmount,
        termDays: loan.termDays,
        applicationDate: loan.applicationDate,
        hasDeviations: loan.deviations.length > 0,
        documentsComplete: loan.documentsComplete,
        branchCode: loan.branchCode,
      })),
    })
  }
  items.sort(
    (a, b) =>
      a.position - b.position || a.enqueuedAt.localeCompare(b.enqueuedAt)
  )

  const currentClaims = items.filter((item) => item.ownerUserId === actorId)
  return { items, currentClaims, actor }
}

export function nextLamId(state: DbState): string {
  state.lamSeq += 1
  return `LAM-2026-${String(state.lamSeq).padStart(4, "0")}`
}

export function nextGroupNo(state: DbState): string {
  state.groupSeq += 1
  return `GRP-2026-${String(state.groupSeq).padStart(4, "0")}`
}

export function recomputeLoan(loan: DbLoan, state: DbState): void {
  const prod = state.products.find((p) => p.code === loan.productCode)
  if (!prod) return
  loan.computed = {
    ...computeLoanTotals({
      principal: loan.proposedAmount,
      annualRatePercent: loan.annualRatePercent,
      termDays: loan.termDays,
      notarialFee: prod.notarialFee,
      docStampFee: prod.docStampFee,
      insuranceFee: prod.insuranceFee,
      applicationChargeRate: prod.applicationChargeRate,
    }),
    notarialFee: prod.notarialFee,
    docStampFee: prod.docStampFee,
    insuranceFee: prod.insuranceFee,
  }
  loan.product = prod.description
  loan.documentsComplete = loan.documents.every(
    (doc) => doc.status !== "Missing"
  )
}

export function makeDocuments(uploaded = true): ChecklistDocumentDto[] {
  return DOCUMENT_TEMPLATE.map((doc) => ({
    code: doc.code,
    name: doc.name,
    status: uploaded ? ("Uploaded" as const) : ("Missing" as const),
    uploadedAt: uploaded ? new Date().toISOString() : null,
    uploadedBy: uploaded ? "Ana Reyes" : null,
    contentType: uploaded ? "image/png" : null,
    sizeBytes: uploaded ? 200_000 : null,
  }))
}

export { DAY, HOUR, MINUTE }
export type { MockUserRecord, MockCisClient }
