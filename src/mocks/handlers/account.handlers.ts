import { delay, http } from "msw"
import { db, findLoan, userName } from "../db"
import {
  intParam,
  isFileLike,
  noStoreJson,
  paginate,
  problem,
  resolveActor,
} from "../handler-utils"
import type { MockUserRecord } from "../fixtures/base-data"

const MAX_SIGNATURE_BYTES = 1024 * 1024 // 1 MB

function profileView(user: MockUserRecord) {
  const loans = db().loans.filter((loan) => loan.createdById === user.id)
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    suffix: user.suffix,
    email: user.email,
    phone: user.phone,
    emergencyContact: user.emergencyContact,
    branchCode: user.branchCode,
    branchName:
      db().branches.find((branch) => branch.code === user.branchCode)?.name ??
      "",
    role: user.role,
    jobTitle: user.jobTitle,
    eSignature: user.eSignature,
    createdAt: user.createdAt,
    passwordChangedAt: user.passwordChangedAt,
    stats: {
      encodedLoans: loans.length,
      activeThisMonth: loans.filter(
        (loan) =>
          loan.applicationDate >
          new Date(Date.now() - 30 * 86_400_000).toISOString()
      ).length,
      pendingCorrection: loans.filter(
        (loan) =>
          loan.status === "ForRevision" ||
          loan.status === "ForIncompleteDocuments"
      ).length,
    },
  }
}

export const accountHandlers = [
  http.get("*/api/account/me", async ({ request }) => {
    await delay(180)
    const actor = resolveActor(request)
    if (!actor)
      return problem(401, "Unauthorized", "Sign in to view your account.")
    return noStoreJson(profileView(actor))
  }),

  http.put("*/api/account/me", async ({ request }) => {
    await delay(300)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (!body)
      return problem(400, "Validation failed", "A request body is required.")
    const errors: Record<string, string[]> = {}
    if (
      typeof body.email === "string" &&
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim())
    ) {
      errors.email = ["Enter a valid email address."]
    }
    for (const field of ["firstName", "lastName"] as const) {
      if (typeof body[field] === "string" && body[field]!.trim().length === 0) {
        errors[field] = [
          `${field === "firstName" ? "First" : "Last"} name cannot be empty.`,
        ]
      }
    }
    if (Object.keys(errors).length)
      return problem(400, "Validation failed", "Some fields need attention.", {
        errors,
      })

    if (typeof body.firstName === "string")
      actor.firstName = body.firstName.trim()
    if (typeof body.middleName === "string")
      actor.middleName = body.middleName.trim() || null
    if (typeof body.lastName === "string") actor.lastName = body.lastName.trim()
    if (typeof body.suffix === "string")
      actor.suffix = body.suffix.trim() || null
    if (typeof body.email === "string") actor.email = body.email.trim()
    if (typeof body.phone === "string") actor.phone = body.phone.trim() || null
    if (typeof body.emergencyContact === "string")
      actor.emergencyContact = body.emergencyContact.trim() || null

    return noStoreJson(profileView(actor))
  }),

  /**
   * E-signature upload. Contract: PNG only, ≤1 MB. The stored value is an
   * opaque data reference; ownership and signing controls stay server-side.
   */
  http.put("*/api/account/me/signature", async ({ request }) => {
    await delay(450)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")

    const formData = await request.formData().catch(() => null)
    const file = formData?.get("signature")
    if (!isFileLike(file)) {
      return problem(
        400,
        "Validation failed",
        'A file part named "signature" is required.'
      )
    }
    if (file.type !== "image/png") {
      return problem(
        415,
        "Unsupported file type",
        "The e-signature must be a PNG image with a transparent background."
      )
    }
    if (file.size > MAX_SIGNATURE_BYTES) {
      return problem(
        413,
        "File too large",
        "The e-signature image must be 1 MB or smaller."
      )
    }
    if (file.size < 100) {
      return problem(
        422,
        "Unprocessable file",
        "That file is too small to be a signature image."
      )
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ""
    for (const byte of bytes) binary += String.fromCharCode(byte)
    actor.eSignature = `data:image/png;base64,${btoa(binary)}`
    return noStoreJson({
      eSignature: actor.eSignature,
      updatedAt: new Date().toISOString(),
      sizeBytes: file.size,
    })
  }),

  http.delete("*/api/account/me/signature", async ({ request }) => {
    await delay(250)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const inFlight = db().loans.some(
      (loan) =>
        loan.status === "ForApproval" &&
        loan.signatures.some((signature) => signature.userId === actor.id)
    )
    if (inFlight) {
      return problem(
        409,
        "Signature in use",
        "Your signature is attached to an application awaiting approval. It cannot be removed yet."
      )
    }
    actor.eSignature = null
    return new Response(null, { status: 204 })
  }),

  http.get("*/api/account/me/sessions", async ({ request }) => {
    await delay(160)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const url = new URL(request.url)
    const sessions = db().sessions.filter(
      (session) => session.userId === actor.id
    )
    return noStoreJson(
      paginate(
        sessions,
        intParam(url, "page", 1),
        intParam(url, "pageSize", 10)
      )
    )
  }),

  http.delete(
    "*/api/account/me/sessions/:sessionId",
    async ({ params, request }) => {
      await delay(200)
      const actor = resolveActor(request)
      if (!actor) return problem(401, "Unauthorized", "Sign in first.")
      const index = db().sessions.findIndex(
        (session) =>
          session.id === String(params.sessionId) && session.userId === actor.id
      )
      if (index === -1)
        return problem(
          404,
          "Session not found",
          "That session no longer exists."
        )
      if (db().sessions[index].isCurrent) {
        return problem(
          409,
          "Current session",
          "Use Sign out to end the session you are using."
        )
      }
      db().sessions.splice(index, 1)
      return new Response(null, { status: 204 })
    }
  ),

  http.delete("*/api/account/me/sessions/others", async ({ request }) => {
    await delay(220)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const state = db()
    const before = state.sessions.length
    state.sessions = state.sessions.filter(
      (session) => session.userId !== actor.id || session.isCurrent
    )
    return noStoreJson({ revokedCount: before - state.sessions.length })
  }),

  http.get("*/api/account/me/activity", async ({ request }) => {
    await delay(180)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const url = new URL(request.url)
    const items = db().activities.filter(
      (activity) => activity.userId === actor.id
    )
    return noStoreJson(
      paginate(items, intParam(url, "page", 1), intParam(url, "pageSize", 20))
    )
  }),

  http.get("*/api/account/me/loans", async ({ request }) => {
    await delay(160)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const url = new URL(request.url)
    const limit = intParam(url, "limit", 5)
    const items = db()
      .loans.filter((loan) => loan.createdById === actor.id)
      .sort((a, b) => b.lastActionDate.localeCompare(a.lastActionDate))
      .slice(0, limit)
      .map((loan) => ({
        id: loan.id,
        lamId: loan.lamId,
        clientName: `${loan.client.firstName} ${loan.client.lastName}`,
        status: loan.status,
        applicationDate: loan.applicationDate,
        proposedAmount: loan.proposedAmount,
      }))
    return noStoreJson({ items })
  }),
]

export { findLoan, userName }
