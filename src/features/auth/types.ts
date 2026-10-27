/** Role and permission model (mirrors the backend contract of the legacy ALAS API). */

export const ROLES = [
  "Encoder",
  "Recommender",
  "Evaluator",
  "Approver",
  "Admin",
] as const
export type UserRole = (typeof ROLES)[number]

/** Roles an administrator may assign (Admin itself is provisioned out-of-band). */
export const ASSIGNABLE_ROLES = [
  "Encoder",
  "Recommender",
  "Evaluator",
  "Approver",
] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

export const PERMISSIONS = {
  loansCreate: "loans.create",
  loansView: "loans.view",
  loansRecommend: "loans.recommend",
  loansEvaluate: "loans.evaluate",
  loansApprove: "loans.approve",
  loansReject: "loans.reject",
  loansRevise: "loans.revise",
  loansDisburse: "loans.disburse",
  loanProductManage: "loan_product.manage",
  loanProductView: "loan_product.view",
  userManage: "users.manage",
  roleView: "roles.view",
  workflowManage: "workflow.manage",
  branchManage: "branches.manage",
  approvalAuthorityManage: "approval.manage",
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ROLE_PERMISSIONS: Record<UserRole, Permission[] | "*"> = {
  Encoder: [
    PERMISSIONS.loansCreate,
    PERMISSIONS.loansView,
    PERMISSIONS.loansRevise,
  ],
  Recommender: [
    PERMISSIONS.loansView,
    PERMISSIONS.loansRecommend,
    PERMISSIONS.loansRevise,
  ],
  Evaluator: [
    PERMISSIONS.loansView,
    PERMISSIONS.loansEvaluate,
    PERMISSIONS.loansReject,
    PERMISSIONS.loansRevise,
  ],
  Approver: [
    PERMISSIONS.loansView,
    PERMISSIONS.loansApprove,
    PERMISSIONS.loansReject,
    PERMISSIONS.loansDisburse,
  ],
  Admin: "*",
}

export function hasPermission(
  granted: readonly string[],
  required: string | string[]
): boolean {
  if (granted.includes("*")) return true
  const requiredList = Array.isArray(required) ? required : [required]
  return requiredList.every((permission) => granted.includes(permission))
}

export function hasAnyPermission(
  granted: readonly string[],
  required: readonly string[]
): boolean {
  if (granted.includes("*")) return true
  return required.some((permission) => granted.includes(permission))
}

/** Desk queue each review role works by default (legacy ROLE_QUEUE_DEFAULTS). */
export const ROLE_QUEUE_STATUS: Partial<Record<UserRole, string>> = {
  Recommender: "ForRecommendation",
  Evaluator: "ForChecking",
  Approver: "ForApproval",
}
