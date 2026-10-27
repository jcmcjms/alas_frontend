/** Shared handler utilities: auth resolution, problem responses, paging. */
import { HttpResponse, type DefaultBodyType, type StrictResponse } from "msw"
import type { MockUserRecord } from "./fixtures/base-data"
import { db, findUser } from "./db"

export function problem(
  status: number,
  title: string,
  detail?: string,
  extras?: Record<string, unknown>
): StrictResponse<DefaultBodyType> {
  return HttpResponse.json(
    { title, detail, status, ...extras },
    { status, headers: { "Cache-Control": "no-store" } }
  )
}

/** Sensitive payloads must never sit in a browser/proxy cache (spec §12). */
/**
 * Single cast at the MSW typing boundary: handler payloads are plain JSON DTOs
 * but msw's DefaultBodyType requires an index signature that TS interfaces
 * lack. Keeping the cast here avoids sprinkling it across every handler.
 */
export function noStoreJson<T>(
  body: T,
  init?: { status?: number }
): StrictResponse<DefaultBodyType> {
  return HttpResponse.json(body as DefaultBodyType, {
    status: init?.status ?? 200,
    headers: { "Cache-Control": "no-store" },
  })
}

export function resolveActor(request: Request): MockUserRecord | null {
  const header = request.headers.get("Authorization")
  if (!header?.startsWith("Bearer ")) return null
  const token = header.slice("Bearer ".length)
  const entry = db().tokens.get(token)
  if (!entry || entry.expiresAt < Date.now()) return null
  return findUser(db(), entry.userId) ?? null
}

export function hasPerm(user: MockUserRecord, permission: string): boolean {
  return (
    user.permissions === "*" ||
    (user.permissions as readonly string[]).includes(permission)
  )
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number
): {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
} {
  const safePage = Math.max(1, page)
  const safeSize = Math.min(200, Math.max(1, pageSize))
  const start = (safePage - 1) * safeSize
  return {
    items: items.slice(start, start + safeSize),
    totalCount: items.length,
    page: safePage,
    pageSize: safeSize,
    totalPages: Math.max(1, Math.ceil(items.length / safeSize)),
  }
}

/**
 * Cross-realm file check: FormData parsed by undici (Node) yields a different
 * File class than jsdom's, so `instanceof File` is unreliable in tests.
 */
export function isFileLike(value: unknown): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).name === "string" &&
    typeof (value as File).arrayBuffer === "function"
  )
}

export function intParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name)
  const parsed = raw == null ? NaN : Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function boolParam(url: URL, name: string): boolean | undefined {
  const raw = url.searchParams.get(name)
  if (raw == null || raw === "") return undefined
  return raw === "true" || raw === "1"
}
