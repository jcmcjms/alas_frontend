import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { BellIcon, CheckCheckIcon } from "lucide-react"

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationInbox,
} from "@/features/notifications/api/notifications"
import { formatDateTime, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/shared/page-header"
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
} from "@/components/shared/state-views"

const TYPE_LABELS: Record<string, string> = {
  workflow: "Workflow",
  correction: "Correction",
  disbursement: "Disbursement",
  system: "System",
}

export function NotificationsPage() {
  const [status, setStatus] = useState<"all" | "unread" | "read">("all")
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const inbox = useNotificationInbox({ page, pageSize: 15, status })
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  const totalPages = inbox.data
    ? Math.max(1, Math.ceil(inbox.data.totalCount / 15))
    : 1

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Notifications"
        description={
          inbox.data ? (
            <span className="tabular-nums">
              {inbox.data.unreadCount} unread of {inbox.data.totalCount}
            </span>
          ) : undefined
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={markAll.isPending || (inbox.data?.unreadCount ?? 0) === 0}
            onClick={() => markAll.mutate()}
          >
            <CheckCheckIcon aria-hidden className="size-3.5" />
            {markAll.isPending ? "Marking…" : "Mark all read"}
          </Button>
        }
      />

      <Tabs
        value={status}
        onValueChange={(value) => {
          setStatus(value as typeof status)
          setPage(1)
        }}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="read">Read</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {inbox.isPending ? <TableSkeleton rows={6} /> : null}
          {inbox.isError ? (
            <ErrorState
              error={inbox.error}
              onRetry={() => void inbox.refetch()}
              title="Couldn't load notifications"
            />
          ) : null}
          {inbox.data && inbox.data.items.length === 0 ? (
            <EmptyState
              className="border-0"
              title={
                status === "unread" ? "Nothing unread" : "No notifications"
              }
              description="Workflow events, corrections and disbursement notices will appear here."
              icon={<BellIcon />}
            />
          ) : null}
          {inbox.data && inbox.data.items.length > 0 ? (
            <ul className="divide-y divide-border">
              {inbox.data.items.map((notification) => (
                <li key={notification.id}>
                  <div
                    className={cn(
                      "flex items-start gap-3 px-4 py-3",
                      notification.readAt == null && "bg-muted/40"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-2 flex-none rounded-full",
                        notification.readAt == null
                          ? "bg-primary"
                          : "bg-transparent"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {notification.title}
                        <span className="ml-2 align-middle text-[10px] font-normal text-muted-foreground">
                          {TYPE_LABELS[notification.type] ?? notification.type}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {notification.body}
                      </p>
                      <p
                        className="mt-1 text-[11px] text-muted-foreground"
                        title={formatDateTime(notification.createdAt)}
                      >
                        {formatRelative(notification.createdAt)}
                        {notification.readAt ? " · read" : " · unread"}
                      </p>
                    </div>
                    <div className="flex flex-none items-center gap-1.5">
                      {notification.readAt == null ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={markRead.isPending}
                          onClick={() => markRead.mutate(notification.id)}
                        >
                          Mark read
                        </Button>
                      ) : null}
                      {notification.link ? (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            if (notification.readAt == null)
                              markRead.mutate(notification.id)
                            navigate(notification.link!)
                          }}
                        >
                          Open
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {totalPages > 1 ? (
        <nav
          className="flex items-center justify-between"
          aria-label="Notification pages"
        >
          <p className="text-xs text-muted-foreground tabular-nums">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  )
}

export default NotificationsPage
