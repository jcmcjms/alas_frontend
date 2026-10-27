import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { SearchXIcon } from "lucide-react"

import { useSession } from "@/features/auth/session-context"
import { useLoanList } from "@/features/loans/api/loans.queries"
import {
  LOAN_STATUS_META,
  STATUS_FILTER_ORDER,
  isLoanStatus,
} from "@/features/loans/types/loan-status"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useNow } from "@/hooks/use-now"
import { formatCurrency, formatDate, formatElapsed } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  NoSearchResultsState,
  TableSkeleton,
} from "@/components/shared/state-views"
import { StatusBadge } from "@/components/shared/status-badge"

const PAGE_SIZE = 20

/**
 * Monitoring: server-side search, filtering and pagination (the frontend never
 * downloads the whole book of loans). Filters live in the URL so views are
 * linkable and survive refresh.
 */
export function MonitoringPage() {
  const { user } = useSession()
  const now = useNow(60_000)
  const [searchParams, setSearchParams] = useSearchParams()

  const status = searchParams.get("status") ?? ""
  const search = searchParams.get("search") ?? ""
  const flagged = searchParams.get("flagged") === "true"
  const mine = searchParams.get("mine") === "true"
  const dateFrom = searchParams.get("dateFrom") ?? ""
  const dateTo = searchParams.get("dateTo") ?? ""
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"))

  const [searchInput, setSearchInput] = useState(search)
  const debouncedSearch = useDebouncedValue(searchInput, 350)

  // The URL is the source of truth: when it changes externally (browser
  // back/forward, deep links), re-sync the input. Render-time state
  // adjustment — no effect, no cascading renders.
  const [lastUrlSearch, setLastUrlSearch] = useState(search)
  if (lastUrlSearch !== search) {
    setLastUrlSearch(search)
    if (search !== searchInput) setSearchInput(search)
  }

  // Commit debounced search to the URL (and reset the page) when it settles.
  useEffect(() => {
    if (debouncedSearch === search) return
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (debouncedSearch) next.set("search", debouncedSearch)
        else next.delete("search")
        next.delete("page")
        return next
      },
      { replace: true }
    )
  }, [debouncedSearch, search, setSearchParams])

  const list = useLoanList({
    page,
    pageSize: PAGE_SIZE,
    status: status || undefined,
    search: search || undefined,
    flagged: flagged || undefined,
    mine: mine || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  function setParam(name: string, value: string | null) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value == null || value === "") next.delete(name)
        else next.set(name, value)
        if (name !== "page") next.delete("page")
        return next
      },
      { replace: true }
    )
  }

  const hasFilters = Boolean(
    status || search || flagged || mine || dateFrom || dateTo
  )
  const clearFilters = () => setSearchParams({}, { replace: true })

  const data = list.data
  const from = data && data.totalCount > 0 ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = data ? Math.min(page * PAGE_SIZE, data.totalCount) : 0

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Loan monitoring"
        description={
          data ? (
            <span className="tabular-nums">
              {from}–{to} of {data.totalCount} applications
              {list.isFetching ? " · refreshing…" : ""}
            </span>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="min-w-52 flex-1 space-y-1">
            <Label
              htmlFor="monitoring-search"
              className="text-xs text-muted-foreground"
            >
              Search
            </Label>
            <Input
              id="monitoring-search"
              placeholder="LAM ID, client, group, product…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="w-48 space-y-1">
            <Label
              htmlFor="monitoring-status"
              className="text-xs text-muted-foreground"
            >
              Status
            </Label>
            <Select
              value={status || "all"}
              onValueChange={(value) =>
                setParam("status", value === "all" ? null : value)
              }
            >
              <SelectTrigger id="monitoring-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_FILTER_ORDER.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {LOAN_STATUS_META[entry].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="monitoring-from"
              className="text-xs text-muted-foreground"
            >
              Applied from
            </Label>
            <Input
              id="monitoring-from"
              type="date"
              className="w-38"
              value={dateFrom}
              onChange={(event) =>
                setParam("dateFrom", event.target.value || null)
              }
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="monitoring-to"
              className="text-xs text-muted-foreground"
            >
              to
            </Label>
            <Input
              id="monitoring-to"
              type="date"
              className="w-38"
              value={dateTo}
              onChange={(event) =>
                setParam("dateTo", event.target.value || null)
              }
            />
          </div>
          <div className="flex items-center gap-2 pb-1.5">
            <Checkbox
              id="monitoring-flagged"
              checked={flagged}
              onCheckedChange={(checked) =>
                setParam("flagged", checked === true ? "true" : null)
              }
            />
            <Label htmlFor="monitoring-flagged" className="text-xs font-normal">
              Flagged documents
            </Label>
          </div>
          {user?.role === "Encoder" || user?.permissions.includes("*") ? (
            <div className="flex items-center gap-2 pb-1.5">
              <Checkbox
                id="monitoring-mine"
                checked={mine}
                onCheckedChange={(checked) =>
                  setParam("mine", checked === true ? "true" : null)
                }
              />
              <Label htmlFor="monitoring-mine" className="text-xs font-normal">
                My applications
              </Label>
            </div>
          ) : null}
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className="mb-0.5"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {list.isPending ? (
            <TableSkeleton rows={8} className="p-0" />
          ) : list.isError ? (
            <ErrorState
              error={list.error}
              onRetry={() => void list.refetch()}
              title="Couldn't load applications"
            />
          ) : data && data.items.length === 0 ? (
            hasFilters ? (
              <NoSearchResultsState
                query={search}
                onClear={clearFilters}
                className="border-0"
              />
            ) : (
              <EmptyState
                className="border-0"
                title="No applications yet"
                description="Submitted applications appear here for tracking."
                icon={<SearchXIcon />}
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-normal">
                      LAM ID
                    </TableHead>
                    <TableHead className="text-xs font-normal">
                      Client
                    </TableHead>
                    <TableHead className="text-xs font-normal">
                      Branch
                    </TableHead>
                    <TableHead className="text-xs font-normal">
                      Product
                    </TableHead>
                    <TableHead className="text-right text-xs font-normal">
                      Amount
                    </TableHead>
                    <TableHead className="text-xs font-normal">
                      Applied
                    </TableHead>
                    <TableHead className="text-xs font-normal">
                      Status
                    </TableHead>
                    <TableHead className="text-right text-xs font-normal">
                      In stage
                    </TableHead>
                    <TableHead className="text-xs font-normal">
                      Last action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.items ?? []).map((loan) => {
                    const meta = isLoanStatus(loan.status)
                      ? LOAN_STATUS_META[loan.status]
                      : null
                    const stageMs =
                      now - new Date(loan.lastActionDate).getTime()
                    const overSla =
                      meta?.defaultSlaHours != null &&
                      stageMs > meta.defaultSlaHours * 3_600_000
                    return (
                      <TableRow key={loan.id}>
                        <TableCell className="px-3 py-2">
                          <Link
                            to={`/loans/${loan.id}`}
                            className="font-mono text-xs underline-offset-2 hover:underline"
                          >
                            {loan.lamId}
                          </Link>
                          {loan.flagged ? (
                            <span
                              className="ml-1.5 align-middle text-[10px] font-medium text-amber-700 dark:text-amber-400"
                              title="Document flag on file"
                            >
                              ⚑ flag
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <span className="block max-w-44 truncate text-sm">
                            {loan.clientName}
                          </span>
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {loan.applicationGroupNo}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {loan.branchCode}
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <span className="block text-xs">
                            {loan.productCode}
                          </span>
                          <span className="block max-w-40 truncate text-[10px] text-muted-foreground">
                            {loan.loanType}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-2 text-right text-sm tabular-nums">
                          {formatCurrency(loan.proposedAmount)}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-xs tabular-nums">
                          {formatDate(loan.applicationDate)}
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <StatusBadge status={loan.status} withDot={false} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            "px-3 py-2 text-right text-xs tabular-nums",
                            overSla &&
                              "font-medium text-amber-700 dark:text-amber-400"
                          )}
                          title={
                            meta?.defaultSlaHours != null
                              ? `Target ${meta.defaultSlaHours} h in this stage`
                              : undefined
                          }
                        >
                          {formatElapsed(stageMs)}
                          {overSla ? (
                            <span className="block text-[10px] whitespace-nowrap">
                              past target
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                          {loan.lastActionBy ?? "—"}
                          {loan.assignedTo ? (
                            <span className="block text-[10px]">
                              serving: {loan.assignedTo}
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.totalPages > 1 ? (
        <nav
          className="flex items-center justify-between"
          aria-label="Pagination"
        >
          <p className="text-xs text-muted-foreground tabular-nums">
            Page {data.page} of {data.totalPages} · {data.totalCount} records
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || list.isFetching}
              onClick={() => setParam("page", String(page - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages || list.isFetching}
              onClick={() => setParam("page", String(page + 1))}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  )
}

export default MonitoringPage
