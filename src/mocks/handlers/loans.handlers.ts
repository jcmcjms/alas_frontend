import { delay, http } from "msw"
import {
  changeStatus,
  db,
  disbursementView,
  findLoan,
  findUser,
  nextGroupNo,
  nextLamId,
  pushHistory,
  pushNotification,
  recomputeLoan,
  userName,
  computeRouting,
} from "../db"
import {
  boolParam,
  intParam,
  isFileLike,
  noStoreJson,
  paginate,
  problem,
  resolveActor,
  hasPerm,
} from "../handler-utils"
import { getMockScenario } from "../scenarios"
import {
  DOCUMENT_TEMPLATE,
  MOCK_DEVIATION_CATALOG,
} from "../fixtures/base-data"
import type { DbLoan } from "../db"
import type {
  LoanListRow,
  LoanDetail,
} from "@/features/loans/types/loan-contracts"
import { CANCELLABLE_STATUSES } from "@/features/loans/types/loan-status"

function toListRow(loan: DbLoan): LoanListRow {
  return {
    id: loan.id,
    lamId: loan.lamId,
    applicationGroupNo: loan.applicationGroupNo,
    clientName: `${loan.client.firstName} ${loan.client.lastName}`,
    branchCode: loan.branchCode,
    productCode: loan.productCode,
    product: loan.product,
    loanType: loan.loanType,
    proposedAmount: loan.proposedAmount,
    termDays: loan.termDays,
    status: loan.status,
    applicationDate: loan.applicationDate,
    lastActionDate: loan.lastActionDate,
    lastActionBy: loan.history.length
      ? loan.history[loan.history.length - 1].actionByUserName
      : null,
    assignedTo: loan.ownerUserId
      ? findUser(db(), loan.ownerUserId)
        ? userName(findUser(db(), loan.ownerUserId)!)
        : null
      : null,
    documentsComplete: loan.documentsComplete,
    flagged:
      loan.documentFlag != null ||
      loan.documents.some((doc) => doc.status === "Missing"),
    disbursementDeadlineUtc: loan.disbursement.deadlineUtc,
  }
}

function toDetail(loan: DbLoan): LoanDetail {
  const routing = computeRouting(db(), loan)
  return {
    id: loan.id,
    lamId: loan.lamId,
    applicationGroupNo: loan.applicationGroupNo,
    branchCode: loan.branchCode,
    loanNo: loan.loanNo,
    productCode: loan.productCode,
    product: loan.product,
    loanType: loan.loanType,
    status: loan.status,
    rowVersion: loan.rowVersion,
    client: { ...loan.client },
    purpose: loan.purpose,
    proposedAmount: loan.proposedAmount,
    termDays: loan.termDays,
    annualRatePercent: loan.annualRatePercent,
    computed: { ...loan.computed },
    obligations: structuredClone(loan.obligations),
    deviations: structuredClone(loan.deviations),
    documents: structuredClone(loan.documents),
    documentsComplete: loan.documentsComplete,
    documentFlag: loan.documentFlag ? { ...loan.documentFlag } : null,
    routing,
    signatures: structuredClone(loan.signatures),
    disbursement: disbursementView(loan),
    remarks: loan.remarks,
    evaluationVerdict: loan.evaluationVerdict,
    createdById: loan.createdById,
    createdByName: loan.createdByName,
    applicationDate: loan.applicationDate,
    lastActionDate: loan.lastActionDate,
    history: structuredClone(loan.history),
  }
}

