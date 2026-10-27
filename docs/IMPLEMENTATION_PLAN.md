# ALAS v3 Frontend — Implementation Plan

Status: **Complete.** All milestones M1–M6 executed; verification results are
recorded in `docs/VERIFICATION.md` (typecheck 0 errors · lint 0 errors ·
110/110 Vitest tests · production build OK · Playwright specs written, browser
execution blocked by sandbox — see verification report §3).

## 1. Existing project condition

- Workspace `/home/user` contained no project — only the uploaded `Frontend Auto.md` (read in full, 735 lines).
- Initialized a new project with the mandated command:
  `npx shadcn@latest init --preset b3lCJ12Ku --base radix --template vite --pointer -n alas-v3 -y`
  - The first run failed inside its own `npm install` with the npm 10.8.2 arborist bug
    (`Cannot read properties of null (reading 'edgesOut')` — a known peer-resolution crash).
    **Fix applied:** upgraded the sandbox's npm to 11.21.1 (Node 20-compatible), completed the
    install manually, then re-ran the exact preset init, which succeeded.
  - Generated preset: style `radix-lyra`, base color neutral, icon library **lucide**, base library
    **radix-ui** (unified package), `cn` utility package, Geist Variable font, sharp corners
    (`rounded-none` controls), compact control heights (h-8 default), warm primary
    (`oklch(0.553 0.195 38.402)`), light+dark tokens, `--pointer` cursor rule enabled.
    `components.json`, `src/index.css` tokens, `theme-provider.tsx`, `button.tsx`, `lib/utils.ts`
    are preserved as generated.
- Environment: Node v20.20.2, npm 11.21.1 (upgraded from 10.8.2), git 2.39.5.
  **No browser binary (chromium/firefox) is installed in the sandbox** — see §8 testing constraints.
- No ALAS v3 backend repository or OpenAPI spec is available in this environment. The reference
  frontend's API surface is used as the contract source, mirrored by MSW mocks (§6).

## 2. Applicable engineering standards (`Frontend Auto.md`)

Read completely. Binding decisions taken from it:

- React 19 + TypeScript strict + Vite SPA; feature-first folder structure
  (`app/`, `features/<name>/{api,components,pages,schemas,types}`, `lib/api`, `mocks/`, `test/`).
- TanStack Query for all server state; React Hook Form + Zod for forms; MSW for mock API;
  Vitest + Testing Library for unit/component tests; Playwright for E2E.
- Typed fetch-based API client with `ProblemDetails`-style `ApiError`; no `fetch()` in components;
  no axios/zustand/Redux (the legacy reference app uses axios + zustand + TanStack Router —
  deliberately **not** carried over; React Router is used per the task baseline).
- `.env.development` / `.env.production` control mock mode (`VITE_ENABLE_MOCK_API`); mocks must be
  disabled in production builds and never a silent fallback.
- Cache rules: structured query keys, targeted invalidation, no sensitive data in persisted
  storage, clear private cache on logout/identity change, freshness per data class.
- Security: backend authoritative for authz; hide-but-don't-trust UI gating; no secrets in env.
- Note: `Frontend Auto.md` shows preset `b3lCJ1rU0`; the task's Priority-5 section and
  non-negotiable rule #3 mandate `b3lCJ12Ku`. **Conflict resolution: the explicit ALAS v3 task
  instruction wins (`b3lCJ12Ku` was used); the discrepancy is documented here.**

## 3. Reference behavior to preserve (EBI_ALAS_Frontend @ main, inspected)

Inspected: `router.tsx`, `loans.ts`, `types.ts`, `use-desk-queue.ts`, `workflow-settings-content.tsx`,
workflow API, loan-review types, loan computations, fee rules, role queues, approval workflow
constants, revision types, account API/types, notifications API, dashboard types, monitoring columns,
auth store/restore, approval authorities, plus the full API endpoint inventory (~60 endpoints).

Business behavior carried into v3:

