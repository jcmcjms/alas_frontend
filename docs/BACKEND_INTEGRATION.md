# ALAS v3 — Backend Integration Guide (ASP.NET Core .NET 10)

How the .NET team plugs the real API behind this frontend with zero frontend
changes, and how both sides verify the contract.

## 1. Switching from mock to real API

The mock is compile-time gated and environment-flagged:

| Build | `VITE_ENABLE_MOCK_API` | Mock code present | Used for |
| --- | --- | --- | --- |
| `npm run dev` (.env.development) | `true` | yes | frontend-only development |
| `npm run build:e2e` (mode development) | `true` | yes | browser E2E against deterministic data |
| `npm run test` (vitest, .env.test) | `false` | modules present, MSW **node** server used by integration tests | unit/integration |
| `npm run build` (production) | `false` | **no** (dead-code eliminated, A-11) | deployment |

Integration work therefore needs no frontend feature flags: point
`VITE_API_BASE_URL` at the .NET host (or same-origin `/api` via IIS/ARR) and
build. `docs/DEPLOYMENT_IIS.md` covers hosting.

## 2. Non-negotiable transport contracts

1. **Base path** `/api`; JSON camelCase; all timestamps ISO-8601 UTC.
2. **Errors** → `ProblemDetails` with `status/title/detail`, optional
   `fieldErrors: [{field, message}]` and stable `code` values
   (`conflict_status`, `conflict_claim`, `bad_credentials`, `account_locked`,
   `weak_password`, `upload_too_large`, …). Frontend maps `detail` +
   `fieldErrors` directly (see `api-client.ts`).
3. **Auth**: bearer access token (short-lived) + HttpOnly `alas_refresh`
   cookie; `POST /auth/refresh` rotates both; `POST /auth/logout` revokes.
   Client behavior (already implemented and tested): single-flight refresh,
   one bounded replay of the failed request, session end + cache clear when
   refresh fails; identity supersede guard on rotation.
4. **Caching**: `Cache-Control: no-store` on every authenticated response.
5. **Pagination**: `page`, `pageSize` in; `{items, total, page, pageSize, hasMore}` out.
6. **Uploads**: multipart; ≤5 MB; png/jpeg/webp for signatures.
7. **CORS** (only if cross-origin): allow SPA origin, `credentials: true`,
   no wildcard.

## 3. Domain-by-domain acceptance checklist

Each item maps to an existing frontend test that will pass unchanged once the
backend honors the contract (mock → real swap is the only change).

### Auth & session
- [ ] Wrong password → 400 with `code=bad_credentials`; lockout after policy threshold (423).
- [ ] Disabled account cannot sign in (403).
- [ ] Expired access + valid refresh → transparent success (frontend replays once).
- [ ] Replayed refresh token rejected (single-use rotation).
- [ ] Logout revokes; subsequent refresh 401.
- [ ] `mustChangePassword` forces first-login change flow.

### Loans lifecycle
- [ ] Submission assigns stage from workflow config **at submit time**; response includes group id + per-loan ids.
- [ ] Recommendation required ON → new loans land `ForRecommendation`; OFF → `ForChecking`; in-flight loans never move.
- [ ] Claim conflicts: second claimer gets 409 with current owner; UI shows conflict toast and refetches.
- [ ] Evaluate return with section feedback → status per feedback target; encoder correction returns to the returning stage with history intact.
- [ ] Approve → `disbursementDeadline = now + 30 days`; void inside window → 409; after deadline, expiry job marks `Expired`.
- [ ] Cancel allowed only up to `ForChecking` and only by creator/admin.
- [ ] All mutations append audit history rows the UI renders verbatim.

### Admin
- [ ] Workflow config PUT is the only writer; concurrent PUTs resolve last-write-wins and losers see the fresh value on refetch.
- [ ] Product edits validate ranges; existing loans keep their snapshot.
- [ ] User disable revokes sessions immediately.

### Account
- [ ] Signature upload replaces prior image; delete returns 204 and 404 on repeat.
- [ ] Profile PUT validates email format server-side (400 + fieldErrors).

### Notifications & dashboard
- [ ] Role-aware counters; unread-first inbox ordering; mark-read idempotent.

## 4. Concurrency & conflict test plan (run against staging)

1. Two browsers claim the same bundle → exactly one 200, one 409.
2. Approve then void inside window → void 409 (window rule).
3. Refresh token replay after rotation → 401 (rotation integrity).
4. Simultaneous workflow-config PUT + loan submission → submission uses a consistent config snapshot.
5. Kill the API mid-mutation → frontend shows retryable failure dialog, form data preserved (verified against mock `mutation-failure`; must hold against real 5xx).

## 5. Performance targets (measured, not assumed)

- p95 `/loans` list (page 1, 25 rows) < 300 ms server-side.
- p95 dashboard/overview < 200 ms (aggregations indexed).
- Notification poll cheap (< 50 ms; consider `ETag` or long-poll/websocket later — frontend transport swap is isolated to `notifications.ts`).

## 6. Security sign-off list

- HttpOnly/Secure/SameSite on refresh cookie; access token never in localStorage (frontend already compliant).
- Rate limiting on `/auth/*`.
- Audit log immutability; history endpoints read-only.
- CSP-compatible responses (no inline scripts needed by SPA).
- Upload scanning + type/size enforcement server-side.
- Approval-authority enforcement server-side (frontend hides out-of-authority actions only).

## 7. Rollout sequence

1. Stand up API with `/auth`, `/account`, `/loans` reads behind the contract.
2. Flip a **staging** build (`VITE_API_BASE_URL`) and run the E2E suite against it (data seeded via API, not MSW).
3. Enable mutations domain by domain; keep MSW dev mode for frontend-only work.
4. Production cutover per `docs/DEPLOYMENT_IIS.md`; keep mock-free build verification in CI as the gate.

## 8. Known open questions for the backend team

1. Exact lockout policy numbers (threshold/window) to mirror in copy.
2. Scheduler design for disbursement expiry (job vs lazy evaluation).
3. Notification transport evolution (poll → websocket) ownership.
4. Whether `/loans/:id/document-flag` and `/sync` remain frontend-visible or become internal.
5. Signature image storage/retention policy (preview URL lifetime).
