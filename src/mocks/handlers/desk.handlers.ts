import { delay, http } from "msw"
import {
  buildDeskQueue,
  db,
  findLoan,
  findUser,
  pushNotification,
  userName,
} from "../db"
import { noStoreJson, problem, resolveActor, hasPerm } from "../handler-utils"
import { getMockScenario } from "../scenarios"
import type {
  ClaimResponse,
  DeskGroupDto,
  DeskQueueResponse,
} from "@/features/loans/types/loan-contracts"
import type { LoanStatus } from "@/features/loans/types/loan-status"
import { ROLE_QUEUE_STATUS } from "@/features/auth/types"
import type { DbLoan } from "../db"

const DESK_LABELS: Record<string, string> = {
  ForRecommendation: "Recommendation desk",
  ForChecking: "Evaluation desk",
  ForApproval: "Approval desk",
}

function deskStatusFor(actorRole: string): LoanStatus | null {
  const status = ROLE_QUEUE_STATUS[actorRole as keyof typeof ROLE_QUEUE_STATUS]
  return (status as LoanStatus | undefined) ?? null
}

function claimBundle(loans: DbLoan[], actorId: string): void {
  for (const loan of loans) {
    loan.ownerUserId = actorId
  }
}

function groupOf(groupNo: string): { groupNo: string; loans: DbLoan[] } | null {
  const loans = db().loans.filter((loan) => loan.applicationGroupNo === groupNo)
  return loans.length ? { groupNo, loans } : null
}

function toClaimResponse(bundle: {
  groupNo: string
  loans: DbLoan[]
}): ClaimResponse {
  const head = bundle.loans[0]
  return {
    groupNo: bundle.groupNo,
    loanId: head.id,
    lamId: head.lamId,
    clientName: `${head.client.firstName} ${head.client.lastName}`,
    status: head.status,
    applications: bundle.loans.map((loan) => ({
      loanId: loan.id,
      lamId: loan.lamId,
      status: loan.status,
    })),
  }
}

export const deskHandlers = [
  http.get("*/api/loans/queue/my", async ({ request }) => {
    const scenario = getMockScenario()
    await delay(scenario === "slow" ? 2500 : 250)
    const actor = resolveActor(request)
    if (!actor)
      return problem(401, "Unauthorized", "Sign in to view your desk.")
    if (
      !hasPerm(actor, "loans.recommend") &&
      !hasPerm(actor, "loans.evaluate") &&
      !hasPerm(actor, "loans.approve")
    ) {
      return problem(403, "Forbidden", "Your role has no review desk.")
    }

    const queueStatus = deskStatusFor(actor.role)
    if (!queueStatus) {
      return noStoreJson<DeskQueueResponse>({
        deskLabel: "Review desk",
        scopeDescription: "No review stage is assigned to your role.",
        queueStatus: "ForChecking",
        items: [],
        currentClaims: [],
      })
    }

    const { items, currentClaims } = buildDeskQueue(db(), queueStatus, actor.id)
    return noStoreJson<DeskQueueResponse>({
      deskLabel: DESK_LABELS[queueStatus] ?? "Review desk",
      scopeDescription:
        queueStatus === "ForRecommendation"
          ? "Applications submitted by all branches, waiting for the branch head's recommendation."
          : queueStatus === "ForChecking"
            ? "Recommended applications waiting for credit checking."
            : "Evaluated applications waiting for the assigned approver.",
      queueStatus,
      items: scenario === "empty-queue" ? [] : items,
      currentClaims: scenario === "empty-queue" ? [] : currentClaims,
    })
  }),

  // Claim the next unclaimed bundle (or a specific one when groupNo is given).
  http.post("*/api/loans/queue/claim", async ({ request }) => {
    const scenario = getMockScenario()
    await delay(scenario === "slow" ? 2500 : 300)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const queueStatus = deskStatusFor(actor.role)
    if (!queueStatus)
      return problem(403, "Forbidden", "Your role has no review desk.")

    if (scenario === "claim-conflict") {
      return problem(
        409,
        "Already claimed",
        "Another officer claimed this client bundle first. Your queue has been refreshed."
      )
    }

    const { items } = buildDeskQueue(db(), queueStatus, actor.id)
    const next = items.find((item: DeskGroupDto) => !item.ownerUserId)
    if (!next) {
      return noStoreJson(null)
    }
    const bundle = groupOf(next.groupNo)
    if (!bundle) return problem(404, "Not found", "That bundle left the queue.")
    const bundleLoans = bundle.loans.filter(
      (loan): loan is NonNullable<typeof loan> => loan != null
    )
    // Re-check ownership at write time (guards concurrent claims).
    if (
      bundleLoans[0]?.ownerUserId &&
      bundleLoans[0].ownerUserId !== actor.id
    ) {
      return problem(
        409,
        "Already claimed",
        `${userName(findUser(db(), bundleLoans[0].ownerUserId!)!)} is serving this client. Your queue has been refreshed.`
      )
    }
    claimBundle(bundleLoans, actor.id)
    return noStoreJson<ClaimResponse>(
      toClaimResponse({ groupNo: bundle.groupNo, loans: bundleLoans })
    )
  }),

  // Claim a specific bundle by one of its loans.
  http.post("*/api/loans/queue/:loanId/claim", async ({ params, request }) => {
    const scenario = getMockScenario()
    await delay(scenario === "slow" ? 2500 : 300)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const queueStatus = deskStatusFor(actor.role)
    if (!queueStatus)
      return problem(403, "Forbidden", "Your role has no review desk.")

    const loan = findLoan(db(), String(params.loanId))
    if (!loan)
      return problem(404, "Not found", "That application left the queue.")
    if (loan.status !== queueStatus) {
      return problem(
        409,
        "No longer queued",
        `This application moved to "${loan.status}" and left your desk.`
      )
    }
    const bundle = groupOf(loan.applicationGroupNo)
    if (!bundle) return problem(404, "Not found", "That bundle left the queue.")
    const owner = bundle.loans[0]?.ownerUserId
    if (owner && owner !== actor.id) {
      const ownerUser = findUser(db(), owner)
      return problem(
        409,
        "Already claimed",
        `${ownerUser ? userName(ownerUser) : "Another officer"} is serving this client.`
      )
    }
    if (scenario === "claim-conflict") {
      return problem(
        409,
        "Already claimed",
        "Another officer claimed this client bundle first. Your queue has been refreshed."
      )
    }
    claimBundle(bundle.loans, actor.id)
    return noStoreJson<ClaimResponse>(toClaimResponse(bundle))
  }),

  // Release the officer's current claim(s); optional groupNo targets one bundle.
  http.post("*/api/loans/queue/release", async ({ request }) => {
    await delay(220)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const body = (await request.json().catch(() => ({}))) as {
      groupNo?: string
    }

    const owned = db().loans.filter(
      (loan) =>
        loan.ownerUserId === actor.id &&
        (!body.groupNo || loan.applicationGroupNo === body.groupNo)
    )
    if (owned.length === 0) {
      return problem(
        404,
        "No active claim",
        "You are not holding this client bundle."
      )
    }
    const releasedGroups = new Set(owned.map((loan) => loan.applicationGroupNo))
    for (const loan of owned) loan.ownerUserId = null
    pushNotification(
      db(),
      actor.id,
      "Claim released",
      `${[...releasedGroups].join(", ")} returned to the queue.`,
      "system",
      "/review-desk"
    )
    return noStoreJson({ releasedGroups: [...releasedGroups] })
  }),
]
