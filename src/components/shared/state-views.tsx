import type { ReactNode } from "react"
import {
  AlertCircleIcon,
  InboxIcon,
  RefreshCwIcon,
  SearchXIcon,
  ShieldAlertIcon,
} from "lucide-react"

import { ApiError, getErrorMessage } from "@/lib/api/api-error"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * State views follow one rule: the failure lives inside the block that failed,
 * never as a full-screen banner, and says what to do next.
 */

export function ErrorState({
  error,
  onRetry,
  title,
  className,
  compact = false,
}: {
  error: unknown
  onRetry?: () => void
  title?: string
  className?: string
  compact?: boolean
}) {
  const isApi = error instanceof ApiError
  const heading =
    title ??
    (isApi && error.isForbidden
      ? "You don't have access to this"
      : isApi && error.isUnauthorized
        ? "Your session has expired"
        : isApi && error.isNotFound
          ? "Not found"
          : isApi && error.isNetworkError
            ? "Connection problem"
            : "Couldn't load this section")
  const message = getErrorMessage(error)

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 border border-dashed text-center",
        compact ? "px-4 py-6" : "px-6 py-10",
        className
      )}
    >
      <AlertCircleIcon aria-hidden className="size-5 text-destructive" />
      <p className="text-sm font-medium">{heading}</p>
      <p className="max-w-md text-xs text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-1 gap-1.5"
          onClick={onRetry}
        >
          <RefreshCwIcon aria-hidden className="size-3.5" />
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <Empty className={cn("border border-dashed", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon ?? <InboxIcon />}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}

export function NoSearchResultsState({
  query,
  onClear,
  className,
}: {
  query: string
  onClear?: () => void
  className?: string
}) {
  return (
    <Empty className={cn("border border-dashed", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>No matching records</EmptyTitle>
        <EmptyDescription>
          Nothing matches{" "}
          {query ? (
            <span className="font-medium text-foreground">“{query}”</span>
          ) : (
            "the current filters"
          )}
          . Adjust the search or filters and try again.
        </EmptyDescription>
      </EmptyHeader>
      {onClear ? (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}

export function AccessDeniedState({
  title = "Access denied",
  description = "Your role doesn't permit this action. If you believe this is wrong, contact your administrator.",
  className,
}: {
  title?: string
  description?: string
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 border border-dashed px-6 py-10 text-center",
        className
      )}
    >
      <ShieldAlertIcon aria-hidden className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

/** Table skeleton that keeps the final layout: header + N rows at real pitch. */
export function TableSkeleton({
  rows = 6,
  className,
}: {
  rows?: number
  className?: string
}) {
  return (
    <div
      className={cn("space-y-2 p-4", className)}
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-4 w-1/3" />
      <div className="space-y-1.5">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function DetailSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("space-y-4", className)}
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-6 w-48" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-40 lg:col-span-2" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-56" />
    </div>
  )
}
