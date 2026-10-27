import { Link } from "react-router-dom"
import { ArrowRightIcon, FilePlus2Icon, InboxIcon } from "lucide-react"

import { useSession } from "@/features/auth/session-context"
import { PERMISSIONS } from "@/features/auth/types"
import { useDashboardOverview } from "@/features/dashboard/api/dashboard"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorState, TableSkeleton } from "@/components/shared/state-views"
import { StatusBadge } from "@/components/shared/status-badge"

/**
 * Role-specific dashboard. Every figure comes from the API (computed from real
 * records) — no invented statistics. KPIs are one hairline-divided strip, not
 * icon tiles; the screen's one question ("what needs me right now?") leads.
 */
export function DashboardPage() {
  const { user, hasPermission } = useSession()
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    dataUpdatedAt,
    isFetching,
  } = useDashboardOverview(user?.role)

  if (isPending) {
    return (
      <div className="p-6">
        <TableSkeleton rows={4} />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="p-6">
        <ErrorState
          error={error}
          onRetry={() => void refetch()}
          title="Couldn't load your dashboard"
        />
      </div>
    )
  }

  const attentionCount = data.needsAttention.length
  const finding =
    attentionCount > 0
      ? `${attentionCount} ${attentionCount === 1 ? "application needs" : "applications need"} attention right now.`
      : "Nothing needs your attention right now."

  const canCreate = hasPermission(PERMISSIONS.loansCreate)
  const hasDesk = data.deskLabel != null

  return (
    <div className="space-y-5 p-6">
      <PageHeader
        title={data.deskLabel ?? "Dashboard"}
        description={
          <span>
            {finding}{" "}
            <span className="text-xs">
              · updated {formatRelative(new Date(dataUpdatedAt).toISOString())}
              {isFetching ? " · refreshing…" : ""}
            </span>
          </span>
        }
        actions={
          <>
            {canCreate ? (
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/loans/new">
                  <FilePlus2Icon aria-hidden className="size-3.5" />
                  New application
                </Link>
              </Button>
            ) : null}
            {hasDesk ? (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/review-desk">
                  <InboxIcon aria-hidden className="size-3.5" />
                  Open review desk
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {/* KPI strip: one container divided by hairlines (design standard). */}
      <div
        className={cn(
          "grid divide-border border border-border bg-card sm:grid-cols-2 sm:divide-x",
          data.counts.length > 2 && "lg:grid-cols-4"
        )}
        role="group"
        aria-label="Operational counts"
      >
        {data.counts.map((count) => (
          <div
            key={count.key}
            className="border-b border-border p-4 last:border-b-0 sm:border-b-0"
          >
            <p className="text-xs text-muted-foreground">{count.label}</p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                count.tone === "attention" &&
                  count.value > 0 &&
                  "text-amber-700 dark:text-amber-400",
                count.tone === "positive" &&
                  count.value > 0 &&
                  "text-emerald-700 dark:text-emerald-400"
              )}
            >
              {count.value}
            </p>
            {count.link && count.value > 0 ? (
              <Link
                to={count.link}
                className="mt-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                View
                <ArrowRightIcon aria-hidden className="size-3" />
              </Link>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm font-medium">
              Needs attention
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.needsAttention.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No corrections or overdue disbursements are waiting.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.needsAttention.map((item) => (
                  <li key={`${item.kind}-${item.loanId}`}>
                    <Link
                      to={
                        item.kind === "correction"
                          ? `/loans/${item.loanId}`
                          : `/monitoring/disbursement`
                      }
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {item.clientName}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.lamId} · {item.detail}
                        </span>
                      </span>
                      <span className="flex flex-none items-center gap-2">
                        <StatusBadge
                          status={
                            item.kind === "overdue" ? "Expired" : "ForRevision"
                          }
                          withDot={false}
                        />
                        <span className="text-xs text-muted-foreground">
                          {formatRelative(item.since)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm font-medium">
              Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentActivity.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No recent activity recorded.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentActivity.map((activity) => (
                  <li
                    key={activity.id}
                    className="flex items-baseline justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">{activity.action}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {activity.lamId} ({activity.clientName})
                      </span>
                    </span>
                    <span
                      className="flex-none text-xs text-muted-foreground"
                      title={activity.byName}
                    >
                      {formatRelative(activity.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default DashboardPage
