import { delay, http, HttpResponse } from "msw"
import { db, daysFromNow, findUser, userName } from "../db"
import { problem, resolveActor } from "../handler-utils"
import { consumeExpiredSession, getMockScenario } from "../scenarios"
import type { MockUserRecord } from "../fixtures/base-data"

const TOKEN_TTL_MS = 60 * 60 * 1000
/**
 * Refresh credential for the mock. NOTE: a service worker cannot observe
 * request cookies (the browser applies them after the SW responds) and
 * Firefox rejects HttpOnly Set-Cookie on SW-synthesized responses, so the
 * mock rotates on the Bearer token instead. The PRODUCTION contract remains
 * an HttpOnly refresh cookie set by ASP.NET Core (docs/WORKFLOW.md section 8):
 * same request/response shape, same single-flight client behavior. A reload
 * in mock mode therefore requires signing in again — by design, never via
 * insecure persistence.
 */

function b64url(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function issueToken(user: MockUserRecord): {
  accessToken: string
  accessTokenExpiresAt: string
} {
  const expiresAt = Date.now() + TOKEN_TTL_MS
  const token = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
    sub: user.id,
    unique_name: user.username,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    suffix: user.suffix,
    email: user.email,
    branchCode: user.branchCode,
    branchName:
      db().branches.find((b) => b.code === user.branchCode)?.name ?? "",
    role: user.role,
    jobTitle: user.jobTitle,
    permissions: user.permissions === "*" ? ["*"] : user.permissions,
    exp: Math.floor(expiresAt / 1000),
  })}.mock-signature`
  db().tokens.set(token, { userId: user.id, expiresAt })
  return {
    accessToken: token,
    accessTokenExpiresAt: new Date(expiresAt).toISOString(),
  }
}

export const authHandlers = [
  http.post("*/api/auth/login", async ({ request }) => {
    if (getMockScenario() === "slow") await delay(2500)
    else await delay(250)

    const body = (await request.json().catch(() => null)) as {
      username?: string
      password?: string
    } | null
    if (!body?.username || !body?.password) {
      return problem(
        400,
        "Validation failed",
        "Username and password are required."
      )
    }

    const user = db().users.find(
      (candidate) =>
        candidate.username.toLowerCase() === body.username!.trim().toLowerCase()
    )
    if (!user || user.password !== body.password) {
      return problem(
        401,
        "Invalid credentials",
        "The username or password is incorrect."
      )
    }
    if (!user.isActive) {
      return problem(
        403,
        "Account suspended",
        "This account has been suspended. Contact your administrator."
      )
    }

    const issued = issueToken(user)
    return HttpResponse.json(
      { ...issued, mustChangePassword: user.mustChangePassword },
      { headers: { "Cache-Control": "no-store" } }
    )
  }),

  /**
   * Session restore / token rotation.
   *
   * Production contract (documented, pending backend): an HttpOnly refresh
   * cookie authenticates this call. The mock cannot set cookies from a
   * service worker, so it rotates on a still-valid Bearer token instead —
   * same request/response shape, same single-flight client behavior. A
   * missing, revoked or expired token yields 401 and the session ends.
   */
  http.post("*/api/auth/refresh", async ({ request }) => {
    await delay(120)
    if (getMockScenario() === "expired-session" && consumeExpiredSession()) {
      return problem(
        401,
        "Session expired",
        "Your session has expired. Please sign in again."
      )
    }
    const actor = resolveActor(request)
    if (!actor) {
      return problem(
        401,
        "Session expired",
        "Your session has expired. Please sign in again."
      )
    }
    if (!actor.isActive) {
      return problem(
        401,
        "Session expired",
        "This account is suspended. Contact your administrator."
      )
    }
    const issued = issueToken(actor)
    return HttpResponse.json(
      { ...issued, mustChangePassword: actor.mustChangePassword },
      { headers: { "Cache-Control": "no-store" } }
    )
  }),

  http.post("*/api/auth/logout", async ({ request }) => {
    await delay(80)
    const header = request.headers.get("Authorization")
    if (header?.startsWith("Bearer ")) {
      db().tokens.delete(header.slice("Bearer ".length))
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.post("*/api/auth/change-password", async ({ request }) => {
    await delay(200)
    const header = request.headers.get("Authorization")
    const token = header?.startsWith("Bearer ")
      ? header.slice("Bearer ".length)
      : null
    const entry = token ? db().tokens.get(token) : null
    const user = entry ? findUser(db(), entry.userId) : null
    if (!user)
      return problem(
        401,
        "Unauthorized",
        "Sign in again to change your password."
      )

    const body = (await request.json().catch(() => null)) as {
      currentPassword?: string
      newPassword?: string
    } | null
    if (!body?.currentPassword || !body?.newPassword) {
      return problem(
        400,
        "Validation failed",
        "Both current and new password are required."
      )
    }
    if (body.currentPassword !== user.password) {
      return problem(
        400,
        "Validation failed",
        "The current password is incorrect."
      )
    }
    if (body.newPassword.length < 8) {
      return problem(
        400,
        "Validation failed",
        "The new password must be at least 8 characters."
      )
    }
    if (body.newPassword === body.currentPassword) {
      return problem(
        400,
        "Validation failed",
        "The new password must differ from the current one."
      )
    }
    user.password = body.newPassword
    user.mustChangePassword = false
    user.passwordChangedAt = new Date().toISOString()
    return new HttpResponse(null, { status: 204 })
  }),

  http.post("*/api/auth/forgot-password", async () => {
    await delay(200)
    // Deliberately vague: never reveals whether the account exists.
    return HttpResponse.json({
      message:
        "If the username exists, reset instructions were sent to the registered email.",
    })
  }),

  /** Mock-only helper used by tests/dev tooling to exchange a username for a session. */
  http.post("*/api/auth/mock-session", async ({ request }) => {
    const body = (await request.json().catch(() => null)) as {
      username?: string
    } | null
    const user = body?.username
      ? db().users.find((candidate) => candidate.username === body.username)
      : null
    if (!user) return problem(404, "Not found", "Unknown mock user.")
    return HttpResponse.json({
      ...issueToken(user),
      mustChangePassword: user.mustChangePassword,
      displayName: userName(user),
    })
  }),
]

export { issueToken, TOKEN_TTL_MS, daysFromNow }
