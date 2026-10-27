import { describe, expect, it } from "vitest"

import {
  hasAnyPermission,
  hasPermission,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_QUEUE_STATUS,
} from "./types"

describe("permission model", () => {
  it("grants encoders creation and revision but no review decisions", () => {
    const encoder = ROLE_PERMISSIONS.Encoder as string[]
    expect(hasPermission(encoder, PERMISSIONS.loansCreate)).toBe(true)
    expect(hasPermission(encoder, PERMISSIONS.loansRevise)).toBe(true)
    expect(hasPermission(encoder, PERMISSIONS.loansApprove)).toBe(false)
    expect(hasPermission(encoder, PERMISSIONS.loansEvaluate)).toBe(false)
  })

  it("requires every permission for array checks and any for anyOf checks", () => {
    const evaluator = ROLE_PERMISSIONS.Evaluator as string[]
    expect(
      hasPermission(evaluator, [
        PERMISSIONS.loansView,
        PERMISSIONS.loansEvaluate,
      ])
    ).toBe(true)
    expect(
      hasPermission(evaluator, [
        PERMISSIONS.loansView,
        PERMISSIONS.loansApprove,
      ])
    ).toBe(false)
    expect(
      hasAnyPermission(evaluator, [
        PERMISSIONS.loansApprove,
        PERMISSIONS.loansEvaluate,
      ])
    ).toBe(true)
    expect(
      hasAnyPermission(evaluator, [
        PERMISSIONS.loansApprove,
        PERMISSIONS.workflowManage,
      ])
    ).toBe(false)
  })

  it("treats the admin wildcard as all permissions", () => {
    const admin = ROLE_PERMISSIONS.Admin as string[]
    expect(hasPermission(["*"], PERMISSIONS.workflowManage)).toBe(true)
    expect(hasAnyPermission(["*"], [PERMISSIONS.loansApprove])).toBe(true)
    expect(admin).toBe("*")
  })

  it("denies everything without a session", () => {
    expect(hasPermission([], PERMISSIONS.loansView)).toBe(false)
    expect(hasAnyPermission([], [PERMISSIONS.loansView])).toBe(false)
  })

  it("keeps reviewers out of each other's stages", () => {
    const recommender = ROLE_PERMISSIONS.Recommender as string[]
    expect(hasPermission(recommender, PERMISSIONS.loansRecommend)).toBe(true)
    expect(hasPermission(recommender, PERMISSIONS.loansEvaluate)).toBe(false)
    const approver = ROLE_PERMISSIONS.Approver as string[]
    expect(hasPermission(approver, PERMISSIONS.loansDisburse)).toBe(true)
    expect(hasPermission(approver, PERMISSIONS.loansCreate)).toBe(false)
  })
})

describe("role desk mapping", () => {
  it("maps each review role to its queue stage", () => {
    expect(ROLE_QUEUE_STATUS.Recommender).toBe("ForRecommendation")
    expect(ROLE_QUEUE_STATUS.Evaluator).toBe("ForChecking")
    expect(ROLE_QUEUE_STATUS.Approver).toBe("ForApproval")
    expect(ROLE_QUEUE_STATUS.Encoder).toBeUndefined()
  })
})
