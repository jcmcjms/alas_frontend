import { delay, http } from "msw"
import { db, disbursementView, findUser, userName } from "../db"
import { noStoreJson, problem, resolveActor } from "../handler-utils"
import { DISBURSEMENT_AT_RISK_DAYS } from "@/features/loans/types/loan-status"

/**
 * Role-aware dashboard overview. Every figure is computed from the mock
 * database — no invented statistics.
 */
export const dashboardHandlers = [
  http.get("*/api/dashboard/overview", async ({ request }) => {
    await delay(240)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")

    const loans = db().loans
    const mine = loans.filter((loan) => loan.createdById === actor.id)
    const now = Date.now()

    const deskCount = (status: string) =>
      loans.filter((loan) => loan.status === status).length
    const myClaimCount = loans.filter(
      (loan) => loan.ownerUserId === actor.id
    ).length

    const overdueDisbursements = loans.filter(
      (loan) => disbursementView(loan).isOverdue
    )
    const atRiskDisbursements = loans.filter((loan) => {
      const view = disbursementView(loan)
      return (
        !view.isOverdue &&
        view.daysRemaining != null &&
        view.daysRemaining <= DISBURSEMENT_AT_RISK_DAYS &&
        (loan.status === "Approved" || loan.status === "ForDisbursement")
      )
    })

    const pendingCorrection = mine.filter(
      (loan) =>
        loan.status === "ForRevision" ||
        loan.status === "ForIncompleteDocuments"
    )

    const counts: {
      key: string
      label: string
      value: number
      link: string | null
      tone: "default" | "attention" | "positive"
    }[] = []

    switch (actor.role) {
      case "Encoder":
        counts.push(
          {
            key: "corrections",
            label: "Returned to me",
            value: pendingCorrection.length,
            link: pendingCorrection.length
              ? `/loans/${pendingCorrection[0].id}`
              : null,
            tone: pendingCorrection.length ? "attention" : "default",
          },
          {
            key: "inPipeline",
            label: "In review pipeline",
            value: mine.filter((loan) =>
              ["ForRecommendation", "ForChecking", "ForApproval"].includes(
                loan.status
              )
            ).length,
            link: "/monitoring?mine=true",
            tone: "default",
          },
          {
            key: "approved30",
            label: "Approved this month",
            value: mine.filter(
              (loan) =>
                [
                  "Approved",
                  "ForDisbursement",
                  "Disbursed",
                  "OnGoing",
                ].includes(loan.status) &&
                new Date(loan.lastActionDate).getTime() > now - 30 * 86_400_000
            ).length,
            link: "/monitoring?mine=true",
            tone: "positive",
          },
          {
            key: "drafts",
            label: "Drafts",
            value: mine.filter((loan) => loan.status === "Draft").length,
            link: "/monitoring?mine=true&status=Draft",
            tone: "default",
          }
        )
        break
      case "Recommender":
        counts.push(
          {
            key: "queue",
            label: "Waiting for recommendation",
            value: deskCount("ForRecommendation"),
            link: "/review-desk",
            tone: deskCount("ForRecommendation") ? "attention" : "default",
          },
          {
            key: "claims",
            label: "Claimed by me",
            value: myClaimCount,
            link: "/review-desk",
            tone: "default",
          },
          {
            key: "done7",
            label: "Recommended (7 days)",
            value: loans.filter((loan) =>
              loan.history.some(
                (entry) =>
                  entry.action === "Recommend" &&
                  entry.actionByUserName === userName(actor) &&
                  new Date(entry.actionDate).getTime() > now - 7 * 86_400_000
              )
            ).length,
            link: null,
            tone: "positive",
          }
        )
        break
      case "Evaluator":
        counts.push(
          {
            key: "queue",
            label: "Waiting for checking",
            value: deskCount("ForChecking"),
            link: "/review-desk",
            tone: deskCount("ForChecking") ? "attention" : "default",
          },
          {
            key: "claims",
            label: "Claimed by me",
            value: myClaimCount,
            link: "/review-desk",
            tone: "default",
          },
          {
            key: "incomplete",
            label: "Incomplete documents",
            value: deskCount("ForIncompleteDocuments"),
            link: "/monitoring?status=ForIncompleteDocuments",
            tone: deskCount("ForIncompleteDocuments") ? "attention" : "default",
          }
        )
        break
      case "Approver":
        counts.push(
          {
            key: "queue",
            label: "Waiting for approval",
            value: deskCount("ForApproval"),
            link: "/review-desk",
            tone: deskCount("ForApproval") ? "attention" : "default",
          },
          {
            key: "claims",
            label: "Claimed by me",
            value: myClaimCount,
            link: "/review-desk",
            tone: "default",
          },
          {
            key: "overdue",
            label: "Disbursement overdue",
            value: overdueDisbursements.length,
            link: "/monitoring/disbursement",
            tone: overdueDisbursements.length ? "attention" : "default",
          },
          {
            key: "atRisk",
            label: "Due within 5 days",
            value: atRiskDisbursements.length,
            link: "/monitoring/disbursement",
            tone: atRiskDisbursements.length ? "attention" : "default",
          }
        )
        break
      default:
        counts.push(
          {
            key: "pipeline",
            label: "In pipeline",
            value: ["ForRecommendation", "ForChecking", "ForApproval"].reduce(
              (sum, status) => sum + deskCount(status),
              0
            ),
            link: "/monitoring",
            tone: "default",
          },
          {
            key: "corrections",
            label: "Returned for correction",
            value:
              deskCount("ForRevision") + deskCount("ForIncompleteDocuments"),
            link: "/monitoring?status=ForRevision",
            tone: "attention",
          },
          {
            key: "overdue",
            label: "Disbursement overdue",
            value: overdueDisbursements.length,
            link: "/monitoring/disbursement",
            tone: overdueDisbursements.length ? "attention" : "default",
          },
          {
            key: "users",
            label: "Active users",
            value: db().users.filter((user) => user.isActive).length,
            link: "/admin/users",
            tone: "default",
          }
        )
    }

    const needsAttention = [
      ...pendingCorrection.map((loan) => ({
        kind: "correction" as const,
        loanId: loan.id,
        lamId: loan.lamId,
        clientName: `${loan.client.firstName} ${loan.client.lastName}`,
        detail:
          loan.status === "ForRevision"
            ? "Returned for correction"
            : "Incomplete documents",
        since: loan.lastActionDate,
      })),
      ...overdueDisbursements.map((loan) => ({
        kind: "overdue" as const,
        loanId: loan.id,
        lamId: loan.lamId,
        clientName: `${loan.client.firstName} ${loan.client.lastName}`,
        detail: "Disbursement window lapsed — eligible for voiding",
        since: loan.disbursement.deadlineUtc ?? loan.lastActionDate,
      })),
    ]
      .sort((a, b) => b.since.localeCompare(a.since))
      .slice(0, 6)

    const recentActivity = db()
      .activities.filter((activity) => {
        const loan = db().loans.find(
          (candidate) => candidate.lamId === activity.lamId
        )
        if (!loan) return false
        if (actor.role === "Encoder") return loan.createdById === actor.id
        if (actor.role === "Admin") return true
        return (
          activity.userId === actor.id ||
          [
            "ForRecommendation",
            "ForChecking",
            "ForApproval",
            "Approved",
          ].includes(loan.status)
        )
      })
      .slice(0, 8)
      .map((activity) => {
        const user = findUser(db(), activity.userId)
        return {
          id: activity.id,
          lamId: activity.lamId,
          clientName: activity.loanClientName,
          action: activity.action,
          byName: user ? userName(user) : activity.action,
          at: activity.actionDate,
        }
      })

    return noStoreJson({
      role: actor.role,
      deskLabel:
        actor.role === "Recommender"
          ? "Recommendation desk"
          : actor.role === "Evaluator"
            ? "Evaluation desk"
            : actor.role === "Approver"
              ? "Approval desk"
              : null,
      counts,
      needsAttention,
      recentActivity,
      workflow: {
        requireRecommendation: db().workflowConfig.requireRecommendation,
      },
    })
  }),
]
