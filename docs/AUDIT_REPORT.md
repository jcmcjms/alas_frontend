# ALAS v3 Frontend — Audit Report

Scope: full audit of the implemented frontend (architecture, security,
caching, workflow integrity, forms, accessibility, performance, tests,
deployment readiness). Each finding lists reproduction, root cause, business
impact, correction, verification and status.

Severity scale: **Critical** (data loss / unauthorized action / crash),
**High** (workflow or security defect reachable by users), **Medium**
(correctness or reliability defect with workaround), **Low** (hygiene,
a11y polish, maintainability), **Info** (environment / process notes).

---

## A-01 — Missing `TooltipProvider` crashed the authenticated shell
- **Severity:** Critical · **Status:** Resolved (build phase)
- **Files:** `src/app/providers/app-providers.tsx`, `src/app/layout/app-shell.tsx`
- **Repro:** Sign in → sidebar menu button renders tooltip → router error screen.
- **Root cause:** shadcn `SidebarMenuButton tooltip` requires a Radix TooltipProvider; none mounted.
- **Impact:** App unusable after login.
- **Correction:** Provider mounted in `AppProviders` (and test harness).
- **Verification:** `auth-flows.test.tsx` sign-in journeys; manual render.

## A-02 — MSW scenario gate forwarded all traffic to the real network
- **Severity:** Critical · **Status:** Resolved (build phase)
- **Files:** `src/mocks/handlers/index.ts`
- **Root cause:** gate resolver returned `passthrough()` instead of falling through.
- **Impact:** every mock request hit the network → total mock failure.
- **Correction:** return `undefined` for fall-through.
- **Verification:** full integration suite.

## A-03 — Decision dialog rendered duplicate alerts and pre-emptive errors
- **Severity:** Medium · **Status:** Resolved (build phase)
- **Files:** `src/components/shared/decision-dialog.tsx`
- **Root cause:** two error paragraphs driven by overlapping state; validation shown before any attempt.
- **Correction:** single alert, shown only after an attempt or on server field errors.
- **Verification:** evaluation/approval integration tests assert one `role=alert`.

## A-04 — Failed workflow-config save left the confirm dialog open over the failure state
- **Severity:** Medium · **Status:** Resolved (build phase)
- **Files:** `src/features/admin/workflow/pages/workflow-settings-page.tsx`
- **Root cause:** dialog stayed open; Radix `aria-hidden` background hid the in-card alert from AT and tests.
- **Correction:** dialog closes on failure; persistent in-card alert + unchanged switch visible together.
- **Verification:** `workflow-settings.test.tsx` (failure keeps old value).

## A-05 — API client JSON-stringified FormData on PUT
- **Severity:** High · **Status:** Resolved (build phase)
- **Files:** `src/lib/api/api-client.ts`
- **Impact:** signature upload would send `"{}"`-style bodies.
- **Correction:** `serializeBody` passes FormData untouched.
- **Verification:** account signature tests (jsdom + undici alignment, A-08).

## A-06 — npm 10.8.2 arborist crash blocked the mandated shadcn init
- **Severity:** Info (environment) · **Status:** Worked around
- **Repro:** `npm install` on the generated manifest → `edgesOut` TypeError.
- **Correction:** sandbox npm upgraded to 11; CI pins `npm@11` explicitly.
- **Verification:** `npm ci` in CI config; lockfile committed.

## A-07 — react-hooks v7 rule violations (purity, setState-in-effect, conditional hook)
- **Severity:** Low · **Status:** Resolved (build phase)
- **Files:** review-desk/monitoring (`Date.now()` in render → `useNow`), admin pages (`useEffect` page resets → `usePagedSearch`), account page (conditional `useForm` → component split), dialog (effect reset → render-time adjust).
- **Verification:** `npm run lint` 0 errors; suites green.

## A-08 — jsdom/undici File class mismatch broke multipart in tests
- **Severity:** Info (test env) · **Status:** Resolved
- **Correction:** `src/test/setup.ts` aligns `FormData/File/Blob` globals with Node classes; handlers duck-type files (`isFileLike`).
- **Verification:** signature upload tests.

