import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { BanIcon, ShieldCheckIcon, ThumbsUpIcon, Undo2Icon } from "lucide-react"
import { toast } from "sonner"

import { useSession } from "@/features/auth/session-context"
import {
  useApproveLoan,
  useLoanDetail,
  usePushbackLoan,
  useRejectLoan,
} from "@/features/loans/api/loans.queries"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DecisionDialog } from "@/components/shared/decision-dialog"
import { DetailSkeleton, ErrorState } from "@/components/shared/state-views"
import { HistoryTimeline } from "@/components/shared/history-timeline"
import { StatusBadge } from "@/components/shared/status-badge"
import { PushbackDialog } from "@/features/loans/components/pushback-dialog"
import { DisbursementActions } from "@/features/loans/components/disbursement-actions"
import {
  ClientPanel,
  DeviationsPanel,
  DisbursementPanel,
  DocumentsPanel,
  LoanTermsPanel,
  ObligationsPanel,
  RoutingPanel,
  SectionCard,
  SignaturesPanel,
} from "@/features/loans/components/review-panels"
type DialogKind = "approve" | "reject" | "pushback" | null

/**
 * Approver review screen: the evaluation evidence first, then the final
 * decision — gated by the backend's approval-authority routing. The UI mirrors
 * the gate (disabled action + reason) but the server enforces it.
 */
