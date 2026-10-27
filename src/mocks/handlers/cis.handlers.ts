import { delay, http } from "msw"
import { db } from "../db"
import { noStoreJson, problem, resolveActor } from "../handler-utils"

/**
 * CIS / WebLoan client lookups used by the encoder during application entry.
 * Read-only data from the authoritative client system.
 */
export const cisHandlers = [
  http.get("*/api/cis/clients", async ({ request }) => {
    await delay(200)
    const actor = resolveActor(request)
    if (!actor)
      return problem(401, "Unauthorized", "Sign in to search clients.")

    const url = new URL(request.url)
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase()
    if (!search) {
      return noStoreJson({ items: [], totalCount: 0 })
    }

    const items = db()
      .cisClients.filter((client) =>
        [
          client.cisNo,
          client.firstName,
          client.lastName,
          `${client.firstName} ${client.lastName}`,
          client.employeeNumber,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)
      )
      .map((client) => ({
        cisNo: client.cisNo,
        name: `${client.lastName}, ${client.firstName}${client.suffix ? ` ${client.suffix}` : ""}`,
        agency: client.agency,
        positionTitle: client.positionTitle,
        employeeNumber: client.employeeNumber,
        accountCount: client.accounts.length,
      }))

    return noStoreJson({ items, totalCount: items.length })
  }),

  http.get("*/api/cis/clients/:cisNo", async ({ params, request }) => {
    await delay(250)
    const actor = resolveActor(request)
    if (!actor)
      return problem(401, "Unauthorized", "Sign in to view client details.")

    const client = db().cisClients.find((c) => c.cisNo === params.cisNo)
    if (!client) {
      return problem(
        404,
        "Client not found",
        `No CIS record matches ${params.cisNo}.`
      )
    }

    return noStoreJson({
      borrower: {
        cisNo: client.cisNo,
        firstName: client.firstName,
        middleName: client.middleName,
        lastName: client.lastName,
        suffix: client.suffix,
        birthDate: client.birthDate,
        address: client.address,
        agencyType: client.agencyType,
        agency: client.agency,
        positionTitle: client.positionTitle,
        employeeNumber: client.employeeNumber,
        netTakeHomePay: client.netTakeHomePay,
        lengthOfService: client.lengthOfService,
        region: client.region,
        misAgency: client.misAgency,
        maritalStatus: client.maritalStatus,
      },
      accounts: client.accounts,
    })
  }),

  http.get(
    "*/api/cis/clients/:cisNo/outstanding",
    async ({ params, request }) => {
      await delay(250)
      const actor = resolveActor(request)
      if (!actor)
        return problem(401, "Unauthorized", "Sign in to view obligations.")

      const client = db().cisClients.find((c) => c.cisNo === params.cisNo)
      if (!client) {
        return problem(
          404,
          "Client not found",
          `No CIS record matches ${params.cisNo}.`
        )
      }

      const url = new URL(request.url)
      const accountNo =
        url.searchParams.get("accountNo") ?? client.accounts[0]?.accountNo ?? ""

      return noStoreJson({
        cisNo: client.cisNo,
        accountNo,
        loans: client.outstanding,
      })
    }
  ),
]