- **Statuses:** Draft, ForRecommendation, ForChecking, ForApproval, ForRevision,
  ForIncompleteDocuments, Approved, ForDisbursement, Disbursed, OnGoing, Rejected, Cancelled —
  with labels, hints, SLA hours and tone mapping (`LOAN_STATUS_META`). The legacy dashboard also
  names an **Expired** state, which ALAS v3 formalizes as the 30-day disbursement-timeout void state.
- **Permissions:** `loans.create|view|recommend|evaluate|approve|reject|revise`,
  `loan_product.manage`, `users.manage`, `roles.view`, `workflow.manage`, `branches.manage`;
  roles Encoder / Recommender / Evaluator / Approver / Admin.
- **Configurable recommendation:** `GET/PUT /api/workflow/configuration` →
  `{requireRecommendation, initialStatus, stages, source, updatedAt, updatedByName}`; affects only
  **new** applications; UI explains impact, shows ForRecommendation backlog before disabling,
  saves via mutation (no optimistic flip), invalidates config afterwards.
- **Desk queue:** `GET /api/loans/queue/my` returns client **bundles** (`groupNo`) each holding
  multiple applications; claim takes the whole bundle (`POST /api/loans/queue/claim`,
  `POST /api/loans/queue/{loanId}/claim`), release returns it (`POST /api/loans/queue/release`);
  ownership (`ownerUserId/ownerName`), position, `currentClaims`, desk label + scope description;
  role desks default to ForRecommendation/ForChecking/ForApproval; queue polls (30 s) + invalidates
  on claim/release; claim navigates to the primary loan of the bundle.
- **Workflow actions & transitions (backend-enforced):**
  recommend (`POST /{id}/recommend`, remarks), evaluate (`POST /{id}/evaluate` `{recommend, remarks}`;
  a *NotRecommended* evaluation still advances to ForApproval — the Approver makes the final call),
  approve, reject (terminal), pushback (`{section, comment}` → ForRevision), cancel;
  min remarks length 10 (mirrors backend `MinRecommendRemarksLength`); confirmation dialogs state
  the consequence; signatures captured server-side on consequential actions.
- **Revision cycle:** `GET /{id}/revision-requests` → sections (`personal-info`, `loan-params`,
  `obligations`, `deviations`, `verification`, …) with per-section comments, requester name/role,
  `fromStatus`; resolve + `POST /{id}/revise` resubmission; history preserved.
- **Loan detail:** client identity (CIS), product + terms, computed fees (notarial, doc stamp,
  insurance — product-driven, deviations flagged), obligations (outstanding loans, buy-outs,
  EBI re-loans, incoming loans), deviations + justifications, document checklist + flags
  (`documentFlag {reason, missingCount}`), routing (approval tier, assigned approver,
  severity/exposure), timeline/history, `rowVersion` for concurrency.
- **Frontend computations preserved (reference `loan-computations.ts`):** monthly amortization =
  ceil(PMT) with term months = floor(termDays/30); max loanable from monthly capacity and product
  ATM caps (C34 200k, C21 215k, C27 120k, C29 100k, C25 200k, C02 100k); amounts in ₱,
  denomination 100; disposable-income check (NTHP − amortization − deductions).
  The v3 backend contract remains authoritative; these mirror the documented legacy formulas and
  are unit-tested.
- **Approval authorities:** tiers with `maxSeverity`, `maxTotalExposure`, `scopeType`
  (Branch/Area/Global), allowNew/allowRenewal, assigned users; approver may only act when assigned
  and within tier.
- **Account:** `GET/PUT /api/account/me` (email, phone, emergency contact, **eSignature PNG
  data-url/base64**), sessions list/revoke, activity feed, recent loans/clients.
- **Notifications:** paged inbox `{items,totalCount,unreadCount}`, mark read / read-all, links to
  loans; legacy uses SignalR — v3 implements **polling** against the mock (documented; no
  production real-time claim).
