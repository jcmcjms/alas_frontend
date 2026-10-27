import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Screen title row: one h1 (noun, 20-24px), an optional one-line finding or
 * scope under it, and real actions on the right. No hero headers, no
 * greetings (app-screen design rules).
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        className
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {description ? (
          <div className="text-sm text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-none items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
