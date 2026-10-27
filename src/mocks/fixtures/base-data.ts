/**
 * Synthetic base data for the mock API. All names, numbers and accounts are
 * invented; nothing here is real client or bank data.
 * Passwords are mock-only and accepted only while MSW mocking is enabled.
 */
import type { UserRole } from "@/features/auth/types"
import { ROLE_PERMISSIONS, type Permission } from "@/features/auth/types"

export interface MockUserRecord {
  id: string
  username: string
  password: string
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  email: string
  phone: string | null
  emergencyContact: string | null
  branchCode: string
  role: UserRole
  jobTitle: string
  permissions: Permission[] | "*"
  eSignature: string | null
  isActive: boolean
  mustChangePassword: boolean
  createdAt: string
  passwordChangedAt: string
}

const perms = (role: UserRole): Permission[] | "*" => ROLE_PERMISSIONS[role]

export const MOCK_USERS: MockUserRecord[] = [
  {
    id: "enc-01",
    username: "encoder",
    password: "Passw0rd!",
    firstName: "Ana",
    middleName: "Perez",
    lastName: "Reyes",
    suffix: null,
    email: "ana.reyes@alas.mock",
    phone: "+63 917 555 0101",
    emergencyContact: "+63 917 555 0999",
    branchCode: "B001",
    role: "Encoder",
    jobTitle: "Loan Encoder",
    permissions: perms("Encoder"),
    eSignature: null,
    isActive: true,
    mustChangePassword: false,
    createdAt: "2024-03-11T08:00:00Z",
    passwordChangedAt: "2026-01-15T02:11:00Z",
  },
  {
    id: "enc-02",
    username: "encoder2",
    password: "Passw0rd!",
    firstName: "Paolo",
    middleName: null,
    lastName: "Garcia",
    suffix: null,
    email: "paolo.garcia@alas.mock",
    phone: null,
    emergencyContact: null,
    branchCode: "B002",
    role: "Encoder",
    jobTitle: "Loan Encoder",
    permissions: perms("Encoder"),
    eSignature: null,
    isActive: true,
    mustChangePassword: false,
    createdAt: "2025-06-02T08:00:00Z",
    passwordChangedAt: "2025-06-02T08:00:00Z",
  },
  {
    id: "rec-01",
    username: "recommender",
    password: "Passw0rd!",
    firstName: "Ramon",
    middleName: "Ilagan",
    lastName: "Cruz",
    suffix: null,
    email: "ramon.cruz@alas.mock",
    phone: "+63 917 555 0102",
    emergencyContact: null,
    branchCode: "B001",
    role: "Recommender",
    jobTitle: "Branch Head",
    permissions: perms("Recommender"),
    eSignature: null,
    isActive: true,
    mustChangePassword: false,
    createdAt: "2023-11-20T08:00:00Z",
    passwordChangedAt: "2025-11-01T05:40:00Z",
  },
  {
    id: "eval-01",
    username: "evaluator",
    password: "Passw0rd!",
    firstName: "Maria",
    middleName: "Santos",
    lastName: "Domingo",
    suffix: null,
    email: "maria.domingo@alas.mock",
    phone: null,
    emergencyContact: null,
    branchCode: "B001",
    role: "Evaluator",
    jobTitle: "Credit Checker",
    permissions: perms("Evaluator"),
    eSignature: null,
    isActive: true,
    mustChangePassword: false,
    createdAt: "2024-01-08T08:00:00Z",
    passwordChangedAt: "2026-02-10T01:02:00Z",
  },
  {
    id: "app-01",
    username: "approver",
    password: "Passw0rd!",
    firstName: "Jose",
    middleName: null,
    lastName: "Mendoza",
    suffix: "Jr",
    email: "jose.mendoza@alas.mock",
    phone: "+63 917 555 0104",
    emergencyContact: null,
    branchCode: "B001",
    role: "Approver",
    jobTitle: "Area Head",
    permissions: perms("Approver"),
    eSignature: null,
    isActive: true,
    mustChangePassword: false,
    createdAt: "2022-09-01T08:00:00Z",
    passwordChangedAt: "2025-09-30T09:12:00Z",
  },
  {
    id: "app-02",
    username: "approver2",
    password: "Passw0rd!",
    firstName: "Cecilia",
    middleName: null,
    lastName: "Navarro",
    suffix: null,
    email: "cecilia.navarro@alas.mock",
    phone: null,
    emergencyContact: null,
    branchCode: "B002",
    role: "Approver",
    jobTitle: "Regional Credit Head",
    permissions: perms("Approver"),
    eSignature: null,
    isActive: true,
    mustChangePassword: false,
    createdAt: "2021-05-17T08:00:00Z",
    passwordChangedAt: "2025-05-19T07:44:00Z",
  },
  {
    id: "adm-01",
    username: "admin",
    password: "Passw0rd!",
    firstName: "Carla",
    middleName: null,
    lastName: "Villanueva",
    suffix: null,
    email: "carla.villanueva@alas.mock",
    phone: null,
    emergencyContact: null,
    branchCode: "B001",
    role: "Admin",
    jobTitle: "Systems Administrator",
    permissions: perms("Admin"),
    eSignature: null,
    isActive: true,
    mustChangePassword: false,
    createdAt: "2021-01-04T08:00:00Z",
    passwordChangedAt: "2026-03-02T00:31:00Z",
  },
  {
    id: "usr-08",
    username: "l.tan",
    password: "Passw0rd!",
    firstName: "Luis",
    middleName: null,
    lastName: "Tan",
    suffix: null,
    email: "luis.tan@alas.mock",
    phone: null,
    emergencyContact: null,
    branchCode: "B003",
    role: "Encoder",
    jobTitle: "Loan Encoder",
    permissions: perms("Encoder"),
    eSignature: null,
    isActive: false,
    mustChangePassword: false,
    createdAt: "2026-08-14T08:00:00Z",
    passwordChangedAt: "2026-08-14T08:00:00Z",
  },
  {
    id: "enc-03",
    username: "newhire",
    password: "Passw0rd!",
    firstName: "Kim",
    middleName: null,
    lastName: "Alonzo",
    suffix: null,
    email: "kim.alonzo@alas.mock",
    phone: null,
    emergencyContact: null,
    branchCode: "B001",
    role: "Encoder",
    jobTitle: "Loan Encoder (Probationary)",
    permissions: perms("Encoder"),
    eSignature: null,
    isActive: true,
    mustChangePassword: true,
    createdAt: "2026-10-20T08:00:00Z",
    passwordChangedAt: "2026-10-20T08:00:00Z",
  },
]

