export type ProblemDetails = {
  title?: string
  detail?: string
  status?: number
  /** Field-level validation errors keyed by field name (ASP.NET Core convention). */
  errors?: Record<string, string[]>
  /** Machine-readable business-rule code, when the backend provides one. */
  code?: string
  /** Concurrency token echo for 409 conflicts. */
  rowVersion?: string
}

/**
 * Transport-level and business-rule API failures.
 * `status` distinguishes them: 4xx with `problem.code`/`problem.errors` is a
 * business-rule/validation failure; 5xx or missing problem details is transport.
 */
export class ApiError extends Error {
  readonly status: number
  readonly problem?: ProblemDetails

  constructor(status: number, problem?: ProblemDetails) {
    super(
      problem?.detail ??
        problem?.title ??
        `Request failed with status ${status}`
    )
    this.name = "ApiError"
    this.status = status
    this.problem = problem
  }

  get fieldErrors(): Record<string, string[]> {
    return this.problem?.errors ?? {}
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isConflict(): boolean {
    return this.status === 409
  }

  get isNotFound(): boolean {
    return this.status === 404
  }

  get isNetworkError(): boolean {
    return this.status === 0
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/** Human-readable message safe to show to end users (no stack traces). */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.isNetworkError) {
      return "Cannot reach the server. Check your connection and try again."
    }
    return error.message
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "The request was cancelled."
  }
  return "Something went wrong. Please try again."
}