export const loansHandlers = [
  // --- document checklist template -------------------------------------------
  http.get("*/api/document-template", async ({ request }) => {
    await delay(100)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    return noStoreJson({ items: DOCUMENT_TEMPLATE })
  }),

  // --- count by status (used by the workflow-settings impact warning) -------
  http.get("*/api/loans/count", async ({ request }) => {
    await delay(120)
    const actor = resolveActor(request)
    if (!actor || !hasPerm(actor, "loans.view"))
      return problem(403, "Forbidden", "Not allowed.")
    const url = new URL(request.url)
    const status = url.searchParams.get("status")
    const totalCount = status
      ? db().loans.filter((loan) => loan.status === status).length
      : db().loans.length
    return noStoreJson({ totalCount })
  }),

  // --- paged list -----------------------------------------------------------
  http.get("*/api/loans", async ({ request }) => {
    const scenario = getMockScenario()
    await delay(scenario === "slow" ? 2500 : 220)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in to view loans.")
    if (!hasPerm(actor, "loans.view"))
      return problem(403, "Forbidden", "Not allowed to view loans.")

    const url = new URL(request.url)
    const page = intParam(url, "page", 1)
    const pageSize = intParam(url, "pageSize", 20)
    const status = url.searchParams.get("status") ?? undefined
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase()
    const dateFrom = url.searchParams.get("dateFrom") ?? undefined
    const dateTo = url.searchParams.get("dateTo") ?? undefined
    const flagged = boolParam(url, "flagged")
    const mine = boolParam(url, "mine")
    const group = url.searchParams.get("group") ?? undefined

    let items = db().loans.map(toListRow)
    if (status) {
      const statuses = status.split(",").filter(Boolean)
      items = items.filter((loan) => statuses.includes(loan.status))
    }
    if (group) items = items.filter((loan) => loan.applicationGroupNo === group)
    if (search) {
      items = items.filter((loan) =>
        [
          loan.lamId,
          loan.clientName,
          loan.applicationGroupNo,
          loan.product,
          loan.productCode,
          loan.branchCode,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)
      )
    }
    if (dateFrom)
      items = items.filter(
        (loan) => loan.applicationDate.slice(0, 10) >= dateFrom
      )
    if (dateTo)
      items = items.filter(
        (loan) => loan.applicationDate.slice(0, 10) <= dateTo
      )
    if (flagged !== undefined)
      items = items.filter((loan) => loan.flagged === flagged)
    if (mine) {
      items = items.filter((loan) => {
        const dbLoan = findLoan(db(), loan.id)
        return (
          dbLoan?.createdById === actor.id || dbLoan?.ownerUserId === actor.id
        )
      })
    }
    items.sort((a, b) => b.lastActionDate.localeCompare(a.lastActionDate))

    return noStoreJson(paginate(items, page, pageSize))
  }),

  // --- create (submit a group of applications) ------------------------------
  http.post("*/api/loans", async ({ request }) => {
    const scenario = getMockScenario()
    await delay(scenario === "slow" ? 2600 : 350)
    if (scenario === "mutation-failure") {
      return problem(
        500,
        "Submission failed",
        "The loan service rejected the submission. No data was saved — please retry."
      )
    }
    const actor = resolveActor(request)
    if (!actor)
      return problem(401, "Unauthorized", "Sign in to create applications.")
    if (!hasPerm(actor, "loans.create"))
      return problem(403, "Forbidden", "Not allowed to create applications.")

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (!body)
      return problem(400, "Validation failed", "A request body is required.")

    const errors: Record<string, string[]> = {}
    const cisNo = String(body.cisNo ?? "")
    const accountNo = String(body.accountNo ?? "")
    const branchCode = String(body.branchCode ?? "")
    const loanType = body.loanType === "Reloan" ? "Reloan" : "New"
    const loans = Array.isArray(body.loans)
      ? (body.loans as Record<string, unknown>[])
      : []
    const client = body.client as Record<string, unknown> | undefined

    if (!db().cisClients.some((c) => c.cisNo === cisNo))
      errors.cisNo = ["Unknown CIS client."]
    if (!db().branches.some((b) => b.code === branchCode))
      errors.branchCode = ["Unknown branch."]
    if (!client?.firstName || !client?.lastName)
      errors.client = ["Client identity is required."]
    if (loans.length === 0)
      errors.loans = ["At least one loan line is required."]
    loans.forEach((line, index) => {
      const prod = db().products.find((p) => p.code === line.productCode)
      if (!prod || prod.isRetired) {
        errors[`loans[${index}].productCode`] = ["Unknown or retired product."]
        return
      }
      const amount = Number(line.proposedAmount)
      const termDays = Number(line.termDays)
      if (
        !Number.isFinite(amount) ||
        amount < prod.minAmount ||
        amount > prod.maxAmount
      ) {
        errors[`loans[${index}].proposedAmount`] = [
          `Amount must be between ₱${prod.minAmount.toLocaleString()} and ₱${prod.maxAmount.toLocaleString()}.`,
        ]
      }
      if (amount % 100 !== 0) {
        errors[`loans[${index}].proposedAmount`] = [
          ...(errors[`loans[${index}].proposedAmount`] ?? []),
          "Amount must be in whole hundreds of pesos.",
        ]
      }
      if (
        !Number.isFinite(termDays) ||
        termDays < prod.minTermDays ||
        termDays > prod.maxTermDays
      ) {
        errors[`loans[${index}].termDays`] = [
          `Term must be between ${prod.minTermDays} and ${prod.maxTermDays} days.`,
        ]
      }
      if (!line.purpose || String(line.purpose).trim().length < 4) {
        errors[`loans[${index}].purpose`] = [
          "Purpose is required (min 4 characters).",
        ]
      }
    })
    if (Object.keys(errors).length > 0) {
      return problem(400, "Validation failed", "Some fields need attention.", {
        errors,
      })
    }

    // Idempotency: a retried submit with the same key returns the first result.
    const idempotencyKey =
      request.headers.get("Idempotency-Key") ??
      String(body.idempotencyKey ?? "")
    if (idempotencyKey && db().idempotency.has(idempotencyKey)) {
      const existing = db().idempotency.get(idempotencyKey)!
      return noStoreJson(
        {
          applicationGroupNo: existing.applicationGroupNo,
          loans: existing.loanIds.map((id) => {
            const loan = findLoan(db(), id)!
            return {
              id: loan.id,
              lamId: loan.lamId,
              productCode: loan.productCode,
              product: loan.product,
              proposedAmount: loan.proposedAmount,
              status: loan.status,
            }
          }),
        },
        { status: 200 }
      )
    }

    const state = db()
    const groupNo = nextGroupNo(state)
    // The BACKEND decides the initial status from the workflow configuration.
    const initialStatus = state.workflowConfig.requireRecommendation
      ? "ForRecommendation"
      : "ForChecking"
    const now = new Date().toISOString()
    // Documents the encoder physically holds at encoding time; the rest start
    // as Missing and drive the incomplete-documents flow.
    const documentsHeld = Array.isArray(body.documentsHeld)
      ? (body.documentsHeld as string[])
      : DOCUMENT_TEMPLATE.map((doc) => doc.code)

    const created = loans.map((line) => {
      const prod = state.products.find((p) => p.code === line.productCode)!
      const loan: DbLoan = {
        id: String(1000 + state.loans.length + 1),
        lamId: nextLamId(state),
        applicationGroupNo: groupNo,
        branchCode,
        loanNo: null,
        productCode: prod.code,
        product: prod.description,
        loanType,
        status: initialStatus,
        rowVersion: "2",
        client: {
          cisNo,
          accountNo,
          firstName: String(client!.firstName ?? ""),
          middleName: (client!.middleName as string | null) ?? null,
          lastName: String(client!.lastName ?? ""),
          suffix: (client!.suffix as string | null) ?? null,
          birthDate: (client!.birthDate as string | null) ?? null,
          address: (client!.address as string | null) ?? null,
          agency: (client!.agency as string | null) ?? null,
          positionTitle: (client!.positionTitle as string | null) ?? null,
          employeeNumber: (client!.employeeNumber as string | null) ?? null,
          netTakeHomePay: (client!.netTakeHomePay as number | null) ?? null,
          lengthOfService: (client!.lengthOfService as string | null) ?? null,
        },
        purpose: String(line.purpose ?? ""),
        proposedAmount: Number(line.proposedAmount),
        termDays: Number(line.termDays),
        annualRatePercent: Number(
          line.annualRatePercent ?? prod.defaultAnnualRatePercent
        ),
        computed: {
          termMonths: 0,
          monthlyAmortization: 0,
          applicationCharge: 0,
          notarialFee: prod.notarialFee,
          docStampFee: prod.docStampFee,
          insuranceFee: prod.insuranceFee,
          totalUpfrontDeductions: 0,
          netProceeds: 0,
        },
        obligations: structuredClone(
          (body.obligations as DbLoan["obligations"]) ?? {
            outstandingLoans: [],
            buyOuts: [],
            ebiReloans: [],
            incomingLoans: [],
            totalMonthlyObligations: 0,
          }
        ),
        deviations: (Array.isArray(line.deviations)
          ? (line.deviations as { code: string; justification: string }[])
          : []
        )
          .map((deviation, index) => {
            const catalogEntry = MOCK_DEVIATION_CATALOG.find(
              (entry) => entry.code === deviation.code
            )
            if (!catalogEntry) return null
            return {
              id: `dev-${Date.now()}-${index}`,
              code: catalogEntry.code,
              reasonText: catalogEntry.reasonText,
              encoderJustification: deviation.justification,
              isFeeOverride: catalogEntry.isFeeOverride,
              severity: catalogEntry.severity,
              remarks: [],
            }
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry != null),
        documents: DOCUMENT_TEMPLATE.map((doc) => {
          const held = documentsHeld.includes(doc.code)
          return {
            code: doc.code,
            name: doc.name,
            status: held ? ("Uploaded" as const) : ("Missing" as const),
            uploadedAt: held ? now : null,
            uploadedBy: held ? userName(actor) : null,
            contentType: held ? "image/png" : null,
            sizeBytes: held ? 200_000 : null,
          }
        }),
        documentsComplete: documentsHeld.length >= DOCUMENT_TEMPLATE.length,
        documentFlag: null,
        remarks: null,
        evaluationVerdict: null,
        createdById: actor.id,
        createdByName: userName(actor),
        applicationDate: now,
        lastActionDate: now,
        enqueuedAt: now,
        ownerUserId: null,
        history: [],
        revisionRequests: [],
        signatures: [],
        disbursement: {
          approvedAt: null,
          deadlineUtc: null,
          disbursedAt: null,
          disbursedBy: null,
          disbursementReference: null,
          voidedAt: null,
          voidReason: null,
        },
      }
      recomputeLoan(loan, state)
      pushHistory(
        loan,
        {
          action: "Submit",
          fromStatus: null,
          toStatus: initialStatus,
          comments: `Group ${groupNo} submitted with ${loans.length} application(s).`,
          actionDate: now,
          actionByUserName: userName(actor),
          actionByRole: actor.role,
        },
        state
      )
      state.loans.push(loan)
      return loan
    })

    if (idempotencyKey) {
      state.idempotency.set(idempotencyKey, {
        applicationGroupNo: groupNo,
        loanIds: created.map((loan) => loan.id),
      })
    }

    // Notify the desk that now owns the first stage.
    const targetRole =
      initialStatus === "ForRecommendation" ? "Recommender" : "Evaluator"
    for (const user of state.users.filter(
      (u) => u.role === targetRole && u.isActive
    )) {
      pushNotification(
        state,
        user.id,
        `New application${created.length > 1 ? "s" : ""} for ${targetRole.toLowerCase()}`,
        `${userName(actor)} submitted group ${groupNo} (${created.length} application${created.length > 1 ? "s" : ""}) for ${created[0].client.firstName} ${created[0].client.lastName}.`,
        "workflow",
        "/review-desk"
      )
    }

    return noStoreJson(
      {
        applicationGroupNo: groupNo,
        loans: created.map((loan) => ({
          id: loan.id,
          lamId: loan.lamId,
          productCode: loan.productCode,
          product: loan.product,
          proposedAmount: loan.proposedAmount,
          status: loan.status,
        })),
      },
      { status: 201 }
    )
  }),

  // --- detail, history, routing, checklist ----------------------------------
  http.get("*/api/loans/:id", async ({ params, request }) => {
    await delay(200)
    const actor = resolveActor(request)
    if (!actor)
      return problem(401, "Unauthorized", "Sign in to view this application.")
    if (!hasPerm(actor, "loans.view"))
      return problem(403, "Forbidden", "Not allowed to view loans.")

    const loan = findLoan(db(), String(params.id))
    if (!loan)
      return problem(
        404,
        "Application not found",
        `No application matches "${params.id}".`
      )
    return noStoreJson(toDetail(loan))
  }),

  http.get("*/api/loans/:id/history", async ({ params, request }) => {
    await delay(150)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const loan = findLoan(db(), String(params.id))
    if (!loan)
      return problem(
        404,
        "Application not found",
        `No application matches "${params.id}".`
      )
    return noStoreJson([...loan.history].reverse())
  }),

  http.get("*/api/loans/:id/routing", async ({ params, request }) => {
    await delay(150)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const loan = findLoan(db(), String(params.id))
    if (!loan)
      return problem(
        404,
        "Application not found",
        `No application matches "${params.id}".`
      )
    return noStoreJson(computeRouting(db(), loan))
  }),

  http.get("*/api/loans/:id/checklist", async ({ params, request }) => {
    await delay(140)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const loan = findLoan(db(), String(params.id))
    if (!loan)
      return problem(
        404,
        "Application not found",
        `No application matches "${params.id}".`
      )
    return noStoreJson({
      documents: loan.documents,
      documentsComplete: loan.documentsComplete,
      documentFlag: loan.documentFlag,
    })
  }),

  http.get("*/api/loans/:id/signature-chain", async ({ params, request }) => {
    await delay(120)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const loan = findLoan(db(), String(params.id))
    if (!loan)
      return problem(
        404,
        "Application not found",
        `No application matches "${params.id}".`
      )
    return noStoreJson({ signatures: loan.signatures })
  }),

  // --- document upload / removal --------------------------------------------
  http.post("*/api/loans/:id/documents/:code", async ({ params, request }) => {
    await delay(400)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (!hasPerm(actor, "loans.revise")) {
      return problem(
        403,
        "Forbidden",
        "Only encoders and reviewers may upload documents."
      )
    }
    const loan = findLoan(db(), String(params.id))
    if (!loan)
      return problem(
        404,
        "Application not found",
        `No application matches "${params.id}".`
      )

    const doc = loan.documents.find((d) => d.code === String(params.code))
    if (!doc)
      return problem(
        404,
        "Document not found",
        `Unknown checklist code "${params.code}".`
      )

    const formData = await request.formData().catch(() => null)
    const file = formData?.get("file")
    if (!isFileLike(file)) {
      return problem(
        400,
        "Validation failed",
        'A file part named "file" is required.'
      )
    }
    if (
      file.type !== "image/png" &&
      file.type !== "application/pdf" &&
      file.type !== "image/jpeg"
    ) {
      return problem(
        415,
        "Unsupported file type",
        "Upload a PNG, JPEG or PDF file."
      )
    }
    if (file.size > 5 * 1024 * 1024) {
      return problem(
        413,
        "File too large",
        "Documents must be 5 MB or smaller."
      )
    }

    doc.status = "Uploaded"
    doc.uploadedAt = new Date().toISOString()
    doc.uploadedBy = userName(actor)
    doc.contentType = file.type
    doc.sizeBytes = file.size
    loan.documentsComplete = loan.documents.every((d) => d.status !== "Missing")
    if (loan.documentsComplete) loan.documentFlag = null
    loan.rowVersion = String(Number(loan.rowVersion) + 1)

    pushHistory(
      loan,
      {
        action: "UploadDocument",
        fromStatus: loan.status,
        toStatus: loan.status,
        comments: `${doc.name} (${file.name})`,
        actionDate: new Date().toISOString(),
        actionByUserName: userName(actor),
        actionByRole: actor.role,
      },
      db()
    )
    return noStoreJson({
      documents: loan.documents,
      documentsComplete: loan.documentsComplete,
      documentFlag: loan.documentFlag,
    })
  }),

  http.delete(
    "*/api/loans/:id/documents/:code",
    async ({ params, request }) => {
      await delay(200)
      const actor = resolveActor(request)
      if (!actor) return problem(401, "Unauthorized", "Sign in first.")
      if (!hasPerm(actor, "loans.revise"))
        return problem(403, "Forbidden", "Not allowed.")
      const loan = findLoan(db(), String(params.id))
      if (!loan)
        return problem(
          404,
          "Application not found",
          `No application matches "${params.id}".`
        )
      const doc = loan.documents.find((d) => d.code === String(params.code))
      if (!doc)
        return problem(
          404,
          "Document not found",
          `Unknown checklist code "${params.code}".`
        )
      doc.status = "Missing"
      doc.uploadedAt = null
      doc.uploadedBy = null
      doc.contentType = null
      doc.sizeBytes = null
      loan.documentsComplete = false
      loan.rowVersion = String(Number(loan.rowVersion) + 1)
      return noStoreJson({
        documents: loan.documents,
        documentsComplete: loan.documentsComplete,
      })
    }
  ),

  // --- revision requests + resubmission ---------------------------------------
  http.get("*/api/loans/:id/revision-requests", async ({ params, request }) => {
    await delay(140)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const loan = findLoan(db(), String(params.id))
    if (!loan)
      return problem(
        404,
        "Application not found",
        `No application matches "${params.id}".`
      )
    return noStoreJson({ items: loan.revisionRequests })
  }),

  http.post("*/api/loans/:id/revise", async ({ params, request }) => {
    const scenario = getMockScenario()
    await delay(scenario === "slow" ? 2500 : 350)
    if (scenario === "mutation-failure") {
      return problem(
        500,
        "Resubmission failed",
        "The loan service could not save the correction. Your changes were not lost — retry the resubmission."
      )
    }
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (!hasPerm(actor, "loans.revise"))
      return problem(403, "Forbidden", "Not allowed to revise applications.")

    const loan = findLoan(db(), String(params.id))
    if (!loan)
      return problem(
        404,
        "Application not found",
        `No application matches "${params.id}".`
      )
    if (
      loan.status !== "ForRevision" &&
      loan.status !== "ForIncompleteDocuments"
    ) {
      return problem(
        409,
        "Invalid transition",
        `This application is "${loan.status}" and cannot be resubmitted right now.`
      )
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (
      !body ||
      typeof body.resolutionNotes !== "string" ||
      body.resolutionNotes.trim().length < 10
    ) {
      return problem(
        400,
        "Validation failed",
        "Resolution notes of at least 10 characters are required.",
        {
          errors: {
            resolutionNotes: [
              "Describe what was corrected (min 10 characters).",
            ],
          },
        }
      )
    }
    if (
      typeof body.rowVersion === "string" &&
      body.rowVersion !== loan.rowVersion
    ) {
      return problem(
        409,
        "Concurrent update",
        "This application changed since you opened it. Reload it and re-apply your correction.",
        {
          rowVersion: loan.rowVersion,
        }
      )
    }

    // Apply the corrected fields (all optional; absent fields keep their value).
    if (typeof body.purpose === "string" && body.purpose.trim())
      loan.purpose = body.purpose.trim()
    if (typeof body.proposedAmount === "number")
      loan.proposedAmount = body.proposedAmount
    if (typeof body.termDays === "number") loan.termDays = body.termDays
    if (typeof body.annualRatePercent === "number")
      loan.annualRatePercent = body.annualRatePercent
    if (Array.isArray(body.deviations)) {
      loan.deviations = (
        body.deviations as { code: string; justification: string }[]
      )
        .map((deviation, index) => {
          const catalogEntry = MOCK_DEVIATION_CATALOG.find(
            (entry) => entry.code === deviation.code
          )
          if (!catalogEntry) return null
          return {
            id: `dev-${Date.now()}-${index}`,
            code: catalogEntry.code,
            reasonText: catalogEntry.reasonText,
            encoderJustification: deviation.justification,
            isFeeOverride: catalogEntry.isFeeOverride,
            severity: catalogEntry.severity,
            remarks: [],
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    }
    recomputeLoan(loan, db())

    // Resubmission returns to the stage that issued the return — the backend
    // decides this from the open revision request, never an arbitrary reset.
    const openRequests = loan.revisionRequests.filter(
      (revision) => !revision.isResolved
    )
    const target = openRequests.length
      ? openRequests[openRequests.length - 1].fromStatus
      : loan.documentFlag
        ? "ForChecking"
        : "ForChecking"
    for (const revision of openRequests) {
      revision.isResolved = true
      revision.resolvedAt = new Date().toISOString()
    }
    if (loan.status === "ForIncompleteDocuments") {
      loan.documentFlag = null
    }
    loan.enqueuedAt = new Date().toISOString()
    loan.ownerUserId = null
    changeStatus(
      db(),
      loan,
      "Resubmit",
      target,
      { name: userName(actor), role: actor.role },
      body.resolutionNotes.trim()
    )

    const reviewerRole =
      target === "ForRecommendation" ? "Recommender" : "Evaluator"
    for (const user of db().users.filter(
      (u) => u.role === reviewerRole && u.isActive
    )) {
      pushNotification(
        db(),
        user.id,
        "Corrected application resubmitted",
        `${loan.lamId} (${loan.client.firstName} ${loan.client.lastName}) was corrected and returned to ${reviewerRole} review.`,
        "workflow",
        "/review-desk"
      )
    }
    return noStoreJson(toDetail(loan))
  }),

  // --- cancel (encoder-owned, pre-decision statuses only) ---------------------
  http.post("*/api/loans/:id/cancel", async ({ params, request }) => {
    await delay(250)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const loan = findLoan(db(), String(params.id))
    if (!loan)
      return problem(
        404,
        "Application not found",
        `No application matches "${params.id}".`
      )
    if (loan.createdById !== actor.id && actor.role !== "Admin") {
      return problem(
        403,
        "Forbidden",
        "Only the encoding officer may cancel this application."
      )
    }
    if (!CANCELLABLE_STATUSES.includes(loan.status)) {
      return problem(
        409,
        "Invalid transition",
        `A "${loan.status}" application can no longer be cancelled.`
      )
    }
    const body = (await request.json().catch(() => null)) as {
      reason?: string
    } | null
    changeStatus(
      db(),
      loan,
      "Cancel",
      "Cancelled",
      { name: userName(actor), role: actor.role },
      body?.reason ?? "Client withdrew the application."
    )
    return noStoreJson(toDetail(loan))
  }),
]

export { toDetail, toListRow }
