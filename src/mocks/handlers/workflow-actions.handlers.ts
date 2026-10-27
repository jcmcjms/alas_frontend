import { delay, http, type PathParams } from "msw"
import {
  changeStatus,
  computeRouting,
  db,
  daysFromNow,
  disbursementView,
  findLoan,
  pushHistory,
  pushNotification,
  userName,
} from "../db"
import { noStoreJson, problem, resolveActor, hasPerm } from "../handler-utils"
import { getMockScenario } from "../scenarios"
import type { DbLoan } from "../db"
import { toDetail } from "./loans.handlers"
import type { RevisionSectionId } from "@/features/loans/types/loan-contracts"

/** Mirrors backend MinRecommendRemarksLength (legacy workflow-constants). */
const MIN_REMARKS = 10

async function actionContext(request: Request, params: PathParams) {
  await delay(getMockScenario() === "slow" ? 2500 : 300)
  const actor = resolveActor(request)
  if (!actor)
    return {
      error: problem(
        401,
        "Unauthorized",
        "Your session has expired. Sign in again."
      ),
    }
  const loan = findLoan(db(), String(params.id))
  if (!loan) {
    return {
      error: problem(
        404,
        "Application not found",
        `No application matches "${params.id}".`
      ),
    }
  }
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (
    typeof body.rowVersion === "string" &&
    body.rowVersion !== loan.rowVersion
  ) {
    return {
      error: problem(
        409,
        "Concurrent update",
        "Another officer acted on this application first. Reload it to see the latest state.",
        { rowVersion: loan.rowVersion }
      ),
      actor,
      loan,
    }
  }
  return { actor, loan, body }
}

function notifyEncoder(
  loan: DbLoan,
  title: string,
  bodyText: string,
  type: "workflow" | "correction" | "disbursement"
): void {
  pushNotification(
    db(),
    loan.createdById,
    title,
    bodyText,
    type,
    `/loans/${loan.id}`
  )
}