- **Auth:** `POST /api/auth/login` → `{accessToken, accessTokenExpiresAt, mustChangePassword}`;
  session restore via `POST /api/auth/refresh`; JWT-style claims carry identity + permissions;
  token kept **in memory only**; 401 handling triggers re-auth; logout clears session + private cache.
- **Monitoring:** server-side paginated `GET /api/loans` (page/pageSize/status/search/date range/
  flagged), columns: LAM ID, branch, customer, loan type, product, amount, date applied, status,
  time lapsed vs SLA, last action by, assigned to; details drawer; cancel action for cancellable
  statuses (Draft…ForIncompleteDocuments).

Legacy defects deliberately **not** reproduced: axios + zustand duplication of server state,
client-side status derivation as a fallback, TanStack Router (baseline says React Router),
grouping-by-array-index risks, toast-only error communication without in-screen states,
missing session-isolation cache clearing.

## 4. Proposed architecture

```
src/
├── app/                     # bootstrap: providers, router, query client, guards, shell layout
├── components/ui/           # shadcn preset components (radix-lyra)
├── components/shared/       # app-level reusable UI (page header, status badge, data-table chrome,
│                            #   state views: loading/empty/error/denied, decision dialog, timeline)
├── features/
│   ├── auth/                # login, session context, protected routes, forbidden
│   ├── dashboard/           # role-aware overview
│   ├── loans/               # create (multi-step), detail, revision, shared loan model/queries
│   ├── review-desk/         # grouped queue, claim/release
│   ├── evaluation/          # evaluator review + decisions
│   ├── approval/            # approver review + decisions
│   ├── monitoring/          # loan search/monitoring + disbursement board (30-day timeout)
│   ├── accounts/            # profile, e-signature, sessions, activity
│   ├── notifications/       # inbox (polling)
│   └── admin/               # users, branches, loan products, approval authorities, workflow settings
├── lib/                     # api client + errors, query keys, formatters, utils
├── mocks/                   # MSW handlers, in-memory db, fixtures, scenario control
└── test/                    # vitest setup + render helpers
```

- Server state: TanStack Query only. Client state: React context for session; URL search params for
  list filters/pagination; RHF for forms. No extra state libraries.
- API client: native fetch, typed, `ApiError` (ProblemDetails + field errors), AbortSignal passthrough,
  bearer-token provider hook, request-id header, JSON/date conventions centralized.
- Query keys: single `src/lib/query/keys.ts` registry (account, auth, workflow, loans list/detail,
  desk, groups, notifications, admin entities). Targeted invalidation maps per mutation (§12 of spec).
- Session isolation: on logout/identity change → `queryClient.clear()` + cancel in-flight requests;
  late responses cannot repopulate because the client instance is cleared and requests are aborted.
- Route-level code splitting via `React.lazy` per feature page; skeletons per section, not per screen.

## 5. Required application modules

Auth/session • Role dashboards • Loan creation (CIS lookup → client confirm → loan terms &
computation → obligations → deviations → documents → review → submit) • Loan detail (timeline,
documents, deviations, routing) • Review desk (grouped bundles, claim/release, role queues) •
Recommendation review • Evaluation review + verdicts • Approval review + authority-gated decisions •
Revision/correction & resubmission • Monitoring (search/filter/paginate, SLA aging) • Disbursement
monitoring incl. 30-day timeout & void state • Notifications • Account (profile, e-signature upload,
sessions, activity) • Admin (users, branches, products, approval authorities, workflow settings).

## 6. API & backend dependencies

No live backend here. Contract source = reference frontend endpoints (inventoried above), extended
for explicit ALAS v3 requirements with **documented mock-only contracts**:

- `LoanStatus.Expired` (void after 30-day disbursement timeout) + `disbursement` block on loan
  detail: `{approvedAt, deadlineUtc, daysRemaining, isOverdue, voidedAt, voidReason}`.
  Backend must compute/enforce; UI only displays + triggers `POST /api/loans/{id}/expire`
  (documented as requiring backend implementation).
