import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  FileWarningIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Undo2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  useEvaluateLoan,
  useFlagDocuments,
  useLoanDetail,
  usePushbackLoan,
} from "@/features/loans/api/loans.queries"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { DecisionDialog } from "@/components/shared/decision-dialog"
import { DetailSkeleton, ErrorState } from "@/components/shared/state-views"
import { HistoryTimeline } from "@/components/shared/history-timeline"
import { StatusBadge } from "@/components/shared/status-badge"
import { PushbackDialog } from "@/features/loans/components/pushback-dialog"
import {
  ClientPanel,
  DeviationsPanel,
  DocumentsPanel,
  LoanTermsPanel,
  ObligationsPanel,
  RoutingPanel,
  SectionCard,
  SignaturesPanel,
} from "@/features/loans/components/review-panels"

type DialogKind =
  "recommend" | "not-recommend" | "pushback" | "flag-docs" | null

/**
 * Evaluator review screen: full evidence set plus only the decisions the
 * backend contract permits at ForChecking. A NotRecommended verdict still
 * advances to the Approver (preserved legacy business rule) — the dialog says
 * so explicitly before the officer confirms.
 */
export function EvaluationPage() {
  const { loanId = "" } = useParams()
  const detail = useLoanDetail(loanId)
  const evaluate = useEvaluateLoan(loanId)
  const pushback = usePushbackLoan(loanId)
  const flagDocs = useFlagDocuments(loanId)
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [flagReason, setFlagReason] = useState("")

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

  if (loan.status !== "ForChecking") {
    return (
      <div className="p-6">
        <SectionCard title="Nothing to evaluate">
          <p className="text-sm">
            <span className="font-mono">{loan.lamId}</span> is currently{" "}
            <StatusBadge status={loan.status} className="align-middle" /> — it
            is not waiting for credit checking.{" "}
            <Link
              to={`/loans/${loan.id}`}
              className="underline underline-offset-2"
            >
              Open the application
            </Link>{" "}
            to see its current stage.
          </p>
        </SectionCard>
      </div>
    )
  }

  const previousDecisions = loan.history.filter((entry) =>
    [
      "Recommend",
      "Evaluate",
      "Evaluate (NotRecommended)",
      "Approve",
      "Reject",
      "PushBack",
    ].includes(entry.action)
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
          </div>
          <p className="text-sm text-muted-foreground">
            {loan.client.firstName} {loan.client.lastName} ·{" "}
            {formatCurrency(loan.proposedAmount)} · {loan.productCode} · waiting
            since {formatDateTime(loan.lastActionDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setDialog("recommend")}
          >
            <ThumbsUpIcon aria-hidden className="size-3.5" />
            Recommend for approval
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setDialog("not-recommend")}
          >
            <ThumbsDownIcon aria-hidden className="size-3.5" />
            Mark not recommended
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setDialog("pushback")}
          >
            <Undo2Icon aria-hidden className="size-3.5" />
            Return for correction
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setDialog("flag-docs")}
          >
            <FileWarningIcon aria-hidden className="size-3.5" />
            Flag incomplete documents
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ClientPanel loan={loan} />
          <LoanTermsPanel loan={loan} />
          <ObligationsPanel loan={loan} />
          <DeviationsPanel loan={loan} />
          <SectionCard title="Previous decisions & remarks">
            {previousDecisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No review decisions recorded yet.
              </p>
            ) : (
              <HistoryTimeline history={previousDecisions} />
            )}
          </SectionCard>
        </div>
        <div className="space-y-4">
          <RoutingPanel loan={loan} />
          <DocumentsPanel loan={loan} />
          <SignaturesPanel loan={loan} />
          <SectionCard title="Full activity history">
            <HistoryTimeline history={loan.history} />
          </SectionCard>
        </div>
      </div>

      <DecisionDialog
        open={dialog === "recommend"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Recommend for approval?"
        subject={`${loan.lamId} · ${loan.client.firstName} ${loan.client.lastName} · ${formatCurrency(loan.proposedAmount)}`}
        consequence="Goes to the Approver with verdict “Recommended” and your remarks. Your signature is captured."
        confirmLabel="Recommend"
        remarksRequired
        remarksMinLength={10}
        remarksLabel="Evaluation findings"
        remarksPlaceholder="Summarize capacity, documents and deviation findings (min 10 characters)"
        pending={evaluate.isPending}
        error={evaluate.error}
        onConfirm={(remarks) => {
          evaluate.mutate(
            { recommend: true, remarks, rowVersion: loan.rowVersion },
            {
              onSuccess: () => {
                setDialog(null)
                toast.success(`${loan.lamId} recommended for approval.`)
              },
            }
          )
        }}
      />

      <DecisionDialog
        open={dialog === "not-recommend"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Mark as not recommended?"
        subject={`${loan.lamId} · ${loan.client.firstName} ${loan.client.lastName}`}
        consequence="The application still goes to the Approver, who makes the final call. Your adverse finding and remarks travel with it."
        confirmLabel="Mark not recommended"
        remarksRequired
        remarksMinLength={10}
        remarksLabel="Adverse findings"
        remarksPlaceholder="State the finding that drives the adverse verdict (min 10 characters)"
        pending={evaluate.isPending}
        error={evaluate.error}
        onConfirm={(remarks) => {
          evaluate.mutate(
            { recommend: false, remarks, rowVersion: loan.rowVersion },
            {
              onSuccess: () => {
                setDialog(null)
                toast.success(
                  `${loan.lamId} marked not recommended and forwarded to the Approver.`
                )
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

      <DecisionDialog
        open={dialog === "flag-docs"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Flag incomplete documents?"
        subject={`${loan.lamId} · ${loan.client.firstName} ${loan.client.lastName}`}
        consequence="The application moves to For Incomplete Documents and returns to the encoder listing what is missing."
        confirmLabel="Flag documents"
        remarksRequired
        remarksMinLength={10}
        remarksLabel="What is missing"
        remarksPlaceholder="e.g. Bank statement and CIBI documentation not uploaded (min 10 characters)"
        pending={flagDocs.isPending}
        error={flagDocs.error}
        onConfirm={(reason) => {
          setFlagReason(reason)
          flagDocs.mutate(
            { reason, rowVersion: loan.rowVersion },
            {
              onSuccess: () => {
                setDialog(null)
                setFlagReason("")
                toast.success(`${loan.lamId} flagged for incomplete documents.`)
              },
            }
          )
        }}
      >
        {loan.routing.missingDocuments.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Checklist currently missing:{" "}
            {loan.routing.missingDocuments.join("; ")}
            {flagReason ? null : " — use this as your reason or edit it below."}
          </p>
        ) : null}
      </DecisionDialog>
    </div>
  )
}

export default EvaluationPage
