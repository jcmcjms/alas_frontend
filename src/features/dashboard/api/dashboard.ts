import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/lib/api/api-client"
import { queryKeys } from "@/lib/query/keys"

export interface DashboardCount {
  key: string
  label: string
  value: number
  link: string | null
  tone: "default" | "attention" | "positive"
}

export interface DashboardAttentionItem {
  kind: "correction" | "overdue"
  loanId: string
  lamId: string
  clientName: string
  detail: string
  since: string
}

export interface DashboardActivityItem {
  id: string
  lamId: string
  clientName: string
  action: string
  byName: string
  at: string
}

export interface DashboardOverview {
  role: string
  deskLabel: string | null
  counts: DashboardCount[]
  needsAttention: DashboardAttentionItem[]
  recentActivity: DashboardActivityItem[]
  workflow: { requireRecommendation: boolean }
}

export function useDashboardOverview(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dashboard.overview(userId ?? "anonymous"),
    queryFn: ({ signal }) =>
      apiClient.get<DashboardOverview>("/api/dashboard/overview", { signal }),
    enabled: Boolean(userId),
    staleTime: 15_000,
    refetchInterval: 60_000,
  })
}