export interface MockBranch {
  code: string
  name: string
  areaCode: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export const MOCK_BRANCHES: MockBranch[] = [
  {
    code: "B001",
    name: "Makati Main",
    areaCode: "NCR",
    isActive: true,
    createdAt: "2019-01-15T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
  },
  {
    code: "B002",
    name: "Quezon City",
    areaCode: "NCR",
    isActive: true,
    createdAt: "2019-03-02T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
  },
  {
    code: "B003",
    name: "Cebu City",
    areaCode: "VIS",
    isActive: true,
    createdAt: "2020-07-19T00:00:00Z",
    updatedAt: "2025-12-11T00:00:00Z",
  },
  {
    code: "B004",
    name: "Davao",
    areaCode: "MIN",
    isActive: false,
    createdAt: "2021-02-08T00:00:00Z",
    updatedAt: "2026-06-30T00:00:00Z",
  },
]

export interface MockProduct {
  code: string
  description: string
  minAmount: number
  maxAmount: number
  minTermDays: number
  maxTermDays: number
  notarialFee: number
  docStampFee: number
  insuranceFee: number
  advanceInterestRate: number
  applicationChargeRate: number
  amortizationMode: string
  chargeAdvanceInterest: boolean
  isRetired: boolean
  lastSyncedAt: string
  /** Default nominal annual rate offered by the product (mock contract field). */
  defaultAnnualRatePercent: number
}

export const MOCK_PRODUCTS: MockProduct[] = [
  {
    code: "C34",
    description: "ATM Salary Loan — Regular",
    minAmount: 20_000,
    maxAmount: 200_000,
    minTermDays: 180,
    maxTermDays: 1080,
    notarialFee: 500,
    docStampFee: 200,
    insuranceFee: 1_200,
    advanceInterestRate: 0,
    applicationChargeRate: 0.01,
    amortizationMode: "Annuity",
    chargeAdvanceInterest: false,
    isRetired: false,
    lastSyncedAt: "2026-10-01T00:00:00Z",
    defaultAnnualRatePercent: 12,
  },
  {
    code: "C21",
    description: "ATM Salary Loan — Enhanced",
    minAmount: 30_000,
    maxAmount: 215_000,
    minTermDays: 180,
    maxTermDays: 1080,
    notarialFee: 500,
    docStampFee: 200,
    insuranceFee: 1_450,
    advanceInterestRate: 0,
    applicationChargeRate: 0.01,
    amortizationMode: "Annuity",
    chargeAdvanceInterest: false,
    isRetired: false,
    lastSyncedAt: "2026-10-01T00:00:00Z",
    defaultAnnualRatePercent: 11.5,
  },
  {
    code: "C27",
    description: "ATM Salary Loan — Starter",
    minAmount: 15_000,
    maxAmount: 120_000,
    minTermDays: 180,
    maxTermDays: 720,
    notarialFee: 400,
    docStampFee: 150,
    insuranceFee: 900,
    advanceInterestRate: 0,
    applicationChargeRate: 0.012,
    amortizationMode: "Annuity",
    chargeAdvanceInterest: false,
    isRetired: false,
    lastSyncedAt: "2026-09-15T00:00:00Z",
    defaultAnnualRatePercent: 13,
  },
  {
    code: "C29",
    description: "ATM Salary Loan — Flexible",
    minAmount: 20_000,
    maxAmount: 100_000,
    minTermDays: 90,
    maxTermDays: 540,
    notarialFee: 400,
    docStampFee: 150,
    insuranceFee: 850,
    advanceInterestRate: 0,
    applicationChargeRate: 0.012,
    amortizationMode: "Annuity",
    chargeAdvanceInterest: false,
    isRetired: false,
    lastSyncedAt: "2026-09-15T00:00:00Z",
    defaultAnnualRatePercent: 13.5,
  },
  {
    code: "C25",
    description: "ATM Salary Loan — Tenured",
    minAmount: 25_000,
    maxAmount: 200_000,
    minTermDays: 180,
    maxTermDays: 900,
    notarialFee: 500,
    docStampFee: 180,
    insuranceFee: 1_100,
    advanceInterestRate: 0,
    applicationChargeRate: 0.01,
    amortizationMode: "Annuity",
    chargeAdvanceInterest: false,
    isRetired: false,
    lastSyncedAt: "2026-10-01T00:00:00Z",
    defaultAnnualRatePercent: 11,
  },
  {
    code: "C02",
    description: "ATM Salary Loan — Micro",
    minAmount: 10_000,
    maxAmount: 100_000,
    minTermDays: 90,
    maxTermDays: 360,
    notarialFee: 300,
    docStampFee: 120,
    insuranceFee: 600,
    advanceInterestRate: 0,
    applicationChargeRate: 0.015,
    amortizationMode: "Annuity",
    chargeAdvanceInterest: false,
    isRetired: false,
    lastSyncedAt: "2026-08-20T00:00:00Z",
    defaultAnnualRatePercent: 14,
  },
  {
    code: "SAL-REG",
    description: "Regular Salary Loan (non-ATM)",
    minAmount: 50_000,
    maxAmount: 500_000,
    minTermDays: 360,
    maxTermDays: 1800,
    notarialFee: 1_000,
    docStampFee: 500,
    insuranceFee: 2_500,
    advanceInterestRate: 0,
    applicationChargeRate: 0.008,
    amortizationMode: "Annuity",
    chargeAdvanceInterest: false,
    isRetired: false,
    lastSyncedAt: "2026-10-01T00:00:00Z",
    defaultAnnualRatePercent: 10.5,
  },
  {
    code: "SAL-OLD",
    description: "Legacy Salary Loan (retired)",
    minAmount: 20_000,
    maxAmount: 300_000,
    minTermDays: 180,
    maxTermDays: 720,
    notarialFee: 800,
    docStampFee: 400,
    insuranceFee: 2_000,
    advanceInterestRate: 0.01,
    applicationChargeRate: 0.01,
    amortizationMode: "Annuity",
    chargeAdvanceInterest: true,
    isRetired: true,
    lastSyncedAt: "2025-01-10T00:00:00Z",
    defaultAnnualRatePercent: 12.5,
  },
]

export interface MockCisAccount {
  accountNo: string
  accountId: string
  bankCode: string
  branchCode: string
  creditLimit: number | null
  usedCredit: number | null
  borrowerType: string
}

export interface MockCisClient {
  cisNo: string
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  birthDate: string
  address: string
  agencyType: string
  agency: string
  positionTitle: string
  employeeNumber: string
  netTakeHomePay: number
  lengthOfService: string
  region: string
  misAgency: string
  maritalStatus: "Single" | "Married" | "Widowed" | "Separated"
  accounts: MockCisAccount[]
  /** Existing obligations surfaced by the WebLoan outstanding-loans lookup. */
  outstanding: {
    pn: string
    productCode: string
    productWithDescription: string
    principalBalance: number
    amortization: number
    outstandingBalance: number
    dateGranted: string
    dateMaturity: string
    status: string
  }[]
}

export const MOCK_CIS_CLIENTS: MockCisClient[] = [
  {
    cisNo: "100234",
    firstName: "Roberto",
    middleName: "Dizon",
    lastName: "Bautista",
    suffix: null,
    birthDate: "1985-04-12",
    address: "12 Gemini St., Poblacion, Makati City",
    agencyType: "Government",
    agency: "Department of Public Works — Makati",
    positionTitle: "Administrative Aide VI",
    employeeNumber: "DPW-4471",
    netTakeHomePay: 45_000,
    lengthOfService: "9 yrs 4 mos",
    region: "NCR",
    misAgency: "MIS-1188",
    maritalStatus: "Married",
    accounts: [
      {
        accountNo: "0118-2034-55",
        accountId: "ACC-90231",
        bankCode: "0118",
        branchCode: "B001",
        creditLimit: 200_000,
        usedCredit: 0,
        borrowerType: "Individual",
      },
    ],
    outstanding: [],
  },
  {
    cisNo: "100587",
    firstName: "Liza",
    middleName: "Mercado",
    lastName: "Reyes",
    suffix: null,
    birthDate: "1990-11-03",
    address: "88 Kalayaan Ave., Brgy. Kamuning, Quezon City",
    agencyType: "Government",
    agency: "Quezon City Health Office",
    positionTitle: "Nurse II",
    employeeNumber: "QCHO-2210",
    netTakeHomePay: 32_500,
    lengthOfService: "5 yrs 1 mo",
    region: "NCR",
    misAgency: "MIS-2043",
    maritalStatus: "Single",
    accounts: [
      {
        accountNo: "0118-7781-02",
        accountId: "ACC-90512",
        bankCode: "0118",
        branchCode: "B002",
        creditLimit: 100_000,
        usedCredit: 0,
        borrowerType: "Individual",
      },
    ],
    outstanding: [],
  },
  {
    cisNo: "100912",
    firstName: "Fernando",
    middleName: "Cruz",
    lastName: "Delgado",
    suffix: "Sr",
    birthDate: "1976-06-25",
    address: "3 Osmeña Blvd, Brgy. Guadalupe, Cebu City",
    agencyType: "Government",
    agency: "Cebu Provincial Capitol",
    positionTitle: "Supervising Bookbinder",
    employeeNumber: "CEB-0873",
    netTakeHomePay: 58_000,
    lengthOfService: "18 yrs 2 mos",
    region: "Region VII",
    misAgency: "MIS-3390",
    maritalStatus: "Married",
    accounts: [
      {
        accountNo: "0118-3390-19",
        accountId: "ACC-91004",
        bankCode: "0118",
        branchCode: "B003",
        creditLimit: 300_000,
        usedCredit: 121_400,
        borrowerType: "Individual",
      },
    ],
    outstanding: [
      {
        pn: "PN-2024-5567",
        productCode: "C34",
        productWithDescription: "C34 — ATM Salary Loan — Regular",
        principalBalance: 130_000,
        amortization: 4_333,
        outstandingBalance: 121_400,
        dateGranted: "2024-08-15",
        dateMaturity: "2027-08-15",
        status: "Active",
      },
    ],
  },
  {
    cisNo: "101043",
    firstName: "Grace",
    middleName: "Lim",
    lastName: "Tan",
    suffix: null,
    birthDate: "1994-02-18",
    address: "21 Jacinto St., Brgy. Poblacion, Davao City",
    agencyType: "Private",
    agency: "Davao Merchandising Corp.",
    positionTitle: "Accounting Supervisor",
    employeeNumber: "DMC-1140",
    netTakeHomePay: 27_800,
    lengthOfService: "3 yrs 8 mos",
    region: "Region XI",
    misAgency: "MIS-4471",
    maritalStatus: "Single",
    accounts: [
      {
        accountNo: "0118-4471-66",
        accountId: "ACC-91330",
        bankCode: "0118",
        branchCode: "B004",
        creditLimit: 100_000,
        usedCredit: 0,
        borrowerType: "Individual",
      },
    ],
    outstanding: [],
  },
  {
    cisNo: "101188",
    firstName: "Michael",
    middleName: "Ang",
    lastName: "Sy",
    suffix: null,
    birthDate: "1981-09-30",
    address: "7 China Bank Bldg., J.P. Laurel Ave., Davao City",
    agencyType: "Private",
    agency: "Sy Logistics Inc.",
    positionTitle: "Operations Manager",
    employeeNumber: "SYL-0091",
    netTakeHomePay: 61_200,
    lengthOfService: "11 yrs",
    region: "Region XI",
    misAgency: "MIS-5120",
    maritalStatus: "Married",
    accounts: [
      {
        accountNo: "0118-5120-84",
        accountId: "ACC-91442",
        bankCode: "0118",
        branchCode: "B002",
        creditLimit: 400_000,
        usedCredit: 244_000,
        borrowerType: "Individual",
      },
    ],
    outstanding: [
      {
        pn: "PN-2025-0031",
        productCode: "C25",
        productWithDescription: "C25 — ATM Salary Loan — Tenured",
        principalBalance: 180_000,
        amortization: 5_900,
        outstandingBalance: 168_200,
        dateGranted: "2025-02-01",
        dateMaturity: "2027-08-01",
        status: "Active",
      },
      {
        pn: "PN-2025-0410",
        productCode: "C02",
        productWithDescription: "C02 — ATM Salary Loan — Micro",
        principalBalance: 80_000,
        amortization: 3_610,
        outstandingBalance: 75_800,
        dateGranted: "2025-05-20",
        dateMaturity: "2026-11-20",
        status: "Active",
      },
    ],
  },
]

export interface MockDeviationCatalogEntry {
  code: string
  reasonText: string
  severity: 0 | 1 | 2
  isFeeOverride: boolean
  requiresJustification: boolean
}

/** Reference exception list from the ALAS v3 spec §6 (backend catalog drives it). */
export const MOCK_DEVIATION_CATALOG: MockDeviationCatalogEntry[] = [
  {
    code: "AGE-01",
    reasonText: "Age outside prescribed parameters",
    severity: 2,
    isFeeOverride: false,
    requiresJustification: true,
  },
  {
    code: "FEE-01",
    reasonText: "Discounted application fee",
    severity: 1,
    isFeeOverride: true,
    requiresJustification: true,
  },
  {
    code: "RATE-01",
    reasonText: "Interest-rate reduction",
    severity: 2,
    isFeeOverride: true,
    requiresJustification: true,
  },
  {
    code: "DOC-01",
    reasonText: "Missing bank statement",
    severity: 1,
    isFeeOverride: false,
    requiresJustification: true,
  },
  {
    code: "DOC-02",
    reasonText: "Missing CIBI documentation",
    severity: 1,
    isFeeOverride: false,
    requiresJustification: true,
  },
  {
    code: "DOC-03",
    reasonText: "Missing marriage certificate where required",
    severity: 1,
    isFeeOverride: false,
    requiresJustification: true,
  },
  {
    code: "DOC-04",
    reasonText: "Missing one or more payslips for a new ATM loan",
    severity: 1,
    isFeeOverride: false,
    requiresJustification: true,
  },
  {
    code: "DOC-05",
    reasonText: "Missing signature on the application form",
    severity: 2,
    isFeeOverride: false,
    requiresJustification: true,
  },
  {
    code: "DOC-06",
    reasonText:
      "Missing special power of attorney when required to claim an ATM",
    severity: 2,
    isFeeOverride: false,
    requiresJustification: true,
  },
  {
    code: "DOC-07",
    reasonText: "Missing appointment record or service record",
    severity: 1,
    isFeeOverride: false,
    requiresJustification: true,
  },
]

export interface MockApprovalAuthority {
  key: string
  displayName: string
  tier: number
  priority: number
  allowNew: boolean
  allowRenewal: boolean
  maxSeverity: 0 | 1 | 2
  maxTotalExposure: number
  scopeType: 0 | 1 | 2
  assignedUserIds: string[]
}

export const MOCK_APPROVAL_AUTHORITIES: MockApprovalAuthority[] = [
  {
    key: "tier-1",
    displayName: "Tier 1 — Branch",
    tier: 1,
    priority: 1,
    allowNew: true,
    allowRenewal: true,
    maxSeverity: 0,
    maxTotalExposure: 200_000,
    scopeType: 0,
    assignedUserIds: ["app-01"],
  },
  {
    key: "tier-2",
    displayName: "Tier 2 — Area",
    tier: 2,
    priority: 2,
    allowNew: true,
    allowRenewal: true,
    maxSeverity: 1,
    maxTotalExposure: 500_000,
    scopeType: 1,
    assignedUserIds: ["app-01", "app-02"],
  },
  {
    key: "tier-3",
    displayName: "Tier 3 — Head Office",
    tier: 3,
    priority: 3,
    allowNew: true,
    allowRenewal: true,
    maxSeverity: 2,
    maxTotalExposure: 5_000_000,
    scopeType: 2,
    assignedUserIds: ["app-02"],
  },
]

/** Standard document checklist template applied to new applications. */
export const DOCUMENT_TEMPLATE: { code: string; name: string }[] = [
  { code: "APP-FORM", name: "Signed application form" },
  { code: "PAYS-1", name: "Latest payslip" },
  { code: "PAYS-2", name: "Second latest payslip" },
  { code: "BANK-STMT", name: "Bank statement (last 3 months)" },
  { code: "CIBI", name: "CIBI consent and report" },
  { code: "MARRIAGE", name: "Marriage certificate (if married)" },
  { code: "SERVICE-REC", name: "Appointment or service record" },
  {
    code: "SPA",
    name: "Special power of attorney (if ATM claimed by representative)",
  },
]
