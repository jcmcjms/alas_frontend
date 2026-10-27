import { describe, expect, it } from "vitest"

import { queryKeys } from "./keys"

describe("query key registry", () => {
  it("includes every parameter that affects a list result", () => {
    const a = queryKeys.loans.list({
      page: 1,
      pageSize: 20,
      status: "ForApproval",
    })
    const b = queryKeys.loans.list({
      page: 2,
      pageSize: 20,
      status: "ForApproval",
    })
    const c = queryKeys.loans.list({
      page: 1,
      pageSize: 20,
      status: "ForChecking",
    })
    expect(a).not.toEqual(b)
    expect(a).not.toEqual(c)
    expect(a).toEqual([
      "loans",
      "list",
      { page: 1, pageSize: 20, status: "ForApproval" },
    ])
  })

  it("nests detail keys under the loans namespace for targeted invalidation", () => {
    const detail = queryKeys.loans.detail("1004")
    expect(detail).toEqual(["loans", "detail", "1004"])
    expect(detail[0]).toBe(queryKeys.loans.all[0])
  })

  it("separates desks per officer identity so invalidation can target one desk", () => {
    expect(queryKeys.loans.desk("eval-01")).not.toEqual(
      queryKeys.loans.desk("app-01")
    )
    expect(queryKeys.loans.desk("eval-01")).toEqual(["loans", "desk", "eval-01"])
  })

  it("keeps account, workflow and notification namespaces distinct", () => {
    expect(queryKeys.account.profile[0]).toBe("account")
    expect(queryKeys.workflow.configuration[0]).toBe("workflow")
    expect(queryKeys.notifications.all[0]).toBe("notifications")
    expect(queryKeys.dashboard.all[0]).toBe("dashboard")
  })

  it("versions notification inbox keys by identity and filter", () => {
    expect(
      queryKeys.notifications.inbox("enc-01", {
        page: 1,
        pageSize: 5,
        status: "unread",
      })
    ).not.toEqual(
      queryKeys.notifications.inbox("enc-01", {
        page: 1,
        pageSize: 5,
        status: "all",
      })
    )
    // Different users never share an inbox cache entry.
    expect(
      queryKeys.notifications.inbox("enc-01", { page: 1, pageSize: 5, status: "all" })
    ).not.toEqual(
      queryKeys.notifications.inbox("enc-02", { page: 1, pageSize: 5, status: "all" })
    )
  })

  it("produces readonly tuple keys (serializable, stable)", () => {
    const key = queryKeys.admin.users({ page: 1, search: "ana" })
    expect(JSON.parse(JSON.stringify(key))).toEqual([
      "admin",
      "users",
      { page: 1, search: "ana" },
    ])
  })
})
