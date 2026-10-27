import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { apiClient, buildQuery } from "@/lib/api/api-client"
import { getErrorMessage } from "@/lib/api/api-error"
import { queryKeys, type NotificationInboxParams } from "@/lib/query/keys"
import { useSession } from "@/features/auth/session-context"

export interface NotificationItem {
  id: string
  title: string
  body: string
  type: "workflow" | "correction" | "disbursement" | "system"
  link: string | null
  createdAt: string
  readAt: string | null
}

export interface InboxPage {
  items: NotificationItem[]
  totalCount: number
  unreadCount: number
  page: number
  pageSize: number
}

async function fetchInbox(
  params: NotificationInboxParams,
  signal?: AbortSignal
): Promise<InboxPage> {
  return apiClient.get<InboxPage>(
    `/api/notifications${buildQuery({
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 10,
      status: params.status === "all" ? undefined : params.status,
    })}`,
    { signal }
  )
}

/**
 * Inbox query. Polling (30s) stands in for the legacy SignalR hub; production
 * real-time transport is a documented backend dependency, not claimed here.
 */
export function useNotificationInbox(params: NotificationInboxParams) {
  const { user } = useSession()
  return useQuery({
    queryKey: queryKeys.notifications.inbox(user?.userId ?? "anonymous", params),
    queryFn: ({ signal }) => fetchInbox(params, signal),
    refetchInterval: 30_000,
    staleTime: 10_000,
  })
}

/** Lightweight unread feed for the top-bar bell. */
export function useBellNotifications(enabled = true) {
  const { user } = useSession()
  return useQuery({
    queryKey: queryKeys.notifications.inbox(user?.userId ?? "anonymous", {
      page: 1,
      pageSize: 5,
      status: "unread",
    }),
    queryFn: ({ signal }) =>
      fetchInbox({ page: 1, pageSize: 5, status: "unread" }, signal),
    refetchInterval: 30_000,
    staleTime: 10_000,
    enabled: enabled && Boolean(user),
  })
}

function useInvalidateInbox() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateInbox()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<void>(`/api/notifications/${id}/read`),
    onSuccess: invalidate,
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateInbox()
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ changedCount: number }>("/api/notifications/read-all"),
    onSuccess: (result) => {
      invalidate()
      toast.success(
        result.changedCount > 0
          ? `${result.changedCount} notifications marked read.`
          : "No unread notifications."
      )
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}