## A-09 — 401 handling ended sessions without attempting refresh
- **Severity:** High · **Status:** Resolved (this phase)
- **Files:** `src/lib/api/api-client.ts`, `src/features/auth/session-context.tsx`
- **Repro:** with short-lived access tokens (production contract), any token expiry mid-work logged the officer out and discarded in-flight work.
- **Root cause:** unauthorized handler fired immediately on 401; no refresh path existed in the client.
- **Correction:** single-flight refresh (`refreshOnce`) + exactly one bounded replay per request (`isRetryAfterRefresh`); refresh handler validates the rotated identity (`claims.sub` must match the current session) so a refresh can never restore a superseded identity; refresh failure ends the session and clears caches. Auth endpoints never trigger the loop.
- **Verification:** new integration tests: transparent retry after one 401; session end when access AND refresh are rejected; existing expiry tests unchanged. `npm test` green.

## A-10 — `mockServiceWorker.js` shipped in the production artifact
- **Severity:** Medium · **Status:** Resolved (this phase)
- **Files:** `vite.config.ts` (`excludeMockServiceWorker` plugin)
- **Root cause:** `public/` copy runs after `generateBundle` in Vite 8.
- **Correction:** plugin deletes the file in `generateBundle` and `closeBundle` for non-development builds; dev-mode (E2E artifact) keeps it.
- **Verification:** `grep -rl mockServiceWorker dist/` empty after `npm run build`; present after `npm run build:e2e`; CI gate step repeats the check.

## A-11 — Mock code chunks shipped (dead) in the production bundle
- **Severity:** Medium · **Status:** Resolved (this phase)
- **Files:** `src/main.tsx`, `src/lib/env.ts`, `vite.config.ts` (`define.__ALAS_MOCKS__`)
- **Root cause:** `import.meta.env.DEV` is false in ALL builds, but the dynamic import chunk was still emitted; earlier gate also mis-used DEV for the E2E artifact (mode development) so mocks never activated there.
- **Correction:** compile-time literal `__ALAS_MOCKS__` (mode ∈ {development,test} AND `VITE_ENABLE_MOCK_API=true`) dead-code-eliminates mock modules in production and enables them in the E2E artifact; single shared gate constant.
- **Verification:** production dist scanned clean (`Passw0rd`, `__alasMock`, mock modules absent); E2E build contains them; suite green both ways.

## A-12 — Multi-step form footer button reuse allowed accidental premature submission
- **Severity:** High · **Status:** Resolved (this phase)
- **Files:** `src/features/loans/pages/create/loan-create-page.tsx`
- **Repro:** (found by E2E on Firefox) click "Continue" on the Documents step; React reused the same DOM node for the Review step's "Submit"; the mouseup of the same click landed on the now-Submit button → application submitted before review. A fast human double-click reproduces the same hazard.
- **Root cause:** element identity reused across step transitions at the same position.
- **Correction:** per-step `key` on footer buttons forces remount; a mouseup after remount targets a different node and the browser dispatches the click to the common ancestor (no action).
- **Verification:** Firefox E2E creation journeys pass (previously hung/ghost-submitted); vitest create suite green.

## A-13 — Radix Select portal unreliable inside the creation form on Firefox
- **Severity:** Medium · **Status:** Resolved (this phase)
- **Files:** `loans-step.tsx`, `loan-revise-page.tsx` (product & deviation pickers)
- **Repro:** real Firefox: trigger opens (`aria-expanded=true`) but listbox never mounts inside the form context; works outside forms.
- **Correction:** financial pickers switched to shadcn registry `native-select` (maximum browser/AT robustness where it matters most); Radix Select retained for filters/dialogs outside forms.
- **Verification:** Firefox E2E + jsdom suites (`selectOptions`).

