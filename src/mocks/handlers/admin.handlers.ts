import { delay, http } from "msw"
import { db, findUser, pushNotification, userName } from "../db"
import {
  intParam,
  noStoreJson,
  paginate,
  problem,
  resolveActor,
  hasPerm,
} from "../handler-utils"
import { ROLE_PERMISSIONS, ROLES, type UserRole } from "@/features/auth/types"
import type { MockUserRecord } from "../fixtures/base-data"

function userView(user: MockUserRecord) {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    suffix: user.suffix,
    email: user.email,
    phone: user.phone,
    branchCode: user.branchCode,
    role: user.role,
    jobTitle: user.jobTitle,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    hasESignature: user.eSignature != null,
    createdAt: user.createdAt,
  }
}

export const adminHandlers = [
  // ------------------------------------------------------------------- users
  http.get("*/api/users", async ({ request }) => {
    await delay(200)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (!hasPerm(actor, "users.manage"))
      return problem(403, "Forbidden", "Only administrators can manage users.")

    const url = new URL(request.url)
    const page = intParam(url, "page", 1)
    const pageSize = intParam(url, "pageSize", 10)
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase()
    const role = url.searchParams.get("role") ?? undefined

    let users = db().users.map(userView)
    if (search) {
      users = users.filter((user) =>
        [
          user.username,
          user.firstName,
          user.lastName,
          user.email,
          user.branchCode,
          user.role,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)
      )
    }
    if (role) users = users.filter((user) => user.role === role)
    return noStoreJson(paginate(users, page, pageSize))
  }),

  http.post("*/api/users", async ({ request }) => {
    await delay(300)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (!hasPerm(actor, "users.manage"))
      return problem(403, "Forbidden", "Only administrators can create users.")

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    const errors: Record<string, string[]> = {}
    const username = String(body?.username ?? "")
      .trim()
      .toLowerCase()
    const firstName = String(body?.firstName ?? "").trim()
    const lastName = String(body?.lastName ?? "").trim()
    const email = String(body?.email ?? "").trim()
    const role = String(body?.role ?? "") as UserRole
    const branchCode = String(body?.branchCode ?? "")

    if (username.length < 3)
      errors.username = ["Username must be at least 3 characters."]
    if (db().users.some((user) => user.username === username))
      errors.username = ["This username is already taken."]
    if (!firstName) errors.firstName = ["First name is required."]
    if (!lastName) errors.lastName = ["Last name is required."]
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      errors.email = ["A valid email is required."]
    if (!(ROLES as readonly string[]).includes(role))
      errors.role = ["Select a role."]
    if (!db().branches.some((branch) => branch.code === branchCode))
      errors.branchCode = ["Select a branch."]
    if (Object.keys(errors).length) {
      return problem(400, "Validation failed", "Some fields need attention.", {
        errors,
      })
    }

    const user: MockUserRecord = {
      id: `usr-${Date.now().toString(36)}`,
      username,
      password: "Passw0rd!",
      firstName,
      middleName: (body?.middleName as string | null) ?? null,
      lastName,
      suffix: (body?.suffix as string | null) ?? null,
      email,
      phone: (body?.phone as string | null) ?? null,
      emergencyContact: null,
      branchCode,
      role,
      jobTitle: String(body?.jobTitle ?? role),
      permissions: ROLE_PERMISSIONS[role],
      eSignature: null,
      isActive: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
      passwordChangedAt: new Date().toISOString(),
    }
    db().users.push(user)
    return noStoreJson(userView(user), { status: 201 })
  }),

  http.put("*/api/users/:id", async ({ params, request }) => {
    await delay(280)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (!hasPerm(actor, "users.manage"))
      return problem(403, "Forbidden", "Only administrators can edit users.")
    const user = findUser(db(), String(params.id))
    if (!user)
      return problem(404, "User not found", `No user matches "${params.id}".`)

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (!body)
      return problem(400, "Validation failed", "A request body is required.")
    if (typeof body.firstName === "string" && body.firstName.trim())
      user.firstName = body.firstName.trim()
    if (typeof body.lastName === "string" && body.lastName.trim())
      user.lastName = body.lastName.trim()
    user.middleName = (body?.middleName as string | null) ?? user.middleName
    user.suffix = (body?.suffix as string | null) ?? user.suffix
    if (typeof body.email === "string" && body.email.trim())
      user.email = body.email.trim()
    if (typeof body.phone === "string") user.phone = body.phone
    if (typeof body.jobTitle === "string") user.jobTitle = body.jobTitle
    if (
      typeof body.branchCode === "string" &&
      db().branches.some((branch) => branch.code === body.branchCode)
    ) {
      user.branchCode = body.branchCode
    }
    if (
      typeof body.role === "string" &&
      (ROLES as readonly string[]).includes(body.role)
    ) {
      user.role = body.role as UserRole
      user.permissions = ROLE_PERMISSIONS[user.role]
    }
    return noStoreJson(userView(user))
  }),

  http.patch("*/api/users/:id/status", async ({ params, request }) => {
    await delay(250)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (!hasPerm(actor, "users.manage"))
      return problem(403, "Forbidden", "Only administrators can suspend users.")
    const user = findUser(db(), String(params.id))
    if (!user)
      return problem(404, "User not found", `No user matches "${params.id}".`)
    if (user.id === actor.id)
      return problem(
        409,
        "Invalid operation",
        "You cannot suspend your own account."
      )

    const body = (await request.json().catch(() => null)) as {
      isActive?: boolean
    } | null
    if (typeof body?.isActive !== "boolean")
      return problem(
        400,
        "Validation failed",
        "isActive must be true or false."
      )
    user.isActive = body.isActive
    pushNotification(
      db(),
      user.id,
      body.isActive ? "Account reactivated" : "Account suspended",
      `${userName(actor)} changed your account status.`,
      "system",
      null
    )
    return noStoreJson(userView(user))
  }),

  http.get("*/api/roles", async ({ request }) => {
    await delay(100)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (!hasPerm(actor, "roles.view") && !hasPerm(actor, "users.manage")) {
      return problem(403, "Forbidden", "Not allowed.")
    }
    return noStoreJson({
      items: ROLES.map((role) => ({
        name: role,
        permissions:
          ROLE_PERMISSIONS[role] === "*" ? ["*"] : ROLE_PERMISSIONS[role],
      })),
    })
  }),

  // ---------------------------------------------------------------- branches
  http.get("*/api/branches", async ({ request }) => {
    await delay(180)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const url = new URL(request.url)
    const page = intParam(url, "page", 1)
    const pageSize = intParam(url, "pageSize", 10)
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase()
    const all = url.searchParams.get("all") === "true"

    let branches = db().branches.map((branch) => ({ ...branch }))
    if (search) {
      branches = branches.filter((branch) =>
        [branch.code, branch.name, branch.areaCode]
          .join(" ")
          .toLowerCase()
          .includes(search)
      )
    }
    if (all)
      return noStoreJson({ items: branches, totalCount: branches.length })
    return noStoreJson(paginate(branches, page, pageSize))
  }),

  http.post("*/api/branches", async ({ request }) => {
    await delay(280)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (!hasPerm(actor, "branches.manage"))
      return problem(
        403,
        "Forbidden",
        "Only administrators can manage branches."
      )

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    const errors: Record<string, string[]> = {}
    const code = String(body?.code ?? "")
      .trim()
      .toUpperCase()
    const name = String(body?.name ?? "").trim()
    const areaCode = String(body?.areaCode ?? "")
      .trim()
      .toUpperCase()
    if (!/^B\d{3}$/.test(code))
      errors.code = ["Branch code must look like B001."]
    if (db().branches.some((branch) => branch.code === code))
      errors.code = ["This branch code already exists."]
    if (!name) errors.name = ["Branch name is required."]
    if (!areaCode) errors.areaCode = ["Area code is required."]
    if (Object.keys(errors).length)
      return problem(400, "Validation failed", "Some fields need attention.", {
        errors,
      })

    const branch = {
      code,
      name,
      areaCode,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    db().branches.push(branch)
    return noStoreJson(branch, { status: 201 })
  }),

  http.put("*/api/branches/:code", async ({ params, request }) => {
    await delay(260)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (!hasPerm(actor, "branches.manage"))
      return problem(
        403,
        "Forbidden",
        "Only administrators can manage branches."
      )
    const branch = db().branches.find(
      (candidate) => candidate.code === String(params.code).toUpperCase()
    )
    if (!branch)
      return problem(
        404,
        "Branch not found",
        `No branch matches "${params.code}".`
      )

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (typeof body?.name === "string" && body.name.trim())
      branch.name = body.name.trim()
    if (typeof body?.areaCode === "string" && body.areaCode.trim())
      branch.areaCode = body.areaCode.trim().toUpperCase()
    if (typeof body?.isActive === "boolean") branch.isActive = body.isActive
    branch.updatedAt = new Date().toISOString()
    return noStoreJson(branch)
  }),

  // ------------------------------------------------------------ loan products
  http.get("*/api/loan-products", async ({ request }) => {
    await delay(180)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const url = new URL(request.url)
    const page = intParam(url, "page", 1)
    const pageSize = intParam(url, "pageSize", 10)
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase()
    const all = url.searchParams.get("all") === "true"
    const includeRetired = url.searchParams.get("includeRetired") === "true"

    let products = db().products.map((product) => ({ ...product }))
    if (!includeRetired && !all)
      products = products.filter((product) => !product.isRetired)
    if (search) {
      products = products.filter((product) =>
        [product.code, product.description]
          .join(" ")
          .toLowerCase()
          .includes(search)
      )
    }
    if (all)
      return noStoreJson({ items: products, totalCount: products.length })
    return noStoreJson(paginate(products, page, pageSize))
  }),

  http.post("*/api/loan-products", async ({ request }) => {
    await delay(300)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (!hasPerm(actor, "loan_product.manage"))
      return problem(
        403,
        "Forbidden",
        "Only administrators can manage loan products."
      )

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    const errors: Record<string, string[]> = {}
    const code = String(body?.code ?? "")
      .trim()
      .toUpperCase()
    if (!code) errors.code = ["Product code is required."]
    if (db().products.some((product) => product.code === code))
      errors.code = ["This product code already exists."]
    if (!String(body?.description ?? "").trim())
      errors.description = ["Description is required."]
    const minAmount = Number(body?.minAmount)
    const maxAmount = Number(body?.maxAmount)
    if (!Number.isFinite(minAmount) || minAmount <= 0)
      errors.minAmount = ["Minimum amount must be positive."]
    if (!Number.isFinite(maxAmount) || maxAmount <= minAmount)
      errors.maxAmount = ["Maximum amount must exceed the minimum."]
    if (Object.keys(errors).length)
      return problem(400, "Validation failed", "Some fields need attention.", {
        errors,
      })

    const product = {
      code,
      description: String(body!.description).trim(),
      minAmount,
      maxAmount,
      minTermDays: Number(body?.minTermDays ?? 180),
      maxTermDays: Number(body?.maxTermDays ?? 1080),
      notarialFee: Number(body?.notarialFee ?? 0),
      docStampFee: Number(body?.docStampFee ?? 0),
      insuranceFee: Number(body?.insuranceFee ?? 0),
      advanceInterestRate: Number(body?.advanceInterestRate ?? 0),
      applicationChargeRate: Number(body?.applicationChargeRate ?? 0.01),
      amortizationMode: String(body?.amortizationMode ?? "Annuity"),
      chargeAdvanceInterest: Boolean(body?.chargeAdvanceInterest),
      isRetired: false,
      lastSyncedAt: new Date().toISOString(),
      defaultAnnualRatePercent: Number(body?.defaultAnnualRatePercent ?? 12),
    }
    db().products.push(product)
    return noStoreJson(product, { status: 201 })
  }),

  http.put("*/api/loan-products/:code", async ({ params, request }) => {
    await delay(280)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (!hasPerm(actor, "loan_product.manage"))
      return problem(
        403,
        "Forbidden",
        "Only administrators can manage loan products."
      )
    const product = db().products.find(
      (candidate) => candidate.code === String(params.code).toUpperCase()
    )
    if (!product)
      return problem(
        404,
        "Product not found",
        `No product matches "${params.code}".`
      )

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (!body)
      return problem(400, "Validation failed", "A request body is required.")
    // Explicit, type-checked field patching (no dynamic casts).
    if (typeof body.description === "string" && body.description.trim()) product.description = body.description.trim()
    if (typeof body.minAmount === "number" && body.minAmount > 0) product.minAmount = body.minAmount
    if (typeof body.maxAmount === "number" && body.maxAmount > product.minAmount) product.maxAmount = body.maxAmount
    if (typeof body.minTermDays === "number" && body.minTermDays >= 30) product.minTermDays = body.minTermDays
    if (typeof body.maxTermDays === "number" && body.maxTermDays > product.minTermDays) product.maxTermDays = body.maxTermDays
    if (typeof body.notarialFee === "number" && body.notarialFee >= 0) product.notarialFee = body.notarialFee
    if (typeof body.docStampFee === "number" && body.docStampFee >= 0) product.docStampFee = body.docStampFee
    if (typeof body.insuranceFee === "number" && body.insuranceFee >= 0) product.insuranceFee = body.insuranceFee
    if (typeof body.advanceInterestRate === "number" && body.advanceInterestRate >= 0) product.advanceInterestRate = body.advanceInterestRate
    if (typeof body.applicationChargeRate === "number" && body.applicationChargeRate >= 0) product.applicationChargeRate = body.applicationChargeRate
    if (typeof body.amortizationMode === "string" && body.amortizationMode) product.amortizationMode = body.amortizationMode
    if (typeof body.chargeAdvanceInterest === "boolean") product.chargeAdvanceInterest = body.chargeAdvanceInterest
    if (typeof body.isRetired === "boolean") product.isRetired = body.isRetired
    if (typeof body.defaultAnnualRatePercent === "number" && body.defaultAnnualRatePercent >= 0) product.defaultAnnualRatePercent = body.defaultAnnualRatePercent
    product.lastSyncedAt = new Date().toISOString()
    return noStoreJson(product)
  }),

  // -------------------------------------------------------- approval authorities
  http.get("*/api/approval-authorities", async ({ request }) => {
    await delay(180)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (
      !hasPerm(actor, "approval.manage") &&
      !hasPerm(actor, "workflow.manage") &&
      !hasPerm(actor, "loans.approve")
    ) {
      return problem(403, "Forbidden", "Not allowed.")
    }
    const items = db().approvalAuthorities.map((authority) => ({
      key: authority.key,
      displayName: authority.displayName,
      tier: authority.tier,
      priority: authority.priority,
      allowNew: authority.allowNew,
      allowRenewal: authority.allowRenewal,
      maxSeverity: authority.maxSeverity,
      maxTotalExposure: authority.maxTotalExposure,
      scopeType: authority.scopeType,
      assignedUsers: authority.assignedUserIds
        .map((id) => findUser(db(), id))
        .filter((user): user is MockUserRecord => user != null)
        .map((user) => ({ userId: user.id, name: userName(user) })),
    }))
    return noStoreJson({ items })
  }),

  http.put("*/api/approval-authorities/:key", async ({ params, request }) => {
    await delay(280)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (
      !hasPerm(actor, "approval.manage") &&
      !hasPerm(actor, "workflow.manage")
    ) {
      return problem(
        403,
        "Forbidden",
        "Only administrators can change approval authorities."
      )
    }
    const authority = db().approvalAuthorities.find(
      (candidate) => candidate.key === String(params.key)
    )
    if (!authority)
      return problem(
        404,
        "Authority not found",
        `No authority matches "${params.key}".`
      )

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (!body)
      return problem(400, "Validation failed", "A request body is required.")
    if (typeof body.maxTotalExposure === "number") {
      if (body.maxTotalExposure <= 0)
        return problem(
          400,
          "Validation failed",
          "Exposure limit must be positive."
        )
      authority.maxTotalExposure = body.maxTotalExposure
    }
    if (
      typeof body.maxSeverity === "number" &&
      [0, 1, 2].includes(body.maxSeverity)
    ) {
      authority.maxSeverity = body.maxSeverity as 0 | 1 | 2
    }
    if (typeof body.allowNew === "boolean") authority.allowNew = body.allowNew
    if (typeof body.allowRenewal === "boolean")
      authority.allowRenewal = body.allowRenewal
    return noStoreJson(authority)
  }),

  http.put(
    "*/api/approval-authorities/:key/users",
    async ({ params, request }) => {
      await delay(280)
      const actor = resolveActor(request)
      if (!actor) return problem(401, "Unauthorized", "Sign in first.")
      if (
        !hasPerm(actor, "approval.manage") &&
        !hasPerm(actor, "workflow.manage")
      ) {
        return problem(
          403,
          "Forbidden",
          "Only administrators can assign approvers."
        )
      }
      const authority = db().approvalAuthorities.find(
        (candidate) => candidate.key === String(params.key)
      )
      if (!authority)
        return problem(
          404,
          "Authority not found",
          `No authority matches "${params.key}".`
        )

      const body = (await request.json().catch(() => null)) as {
        userIds?: string[]
      } | null
      if (!Array.isArray(body?.userIds))
        return problem(400, "Validation failed", "userIds must be an array.")
      const invalid = body!.userIds.filter((id) => {
        const user = findUser(db(), id)
        return !user || user.role !== "Approver"
      })
      if (invalid.length) {
        return problem(
          400,
          "Validation failed",
          "Only active users with the Approver role can hold approval authority.",
          {
            errors: { userIds: [`Not approvers: ${invalid.join(", ")}`] },
          }
        )
      }
      authority.assignedUserIds = body!.userIds
      return noStoreJson(authority)
    }
  ),

  // ----------------------------------------------------------- deviation catalog
  http.get("*/api/deviation-catalog", async ({ request }) => {
    await delay(120)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    return noStoreJson({ items: db().deviationCatalog })
  }),
]
