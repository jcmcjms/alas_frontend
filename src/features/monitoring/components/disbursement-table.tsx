import { Link } from "react-router-dom"
import { ArrowRightIcon } from "lucide-react"

import type { LoanListRow } from "@/features/loans/types/loan-contracts"
import {
  DISBURSEMENT_AT_RISK_DAYS,
  DISBURSEMENT_TIMEOUT_DAYS,
} from "@/features/loans/types/loan-status"
import { formatCurrency, formatDate, formatDeadline } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/shared/status-badge"

export interface BoardRow {
  loan: LoanListRow
  /** Whole days left until the disbursement deadline; negative = overdue. */
  daysLeft: number | null
}

/**
 * The disbursement board table. Deadline state drives the visual urgency:
 * overdue (red), at risk within the warning window (amber), healthy (quiet).
 */
export function DisbursementBoardTable({
  rows,
  canAct,
  releasedView = false,
  voidedView = false,
}: {
  rows: BoardRow[]
  canAct: boolean
  releasedView?: boolean
  voidedView?: boolean
}) {
  // Overdue first, then closest to the deadline.
  const sorted = [...rows].sort((a, b) => {
    const av = a.daysLeft ?? Number.MAX_SAFE_INTEGER
    const bv = b.daysLeft ?? Number.MAX_SAFE_INTEGER
    return av - bv || a.loan.lamId.localeCompare(b.loan.lamId)
  })

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs font-normal">LAM ID</TableHead>
            <TableHead className="text-xs font-normal">Client</TableHead>
            <TableHead className="text-xs font-normal">Branch</TableHead>
            <TableHead className="text-right text-xs font-normal">
              Amount
            </TableHead>
            <TableHead className="text-xs font-normal">Status</TableHead>
            {releasedView || voidedView ? (
              <TableHead className="text-xs font-normal">
                {releasedView ? "Released / synced" : "Voided"}
              </TableHead>
            ) : (
              <>
                <TableHead className="text-xs font-normal">
                  Deadline ({DISBURSEMENT_TIMEOUT_DAYS} d)
                </TableHead>
                <TableHead className="text-right text-xs font-normal">
                  Time left
                </TableHead>
              </>
            )}
            <TableHead className="w-24 text-xs font-normal">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(({ loan, daysLeft }) => {
            const overdue = daysLeft != null && daysLeft < 0
            const atRisk =
              daysLeft != null &&
              daysLeft >= 0 &&
              daysLeft <= DISBURSEMENT_AT_RISK_DAYS
            return (
              <TableRow
                key={loan.id}
                className={cn(overdue && "bg-red-50/60 dark:bg-red-500/5")}
              >
                <TableCell className="px-3 py-2">
                  <Link
                    to={`/loans/${loan.id}`}
                    className="font-mono text-xs underline-offset-2 hover:underline"
                  >
                    {loan.lamId}
                  </Link>
                </TableCell>
                <TableCell className="max-w-44 truncate px-3 py-2 text-sm">
                  {loan.clientName}
                </TableCell>
                <TableCell className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {loan.branchCode}
                </TableCell>
                <TableCell className="px-3 py-2 text-right text-sm tabular-nums">
                  {formatCurrency(loan.proposedAmount)}
                </TableCell>
                <TableCell className="px-3 py-2">
                  <StatusBadge status={loan.status} withDot={false} />
                </TableCell>
                {releasedView || voidedView ? (
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                    {formatDate(loan.lastActionDate)}
                    {voidedView ? (
                      <span
                        className="block max-w-56 truncate text-[10px]"
                        title="Void reason recorded on the application"
                      >
                        window lapsed · see application
                      </span>
                    ) : null}
                  </TableCell>
                ) : (
                  <>
                    <TableCell className="px-3 py-2 text-xs tabular-nums">
                      {formatDate(loan.disbursementDeadlineUtc)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "px-3 py-2 text-right text-xs font-medium tabular-nums",
                        overdue && "text-red-700 dark:text-red-400",
                        atRisk && "text-amber-700 dark:text-amber-400",
                        !overdue && !atRisk && "text-muted-foreground"
                      )}
                    >
                      {overdue ? (
                        <span className="inline-flex items-center gap-1">
                          <span aria-hidden>▲</span>
                          {formatDeadline(loan.disbursementDeadlineUtc)}
                        </span>
                      ) : (
                        formatDeadline(loan.disbursementDeadlineUtc)
                      )}
                    </TableCell>
                  </>
                )}
                <TableCell className="px-3 py-2 text-right">
                  {canAct &&
                  (overdue ||
                    loan.status === "Approved" ||
                    loan.status === "ForDisbursement" ||
                    loan.status === "Disbursed") ? (
                    <Button
                      asChild
                      size="xs"
                      variant="outline"
                      className="gap-1"
                    >
                      <Link to={`/loans/${loan.id}/approve`}>
                        Process
                        <ArrowRightIcon aria-hidden className="size-3" />
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild size="xs" variant="ghost">
                      <Link to={`/loans/${loan.id}`}>View</Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
