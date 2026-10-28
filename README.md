# ALAS v3 — Automated Loan Application System (Frontend)

Internal banking frontend for processing loan applications through a
configurable, role-based approval workflow: **Encoder → (Recommender) →
Evaluator → Approver → Disbursement**, with corrections, grouped review desks,
monitoring and administration.

Built to the `Frontend Auto.md` engineering standard on the mandated shadcn/ui
preset (`b3lCJ12Ku`, style `radix-lyra`). All server behavior in this
repository is provided by a **mock API (MSW)** that mirrors the legacy ALAS
backend contract; swapping to the real .NET API is a configuration change, not
a code change.

---

## 1. Quick start

```bash
npm ci                 # Node 20.19+ (Node 22+ recommended); npm >= 10.9
cp .env.example .env.development.local   # optional overrides
npm run dev            # http://localhost:5173 with the MSW mock API enabled
```

Sign in with any demo account (mock mode only, password `Passw0rd!`):
`encoder`, `recommender`, `evaluator`, `approver`, `approver2`, `admin`.
The login screen lists them behind a collapsed "Development mock accounts"
disclosure when mock mode is active; that surface never renders in production
builds.

## 2. Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server (mock API per `.env.development`) |
| `npm run build` | Type-check (`tsc -b`) + production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint (flat config, typescript-eslint + react-hooks v7) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` | Prettier (+ tailwind plugin) |
| `npm test` | Vitest unit + integration suites (MSW, jsdom) |
| `npm run test:coverage` | Vitest with v8 coverage |
| `npm run build:e2e` | Dev-mode production-shaped build for E2E (mocks enabled) |
| `npm run preview:e2e` | Serve the E2E artifact on :5173 |
| `npm run test:e2e` | Playwright E2E against the built app (chromium + firefox projects) |

## 3. Environment variables

| Variable | Dev default | Prod default | Meaning |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | *(empty)* | *(empty)* | Empty = same-origin relative calls (`/api/...`), the IIS reverse-proxy layout. Set an origin for split-host deployments. |
| `VITE_ENABLE_MOCK_API` | `true` | `false` | Starts the MSW worker **only** in dev (`import.meta.env.DEV` is a hard second guard). Never a fallback in production: real API failures stay real errors. |
| `.env.test` | — | — | Sets `VITE_API_BASE_URL=http://localhost` because Node fetch (under jsdom) requires absolute URLs. |

`VITE_`-prefixed values are exposed to browser code — never put secrets there.

## 4. Mock API (MSW)

- Handlers: `src/mocks/handlers/*` — auth, CIS, loans, desk queue, workflow
  actions, workflow configuration, admin, account, notifications, dashboard.
- In-memory database: `src/mocks/db.ts`. The mock is the **authoritative
  backend** in dev/test: it enforces workflow transitions, approval authority,
  `rowVersion` concurrency, idempotent submission and the 30-day disbursement
  rule. The frontend cannot fake a transition locally.
- Fixtures: `src/mocks/fixtures/base-data.ts` — entirely synthetic clients,
  users, branches, products (no real banking data).
- Tests: `src/mocks/server.ts` with `onUnhandledRequest: "error"`; the DB
  resets between tests.

### Deterministic failure scenarios (spec §11)

Switch scenarios in dev from the sidebar footer, or at runtime:

```js
__alasMock.setScenario("network-error")   // also: slow, empty-queue,
                                          // claim-conflict, workflow-stale,
                                          // mutation-failure, expired-session
__alasMock.resetDb()                      // re-seed deterministic data
```

`localStorage["alas.mock.scenario"]` persists the choice across reloads.
In tests: `setMockScenario(...)` from `@/mocks/scenarios`, or per-request
overrides via `server.use(...)`.

## 5. Project structure

```
src/
├── app/                 # providers, query client, router, guards, shell layout
├── components/ui/       # shadcn preset components (radix-lyra) — do not hand-edit styles
├── components/shared/   # app-level UI: state views, status badge, decision dialog…
├── features/
│   ├── auth/            # session context, login/password pages, permission model
│   ├── dashboard/       # role-aware overview
│   ├── loans/           # contracts, computations, create/detail/revise pages, shared panels
│   ├── review-desk/     # grouped queue UI (claim/release)
│   ├── evaluation/      # evaluator review + decisions
│   ├── approval/        # approver review + decisions + disbursement actions
│   ├── monitoring/      # loan search/monitoring + disbursement board
│   ├── accounts/        # profile, e-signature, sessions, activity
│   ├── notifications/   # inbox (polling transport)
│   └── admin/           # users, branches, products, approval authorities, workflow
├── hooks/               # use-debounced-value, use-now, use-paged-search, use-mobile
├── lib/                 # api client + errors, query keys, formatters, jwt, utils
├── mocks/               # MSW handlers, db, fixtures, scenarios
└── test/                # vitest setup + render harness
e2e/                     # Playwright journeys (see playwright.config.ts)
docs/                    # plan, workflow, verification report
```

Architecture rules (from `Frontend Auto.md`): components render UI and contain
no `fetch()`; feature `api/` files define endpoint operations and query hooks;
types/schemas live with the owning feature; server state is TanStack Query
only; form state is React Hook Form + Zod; URL search params drive list
filters/pagination.

## 6. API integration

- Single typed client: `src/lib/api/api-client.ts` (native fetch).
  Bearer token injection, `X-Request-Id` correlation, 30 s timeout,
  AbortSignal pass-through, `ProblemDetails`-shaped `ApiError` with
  field-level `errors`, and a global 401 hook that ends the session.
