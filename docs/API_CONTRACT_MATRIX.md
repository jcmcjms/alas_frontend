# ALAS v3 — API Contract Matrix (frontend ⇄ ASP.NET Core)

Purpose: single reference for the .NET team. Every row is what the frontend
**already sends and consumes** today (mocked). Shapes are stable; deviations
must be negotiated, not silently changed.

Legend:
- **Origin** — `legacy-derived`: behavior mirrors a legacy ASP.NET Framework
  4.8 route/rule documented in `docs/WORKFLOW.md §8`; `new`: introduced by
  ALAS v3, needs backend design sign-off; `dev-only`: mock control surface,
  never implemented by the backend.
- **Idem.** — safe to replay with the same request id / identical body.
- **Concurrency** — server rule the backend must enforce (frontend enforces
  the same rules in mocks and displays conflicts, it is NOT authoritative).
- **Cache** — required `Cache-Control` / client caching policy.

All endpoints are relative to the API base (`/api`). All authenticated
responses: `Cache-Control: no-store`. Errors: `ProblemDetails` shape
(`status`, `title`, `detail`, optional `fieldErrors[]`, `code`).

## Auth & session

| Endpoint | Actor | Request → Response | Errors | Idem. | Concurrency / rules | Origin |
| --- | --- | --- | --- | --- | --- | --- |
| POST `/auth/login` | anon | `{username,password}` → `{accessToken, refreshToken, mustChangePassword, user}` | 400 badCreds, 403 disabled, 423 locked | no | lockout after N failures; refresh credential via HttpOnly cookie (see WORKFLOW §8.9) | legacy-derived |
| POST `/auth/refresh` | cookie | cookie → rotated `{accessToken, refreshToken, user}` | 401 | no | single-use rotation; reject replayed refresh tokens | legacy-derived |
| POST `/auth/logout` | auth | – → 204 | 401 | yes | revokes refresh credential server-side | legacy-derived |
| POST `/auth/change-password` | auth | `{currentPassword,newPassword}` → `{accessToken,refreshToken,user}` | 400 weak, 401 | no | history/complexity rules server-side | legacy-derived |
| POST `/auth/forgot-password` | anon | `{username}` → 202 (no enumeration) | – | yes | constant-time, no user oracle | new |
| POST `/auth/mock-session` | dev | – | – | – | never implemented | dev-only |

## Profile / account

| Endpoint | Actor | Request → Response | Errors | Concurrency / rules | Origin |
| --- | --- | --- | --- | --- | --- |
| GET `/account/me` | auth | → `{id, fullName, email, contactNumber, role, branchCode, permissions[], mustChangePassword}` | 401 | no-store | legacy-derived |
| PUT `/account/me` | auth | `{email?, contactNumber?}` → updated profile | 400 invalid email | last-write-wins per field pair | legacy-derived |
| GET `/account/me/activity` | auth | → paginated audit rows (own actions) | 401 | read-only | new |
| GET `/account/me/loans` | auth | → own submitted applications | 401 | read-only | new |
| GET `/account/me/sessions` | auth | → active sessions list | 401 | read-only | new |
| DELETE `/account/me/sessions/others` | auth | → 204 | 401 | revokes other refresh credentials | new |
| PUT `/account/me/signature` | auth | multipart `file` (≤5 MB, png/jpeg/webp) → `{hasSignature, previewUrl}` | 400 type/size, 401 | replace semantics | new |
| DELETE `/account/me/signature` | auth | → 204 | 404 | idempotent | new |

## Loans — reads

| Endpoint | Actor | Request → Response | Errors | Notes | Origin |
| --- | --- | --- | --- | --- | --- |
| GET `/loans` | loans.view | filters: `search, status[], productCode, branchCode, dateFrom, dateTo, page, pageSize` → `{items[], total, page, pageSize, hasMore}` | 400 bad filters | server-side paging; stable sort `createdAt desc, id` | legacy-derived |
| GET `/loans/count` | loans.view | same filters → counts by status (monitoring tiles) | – | single round trip | new |
| GET `/loans/:id` | loans.view | → full application incl. `routing`, `obligations`, `deviations`, `grouping fields` | 404, 403 | no-store | legacy-derived |
| GET `/loans/:id/checklist` | loans.view | → document requirement rows w/ status | 404 | read-only | new |
| GET `/loans/:id/history` | loans.view | → ordered action log (actor, stage, timestamps) | 404 | append-only source | legacy-derived |
| GET `/loans/:id/revision-requests` | loans.view | → returns + correction notes | 404 | – | new |
| GET `/loans/:id/routing` | loans.view | → stage trail incl. future stages (plan) | 404 | derived from workflow config snapshot | new |
| GET `/loans/:id/signature-chain` | loans.view | → ordered signatures (role, name, signedAt, image ref) | 404 | – | new |
| GET `/loans/queue/my` | any authed | → claims held by caller (`{bundles[], singles[]}`) | – | per-actor | legacy-derived (My Queue) |

## Loans — workflow mutations (state machine lives in the backend)

