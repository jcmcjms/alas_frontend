import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  BanIcon,
  InboxIcon,
  PaperclipIcon,
  SendIcon,
  ThumbsUpIcon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { useSession } from "@/features/auth/session-context"
import { PERMISSIONS } from "@/features/auth/types"
import { getErrorMessage } from "@/lib/api/api-error"
import { formatCurrency, formatDateTime, formatRelative } from "@/lib/format"
import { queryKeys } from "@/lib/query/keys"
import { useQuery } from "@tanstack/react-query"
import { loansApi } from "@/features/loans/api/loans.api"
import {
  useCancelLoan,
  useLoanDetail,
  useRecommendLoan,
  useUploadDocument,
} from "@/features/loans/api/loans.queries"
import {
  CANCELLABLE_STATUSES,
  isLoanStatus,
} from "@/features/loans/types/loan-status"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DecisionDialog } from "@/components/shared/decision-dialog"
import { DetailSkeleton, ErrorState } from "@/components/shared/state-views"
import { HistoryTimeline } from "@/components/shared/history-timeline"
import { StatusBadge } from "@/components/shared/status-badge"
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

/**
 * Application detail: the single source of view for any role, with only the
 * actions the backend permits for this user and status.
 */
export function LoanDetailPage() {
  const { loanId = "" } = useParams()
  const { user, hasPermission } = useSession()
  const detail = useLoanDetail(loanId)

  const [recommendOpen, setRecommendOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const recommend = useRecommendLoan(loanId)
  const cancel = useCancelLoan(loanId)
  const upload = useUploadDocument(loanId)

  const loan = detail.data
  const groupLoans = useQuery({
    queryKey: queryKeys.loans.list({ group: loan?.applicationGroupNo ?? "" }),
    queryFn: ({ signal }) =>
      loansApi.list(
        { page: 1, pageSize: 10, group: loan!.applicationGroupNo },
        signal
      ),
    enabled: Boolean(loan?.applicationGroupNo),
    staleTime: 15_000,
  })

  if (detail.isPending) {
    return (
      <div className="p-6">
        <DetailSkeleton />
      </div>
    )
  }
  if (detail.isError || !loan) {
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

  const isCreator = loan.createdById === user?.userId
  // Corrections are permission-gated (legacy behavior): any officer with
  // loans.revise may correct a returned application — branches cover for
  // absent encoders. Cancellation remains creator-only.
  const canCorrect =
    (loan.status === "ForRevision" ||
      loan.status === "ForIncompleteDocuments") &&
    hasPermission(PERMISSIONS.loansRevise)
  const canCancel =
    isLoanStatus(loan.status) &&
    CANCELLABLE_STATUSES.includes(loan.status) &&
    (isCreator || user?.role === "Admin")
  const canRecommend =
    loan.status === "ForRecommendation" &&
    hasPermission(PERMISSIONS.loansRecommend)
  const canEvaluate =
    loan.status === "ForChecking" && hasPermission(PERMISSIONS.loansEvaluate)
  const canApprove =
    loan.status === "ForApproval" && hasPermission(PERMISSIONS.loansApprove)
  const canUploadDocs =
    hasPermission(PERMISSIONS.loansRevise) &&
    (loan.status === "ForRevision" ||
      loan.status === "ForIncompleteDocuments" ||
      loan.status === "Draft")

  return (
    <div className="space-y-4 p-6">
      {/* Header: identity, status and the actions this user may take. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-lg font-semibold tracking-tight">
              {loan.lamId}
            </h1>
            <StatusBadge status={loan.status} />
            {loan.evaluationVerdict === "NotRecommended" ? (
              <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                Evaluation: NOT recommended
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {loan.client.firstName} {loan.client.lastName} ·{" "}
            {formatCurrency(loan.proposedAmount)} · {loan.productCode} · branch{" "}
            {loan.branchCode} · group{" "}
            <Link
              to={`/monitoring?search=${encodeURIComponent(loan.applicationGroupNo)}`}
              className="font-mono underline-offset-2 hover:underline"
            >
              {loan.applicationGroupNo}
            </Link>
          </p>
          <p className="text-xs text-muted-foreground">
            Encoded by {loan.createdByName} on{" "}
            {formatDateTime(loan.applicationDate)} · last action{" "}
            {formatRelative(loan.lastActionDate)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCorrect ? (
            <Button asChild size="sm" className="gap-1.5">
              <Link to={`/loans/${loan.id}/revise`}>
                <SendIcon aria-hidden className="size-3.5" />
                Correct & resubmit
              </Link>
            </Button>
          ) : null}
          {canRecommend ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setRecommendOpen(true)}
            >
              <ThumbsUpIcon aria-hidden className="size-3.5" />
              Recommend
            </Button>
          ) : null}
          {canEvaluate ? (
            <Button asChild size="sm" className="gap-1.5">
              <Link to={`/loans/${loan.id}/evaluate`}>
                <InboxIcon aria-hidden className="size-3.5" />
                Open evaluation
              </Link>
            </Button>
          ) : null}
          {canApprove ? (
            <Button asChild size="sm" className="gap-1.5">
              <Link to={`/loans/${loan.id}/approve`}>
                <InboxIcon aria-hidden className="size-3.5" />
                Open approval review
              </Link>
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              <BanIcon aria-hidden className="size-3.5" />
              Cancel application
            </Button>
          ) : null}
        </div>
      </div>

      {loan.status === "ForRevision" ||
      loan.status === "ForIncompleteDocuments" ? (
        <CorrectionBanner loanId={loan.id} />
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ClientPanel loan={loan} />
          <LoanTermsPanel loan={loan} />
          <ObligationsPanel loan={loan} />
          <DeviationsPanel loan={loan} />
        </div>
        <div className="space-y-4">
          <RoutingPanel loan={loan} />
          <DocumentsPanel loan={loan} />
          {canUploadDocs ? (
            <DocumentUploadCard
              loanId={loan.id}
              canUpload={canUploadDocs}
              uploading={upload.isPending}
            />
          ) : null}
          <SignaturesPanel loan={loan} />
          <DisbursementPanel loan={loan} />
          {groupLoans.data && groupLoans.data.items.length > 1 ? (
            <SectionCard
              title={`Applications in group ${loan.applicationGroupNo}`}
            >
              <ul className="divide-y divide-border">
                {groupLoans.data.items.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 py-1.5 text-sm"
                  >
                    <Link
                      to={`/loans/${row.id}`}
                      className="font-mono text-xs underline-offset-2 hover:underline"
                    >
                      {row.lamId}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {row.productCode} · {formatCurrency(row.proposedAmount)}
                    </span>
                    <StatusBadge status={row.status} withDot={false} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      </div>

      <SectionCard title="Activity history">
        <HistoryTimeline history={loan.history} />
      </SectionCard>

      <DecisionDialog
        open={recommendOpen}
        onOpenChange={setRecommendOpen}
        title="Recommend for evaluation?"
        subject={`${loan.lamId} · ${loan.client.firstName} ${loan.client.lastName} · ${formatCurrency(loan.proposedAmount)}`}
        consequence="Goes to the Evaluator for credit checking. Your recommendation is signed and stored in the history."
        confirmLabel="Recommend"
        remarksLabel="Remarks"
        pending={recommend.isPending}
        error={recommend.error}
        onConfirm={(remarks) => {
          recommend.mutate(
            { remarks: remarks || undefined, rowVersion: loan.rowVersion },
            {
              onSuccess: () => {
                setRecommendOpen(false)
                toast.success(`${loan.lamId} recommended for evaluation.`)
              },
            }
          )
        }}
      />

      <DecisionDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this application?"
        subject={`${loan.lamId} · ${loan.client.firstName} ${loan.client.lastName}`}
        consequence="This ends the application. It cannot be reopened — the client must reapply."
        confirmLabel="Cancel application"
        remarksLabel="Cancellation reason"
        remarksRequired
        destructive
        pending={cancel.isPending}
        error={cancel.error}
        onConfirm={(reason) => {
          cancel.mutate(reason, {
            onSuccess: () => {
              setCancelOpen(false)
              toast.success(`${loan.lamId} cancelled.`)
            },
          })
        }}
      />

      {upload.isPending ? (
        <span className="sr-only" role="status">
          Uploading document…
        </span>
      ) : null}
      {upload.isError ? (
        <span className="sr-only" role="alert">
          {getErrorMessage(upload.error)}
        </span>
      ) : null}
    </div>
  )
}

function CorrectionBanner({ loanId }: { loanId: string }) {
  return (
    <div className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-200">
      This application was returned and is waiting for correction.{" "}
      <Link
        to={`/loans/${loanId}/revise`}
        className="font-medium underline underline-offset-2"
      >
        Open the correction checklist
      </Link>{" "}
      to see the reviewer's feedback, fix the affected sections and resubmit.
    </div>
  )
}

function DocumentUploadCard({
  loanId,
  canUpload,
  uploading,
}: {
  loanId: string
  canUpload: boolean
  uploading: boolean
}) {
  const detail = useLoanDetail(loanId)
  const upload = useUploadDocument(loanId)
  const loan = detail.data
  if (!loan || !canUpload) return null
  const missing = loan.documents.filter((doc) => doc.status === "Missing")
  if (missing.length === 0) return null

  return (
    <Card>
      <CardHeader className="border-b py-3">
        <CardTitle className="text-sm font-medium">
          Upload missing documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-4">
        {missing.map((doc) => (
          <label
            key={doc.code}
            className="flex cursor-pointer items-center justify-between gap-2 border border-dashed px-3 py-2 text-sm hover:bg-muted/50"
          >
            <span className="min-w-0">
              <span className="block truncate text-xs">{doc.name}</span>
              <span className="block font-mono text-[10px] text-muted-foreground">
                {doc.code} · PNG/JPEG/PDF, max 5 MB
              </span>
            </span>
            <span className="flex flex-none items-center gap-1.5 text-xs text-muted-foreground">
              {upload.isPending && upload.variables?.code === doc.code ? (
                "Uploading…"
              ) : (
                <UploadIcon aria-hidden className="size-3.5" />
              )}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (!file) return
                if (
                  !["image/png", "image/jpeg", "application/pdf"].includes(
                    file.type
                  )
                ) {
                  toast.error("Upload a PNG, JPEG or PDF file.")
                  return
                }
                if (file.size > 5 * 1024 * 1024) {
                  toast.error("Documents must be 5 MB or smaller.")
                  return
                }
                upload.mutate(
                  { code: doc.code, file },
                  { onSuccess: () => toast.success(`${doc.name} uploaded.`) }
                )
              }}
            />
          </label>
        ))}
        <p className="flex items-center gap-1 pt-1 text-[11px] text-muted-foreground">
          <PaperclipIcon aria-hidden className="size-3" />
          Once every requirement is uploaded, resubmit the application.
        </p>
      </CardContent>
    </Card>
  )
}

export default LoanDetailPage
