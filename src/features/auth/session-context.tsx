import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"

import {
  setAuthTokenProvider,
  setUnauthorizedHandler,
} from "@/lib/api/api-client"
import { ApiError } from "@/lib/api/api-error"
import { extractUserFromToken, type TokenClaims } from "@/lib/jwt"
import {
  hasAnyPermission as checkAnyPermission,
  hasPermission as checkPermission,
} from "@/features/auth/types"
import {
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
} from "@/features/auth/api/auth"

export interface SessionUser extends TokenClaims {
  userId: string
  mustChangePassword: boolean
}

type SessionStatus = "initializing" | "authenticated" | "unauthenticated"

interface SessionContextValue {
  status: SessionStatus
  user: SessionUser | null
  /** True after a 401 ended an authenticated session (drives the expired banner). */
  sessionExpired: boolean
  login: (username: string, password: string) => Promise<SessionUser>
  logout: () => Promise<void>
  hasPermission: (required: string | string[]) => boolean
  hasAnyPermission: (required: readonly string[]) => boolean
}

const SessionContext = createContext<SessionContextValue | null>(null)

function toSessionUser(
  claims: TokenClaims,
  mustChangePassword: boolean
): SessionUser {
  return { ...claims, userId: claims.sub, mustChangePassword }
}

/**
 * One restore attempt per page load. StrictMode double-mounts must not fire
 * two concurrent refresh calls (preserved behavior from the legacy app:
 * refresh rotation would revoke the first token and log the user out).
 */
let pageRestore: Promise<AuthTokenShape | null> | null = null
type AuthTokenShape = { accessToken: string; mustChangePassword: boolean }

function restoreOnce(): Promise<AuthTokenShape | null> {
  if (!pageRestore) {
    pageRestore = refreshSession()
      .then((response) => ({
        accessToken: response.accessToken,
        mustChangePassword: response.mustChangePassword,
      }))
      .catch(() => null)
  }
  return pageRestore
}

export function resetRestoreSession(): void {
  pageRestore = null
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<SessionStatus>("initializing")
  const [user, setUser] = useState<SessionUser | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const tokenRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(null)

  /**
   * Wipe every cached server state and cancel in-flight requests. Called on
   * logout, session expiry and identity change so the next user can never see
   * the previous user's data (spec §12 session isolation). Late-arriving
   * responses cannot repopulate because their queries are cancelled and the
   * cache is cleared after cancellation.
   */
  const clearPrivateState = useCallback(async () => {
    await queryClient.cancelQueries()
    queryClient.clear()
  }, [queryClient])

  const applyToken = useCallback(
    (token: string, mustChangePassword: boolean): SessionUser | null => {
      const claims = extractUserFromToken(token)
      if (!claims) return null
      tokenRef.current = token
      const nextUser = toSessionUser(claims, mustChangePassword)
      // Identity change (different user without an explicit logout): clear first.
      if (userIdRef.current && userIdRef.current !== nextUser.userId) {
        void queryClient.cancelQueries().then(() => queryClient.clear())
      }
      userIdRef.current = nextUser.userId
      setUser(nextUser)
      setStatus("authenticated")
      return nextUser
    },
    [queryClient]
  )

  // Session restore on first mount.
  useEffect(() => {
    let cancelled = false
    restoreOnce().then((restored) => {
      if (cancelled) return
      if (restored) {
        applyToken(restored.accessToken, restored.mustChangePassword)
      } else {
        setStatus("unauthenticated")
      }
    })
    return () => {
      cancelled = true
    }
  }, [applyToken])

  // Wire the API client to the in-memory token and to expiry handling.
  useEffect(() => {
    setAuthTokenProvider(() => tokenRef.current)
    setUnauthorizedHandler((error: ApiError) => {
      if (error.isUnauthorized && tokenRef.current) {
        tokenRef.current = null
        userIdRef.current = null
        setUser(null)
        setStatus("unauthenticated")
        setSessionExpired(true)
        resetRestoreSession()
        void queryClient.cancelQueries().then(() => queryClient.clear())
      }
    })
    return () => {
      setAuthTokenProvider(() => null)
      setUnauthorizedHandler(null)
    }
  }, [queryClient])

  const login = useCallback(
    async (username: string, password: string): Promise<SessionUser> => {
      const response = await loginRequest(username, password)
      resetRestoreSession()
      const nextUser = applyToken(
        response.accessToken,
        response.mustChangePassword
      )
      if (!nextUser) {
        throw new ApiError(500, {
          title: "Invalid session",
          detail: "The server returned an unusable token.",
        })
      }
      setSessionExpired(false)
      return nextUser
    },
    [applyToken]
  )

  const logout = useCallback(async () => {
    try {
      if (tokenRef.current) await logoutRequest()
    } catch {
      // Best effort: local cleanup must proceed even if the API call fails.
    }
    tokenRef.current = null
    userIdRef.current = null
    setUser(null)
    setStatus("unauthenticated")
    setSessionExpired(false)
    resetRestoreSession()
    await clearPrivateState()
  }, [clearPrivateState])

  const hasPermission = useCallback(
    (required: string | string[]) =>
      user ? checkPermission(user.permissions, required) : false,
    [user]
  )
  const hasAnyPermission = useCallback(
    (required: readonly string[]) =>
      user ? checkAnyPermission(user.permissions, required) : false,
    [user]
  )

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      sessionExpired,
      login,
      logout,
      hasPermission,
      hasAnyPermission,
    }),
    [
      status,
      user,
      sessionExpired,
      login,
      logout,
      hasPermission,
      hasAnyPermission,
    ]
  )

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context)
    throw new Error("useSession must be used within SessionProvider")
  return context
}

/** Current session user or null — for components that render nothing when signed out. */
export function useCurrentUser(): SessionUser | null {
  return useSession().user
}
