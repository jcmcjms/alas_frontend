/** Shared formatting helpers. Tabular figures are applied via CSS (`tabular-nums`). */

const php = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const phpCompact = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  notation: "compact",
  maximumFractionDigits: 1,
})

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return php.format(value)
}

export function formatCurrencyCompact(
  value: number | null | undefined
): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return phpCompact.format(value)
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-PH").format(value)
}

/** "2026-10-27" — ISO form for comparable columns (design standard for tables). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** "2026-10-27 14:32" for detail screens and history entries. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return `${formatDate(iso)} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`
}

/** "Today", "Yesterday", "6 days ago" — recency wording for feeds. */
export function formatRelative(
  iso: string | null | undefined,
  now: Date = new Date()
): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHours = Math.round(diffMin / 60)
  if (diffHours < 24) return `${diffHours} h ago`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays === 1) return "yesterday"
  if (diffDays < 30) return `${diffDays} days ago`
  return formatDate(iso)
}

/** "2 h 15 m" style elapsed durations. */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—"
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return "<1 m"
  if (minutes < 60) return `${minutes} m`
  const hours = Math.floor(minutes / 60)
  const restMin = minutes % 60
  if (hours < 48) return restMin ? `${hours} h ${restMin} m` : `${hours} h`
  const days = Math.floor(hours / 24)
  return `${days} d ${hours % 24} h`
}

/** Whole days from now until `iso` (negative when past). */
export function daysUntil(
  iso: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000)
}

/** "12 days left" / "3 days overdue" for disbursement deadlines. */
export function formatDeadline(
  iso: string | null | undefined,
  now: Date = new Date()
): string {
  const days = daysUntil(iso, now)
  if (days == null) return "—"
  if (days === 0) return "due today"
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} left`
  return `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`
}

export function formatFullName(person: {
  firstName: string
  middleName?: string | null
  lastName: string
  suffix?: string | null
}): string {
  const parts = [person.firstName, person.lastName, person.suffix].filter(
    Boolean
  )
  return parts.join(" ")
}

/** PHP amounts are entered in whole-peso denominations of 100 (legacy rule). */
export const LOAN_AMOUNT_DENOMINATION = 100

export function roundToDenomination(
  value: number,
  denomination = LOAN_AMOUNT_DENOMINATION
): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value / denomination) * denomination
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}