- Contracts: `src/features/loans/types/loan-contracts.ts` and per-feature
  `*.api.ts` modules. The legacy ALAS endpoint surface is mirrored 1:1; new
  v3-only pieces (disbursement block, expire endpoint, config `version`) are
  marked **mock contracts pending backend confirmation** in
  `docs/WORKFLOW.md §8`.
- Runtime validation at untrusted boundaries: Zod schemas for every form;
  mock handlers validate payloads with the same rules the real API must apply.

## 7. Query caching strategy

- Central key registry: `src/lib/query/keys.ts` — every key contains all
  parameters that affect the result.
- Freshness by data class (not one global setting):
  - status/ownership-critical (loan detail, desk, checklist, account): `staleTime: 0` + revalidate on focus; desk polls every 30 s.
  - reference data (products, branches, catalogs): 5–10 min.
  - workflow configuration: 30 s + refetch on window focus.
- Mutations invalidate **exactly** their dependents (`useLoanInvalidation`
  maps in `loans.queries.ts`); no blanket invalidation. The workflow-settings
  screen never flips optimistically — it renders the server-confirmed value
  and surfaces 409 conflicts with the authoritative config.
- Session isolation: logout / expiry / identity change cancels in-flight
  queries and clears the whole cache (`SessionProvider.clearPrivateState`), so
  late responses cannot repopulate another user's data. Nothing user-specific
  is persisted to browser storage; the access token lives in memory only.
- HTTP caching is a backend concern: mocks answer sensitive endpoints with
  `Cache-Control: no-store`; the real API must do the same (documented in
  `docs/WORKFLOW.md §8`). TanStack Query does not and cannot control browser
  or proxy caches.

## 8. Authentication & authorization

- Contract (mirrors legacy): `POST /api/auth/login` →
  `{accessToken, accessTokenExpiresAt, mustChangePassword}`; identity and
  permissions ride in token claims (`src/lib/jwt.ts` decodes, the server
  validates). `POST /api/auth/refresh` restores sessions (single-flight per
  page load, as in the legacy app); logout revokes the token.
- Roles: Encoder, Recommender, Evaluator, Approver, Admin; permission strings
  in `src/features/auth/types.ts`. Route guards + permission-aware navigation
  are **UX only** — every mock/real endpoint independently authorizes.
- The production backend is expected to use HttpOnly/Secure/SameSite refresh
  cookies; the mock keeps sessions in memory (reload → sign in again), which
  exercises the same expired-session paths.

## 9. Testing

- **Unit** (Vitest): loan computations (legacy amortization/max-loanable
  rules), Zod schemas, query-key construction, status model, formatters,
  permission logic.
- **Integration** (Vitest + RTL + MSW, real router & providers): login/logout,
  protected routes, session-expiry, cache isolation between users, loan
  creation (single + grouped bundle + validation), desk claim/release incl.
  409 conflicts, recommendation/evaluation/approval decisions (incl. the
  NotRecommended-still-advances rule and authority gating), pushback →
  correction → resubmission, workflow-config change (impact, backlog warning,
  stale-config 409, failure keeps old value), monitoring filters, disbursement
  board (overdue/at-risk/voided) incl. server-side void refusal, account
  update, e-signature validation + upload, notifications read states, network
  failure + retry.
- **E2E** (Playwright, `e2e/`): the 11 critical journeys of spec §18 against
  the dev server + mocks. Run `npx playwright install chromium` once, then
  `npm run test:e2e`.
- Test-env notes: jsdom gaps (matchMedia, ResizeObserver, pointer capture) are
  stubbed in `src/test/setup.ts`; `FormData/File/Blob` globals are aligned with
  Node's undici classes so multipart uploads serialize correctly.

## 10. Production build & deployment (IIS)

```bash
npm ci && npm run lint && npm run typecheck && npm test && npm run build
```

Deploy `dist/` to IIS with URL rewriting so SPA routes resolve to
`index.html`; route `/api/*` to the .NET backend (same-origin recommended).
Serve hashed `assets/*` with immutable long-lived caching and revalidate
`index.html`. Verify on the deployed artifact that `VITE_ENABLE_MOCK_API` is
`false`, that `mockServiceWorker.js` is not requested, and that no mock
credentials panel renders.

Bundle notes: routes are code-split (one lazy chunk per page). The shared
entry chunk is ≈162 kB gzipped (React + router + query + design system);
measured with `npm run build` on 2026-10-27.

## 11. Design system

shadcn preset `b3lCJ12Ku` (`radix-lyra`): neutral base, sharp corners,
compact 32 px controls, Geist Variable, warm primary. The app follows the
"quiet chrome, colour on data" rules for operational screens: hairline-divided
KPI strips (no icon tiles), sentence-case 12 px table headers, right-aligned
tabular figures, pale-tint status pills that always carry text (never colour
alone), one h1 per screen, no gradients/sparklines/decorative charts,
state views (loading skeleton / empty / no-results / error / denied) for every
data block. Dark mode ships with the preset (`d` toggles).

## 12. Documentation map

- `docs/IMPLEMENTATION_PLAN.md` — discovery findings, architecture, risks.
- `docs/WORKFLOW.md` — business workflow, roles, transitions, backend gaps.
- `docs/VERIFICATION.md` — commands executed, results, known limitations.
