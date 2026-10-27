import { useMemo } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRightIcon,
  InboxIcon,
  RotateCcwIcon,
  UserRoundIcon,
} from "lucide-react"

import { useSession } from "@/features/auth/session-context"
import {
  useClaimByLoan,
  useClaimNext,
  useDeskQueue,
  useReleaseClaim,
} from "@/features/loans/api/loans.queries"
import { LOAN_STATUS_META } from "@/features/loans/types/loan-status"
import { useNow } from "@/hooks/use-now"
import type { DeskGroupDto } from "@/features/loans/types/loan-contracts"
import { formatCurrency, formatElapsed } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/shared/page-header"
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
} from "@/components/shared/state-views"
import { StatusBadge } from "@/components/shared/status-badge"

/**
 * Review desk: the role's queue of client bundles. The desk serves clients —
 * claiming takes every application in the bundle together (legacy behavior,
 * spec §7). Ownership comes from the backend; the queue polls and refreshes on
 * every claim/release so ownership is never stale.
 */
export function ReviewDeskPage() {
  const { user } = useSession()
  const now = useNow(30_000)
  const desk = useDeskQueue(user?.userId)
  const claimNext = useClaimNext()
  const claimByLoan = useClaimByLoan()
  const release = useReleaseClaim()

  const slaHours = desk.data
    ? (LOAN_STATUS_META[desk.data.queueStatus]?.defaultSlaHours ?? null)
    : null

  const waiting = useMemo(
    () => (desk.data?.items ?? []).filter((item) => item.ownerUserId == null),
    [desk.data]
  )
  const claims = desk.data?.currentClaims ?? []

  function actionRoute(loanId: string): string {
    if (user?.role === "Evaluator") return `/loans/${loanId}/evaluate`
    if (user?.role === "Approver") return `/loans/${loanId}/approve`
    return `/loans/${loanId}`
  }

  return (
    <div className="space-y-5 p-6">
      <PageHeader
        title={desk.data?.deskLabel ?? "Review desk"}
        description={
          desk.data ? (
            <span>
              {desk.data.scopeDescription}
              {desk.isFetching && !desk.isPending ? (
                <span className="ml-1 text-xs"> · refreshing…</span>
              ) : null}
            </span>
          ) : undefined
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void desk.refetch()}
              disabled={desk.isFetching}
              className="gap-1.5"
            >
              <RotateCcwIcon
                aria-hidden
                className={cn("size-3.5", desk.isFetching && "animate-spin")}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={
                desk.isPending || claimNext.isPending || waiting.length === 0
              }
              onClick={() => claimNext.mutate()}
            >
              {claimNext.isPending ? (
                <Spinner className="size-3.5" />
              ) : (
                <InboxIcon aria-hidden className="size-3.5" />
              )}
              Serve next client
            </Button>
          </>
        }
      />

      {desk.isPending ? <TableSkeleton rows={5} /> : null}

      {desk.isError ? (
        <ErrorState
          error={desk.error}
          onRetry={() => void desk.refetch()}
          title="Couldn't load your desk"
        />
      ) : null}

      {desk.data ? (
        <>
          {claims.length > 0 ? (
            <section aria-label="Your current claims" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">
                  Now serving{" "}
                  <span className="text-muted-foreground">
                    ({claims.length} bundle{claims.length === 1 ? "" : "s"})
                  </span>
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={release.isPending}
                  onClick={() => release.mutate(undefined)}
                >
                  <RotateCcwIcon aria-hidden className="size-3.5" />
                  {release.isPending ? "Releasing…" : "Release all claims"}
                </Button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {claims.map((bundle) => (
                  <ClaimCard
                    key={bundle.groupNo}
                    bundle={bundle}
                    now={now}
                    actionRoute={actionRoute}
                    releasing={
                      release.isPending && release.variables === bundle.groupNo
                    }
                    onRelease={() => release.mutate(bundle.groupNo)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section aria-label="Waiting queue">
            <h2 className="mb-2 text-sm font-medium">
              Waiting{" "}
              <span className="text-muted-foreground tabular-nums">
                ({waiting.length} client bundle{waiting.length === 1 ? "" : "s"}
                )
              </span>
            </h2>
            {waiting.length === 0 ? (
              <EmptyState
                title="Your queue is clear"
                description={
                  claims.length > 0
                    ? "Finish the clients you are serving, or release them back to the queue."
                    : "No clients are waiting at this desk right now. New submissions appear here automatically."
                }
                icon={<UserRoundIcon />}
              />
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10 text-xs font-normal">
                          #
                        </TableHead>
                        <TableHead className="text-xs font-normal">
                          Client
                        </TableHead>
                        <TableHead className="text-xs font-normal">
                          Bundle
                        </TableHead>
                        <TableHead className="text-right text-xs font-normal">
                          Applications
                        </TableHead>
                        <TableHead className="text-right text-xs font-normal">
                          Total amount
                        </TableHead>
                        <TableHead className="text-right text-xs font-normal">
                          Waiting
                        </TableHead>
                        <TableHead className="w-24 text-xs font-normal">
                          <span className="sr-only">Claim</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {waiting.map((bundle) => {
                        const total = bundle.applications.reduce(
                          (sum, loan) => sum + loan.proposedAmount,
                          0
                        )
                        const waitedMs =
                          now - new Date(bundle.enqueuedAt).getTime()
                        const overSla =
                          slaHours != null && waitedMs > slaHours * 3_600_000
                        return (
                          <TableRow key={bundle.groupNo}>
                            <TableCell className="px-3 py-2 text-sm text-muted-foreground tabular-nums">
                              {bundle.position}
                            </TableCell>
                            <TableCell className="px-3 py-2">
                              <span className="block text-sm font-medium">
                                {bundle.clientName}
                              </span>
                              <span className="block font-mono text-xs text-muted-foreground">
                                CIS {bundle.cisNo} ·{" "}
                                {bundle.applications[0]?.branchCode}
                              </span>
                            </TableCell>
                            <TableCell className="px-3 py-2 font-mono text-xs text-muted-foreground">
                              {bundle.groupNo}
                            </TableCell>
                            <TableCell className="px-3 py-2 text-right text-sm tabular-nums">
                              {bundle.applications.length}
                            </TableCell>
                            <TableCell className="px-3 py-2 text-right text-sm tabular-nums">
                              {formatCurrency(total)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "px-3 py-2 text-right text-sm tabular-nums",
                                overSla &&
                                  "font-medium text-amber-700 dark:text-amber-400"
                              )}
                            >
                              {formatElapsed(waitedMs)}
                              {overSla && slaHours != null ? (
                                <span className="block text-[11px] whitespace-nowrap">
                                  past {slaHours} h target
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="px-3 py-2 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  claimByLoan.isPending || claimNext.isPending
                                }
                                onClick={() =>
                                  claimByLoan.mutate(
                                    bundle.applications[0].loanId
                                  )
                                }
                                aria-label={`Claim bundle ${bundle.groupNo} for ${bundle.clientName}`}
                              >
                                {claimByLoan.isPending &&
                                claimByLoan.variables ===
                                  bundle.applications[0].loanId
                                  ? "Claiming…"
                                  : "Claim"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            {claimNext.isPending || claimByLoan.isPending ? (
              <p className="mt-2 text-xs text-muted-foreground" role="status">
                Claiming the client bundle…
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  )
}

function ClaimCard({
  bundle,
  now,
  actionRoute,
  releasing,
  onRelease,
}: {
  bundle: DeskGroupDto
  now: number
  actionRoute: (loanId: string) => string
  releasing: boolean
  onRelease: () => void
}) {
  const total = bundle.applications.reduce(
    (sum, loan) => sum + loan.proposedAmount,
    0
  )
  return (
    <Card className="border-primary/40">
      <CardHeader className="border-b py-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate">
            {bundle.clientName}{" "}
            <span className="font-mono text-xs font-normal text-muted-foreground">
              {bundle.groupNo}
            </span>
          </span>
          <Button
            variant="outline"
            size="xs"
            className="flex-none gap-1"
            onClick={onRelease}
            disabled={releasing}
          >
            <RotateCcwIcon aria-hidden className="size-3" />
            {releasing ? "Releasing…" : "Release"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {bundle.applications.map((loan) => (
            <li
              key={loan.loanId}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="min-w-0">
                <span className="block font-mono text-xs text-muted-foreground">
                  {loan.lamId}
                </span>
                <span className="block truncate text-sm">
                  {loan.productCode} · {formatCurrency(loan.proposedAmount)} ·{" "}
                  {loan.termDays} d
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={loan.status} withDot={false} />
                  {loan.hasDeviations ? (
                    <span className="border border-amber-300 bg-amber-50 px-1 py-px text-[10px] font-medium text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                      deviations
                    </span>
                  ) : null}
                  {loan.documentsComplete === false ? (
                    <span className="border border-amber-300 bg-amber-50 px-1 py-px text-[10px] font-medium text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                      docs incomplete
                    </span>
                  ) : null}
                </span>
              </span>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="flex-none gap-1"
              >
                <Link to={actionRoute(loan.loanId)}>
                  Open
                  <ArrowRightIcon aria-hidden className="size-3.5" />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
        <Separator />
        <p className="px-4 py-2 text-xs text-muted-foreground tabular-nums">
          Bundle total {formatCurrency(total)} · claimed{" "}
          {formatElapsed(now - new Date(bundle.enqueuedAt).getTime())} ago
        </p>
      </CardContent>
    </Card>
  )
}

export default ReviewDeskPage