| Endpoint | Permission | Request → Response | Conflicts / rules (backend-authoritative) | Origin |
| --- | --- | --- | --- | --- |
| POST `/loans` | loans.create | group payload: client, accounts, lines[] (product, amount, term, rate, deviations[]), docsChecked[] | → `{groupId, loans[], assignedStage}`; stage from **workflow config at submit time**; group ids atomic | legacy-derived |
| POST `/loans/:id/recommend` | loans.recommend | `{remarks}` | 409 if not ForRecommendation or not claimed by caller; claim released on success | legacy-derived |
| POST `/loans/:id/evaluate` | loans.evaluate | `{decision: recommend|return|reject, findings, sectionFeedback[]}` | 409 wrong stage/claim; return sets ForRevision/ForIncompleteDocuments per feedback targets | legacy-derived |
| POST `/loans/:id/approve` | loans.approve | `{remarks}` | 409 wrong stage/claim; opens 30-day disbursement window (`disbursementDeadline = now+30d`) | legacy-derived |
| POST `/loans/:id/reject` | loans.approve | `{reason}` | 409 wrong stage/claim | legacy-derived |
| POST `/loans/:id/pushback` | loans.evaluate | `{sectionFeedback[], reason}` | 409 unless ForChecking; routes to encoder stage | legacy-derived |
| POST `/loans/:id/revise` | loans.revise | `{correctionNotes}` | 409 unless ForRevision/ForIncompleteDocuments; returns to the **returning stage** | legacy-derived |
| POST `/loans/:id/cancel` | creator or admin | `{reason}` | 409 if past ForChecking | legacy-derived |
| POST `/loans/:id/expire` | system/scheduler | – | ForDisbursement past deadline → Expired; void only **outside** window (409 inside) | legacy-derived rule |
| POST `/loans/:id/document-flag` | loans.view? (TBD) | `{code, status}` | requirement checklist updates | new |
| POST `/loans/:id/documents/:code` | loans.view | multipart upload | size/type rules | new |
| POST `/loans/:id/sync` | loans.view | – → refreshed core-banking snapshot | external system read | new |

## Queues (claim/release)

| Endpoint | Permission | Semantics | Conflicts | Origin |
| --- | --- | --- | --- | --- |
| GET `/loans/queue/:stage` (desk lists) | stage role | bundles grouped by `(clientAccountNumber, groupCode)` + singles, FIFO by oldest loan | read-only | legacy-derived |
| POST `/loans/queue/claim` | stage role | `{loanIds[]}` whole bundle or single; owner=caller | 409 already claimed/expired stage | legacy-derived |
| POST `/loans/queue/:loanId/claim` | stage role | single claim convenience | same | legacy-derived |
| POST `/loans/queue/release` | stage role | `{loanIds[]}` release own claims | 409 not owner | legacy-derived |

## Admin configuration

| Endpoint | Permission | Semantics | Rules | Origin |
| --- | --- | --- | --- | --- |
| GET/PUT `/workflow/configuration` | admin.workflow | `{requireRecommendation: boolean}` | PUT is the ONLY writer; in-flight loans keep their current stage (no rerouting) | legacy-derived |
| GET `/loan-products`, POST, PUT `/:code` | admin.products | product catalog incl. rate floors/caps, amount caps, term bounds, active flag | validation server-side; edits never rewrite existing loans | legacy-derived |
| GET `/branches`, POST, PUT `/:code` | admin.branches | branch master | – | legacy-derived |
| GET `/users`, POST, PUT `/:id`, PATCH `/:id/status` | admin.users | officer master; assignable roles subset enforced | disabling a user revokes sessions | legacy-derived |
| GET `/roles` | authed | role → permission matrix | read-only | legacy-derived |
| GET/PUT `/approval-authorities/:key` | admin.authorities | role/branch approval limits | amounts above limit escalate | legacy-derived |
| GET `/deviation-catalog` | authed | deviation codes/reasons | read-only | legacy-derived |
| GET `/document-template` | authed | per-product document requirements | read-only | legacy-derived |
| GET `/cis/clients`, GET `/cis/clients/:cisNo` | loans.create | core banking read (search + accounts) | external system | legacy-derived |

## Dashboard & notifications

| Endpoint | Actor | Semantics | Cache | Origin |
| --- | --- | --- | --- | --- |
| GET `/dashboard/overview` | authed | role-aware counters + stage queue sizes | no-store; client polls 60 s | new |
| GET `/notifications` | authed | inbox (`unreadFirst`, page) | no-store; client polls 30 s | new |
| POST `/notifications/:id/read` | authed | mark read | idempotent | new |
| POST `/notifications/read-all` | authed | mark all read | idempotent | new |

## Cross-cutting backend obligations

1. **State machine authority**: every mutation validates current status +
   claim ownership; frontend displays conflicts but never decides.
2. **Workflow config isolation**: config changes affect only new submissions.
3. **Disbursement window**: approve starts it; voids inside the window are
   refused; expiry is backend/scheduler driven.
4. **Group atomicity**: submission creates all lines or none; bundle claims
   cover the whole group.
5. **Audit**: every mutation appends history (actor, role, from→to, time).
6. **Money**: backend computes and returns amounts; frontend computations are
   advisory UX only (rounding rules in WORKFLOW §5).
7. **Idempotency**: retries of POST mutations must not double-apply (use
   request ids or status-transition guards).
8. **Pagination**: `page/pageSize/total/hasMore` contract as consumed.
9. **Auth cookies**: HttpOnly refresh cookie + rotated bearer pair; the SPA
   refreshes with single-flight + one bounded replay (client behavior fixed,
   see AUDIT A-09).
