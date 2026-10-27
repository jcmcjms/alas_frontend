import { BanknoteIcon, CircleSlashIcon } from "lucide-react"

import { useSession } from "@/features/auth/session-context"
import { PERMISSIONS } from "@/features/auth/types"
import { useLoanList } from "@/features/loans/api/loans.queries"
import {
  DISBURSEMENT_AT_RISK_DAYS,
  DISBURSEMENT_TIMEOUT_DAYS,
} from "@/features/loans/types/loan-status"
import { daysUntil } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/shared/page-header"
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
} from "@/components/shared/state-views"
import {
  DisbursementBoardTable,
  type BoardRow,
} from "../components/disbursement-table"

const AWAITING = "Approved,ForDisbursement"
const RELEASED = "Disbursed,OnGoing"

/**
 * Disbursement monitoring (spec §5.6/§5.7). Deadlines, overdue state and the
 * void flag all come from the backend's disbursement block; this screen only
 * presents them and links to the actions.
 */
export function DisbursementPage() {
  const { hasPermission } = useSession()
  const awaiting = useLoanList({ page: 1, pageSize: 100, status: AWAITING })
  const released = useLoanList({ page: 1, pageSize: 100, status: RELEASED })
  const voided = useLoanList({ page: 1, pageSize: 100, status: "Expired" })

  const canAct = hasPermission(PERMISSIONS.loansDisburse)

  const awaitingRows: BoardRow[] = (awaiting.data?.items ?? []).map((loan) => ({
    loan,
    daysLeft: daysUntil(loan.disbursementDeadlineUtc),
  }))
  const overdueCount = awaitingRows.filter(
    (row) => row.daysLeft != null && row.daysLeft < 0
  ).length
  const atRiskCount = awaitingRows.filter(
    (row) =>
      row.daysLeft != null &&
      row.daysLeft >= 0 &&
      row.daysLeft <= DISBURSEMENT_AT_RISK_DAYS
  ).length

  const finding =
    overdueCount > 0
      ? `${overdueCount} application${overdueCount === 1 ? "" : "s"} passed the ${DISBURSEMENT_TIMEOUT_DAYS}-day window and ${overdueCount === 1 ? "is" : "are"} void-eligible.`
      : atRiskCount > 0
        ? `${atRiskCount} application${atRiskCount === 1 ? "" : "s"} reach the ${DISBURSEMENT_TIMEOUT_DAYS}-day deadline within ${DISBURSEMENT_AT_RISK_DAYS} days.`
        : `All pending releases are inside the ${DISBURSEMENT_TIMEOUT_DAYS}-day window.`

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Disbursement monitoring"
        description={
          <span
            className={cn(
              overdueCount > 0 && "font-medium text-red-700 dark:text-red-400"
            )}
          >
            {finding}
            {awaiting.isFetching ? (
              <span className="text-xs"> · refreshing…</span>
            ) : null}
          </span>
        }
      />

      <Tabs defaultValue="awaiting">
        <TabsList>
          <TabsTrigger value="awaiting">
            Awaiting release
            <span className="ml-1.5 text-muted-foreground tabular-nums">
              {awaiting.data?.totalCount ?? "…"}
            </span>
          </TabsTrigger>
          <TabsTrigger value="released">
            Released
            <span className="ml-1.5 text-muted-foreground tabular-nums">
              {released.data?.totalCount ?? "…"}
            </span>
          </TabsTrigger>
          <TabsTrigger value="voided">
            Voided
            <span className="ml-1.5 text-muted-foreground tabular-nums">
              {voided.data?.totalCount ?? "…"}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="awaiting" className="mt-3">
          <BoardSection
            query={awaiting}
            rows={awaitingRows}
            canAct={canAct}
            emptyTitle="Nothing awaiting release"
            emptyDescription="Approved applications appear here with their 30-day disbursement deadline."
            emptyIcon={<BanknoteIcon />}
          />
        </TabsContent>

        <TabsContent value="released" className="mt-3">
          <BoardSection
            query={released}
            rows={(released.data?.items ?? []).map((loan) => ({
              loan,
              daysLeft: null,
            }))}
            canAct={canAct}
            emptyTitle="No releases recorded"
            emptyDescription="Disbursed and On Going applications will be listed here."
            emptyIcon={<BanknoteIcon />}
            releasedView
          />
        </TabsContent>

        <TabsContent value="voided" className="mt-3">
          <BoardSection
            query={voided}
            rows={(voided.data?.items ?? []).map((loan) => ({
              loan,
              daysLeft: null,
            }))}
            canAct={canAct}
            emptyTitle="No voided applications"
            emptyDescription={`Applications not released within ${DISBURSEMENT_TIMEOUT_DAYS} days of approval are voided and archived here with the reason.`}
            emptyIcon={<CircleSlashIcon />}
            voidedView
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default DisbursementPage

function BoardSection({
  query,
  rows,
  canAct,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  releasedView = false,
  voidedView = false,
}: {
  query: {
    isPending: boolean
    isError: boolean
    error: unknown
    refetch: () => void
  }
  rows: BoardRow[]
  canAct: boolean
  emptyTitle: string
  emptyDescription: string
  emptyIcon: React.ReactNode
  releasedView?: boolean
  voidedView?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-0">
        {query.isPending ? (
          <TableSkeleton rows={5} className="p-0" />
        ) : query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={() => query.refetch()}
            title="Couldn't load the board"
          />
        ) : rows.length === 0 ? (
          <EmptyState
            className="border-0"
            title={emptyTitle}
            description={emptyDescription}
            icon={emptyIcon}
          />
        ) : (
          <DisbursementBoardTable
            rows={rows}
            canAct={canAct}
            releasedView={releasedView}
            voidedView={voidedView}
          />
        )}
      </CardContent>
    </Card>
  )
}
