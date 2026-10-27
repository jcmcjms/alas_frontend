import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { apiClient, buildQuery } from "@/lib/api/api-client"
import { getErrorMessage } from "@/lib/api/api-error"
import { queryKeys } from "@/lib/query/keys"
import type { UserRole } from "@/features/auth/types"

export interface AccountProfile {
  id: string
  username: string
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  email: string
  phone: string | null
  emergencyContact: string | null
  branchCode: string
  branchName: string
  role: UserRole
  jobTitle: string
  /** Opaque PNG data reference; ownership enforced server-side. */
  eSignature: string | null
  createdAt: string
  passwordChangedAt: string
  stats: {
    encodedLoans: number
    activeThisMonth: number
    pendingCorrection: number
  }
}

export interface AccountSession {
  id: string
  deviceInfo: string
  ipAddress: string
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

export interface AccountActivity {
  id: string
  lamId: string
  loanClientName: string
  action: string
  fromStatus: string | null
  toStatus: string | null
  comments: string | null
  actionDate: string
}

export interface UpdateProfilePayload {
  firstName?: string
  middleName?: string | null
  lastName?: string
  suffix?: string | null
  email?: string
  phone?: string | null
  emergencyContact?: string | null
}

export function useAccountProfile() {
  return useQuery({
    queryKey: queryKeys.account.profile,
    queryFn: ({ signal }) =>
      apiClient.get<AccountProfile>("/api/account/me", { signal }),
    // Sensitive account data: always revalidate; never persisted to storage.
    staleTime: 0,
  })
}

export function useAccountSessions(page: number) {
  return useQuery({
    queryKey: queryKeys.account.sessions(page),
    queryFn: ({ signal }) =>
      apiClient.get<{
        items: AccountSession[]
        totalCount: number
        page: number
        pageSize: number
        totalPages: number
      }>(`/api/account/me/sessions${buildQuery({ page, pageSize: 10 })}`, {
        signal,
      }),
  })
}

export function useAccountActivity(page: number) {
  return useQuery({
    queryKey: queryKeys.account.activity(page),
    queryFn: ({ signal }) =>
      apiClient.get<{
        items: AccountActivity[]
        totalCount: number
        page: number
        pageSize: number
        totalPages: number
      }>(`/api/account/me/activity${buildQuery({ page, pageSize: 20 })}`, {
        signal,
      }),
  })
}

/**
 * Profile update. The UI only reflects the server-confirmed result: on success
 * the profile query is invalidated (and re-rendered from the response), never
 * updated optimistically.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) =>
      apiClient.put<AccountProfile, UpdateProfilePayload>(
        "/api/account/me",
        payload
      ),
    onSuccess: async (profile) => {
      // Seed the cache with the authoritative response, then revalidate.
      queryClient.setQueryData(queryKeys.account.profile, profile)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.account.profile,
      })
      toast.success("Account details saved.")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

export function useUploadSignature() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.set("signature", file)
      return apiClient.put<{
        eSignature: string
        updatedAt: string
        sizeBytes: number
      }>("/api/account/me/signature", formData)
    },
    onSuccess: () => {
      toast.success("E-signature updated.")
      return queryClient.invalidateQueries({
        queryKey: queryKeys.account.profile,
      })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

export function useDeleteSignature() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.delete<void>("/api/account/me/signature"),
    onSuccess: () => {
      toast.success("E-signature removed.")
      return queryClient.invalidateQueries({
        queryKey: queryKeys.account.profile,
      })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

export function useRevokeSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiClient.delete<void>(`/api/account/me/sessions/${sessionId}`),
    onSuccess: () => {
      toast.success("Session ended.")
      return queryClient.invalidateQueries({ queryKey: queryKeys.account.all })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiClient.delete<{ revokedCount: number }>(
        "/api/account/me/sessions/others"
      ),
    onSuccess: (result) => {
      toast.success(
        result.revokedCount > 0
          ? `${result.revokedCount} other session(s) ended.`
          : "No other sessions were active."
      )
      return queryClient.invalidateQueries({ queryKey: queryKeys.account.all })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}
