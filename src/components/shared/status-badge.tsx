import { cn } from "@/lib/utils"
import type { StatusTone } from "@/features/loans/types/loan-status"
import {
  LOAN_STATUS_META,
  isLoanStatus,
  type LoanStatus,
} from "@/features/loans/types/loan-status"

const TONE_CLASSES: Record<StatusTone, string> = {
  // Pale tint + dark ink of the same hue (design standard for status pills).
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
  positive:
    "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  warning:
    "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  negative:
    "border-red-300 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
}

const TONE_DOT: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/60",
  info: "bg-blue-500",
  positive: "bg-emerald-600",
  warning: "bg-amber-500",
  negative: "bg-red-600",
}

export type StatusToneKey = StatusTone

/**
 * Status pill: pale tint, dark ink, plus a dot so state is never conveyed by
 * colour alone (WCAG 1.4.1). The label text is always the primary indicator.
 */
export function StatusBadge({
  status,
  className,
  withDot = true,
}: {
  status: LoanStatus | string
  className?: string
  withDot?: boolean
}) {
  const meta = isLoanStatus(status) ? LOAN_STATUS_META[status] : null
  const label = meta?.label ?? status
  const tone: StatusTone = meta?.tone ?? "neutral"
  return (
    <span
      title={meta?.hint}
      className={cn(
        "inline-flex flex-none items-center gap-1.5 border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className
      )}
    >
      {withDot && (
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", TONE_DOT[tone])}
        />
      )}
      {label}
    </span>
  )
}

/** Generic tone badge for non-loan statuses (branches, documents, sessions). */
export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1.5 border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
