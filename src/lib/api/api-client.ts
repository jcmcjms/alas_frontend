import { ApiError, type ProblemDetails } from "./api-error"

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "")

type TokenProvider = () => string | null
type UnauthorizedHandler = (error: ApiError) => void
/**
 * Attempts a token refresh; resolves to the new access token, or null when
 * the session cannot be restored (the caller then ends the session).
 */
type SessionRefreshHandler = () => Promise<string | null>

let tokenProvider: TokenProvider = () => null
let unauthorizedHandler: UnauthorizedHandler | null = null
let refreshHandler: SessionRefreshHandler | null = null

/** Registered once by the auth session provider; keeps the client decoupled. */
export function setAuthTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider
}

/** Registered once by the auth session provider to handle expired sessions. */
export function setUnauthorizedHandler(
  handler: UnauthorizedHandler | null
): void {
  unauthorizedHandler = handler
}

/** Registered once by the auth session provider to restore expired tokens. */
export function setSessionRefreshHandler(
  handler: SessionRefreshHandler | null
): void {
  refreshHandler = handler
}

/**
 * Single-flight refresh: concurrent 401s share ONE refresh call so
 * rotation-based backends never see competing refreshes revoking each other.
 */
let refreshInFlight: Promise<string | null> | null = null
function refreshOnce(): Promise<string | null> {
  if (!refreshInFlight) {
    const run = refreshHandler ? refreshHandler() : Promise.resolve(null)
    refreshInFlight = run.finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

export interface RequestOptions {
  signal?: AbortSignal
  headers?: Record<string, string>
  /** Abort the request after this many ms. Defaults to 30s. */
  timeoutMs?: number
  /** Internal: marks the single automatic retry after a token refresh. */
  isRetryAfterRefresh?: boolean
}

const DEFAULT_TIMEOUT_MS = 30_000

/** FormData passes through untouched (the browser sets the multipart boundary). */
function serializeBody<TBody>(body: TBody | undefined): BodyInit | undefined {
  if (body === undefined) return undefined
  if (body instanceof FormData) return body
  return JSON.stringify(body)
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {}
): Promise<T> {
  const headers = new Headers(init.headers)
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    headers.set(key, value)
  }
  headers.set("Accept", "application/json, application/problem+json")
  headers.set("X-Request-Id", crypto.randomUUID())

  if (
    init.body != null &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json")
  }

  const token = tokenProvider()
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException("Timeout", "TimeoutError")),
    timeoutMs
  )
  const forwardAbort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener("abort", forwardAbort, { once: true })

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    })
  } catch (error) {
    // fetch rejects on network failure and on abort.
    if (options.signal?.aborted) throw error
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiError(408, {
        title: "Request timed out",
        detail: "The server did not respond in time. Please try again.",
      })
    }
    throw new ApiError(0, {
      title: "Network error",
      detail: "Cannot reach the server.",
    })
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", forwardAbort)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get("content-type") ?? ""
  let body: unknown
  if (contentType.includes("json")) {
    body = await response.json().catch(() => undefined)
  }

  if (!response.ok) {
    const apiError = new ApiError(
      response.status,
      body as ProblemDetails | undefined
    )
    // Auth endpoints manage their own 401s (login/refresh must not trigger
    // the global handler or a refresh loop).
    if (apiError.isUnauthorized && !path.startsWith("/api/auth/")) {
      // One transparent refresh-and-retry per request while a session exists:
      // short-lived access tokens must not log officers out mid-work. The
      // retry flag bounds replay to exactly one attempt (no retry storms).
      // A 401 means the server did NOT execute the operation, so replaying
      // even a mutation is safe at this point; business mutations themselves
      // are never auto-retried on transport failures.
      if (!options.isRetryAfterRefresh && refreshHandler && tokenProvider()) {
        const newToken = await refreshOnce()
        if (newToken) {
          return request<T>(path, init, {
            ...options,
            isRetryAfterRefresh: true,
          })
        }
      }
      unauthorizedHandler?.(apiError)
    }
    throw apiError
  }

  return body as T
}

export const apiClient = {
  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return request<T>(path, { method: "GET" }, options)
  },

  post<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options: RequestOptions = {}
  ): Promise<TResponse> {
    return request<TResponse>(
      path,
      { method: "POST", body: serializeBody(body) },
      options
    )
  },

  put<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options: RequestOptions = {}
  ): Promise<TResponse> {
    return request<TResponse>(
      path,
      { method: "PUT", body: serializeBody(body) },
      options
    )
  },

  patch<TResponse, TBody = unknown>(
    path: string,
    body: TBody,
    options: RequestOptions = {}
  ): Promise<TResponse> {
    return request<TResponse>(
      path,
      { method: "PATCH", body: serializeBody(body) },
      options
    )
  },

  delete<TResponse>(
    path: string,
    options: RequestOptions = {}
  ): Promise<TResponse> {
    return request<TResponse>(path, { method: "DELETE" }, options)
  },

  /** Multipart upload (documents, e-signature). No Content-Type override. */
  upload<TResponse>(
    path: string,
    formData: FormData,
    options: RequestOptions = {}
  ): Promise<TResponse> {
    // Longer ceiling: multi-MB document scans on slow branch uplinks.
    return request<TResponse>(
      path,
      { method: "POST", body: formData },
      { timeoutMs: 120_000, ...options }
    )
  },
}

export function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value))
    }
  }
  const query = search.toString()
  return query ? `?${query}` : ""
}
