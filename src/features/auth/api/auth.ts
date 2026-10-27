import { apiClient } from "@/lib/api/api-client"

export interface AuthTokenResponse {
  accessToken: string
  accessTokenExpiresAt: string
  mustChangePassword: boolean
}

export function login(
  username: string,
  password: string
): Promise<AuthTokenResponse> {
  return apiClient.post<
    AuthTokenResponse,
    { username: string; password: string }
  >("/api/auth/login", {
    username,
    password,
  })
}

/**
 * Session restore attempt. The production backend authenticates this call with
 * an HttpOnly refresh cookie; it fails with 401 when no session exists.
 */
export function refreshSession(): Promise<AuthTokenResponse> {
  return apiClient.post<AuthTokenResponse>("/api/auth/refresh")
}

export function logout(): Promise<void> {
  return apiClient.post<void>("/api/auth/logout")
}

export function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  return apiClient.post<void, { currentPassword: string; newPassword: string }>(
    "/api/auth/change-password",
    { currentPassword, newPassword }
  )
}

export function forgotPassword(username: string): Promise<{ message: string }> {
  return apiClient.post<{ message: string }, { username: string }>(
    "/api/auth/forgot-password",
    {
      username,
    }
  )
}
