import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { apiClient } from "@/lib/api/api-client"
import { getErrorMessage } from "@/lib/api/api-error"
import { queryKeys } from "@/lib/query/keys"

export interface ApprovalAuthority {
  key: string
  displayName: string
  tier: number
  priority: number
  allowNew: boolean
  allowRenewal: boolean
  maxSeverity: 0 | 1 | 2
  maxTotalExposure: number
  scopeType: 0 | 1 | 2
  assignedUsers: { userId: string; name: string }[]
}

export const SEVERITY_LABELS: Record<0 | 1 | 2, string> = {
  0: "None (0)",
  1: "Minor (1)",
  2: "Major (2)",
}

export const SCOPE_LABELS: Record<0 | 1 | 2, string> = {
  0: "Branch",
  1: "Area",
  2: "Global",
}

export function useApprovalAuthorities() {
  return useQuery({
    queryKey: queryKeys.admin.approvalAuthorities,
    queryFn: ({ signal }) =>
      apiClient.get<{ items: ApprovalAuthority[] }>(
        "/api/approval-authorities",
        { signal }
      ),
    staleTime: 60_000,
  })
}

export function useUpdateAuthority(key: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      maxTotalExposure?: number
      maxSeverity?: 0 | 1 | 2
      allowNew?: boolean
      allowRenewal?: boolean
    }) =>
      apiClient.put<ApprovalAuthority, typeof payload>(
        `/api/approval-authorities/${encodeURIComponent(key)}`,
        payload
      ),
    onSuccess: () => {
      toast.success("Approval authority updated.")
      return queryClient.invalidateQueries({
        queryKey: queryKeys.admin.approvalAuthorities,
      })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

export function useAssignAuthorityUsers(key: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userIds: string[]) =>
      apiClient.put<ApprovalAuthority, { userIds: string[] }>(
        `/api/approval-authorities/${encodeURIComponent(key)}/users`,
        { userIds }
      ),
    onSuccess: () => {
      toast.success("Approver assignment saved.")
      return queryClient.invalidateQueries({
        queryKey: queryKeys.admin.approvalAuthorities,
      })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}