- `initialStatus` on workflow config already models configurable routing (reference contract).
- Group claim endpoints already exist in the reference contract (bundle-level claim/release).

All mock handlers return the same shapes; swapping `VITE_API_BASE_URL` to the real API and disabling
mocks is the only change needed.

## 7. Security and caching risks

- Token in memory only; no localStorage persistence of session or client data.
- 401 → single-flight refresh attempt → else force re-auth; expired-session screen; no silent mock fallback.
- Every consequential mutation server-validated; UI gating is UX only; `rowVersion` sent on decisions
  to surface 409 concurrent-update conflicts.
- Sensitive responses: mock sets `Cache-Control: no-store` on account/loan endpoints; documented that
  the real backend must do the same (frontend cannot enforce HTTP caching).
- No sensitive data in query keys/URLs/logs; signature preview via object URL, revoked on unmount;
  uploads type/size-validated (image/png, ≤ 1 MB).
- XSS: no `dangerouslySetInnerHTML`; remarks rendered as text.

## 8. Testing strategy

- **Vitest + RTL + MSW (node server)**, `onUnhandledRequest: 'error'`, deterministic fixtures,
  per-test db reset, scenario overrides for the 16 required failure/edge scenarios.
- Unit: loan computations, schemas, query keys, status/deadline formatters, permission-gating logic,
  workflow presentation.
- Integration: login/logout, protected routes, create flow validation + submit, desk claim/release
  (incl. concurrent 409), evaluation/approval decisions (incl. not-recommended advance rule,
  remarks required), revision → resubmission, workflow settings change (impact text, backlog warning,
  failure keeps old value), account update invalidation, signature upload validation, session-change
  cache isolation, notification read states, monitoring filters, disbursement overdue/void display.
- **Playwright E2E:** specs written for the 11 required journeys; **cannot execute in this sandbox
  (no browser binary; `playwright install` blocked/heavy)** — reported honestly in the verification
  report with instructions to run them in a normal environment.
- Verification runs: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## 9. Unresolved business questions (assumptions recorded)

1. Exact voiding endpoint/automation for the 30-day timeout — mock contract
   `POST /api/loans/{id}/expire`; backend must confirm.
2. Resubmission target stage after revision — assumption: returns to the stage that issued the
   return (`fromStatus` on the revision request), per reference behavior; backend authoritative.
3. Approval-authority tier computation (severity/exposure thresholds) — treated as backend routing
   output; UI displays `requiredApprovalTier`, `assignedApprover`, `noAuthorityReason`.
4. Interest-rate deviation rules and product fee schedules — driven entirely by product data from
   the API; no invented defaults.
5. Real-time notifications (legacy SignalR hub) — replaced by documented polling in v3 until a
   production transport is available.
6. Preset id discrepancy (`b3lCJ12Ku` vs doc's `b3lCJ1rU0`) — resolved in favor of the task mandate.

## 10. Implementation milestones

- **M1 Foundation:** deps, preset components, tsconfig/vitest, API client, query keys, MSW db +
  auth handlers, session context, router + guards + app shell, login page. *(verify: typecheck/build)*
- **M2 Contracts & mocks:** all remaining handlers + fixtures + 16 scenarios; feature query/mutation
  layers. *(verify: handler unit smoke via tests)*
- **M3 Core workflow:** dashboard, loan creation, loan detail, review desk, evaluation, approval,
  revision, monitoring + disbursement board. *(verify: integration tests)*
- **M4 Support modules:** account/e-signature, notifications, admin (users, branches, products,
  approval authorities, workflow settings). *(verify: integration tests)*
- **M5 Reliability & polish:** state audit, a11y pass (keyboard/ARIA/contrast), performance
  (splitting, bundle check), web-interface-guidelines review of key screens.
- **M6 Final verification & docs:** run all checks, fix, write technical/workflow/verification docs,
  E2E specs + honest execution report.
