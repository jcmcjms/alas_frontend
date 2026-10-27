import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { apiClient, buildQuery } from "@/lib/api/api-client"
import { getErrorMessage } from "@/lib/api/api-error"
import { queryKeys } from "@/lib/query/keys"
import type { UserRole } from "@/features/auth/types"

export interface AdminUser {
  id: string
  username: string
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  email: string
  phone: string | null
  branchCode: string
  role: UserRole
  jobTitle: string
  isActive: boolean
  mustChangePassword: boolean
  hasESignature: boolean
  createdAt: string
}

export interface CreateUserPayload {
  username: string
  firstName: string
  middleName?: string | null
  lastName: string
  suffix?: string | null
  email: string
  phone?: string | null
  jobTitle?: string
  branchCode: string
  role: UserRole
}

export interface UserListResponse {
  items: AdminUser[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export function useUsers(params: {
  page: number
  pageSize: number
  search: string
  role?: string
}) {
  return useQuery({
    queryKey: queryKeys.admin.users({
      page: params.page,
      search: params.search,
    }),
    queryFn: ({ signal }) =>
      apiClient.get<UserListResponse>(
        `/api/users${buildQuery({ page: params.page, pageSize: params.pageSize, search: params.search, role: params.role })}`,
        { signal }
      ),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  })
}

export function useRoles() {
  return useQuery({
    queryKey: queryKeys.admin.roles,
    queryFn: ({ signal }) =>
      apiClient.get<{ items: { name: UserRole; permissions: string[] }[] }>(
        "/api/roles",
        { signal }
      ),
    staleTime: 10 * 60_000,
  })
}

function useInvalidateUsers() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.userLists })
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (payload: CreateUserPayload) =>
      apiClient.post<AdminUser, CreateUserPayload>("/api/users", payload),
    onSuccess: () => {
      toast.success(
        "User created. They must change the temporary password at first sign-in."
      )
      return invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

export function useUpdateUser(id: string) {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (payload: Partial<CreateUserPayload>) =>
      apiClient.put<AdminUser, Partial<CreateUserPayload>>(
        `/api/users/${encodeURIComponent(id)}`,
        payload
      ),
    onSuccess: () => {
      toast.success("User updated.")
      return invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

export function useToggleUserStatus(id: string) {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (isActive: boolean) =>
      apiClient.patch<AdminUser, { isActive: boolean }>(
        `/api/users/${encodeURIComponent(id)}/status`,
        { isActive }
      ),
    onSuccess: (user) => {
      toast.success(
        user.isActive
          ? `${user.firstName} ${user.lastName} reactivated.`
          : `${user.firstName} ${user.lastName} suspended.`
      )
      return invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}