export const workflowActionHandlers = [
  // --- Recommender: ForRecommendation -> ForChecking -------------------------
  http.post("*/api/loans/:id/recommend", async ({ params, request }) => {
    const context = await actionContext(request, params)
    if ("error" in context && context.error) return context.error
    const { actor, loan, body } = context as {
      actor: NonNullable<typeof context.actor>
      loan: DbLoan
      body: Record<string, unknown>
    }
    if (!hasPerm(actor, "loans.recommend")) {
      return problem(
        403,
        "Forbidden",
        "Your role cannot recommend applications."
      )
    }
    if (loan.status !== "ForRecommendation") {
      return problem(
        409,
        "Invalid transition",
        `This application is "${loan.status}", not awaiting recommendation.`
      )
    }
    if (getMockScenario() === "mutation-failure") {
      return problem(
        500,
        "Action failed",
        "The workflow service rejected the recommendation. Nothing changed — try again."
      )
    }

    const remarks = typeof body.remarks === "string" ? body.remarks.trim() : ""
    changeStatus(
      db(),
      loan,
      "Recommend",
      "ForChecking",
      { name: userName(actor), role: actor.role },
      remarks || null
    )
    loan.enqueuedAt = new Date().toISOString()
    loan.ownerUserId = null
    loan.signatures.push({
      stage: "Recommendation",
      userId: actor.id,
      userName: userName(actor),
      role: actor.role,
      signedAt: new Date().toISOString(),
    })
    notifyEncoder(
      loan,
      "Application recommended",
      `${loan.lamId} moved to credit checking.`,
      "workflow"
    )
    for (const user of db().users.filter(
      (u) => u.role === "Evaluator" && u.isActive
    )) {
      pushNotification(
        db(),
        user.id,
        "Application for checking",
        `${loan.lamId} (${loan.client.firstName} ${loan.client.lastName}) was recommended for evaluation.`,
        "workflow",
        "/review-desk"
      )
    }
    return noStoreJson(toDetail(loan))
  }),

  // --- Evaluator: ForChecking -> ForApproval (verdict Recommended|NotRecommended)
  http.post("*/api/loans/:id/evaluate", async ({ params, request }) => {
    const context = await actionContext(request, params)
    if ("error" in context && context.error) return context.error
    const { actor, loan, body } = context as {
      actor: NonNullable<typeof context.actor>
      loan: DbLoan
      body: Record<string, unknown>
    }
    if (!hasPerm(actor, "loans.evaluate")) {
      return problem(
        403,
        "Forbidden",
        "Your role cannot evaluate applications."
      )
    }
    if (loan.status !== "ForChecking") {
      return problem(
        409,
        "Invalid transition",
        `This application is "${loan.status}", not awaiting evaluation.`
      )
    }
    if (getMockScenario() === "mutation-failure") {
      return problem(
        500,
        "Action failed",
        "The workflow service rejected the evaluation. Nothing changed — try again."
      )
    }

    const recommend = body.recommend !== false
    const remarks = typeof body.remarks === "string" ? body.remarks.trim() : ""
    if (!recommend && remarks.length < MIN_REMARKS) {
      return problem(
        400,
        "Validation failed",
        "A not-recommended evaluation requires remarks of at least 10 characters.",
        {
          errors: {
            remarks: [`Explain the finding (min ${MIN_REMARKS} characters).`],
          },
        }
      )
    }

    loan.evaluationVerdict = recommend ? "Recommended" : "NotRecommended"
    if (remarks) loan.remarks = remarks
    // Business rule preserved from legacy: a NotRecommended evaluation still
    // advances to ForApproval — the Approver makes the final call.
    changeStatus(
      db(),
      loan,
      recommend ? "Evaluate" : "Evaluate (NotRecommended)",
      "ForApproval",
      { name: userName(actor), role: actor.role },
      remarks || null
    )
    loan.enqueuedAt = new Date().toISOString()
    loan.ownerUserId = null
    loan.signatures.push({
      stage: "Evaluation",
      userId: actor.id,
      userName: userName(actor),
      role: actor.role,
      signedAt: new Date().toISOString(),
    })
    notifyEncoder(
      loan,
      "Application evaluated",
      `${loan.lamId} was ${recommend ? "recommended" : "marked not recommended"} and forwarded to the Approver.`,
      "workflow"
    )
    const routing = computeRouting(db(), loan)
    for (const user of db().users.filter(
      (u) => u.role === "Approver" && u.isActive
    )) {
      if (
        routing.assignedApproverId &&
        routing.assignedApproverId !== user.id &&
        user.role !== "Admin"
      )
        continue
      pushNotification(
        db(),
        user.id,
        "Application for approval",
        `${loan.lamId} — ${recommend ? "recommended" : "NOT recommended by the Evaluator"} (Tier ${routing.requiredApprovalTier ?? "—"}).`,
        "workflow",
        "/review-desk"
      )
    }
    return noStoreJson(toDetail(loan))
  }),

  // --- Evaluator: flag incomplete documents ----------------------------------
  http.post("*/api/loans/:id/document-flag", async ({ params, request }) => {
    const context = await actionContext(request, params)
    if ("error" in context && context.error) return context.error
    const { actor, loan, body } = context as {
      actor: NonNullable<typeof context.actor>
      loan: DbLoan
      body: Record<string, unknown>
    }
    if (!hasPerm(actor, "loans.evaluate"))
      return problem(403, "Forbidden", "Not allowed.")
    if (loan.status !== "ForChecking") {
      return problem(
        409,
        "Invalid transition",
        "Documents can only be flagged while the application is For Checking."
      )
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : ""
    if (reason.length < MIN_REMARKS) {
      return problem(
        400,
        "Validation failed",
        "State which documents are missing (min 10 characters).",
        {
          errors: { reason: ["Describe the missing documents."] },
        }
      )
    }
    const missing = loan.documents.filter((doc) => doc.status === "Missing")
    loan.documentFlag = {
      flaggedAt: new Date().toISOString(),
      flaggedByName: userName(actor),
      reason,
      missingCount: missing.length,
    }
    changeStatus(
      db(),
      loan,
      "FlagDocuments",
      "ForIncompleteDocuments",
      { name: userName(actor), role: actor.role },
      reason
    )
    notifyEncoder(
      loan,
      "Documents incomplete",
      `${loan.lamId}: ${reason}`,
      "correction"
    )
    return noStoreJson(toDetail(loan))
  }),

  // --- Approver: ForApproval -> Approved (authority-gated) --------------------
  http.post("*/api/loans/:id/approve", async ({ params, request }) => {
    const context = await actionContext(request, params)
    if ("error" in context && context.error) return context.error
    const { actor, loan, body } = context as {
      actor: NonNullable<typeof context.actor>
      loan: DbLoan
      body: Record<string, unknown>
    }
    if (!hasPerm(actor, "loans.approve")) {
      return problem(403, "Forbidden", "Your role cannot approve applications.")
    }
    if (loan.status !== "ForApproval") {
      return problem(
        409,
        "Invalid transition",
        `This application is "${loan.status}", not awaiting approval.`
      )
    }
    if (getMockScenario() === "mutation-failure") {
      return problem(
        500,
        "Action failed",
        "The workflow service rejected the approval. Nothing changed — try again."
      )
    }

    // Approval-authority enforcement (backend-owned): the actor must be the
    // routed approver for the required tier, or hold global authority.
    const routing = computeRouting(db(), loan)
    if (routing.noAuthorityReason) {
      return problem(403, "No approval authority", routing.noAuthorityReason)
    }
    if (actor.permissions !== "*" && routing.assignedApproverId !== actor.id) {
      return problem(
        403,
        "Not the assigned approver",
        `This application is assigned to ${routing.assignedApproverName ?? "another approver"} (Tier ${routing.requiredApprovalTier}).`
      )
    }

    const remarks = typeof body.remarks === "string" ? body.remarks.trim() : ""
    if (remarks) loan.remarks = remarks
    changeStatus(
      db(),
      loan,
      "Approve",
      "Approved",
      { name: userName(actor), role: actor.role },
      remarks || null
    )
    loan.signatures.push({
      stage: "Approval",
      userId: actor.id,
      userName: userName(actor),
      role: actor.role,
      signedAt: new Date().toISOString(),
    })
    notifyEncoder(
      loan,
      "Application approved",
      `${loan.lamId} was approved. Disbursement must complete within 30 days (by ${daysFromNow(30).slice(0, 10)}).`,
      "workflow"
    )
    return noStoreJson(toDetail(loan))
  }),

  // --- Approver: ForApproval -> Rejected (terminal) ---------------------------
  http.post("*/api/loans/:id/reject", async ({ params, request }) => {
    const context = await actionContext(request, params)
    if ("error" in context && context.error) return context.error
    const { actor, loan, body } = context as {
      actor: NonNullable<typeof context.actor>
      loan: DbLoan
      body: Record<string, unknown>
    }
    if (!hasPerm(actor, "loans.reject"))
      return problem(403, "Forbidden", "Your role cannot reject applications.")
    if (loan.status !== "ForApproval") {
      return problem(
        409,
        "Invalid transition",
        `Only applications awaiting approval can be rejected (this one is "${loan.status}").`
      )
    }
    const remarks = typeof body.remarks === "string" ? body.remarks.trim() : ""
    if (remarks.length < MIN_REMARKS) {
      return problem(
        400,
        "Validation failed",
        "Rejection requires remarks of at least 10 characters.",
        {
          errors: {
            remarks: [
              `State the reason for rejection (min ${MIN_REMARKS} characters).`,
            ],
          },
        }
      )
    }
    changeStatus(
      db(),
      loan,
      "Reject",
      "Rejected",
      { name: userName(actor), role: actor.role },
      remarks
    )
    notifyEncoder(
      loan,
      "Application rejected",
      `${loan.lamId}: ${remarks}`,
      "workflow"
    )
    return noStoreJson(toDetail(loan))
  }),

  // --- Pushback (Evaluator or Approver): -> ForRevision -----------------------
  http.post("*/api/loans/:id/pushback", async ({ params, request }) => {
    const context = await actionContext(request, params)
    if ("error" in context && context.error) return context.error
    const { actor, loan, body } = context as {
      actor: NonNullable<typeof context.actor>
      loan: DbLoan
      body: Record<string, unknown>
    }

    const fromEvaluation =
      loan.status === "ForChecking" && hasPerm(actor, "loans.evaluate")
    const fromApproval =
      loan.status === "ForApproval" && hasPerm(actor, "loans.approve")
    if (!fromEvaluation && !fromApproval) {
      if (loan.status !== "ForChecking" && loan.status !== "ForApproval") {
        return problem(
          409,
          "Invalid transition",
          `A "${loan.status}" application cannot be returned for correction.`
        )
      }
      return problem(
        403,
        "Forbidden",
        "Your role cannot return this application."
      )
    }

    const sections = Array.isArray(body.sections)
      ? (body.sections as { sectionId: RevisionSectionId; comments: string }[])
      : []
    const overallComments =
      typeof body.overallComments === "string"
        ? body.overallComments.trim()
        : ""
    if (
      sections.length === 0 ||
      sections.some(
        (section) => !section.sectionId || section.comments.trim().length === 0
      )
    ) {
      return problem(
        400,
        "Validation failed",
        "Select at least one section and describe what must be corrected.",
        {
          errors: { sections: ["Each selected section needs a comment."] },
        }
      )
    }
    if (overallComments.length < MIN_REMARKS) {
      return problem(
        400,
        "Validation failed",
        "Overall comments of at least 10 characters are required.",
        {
          errors: {
            overallComments: [
              `Summarize the return reason (min ${MIN_REMARKS} characters).`,
            ],
          },
        }
      )
    }

    loan.revisionRequests.push({
      id: `rev-${Date.now()}`,
      loanId: loan.id,
      requestedByName: userName(actor),
      requestedByRole: actor.role,
      overallComments,
      fromStatus: loan.status,
      requestedAt: new Date().toISOString(),
      isResolved: false,
      resolvedAt: null,
      sections,
    })
    changeStatus(
      db(),
      loan,
      "PushBack",
      "ForRevision",
      { name: userName(actor), role: actor.role },
      overallComments
    )
    loan.ownerUserId = null
    notifyEncoder(
      loan,
      "Application returned for correction",
      `${loan.lamId}: ${overallComments}`,
      "correction"
    )
    return noStoreJson(toDetail(loan))
  }),

  // --- Disbursement lifecycle (backend-owned 30-day rule) ----------------------
  http.post(
    "*/api/loans/:id/disbursement/prepare",
    async ({ params, request }) => {
      const context = await actionContext(request, params)
      if ("error" in context && context.error) return context.error
      const { actor, loan } = context as {
        actor: NonNullable<typeof context.actor>
        loan: DbLoan
      }
      if (!hasPerm(actor, "loans.disburse"))
        return problem(
          403,
          "Forbidden",
          "Your role cannot prepare disbursements."
        )
      if (loan.status !== "Approved") {
        return problem(
          409,
          "Invalid transition",
          `Only "Approved" applications can be prepared for disbursement (this one is "${loan.status}").`
        )
      }
      const view = disbursementView(loan)
      if (view.isOverdue) {
        return problem(
          409,
          "Disbursement window lapsed",
          "This application passed its 30-day disbursement deadline and must be voided, not disbursed."
        )
      }
      changeStatus(
        db(),
        loan,
        "PrepareDisbursement",
        "ForDisbursement",
        { name: userName(actor), role: actor.role },
        "Proceeds release scheduled."
      )
      return noStoreJson(toDetail(loan))
    }
  ),

  http.post(
    "*/api/loans/:id/disbursement/confirm",
    async ({ params, request }) => {
      const context = await actionContext(request, params)
      if ("error" in context && context.error) return context.error
      const { actor, loan, body } = context as {
        actor: NonNullable<typeof context.actor>
        loan: DbLoan
        body: Record<string, unknown>
      }
      if (!hasPerm(actor, "loans.disburse"))
        return problem(
          403,
          "Forbidden",
          "Your role cannot confirm disbursements."
        )
      if (loan.status !== "ForDisbursement") {
        return problem(
          409,
          "Invalid transition",
          `Only applications "ForDisbursement" can be confirmed (this one is "${loan.status}").`
        )
      }
      const view = disbursementView(loan)
      if (view.isOverdue) {
        return problem(
          409,
          "Disbursement window lapsed",
          "This application passed its 30-day disbursement deadline and must be voided, not disbursed."
        )
      }
      const reference =
        typeof body.reference === "string" && body.reference.trim()
          ? body.reference.trim()
          : `DISB-2026-${String(2000 + db().loans.length)}`
      loan.disbursement.disbursedAt = new Date().toISOString()
      loan.disbursement.disbursedBy = userName(actor)
      loan.disbursement.disbursementReference = reference
      changeStatus(
        db(),
        loan,
        "Disburse",
        "Disbursed",
        { name: userName(actor), role: actor.role },
        `Credited under reference ${reference}.`
      )
      notifyEncoder(
        loan,
        "Proceeds released",
        `${loan.lamId} was disbursed (${reference}).`,
        "disbursement"
      )
      return noStoreJson(toDetail(loan))
    }
  ),

  /**
   * Void an application whose 30-day disbursement window lapsed. The overdue
   * check happens HERE (server-side) — the frontend cannot void an application
   * that is still inside the window, and cannot fake a void locally.
   */
  http.post("*/api/loans/:id/expire", async ({ params, request }) => {
    const context = await actionContext(request, params)
    if ("error" in context && context.error) return context.error
    const { actor, loan, body } = context as {
      actor: NonNullable<typeof context.actor>
      loan: DbLoan
      body: Record<string, unknown>
    }
    if (!hasPerm(actor, "loans.disburse") && actor.permissions !== "*") {
      return problem(
        403,
        "Forbidden",
        "Only officers with disbursement authority may void lapsed applications."
      )
    }
    if (loan.status !== "Approved" && loan.status !== "ForDisbursement") {
      return problem(
        409,
        "Invalid transition",
        `A "${loan.status}" application cannot be voided for timeout.`
      )
    }
    const view = disbursementView(loan)
    if (!view.isOverdue) {
      return problem(
        409,
        "Not eligible for voiding",
        view.daysRemaining != null
          ? `The disbursement window is still open (${view.daysRemaining} day(s) left).`
          : "This application has no disbursement deadline."
      )
    }
    const reason =
      typeof body.reason === "string" &&
      body.reason.trim().length >= MIN_REMARKS
        ? body.reason.trim()
        : "Not disbursed within 30 days of approval; voided per disbursement-timeout policy."
    loan.disbursement.voidedAt = new Date().toISOString()
    loan.disbursement.voidReason = reason
    changeStatus(
      db(),
      loan,
      "Expire",
      "Expired",
      { name: userName(actor), role: actor.role },
      reason
    )
    notifyEncoder(
      loan,
      "Application voided (disbursement timeout)",
      `${loan.lamId}: ${reason}`,
      "disbursement"
    )
    return noStoreJson(toDetail(loan))
  }),

  /** Core-banking sync stand-in: Disbursed -> OnGoing after the first amortization posts. */
  http.post("*/api/loans/:id/sync", async ({ params, request }) => {
    const context = await actionContext(request, params)
    if ("error" in context && context.error) return context.error
    const { actor, loan } = context as {
      actor: NonNullable<typeof context.actor>
      loan: DbLoan
    }
    if (actor.permissions !== "*" && !hasPerm(actor, "loans.disburse")) {
      return problem(403, "Forbidden", "Not allowed.")
    }
    if (loan.status !== "Disbursed") {
      return problem(
        409,
        "Invalid transition",
        "Only disbursed applications can be synced to On Going."
      )
    }
    pushHistory(
      loan,
      {
        action: "CoreSync",
        fromStatus: "Disbursed",
        toStatus: "OnGoing",
        comments: "First amortization posted by core system.",
        actionDate: new Date().toISOString(),
        actionByUserName: "System",
        actionByRole: "System",
      },
      db()
    )
    loan.status = "OnGoing"
    return noStoreJson({
      loanId: loan.id,
      lamId: loan.lamId,
      previousStatus: "Disbursed",
      currentStatus: "OnGoing",
      synced: true,
      reason: "First amortization posted.",
    })
  }),
]
