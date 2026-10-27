import { formatDateTime, formatRelative } from "@/lib/format"
import type { LoanHistoryEntry } from "@/features/loans/types/loan-contracts"
import { cn } from "@/lib/utils"

const ACTION_TONE: Record<string, string> = {
  Approve: "bg-emerald-600",
  Disburse: "bg-emerald-600",
  CoreSync: "bg-emerald-600",
  Reject: "bg-red-600",
  Expire: "bg-red-600",
  PushBack: "bg-amber-500",
  FlagDocuments: "bg-amber-500",
  Cancel: "bg-muted-foreground",
}

/**
 * Workflow history timeline. Newest first; every entry keeps actor, role,
 * transition and comments — previous decisions are never erased (spec §6).
 */
export function HistoryTimeline({
  history,
  className,
}: {
  history: LoanHistoryEntry[]
  className?: string
}) {
  if (history.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        No recorded activity yet.
      </p>
    )
  }
  const entries = [...history].sort((a, b) =>
    b.actionDate.localeCompare(a.actionDate)
  )
  return (
    <ol className={cn("space-y-0", className)} aria-label="Application history">
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          className="relative grid grid-cols-[auto_1fr] gap-x-3 pb-4 last:pb-0"
        >
          <div className="flex flex-col items-center">
            <span
              aria-hidden
              className={cn(
                "mt-1 size-2.5 flex-none rounded-full",
                ACTION_TONE[entry.action] ?? "bg-primary"
              )}
            />
            {index < entries.length - 1 ? (
              <span aria-hidden className="mt-1 w-px flex-1 bg-border" />
            ) : null}
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm">
              <span className="font-medium">{describeAction(entry)}</span>
              <span className="text-muted-foreground">
                {" "}
                · {entry.actionByUserName}
              </span>
              <span className="text-xs text-muted-foreground">
                {" "}
                ({entry.actionByRole})
              </span>
            </p>
            <p
              className="text-xs text-muted-foreground"
              title={formatDateTime(entry.actionDate)}
            >
              {formatRelative(entry.actionDate)} —{" "}
              {formatDateTime(entry.actionDate)}
            </p>
            {entry.comments ? (
              <p className="mt-1 border-l-2 border-border pl-2 text-xs whitespace-pre-wrap text-muted-foreground">
                {entry.comments}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

function describeAction(entry: LoanHistoryEntry): string {
  if (
    entry.fromStatus &&
    entry.toStatus &&
    entry.fromStatus !== entry.toStatus
  ) {
    return `${entry.action}: ${entry.fromStatus} → ${entry.toStatus}`
  }
  return entry.action
}
