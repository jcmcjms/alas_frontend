import { delay, http } from "msw"
import { db } from "../db"
import { intParam, noStoreJson, problem, resolveActor } from "../handler-utils"

export const notificationHandlers = [
  http.get("*/api/notifications", async ({ request }) => {
    await delay(160)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")

    const url = new URL(request.url)
    const page = intParam(url, "page", 1)
    const pageSize = intParam(url, "pageSize", 10)
    const status = url.searchParams.get("status") ?? "all"

    let items = db()
      .notifications.filter((notification) => notification.userId === actor.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (status === "unread")
      items = items.filter((notification) => notification.readAt == null)
    if (status === "read")
      items = items.filter((notification) => notification.readAt != null)

    const unreadCount = db().notifications.filter(
      (notification) =>
        notification.userId === actor.id && notification.readAt == null
    ).length
    const paged = items.slice((page - 1) * pageSize, page * pageSize)

    return noStoreJson({
      items: paged,
      totalCount: items.length,
      unreadCount,
      page,
      pageSize,
    })
  }),

  http.post("*/api/notifications/:id/read", async ({ params, request }) => {
    await delay(120)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    const notification = db().notifications.find(
      (candidate) =>
        candidate.id === String(params.id) && candidate.userId === actor.id
    )
    if (!notification)
      return problem(
        404,
        "Notification not found",
        "That notification no longer exists."
      )
    notification.readAt = new Date().toISOString()
    return new Response(null, { status: 204 })
  }),

  http.post("*/api/notifications/read-all", async ({ request }) => {
    await delay(150)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    let changedCount = 0
    for (const notification of db().notifications) {
      if (notification.userId === actor.id && notification.readAt == null) {
        notification.readAt = new Date().toISOString()
        changedCount += 1
      }
    }
    return noStoreJson({ changedCount })
  }),
]
