/**
 * Central query-key registry (Frontend Auto.md §6).
 * Every query key contains all parameters that affect its result.
 * Invalidation targets these prefixes after mutations — never blanket-invalidate.
 */

export type LoanListParams = {
  page?: number
  pageSize?: number
  status?: string
  search?: string
  dateFrom?: string
  dateTo?: string
  flagged?: boolean
  mine?: boolean
  group?: string
}

export type NotificationInboxParams = {
  page?: number
  pageSize?: number
  status?: "all" | "unread" | "read"
}

export const queryKeys = {
  account: {
    all: ["account"] as const,
    profile: ["account", "profile"] as const,
    sessions: (page: number) => ["account", "sessions", page] as const,
    activity: (page: number) => ["account", "activity", page] as const,
    myLoans: ["account", "my-loans"] as const,
  },

  workflow: {
    all: ["workflow"] as const,
    configuration: ["workflow", "configuration"] as const,
  },

  dashboard: {
    all: ["dashboard"] as const,
    // Keyed by identity: overview content is user-specific (defense-in-depth
    // on top of the cache clear performed at session end).
    overview: (userId: string) => ["dashboard", "overview", userId] as const,
  },

  loans: {
    all: ["loans"] as const,
    lists: ["loans", "list"] as const,
    list: (params: LoanListParams) => ["loans", "list", params] as const,
    detail: (id: string) => ["loans", "detail", id] as const,
    history: (id: string) => ["loans", "history", id] as const,
    checklist: (id: string) => ["loans", "checklist", id] as const,
    deviations: (id: string) => ["loans", "deviations", id] as const,
    routing: (id: string) => ["loans", "routing", id] as const,
    revisionRequests: (id: string) =>
      ["loans", "revision-requests", id] as const,
    signatureChain: (id: string) => ["loans", "signature-chain", id] as const,
    desk: (userId: string) => ["loans", "desk", userId] as const,
    countByStatus: (status: string) => ["loans", "count", status] as const,
    disbursement: (filter: string) =>
      ["loans", "disbursement", filter] as const,
  },

  cis: {
    all: ["cis"] as const,
    search: (term: string) => ["cis", "search", term] as const,
    client: (cisNo: string) => ["cis", "client", cisNo] as const,
    outstanding: (cisNo: string, accountNo: string) =>
      ["cis", "outstanding", cisNo, accountNo] as const,
  },

  notifications: {
    all: ["notifications"] as const,
    inbox: (userId: string, params: NotificationInboxParams) =>
      ["notifications", "inbox", userId, params] as const,
  },

  admin: {
    users: (params: { page: number; search: string }) =>
      ["admin", "users", params] as const,
    userLists: ["admin", "users"] as const,
    roles: ["admin", "roles"] as const,
    branches: (params: { page: number; search: string }) =>
      ["admin", "branches", params] as const,
    branchLists: ["admin", "branches"] as const,
    branchOptions: ["admin", "branches", "options"] as const,
    products: (params: { page: number; search: string }) =>
      ["admin", "products", params] as const,
    productLists: ["admin", "products"] as const,
    productOptions: ["admin", "products", "options"] as const,
    product: (code: string) => ["admin", "products", "detail", code] as const,
    approvalAuthorities: ["admin", "approval-authorities"] as const,
    deviationCatalog: ["admin", "deviation-catalog"] as const,
  },
} as const