export function ApprovalPage() {
  const { loanId = "" } = useParams()
  const { user } = useSession()
  const detail = useLoanDetail(loanId)
  const approve = useApproveLoan(loanId)
  const reject = useRejectLoan(loanId)
  const pushback = usePushbackLoan(loanId)
  const [dialog, setDialog] = useState<DialogKind>(null)

  if (detail.isPending) {
    return (
      <div className="p-6">
        <DetailSkeleton />
      </div>
    )
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="p-6">
        <ErrorState
          error={detail.error}
          onRetry={() => void detail.refetch()}
          title="Couldn't load this application"
        />
      </div>
    )
  }

  const loan = detail.data
  const isAwaitingApproval = loan.status === "ForApproval"
  const isPostApproval = [
    "Approved",
    "ForDisbursement",
    "Disbursed",
    "OnGoing",
    "Expired",
  ].includes(loan.status)

  // Authority gate (mirrors the server-side check for honest UX).
  const isAdmin = user?.permissions.includes("*")
  const notAssigned =
    isAwaitingApproval &&
    loan.routing.assignedApproverId != null &&
    loan.routing.assignedApproverId !== user?.userId &&
    !isAdmin
  const noAuthority =
    isAwaitingApproval && loan.routing.noAuthorityReason != null

  if (!isAwaitingApproval && !isPostApproval) {
    return (
      <div className="p-6">
        <SectionCard title="Nothing to approve">
          <p className="text-sm">
            <span className="font-mono">{loan.lamId}</span> is currently{" "}
            <StatusBadge status={loan.status} className="align-middle" /> —
            approval decisions are only possible while an application is For
            Approval.{" "}
            <Link
              to={`/loans/${loan.id}`}
              className="underline underline-offset-2"
            >
              Open the application
            </Link>
            .
          </p>
        </SectionCard>
      </div>
    )
  }

  const evaluationEntries = loan.history.filter((entry) =>
    ["Recommend", "Evaluate", "Evaluate (NotRecommended)", "PushBack"].includes(
      entry.action
    )
  )

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-lg font-semibold tracking-tight">
              {loan.lamId}
            </h1>
            <StatusBadge status={loan.status} />
            {loan.evaluationVerdict === "NotRecommended" ? (
              <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                Evaluator did NOT recommend
              </span>
            ) : loan.evaluationVerdict === "Recommended" ? (
              <span className="border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                Evaluator recommended
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {loan.client.firstName} {loan.client.lastName} ·{" "}
            {formatCurrency(loan.proposedAmount)} · {loan.productCode} · Tier{" "}
            {loan.routing.requiredApprovalTier ?? "—"} ·{" "}
            {isAwaitingApproval
              ? `waiting since ${formatDateTime(loan.lastActionDate)}`
              : ""}
          </p>
        </div>
        {isAwaitingApproval ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={notAssigned || noAuthority || approve.isPending}
              onClick={() => setDialog("approve")}
              title={
                notAssigned
                  ? `Assigned to ${loan.routing.assignedApproverName ?? "another approver"}`
                  : noAuthority
                    ? (loan.routing.noAuthorityReason ?? undefined)
                    : undefined
              }
            >
              <ThumbsUpIcon aria-hidden className="size-3.5" />
              Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={reject.isPending}
              onClick={() => setDialog("reject")}
            >
              <BanIcon aria-hidden className="size-3.5" />
              Reject
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={pushback.isPending}
              onClick={() => setDialog("pushback")}
            >
              <Undo2Icon aria-hidden className="size-3.5" />
              Return for correction
            </Button>
          </div>
        ) : null}
      </div>

      {isAwaitingApproval && (notAssigned || noAuthority) ? (
        <Alert
          className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          role="status"
        >
          <ShieldCheckIcon aria-hidden className="size-4" />
          <AlertDescription className="text-xs">
            {noAuthority
              ? loan.routing.noAuthorityReason
              : `This application is assigned to ${loan.routing.assignedApproverName ?? "another approver"} under the ${loan.routing.matchedRule ?? "matched"} authority. You can review it, but only the assigned approver may approve.`}
          </AlertDescription>
        </Alert>
      ) : null}

      {isPostApproval ? <DisbursementActions loan={loan} /> : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <LoanTermsPanel loan={loan} />
          <SectionCard title="Evaluation findings">
            {evaluationEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No prior review decisions recorded.
              </p>
            ) : (
              <HistoryTimeline history={evaluationEntries} />
            )}
            {loan.remarks ? (
              <p className="mt-3 border-l-2 border-border pl-2 text-sm text-muted-foreground">
                <span className="text-xs">Evaluator remarks:</span>
                <br />
                {loan.remarks}
              </p>
            ) : null}
          </SectionCard>
          <ClientPanel loan={loan} />
          <ObligationsPanel loan={loan} />
          <DeviationsPanel loan={loan} />
        </div>
        <div className="space-y-4">
          <RoutingPanel loan={loan} />
          <DocumentsPanel loan={loan} />
          <SignaturesPanel loan={loan} />
          <DisbursementPanel loan={loan} />
          <SectionCard title="Full activity history">
            <HistoryTimeline history={loan.history} />
          </SectionCard>
        </div>
      </div>

      <DecisionDialog
        open={dialog === "approve"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Approve this loan?"
        subject={
          <span>
            <span className="font-mono">{loan.lamId}</span> ·{" "}
            {loan.client.firstName} {loan.client.lastName} ·{" "}
            {formatCurrency(loan.proposedAmount)} · {loan.termDays} days @{" "}
            {loan.annualRatePercent}%
          </span>
        }
        consequence="The loan is approved and the encoder is notified. Proceeds must be released within 30 days or the application becomes void-eligible. Your signature is captured."
        confirmLabel="Approve loan"
        remarksLabel="Approval remarks"
        pending={approve.isPending}
        error={approve.error}
        onConfirm={(remarks) => {
          approve.mutate(
            { remarks: remarks || undefined, rowVersion: loan.rowVersion },
            {
              onSuccess: () => {
                setDialog(null)
                toast.success(
                  `${loan.lamId} approved. Disbursement window: 30 days.`
                )
              },
            }
          )
        }}
      >
        {loan.evaluationVerdict === "NotRecommended" ? (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertDescription className="text-xs">
              The Evaluator marked this application NOT recommended. Review the
              findings below before approving over that verdict.
            </AlertDescription>
          </Alert>
        ) : null}
        {loan.routing.totalExposure > loan.proposedAmount ? (
          <p className="text-xs text-muted-foreground">
            Total exposure including existing obligations:{" "}
            {formatCurrency(loan.routing.totalExposure)}.
          </p>
        ) : null}
      </DecisionDialog>

      <DecisionDialog
        open={dialog === "reject"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Reject this application?"
        subject={`${loan.lamId} · ${loan.client.firstName} ${loan.client.lastName}`}
        consequence="This ends the application. It cannot be reopened — the client would need to reapply."
        confirmLabel="Reject application"
        remarksLabel="Rejection reason"
        remarksRequired
        remarksMinLength={10}
        remarksPlaceholder="State the reason the client and encoder will see (min 10 characters)"
        destructive
        pending={reject.isPending}
        error={reject.error}
        onConfirm={(remarks) => {
          reject.mutate(
            { remarks, rowVersion: loan.rowVersion },
            {
              onSuccess: () => {
                setDialog(null)
                toast.success(`${loan.lamId} rejected.`)
              },
            }
          )
        }}
      />

      <PushbackDialog
        open={dialog === "pushback"}
        onOpenChange={(open) => !open && setDialog(null)}
        lamId={loan.lamId}
        clientName={`${loan.client.firstName} ${loan.client.lastName}`}
        pending={pushback.isPending}
        error={pushback.error}
        onConfirm={(payload) => {
          pushback.mutate(
            { ...payload, rowVersion: loan.rowVersion },
            {
              onSuccess: () => {
                setDialog(null)
                toast.success(
                  `${loan.lamId} returned to the encoder for correction.`
                )
              },
            }
          )
        }}
      />
    </div>
  )
}

export default ApprovalPage
