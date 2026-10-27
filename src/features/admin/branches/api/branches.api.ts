import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { apiClient, buildQuery } from "@/lib/api/api-client"
import { getErrorMessage } from "@/lib/api/api-error"
import { queryKeys } from "@/lib/query/keys"

export interface Branch {
  code: string
  name: string
  areaCode: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface BranchListResponse {
  items: Branch[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export function useBranches(params: {
  page: number
  pageSize: number
  search: string
}) {
  return useQuery({
    queryKey: queryKeys.admin.branches({
      page: params.page,
      search: params.search,
    }),
    queryFn: ({ signal }) =>
      apiClient.get<BranchListResponse>(
        `/api/branches${buildQuery({ page: params.page, pageSize: params.pageSize, search: params.search })}`,
        { signal }
      ),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  })
}

/** Lightweight full list for selects (reference data, longer freshness). */
export function useBranchOptions() {
  return useQuery({
    queryKey: queryKeys.admin.branchOptions,
    queryFn: ({ signal }) =>
      apiClient.get<{ items: Branch[]; totalCount: number }>(
        "/api/branches?all=true",
        { signal }
      ),
    staleTime: 10 * 60_000,
  })
}

function useInvalidateBranches() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.branchLists }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.branchOptions,
      }),
    ])
}

export function useCreateBranch() {
  const invalidate = useInvalidateBranches()
  return useMutation({
    mutationFn: (payload: { code: string; name: string; areaCode: string }) =>
      apiClient.post<Branch, { code: string; name: string; areaCode: string }>(
        "/api/branches",
        payload
      ),
    onSuccess: () => {
      toast.success("Branch created.")
      return invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

export function useUpdateBranch(code: string) {
  const invalidate = useInvalidateBranches()
  return useMutation({
    mutationFn: (payload: {
      name?: string
      areaCode?: string
      isActive?: boolean
    }) =>
      apiClient.put<
        Branch,
        { name?: string; areaCode?: string; isActive?: boolean }
      >(`/api/branches/${encodeURIComponent(code)}`, payload),
    onSuccess: () => {
      toast.success("Branch updated.")
      return invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}