## A-14 — Correction screen carried an extra creator-only restriction
- **Severity:** Low · **Status:** Resolved (this phase)
- **Files:** `src/features/loans/pages/loan-detail-page.tsx`
- **Root cause:** deviation from the legacy permission-only model (`loans.revise`); blocked legitimate colleague coverage.
- **Correction:** corrections gated by permission only; cancellation remains creator/admin-only.
- **Verification:** E2E correction journey signs in a different encoder than the creator.

## A-15 — Monitoring search input did not re-sync on back/forward navigation
- **Severity:** Low · **Status:** Resolved (this phase)
- **Files:** `src/features/monitoring/pages/monitoring-page.tsx`
- **Correction:** render-time URL→input adjustment (source of truth stays the URL).
- **Verification:** manual + monitoring tests (URL-driven filters).

## A-16 — Actor identity absent from user-scoped query keys
- **Severity:** Low (defense-in-depth) · **Status:** Resolved (this phase)
- **Files:** `src/lib/query/keys.ts`, desk/dashboard/notification hooks
- **Rationale:** session-end cache clearing already prevents cross-user reads; identity in keys makes collisions structurally impossible.
- **Verification:** `keys.test.ts` updated (identity-difference assertions).

## A-17 — Upload timeout equal to default request timeout (30 s)
- **Severity:** Low · **Status:** Resolved (this phase)
- **Files:** `src/lib/api/api-client.ts`
- **Correction:** uploads get a 120 s ceiling (5 MB documents on branch uplinks); overridable per call.

## A-18 — Two `<main>` landmarks (invalid hierarchy, AT confusion)
- **Severity:** Low · **Status:** Resolved (this phase)
- **Files:** `src/app/layout/app-shell.tsx`
- **Root cause:** shadcn `SidebarInset` renders a `<main>`; shell nested a second one.
- **Correction:** inner region is a focusable `div#main-content` (skip-link target).
- **Verification:** probe run showed exactly one main landmark afterwards.

## A-19 — Unsafe casts (`as never`, `as any`)
- **Severity:** Low · **Status:** Resolved (this phase)
- **Files:** `users-page.tsx` (resolver cast → `ASSIGNABLE_ROLES` tuple), `admin.handlers.ts` (dynamic product patch → explicit typed guards). Remaining documented casts: MSW JSON boundary (`noStoreJson`), none elsewhere.
- **Verification:** `tsc --noEmit` strict clean; lint clean.

## A-20 — Chromium cannot run in this sandbox (renderer blocked)
- **Severity:** Info (environment) · **Status:** Documented; mitigated
- **Evidence:** `chrome-headless-shell` and full Chromium crash at renderer spawn (`Target crashed`); `--single-process` deadlocks; xvfb headed also crashes. Firefox (after GTK deps) runs fully.
- **Correction:** Playwright config keeps chromium (CI standard) + firefox project; sandbox verification executed on Firefox; CI installs both.

## A-21 — Firefox first-document reload-loop flake in sandbox
- **Severity:** Info (environment) · **Status:** Mitigated + documented
- **Evidence:** intermittent repeated document navigations to /login on first load (SW claim race); reproduces ~1 in 8 runs here; retry always passes; never reproduces on the built-app flows after `updateViaCache: "all"`.
- **Correction:** dev bootstrap registers the worker with `updateViaCache: "all"`; firefox project allows one retry with an explanatory comment (failures reproducing on retry are investigated — each prior recurrence led to A-12/A-13 fixes, not suppression).

## A-22 — E2E coverage gaps closed this phase
- **Severity:** Info · **Status:** Resolved
- Added browser journeys: deep-link-before-auth return, documented reload re-authentication, single-page role handoffs (sign out/in), disbursement board void refusal, mutation-failure dialog preservation.
- All 11 E2E tests pass on Firefox against the built app (`npm run test:e2e -- --project=firefox`), 10 first-try + 1 environmental retry.

## Open items (not defects — tracked elsewhere)
- Backend-dependent contracts: `docs/WORKFLOW.md §8`, `docs/BACKEND_INTEGRATION.md`.
- Real-time notification transport (polling today).
- Coverage percentages: see `docs/VERIFICATION.md` (recorded, no arbitrary gate).
