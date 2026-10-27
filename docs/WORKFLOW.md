# ALAS v3 — Workflow Documentation

This document distinguishes **confirmed reference behavior** (traced from the
legacy ALAS frontend, `jcmcjms/EBI_ALAS_Frontend@main`) from **mock contracts
pending backend confirmation** (added for explicit ALAS v3 requirements where
no backend is available in this environment).

## 1. Roles and responsibilities

| Role | Queue stage | Key permissions | Responsibilities |
| --- | --- | --- | --- |
| Encoder | — (originator) | `loans.create`, `loans.view`, `loans.revise` | Client lookup (CIS), application entry, grouped submission, corrections/resubmission, cancellation before decision |
| Recommender | ForRecommendation | `loans.recommend`, `loans.view`, `loans.revise` | Branch-head review; recommend to evaluation or return for correction |
| Evaluator | ForChecking | `loans.evaluate`, `loans.reject`, `loans.view`, `loans.revise` | Credit checking; verdict Recommended / NotRecommended; return for correction; flag incomplete documents |
| Approver | ForApproval | `loans.approve`, `loans.reject`, `loans.disburse` | Final decision within approval authority; post-approval disbursement processing |
| Admin | — | `*` | Users, branches, products, approval authorities, workflow configuration |

The backend is authoritative for every permission check; UI gating
(hidden nav, disabled buttons, access-denied screens) is UX only.

## 2. Configurable recommendation stage (ALAS v3 requirement)

- Setting: `GET/PUT /api/workflow/configuration` →
  `{requireRecommendation, initialStatus, stages[], source, updatedAt, updatedByName, version}` *(version field: mock contract, see §8)*.
- **Only the initial routing of NEW applications is affected.** The backend
  assigns `ForRecommendation` or `ForChecking` at submission time.
- **In-flight applications are never rerouted.** Applications already at
  ForRecommendation stay with Recommenders after the setting is disabled
  (integration-tested in `workflow-settings.test.tsx` and
  `e2e/loan-lifecycle.spec.ts`).
- UI behavior: pipeline preview + impact explanation before saving; backlog
  warning ("N applications already waiting for recommendation"); pending /
  saving / success / failure states; **no optimistic flip** — the switch
  renders only the server-confirmed value; stale saves return 409 with the
  authoritative config and the UI forces a deliberate re-save; audit fields
  (`updatedByName/updatedAt`) displayed.

Pipeline (recommendation ON): `Encoder → Recommender → Evaluator → Approver → Approved`
Pipeline (recommendation OFF): `Encoder → Evaluator → Approver → Approved`

## 3. Status model (canonical, from the reference contract)

`Draft · ForRecommendation · ForChecking · ForApproval · ForRevision ·
ForIncompleteDocuments · Approved · ForDisbursement · Disbursed · OnGoing ·
Rejected · Cancelled · Expired`

`Expired` is the ALAS v3 void state (see §6). Labels, hints, SLA targets
(4 h recommendation / 8 h checking / 8 h approval / 24 h corrections) and tone
mapping live in `src/features/loans/types/loan-status.ts`; statuses are always
rendered with text + tone (never colour alone).

## 4. Transitions supported by the UI (backend-enforced)

| Action | Endpoint | From → To | Rules enforced server-side (mock mirrors them) |
| --- | --- | --- | --- |
| Submit group | `POST /api/loans` | *(new)* → ForRecommendation or ForChecking | Initial status from workflow config; product limits; Idempotency-Key dedupe |
| Recommend | `POST /api/loans/{id}/recommend` | ForRecommendation → ForChecking | `loans.recommend`; signature captured |
| Evaluate | `POST /api/loans/{id}/evaluate` `{recommend, remarks}` | ForChecking → ForApproval | `loans.evaluate`; **NotRecommended still advances** (Approver decides) — preserved legacy rule; adverse verdict requires remarks ≥ 10 chars |
| Flag documents | `POST /api/loans/{id}/document-flag` | ForChecking → ForIncompleteDocuments | reason ≥ 10 chars; encoder notified |
| Approve | `POST /api/loans/{id}/approve` | ForApproval → Approved | `loans.approve` **and** routed approval authority (tier by severity+exposure; assigned approver only) — non-assigned approvers get 403 |
| Reject | `POST /api/loans/{id}/reject` | ForApproval → Rejected (terminal) | remarks ≥ 10 chars |
| Return for correction | `POST /api/loans/{id}/pushback` `{sections[], overallComments}` | ForChecking/ForApproval → ForRevision | per-section comments required; creates a RevisionRequest recording `fromStatus` |
| Resubmit | `POST /api/loans/{id}/revise` | ForRevision/ForIncompleteDocuments → **the stage that returned it** (`fromStatus`) | resolution notes ≥ 10 chars; `rowVersion` conflict → 409; open revision requests marked resolved; history preserved |
| Cancel | `POST /api/loans/{id}/cancel` | Draft…ForIncompleteDocuments → Cancelled | creator or Admin only |
| Prepare disbursement | `POST /api/loans/{id}/disbursement/prepare` | Approved → ForDisbursement | blocked when the 30-day window lapsed |
| Confirm release | `POST /api/loans/{id}/disbursement/confirm` | ForDisbursement → Disbursed | reference recorded; blocked when lapsed |
| Void (timeout) | `POST /api/loans/{id}/expire` | Approved/ForDisbursement → Expired | **only succeeds when genuinely overdue** (server computes); reason recorded |
| Core sync | `POST /api/loans/{id}/sync` | Disbursed → OnGoing | stands in for the core-banking amortization sync |

Every consequential transition writes a history entry (actor, role, from/to
status, comments, timestamp) that is never erased — corrections and rejections
keep the full decision trail visible.

## 5. Grouped applications and review desks

Reference behavior preserved from `use-desk-queue.ts`:

- `GET /api/loans/queue/my` returns the role's desk: `deskLabel`,
  `scopeDescription`, waiting `items` and the officer's `currentClaims`.
- **The unit of work is the client bundle** (`applicationGroupNo`): one client's
  applications submitted together are claimed, served and released together.
  Individual application statuses inside a bundle are displayed and preserved.
- Claim: `POST /api/loans/queue/claim` (next bundle) or
  `POST /api/loans/queue/{loanId}/claim` (specific). Ownership is recorded
  server-side on every application of the bundle. Concurrent claims answer
  409 ("Another officer claimed…") and the UI refreshes the queue rather than
  showing stale ownership.
- Release: `POST /api/loans/queue/release` (`{groupNo?}`; all claims when
  omitted). Released bundles re-enter the queue at their arrival position.
- Claims are held at bundle level in this contract; the UI clearly separates
  group-level operations (claim/release/serve) from application-level
  operations (open/decide), and a decision on one application never changes
  the status of its siblings.
- Queue freshness: 30 s polling + invalidation after every claim/release/
  decision + manual refresh; SLA aging (time waiting vs stage target) is shown
  per bundle.

## 6. Post-approval processing & the 30-day disbursement timeout

Progression: `Approved → ForDisbursement → Disbursed → OnGoing`.

- On approval, the backend stamps `disbursement.approvedAt` and
  `deadlineUtc = approvedAt + 30 days`.
- The loan list/detail expose `{deadlineUtc, daysRemaining, isOverdue,
  voidedAt, voidReason}`; the Disbursement board sorts overdue first and marks
  at-risk items (≤ 5 days left — frontend display threshold).
- **The timeout is a backend rule, not a frontend timer.** Prepare/confirm are
  rejected once the window lapses; voiding (`/expire`) only succeeds for
  genuinely overdue applications (the mock enforces this server-side; a
  non-overdue void attempt returns 409 — covered by tests). Voided
  applications keep their full history, timestamps and the void reason.
- An approved loan never appears as disbursed: Disbursed requires the explicit
  confirm action with a release reference; OnGoing comes from the core sync.

## 7. Corrections, returns and exceptions

- Return reasons are structured: affected sections (`client-info`,
  `loan-params`, `obligations`, `deviations`, `documents`, `verification`),
  per-section comments, overall reason, requesting officer + role, and the
  stage the application returns to on resubmission.
- The deviation catalog (backend-driven) covers the reference exceptions: age
  outside parameters, discounted application fee, interest-rate reduction,
  missing bank statement / CIBI / marriage certificate / payslips / signature /
  SPA / appointment-service record. Each deviation carries severity
  (0/1/2), a fee-override flag and the encoder's justification; reviewers can
  attach remarks. Severity + total exposure feed approval-tier routing.
- The correction screen shows every open and past return with its feedback,
  lets the encoder amend terms/purpose/deviations, upload missing documents
  (type/size validated both client- and server-side) and requires resolution
  notes before resubmission.

## 8. Backend-dependent items & unresolved questions (mock contracts)

These exist because no ALAS v3 backend was available; each is a documented
mock contract that the real API must confirm or replace:

1. **`Expired` status + `POST /api/loans/{id}/expire`** — the legacy frontend
   had no void state (its dashboard types mention an "Expired" status). The
   endpoint, its authorization (currently `loans.disburse` or admin) and any
   automated nightly voiding job are backend decisions.
2. **`disbursement` block** on loan detail/list (`approvedAt`, `deadlineUtc`,
   `daysRemaining`, `isOverdue`, `voidedAt`, `voidReason`, release reference) —
   legacy synced disbursement from core; the exact shape must come from the
   backend.
3. **`version` token on workflow configuration** — added to satisfy the
   "handle concurrent configuration changes" requirement (409 + authoritative
   payload). The backend may implement this as `rowVersion`/ETag instead.
4. **`POST /api/loans/{id}/sync` (Disbursed → OnGoing)** — stands in for the
   core-banking sync; production should drive this from an integration job.
5. **`defaultAnnualRatePercent` on loan products** — the legacy product DTO has
   no default rate; the creation form needs one. Rate deviations below it
   require the `RATE-01` deviation.
6. **`GET /api/document-template`** — the required-documents checklist template
   (legacy derived it per product); should become
   `/api/loan-products/{code}/document-requirements` as in the legacy API.
7. **Notifications transport** — legacy used SignalR; v3 polls every 30 s.
   Real-time delivery is a backend dependency, not claimed here.
8. **HTTP caching** — mocks send `Cache-Control: no-store` on account/loan
   responses; the real API must set equivalent headers (frontend cache
   invalidation cannot fix server/proxy caching).
9. **Refresh-cookie session restore** — the production contract authenticates
   `POST /api/auth/refresh` with an HttpOnly cookie; the mock cannot observe
   request cookies from a service worker (and Firefox rejects HttpOnly
   Set-Cookie on SW-synthesized responses), so the mock rotates the refresh
   credential on the Bearer token and keeps sessions in-memory
   (reload → sign in again; asserted by E2E). The dev bootstrap registers the
   worker with `updateViaCache: "all"` because Firefox otherwise re-checks the
   worker script on every navigation and can stall reloads in dev.
10. **Approval-authority tier matching** (severity/exposure thresholds,
    assignment order) is mirrored from the legacy routing response; the
    backend routing engine remains the source of truth.

## 9. Frontend assumptions (clearly identified)

- Resubmission returns to `fromStatus` of the latest open revision request
  (reference behavior); if the backend routes differently, only the mock
  handler changes.
- "At risk" disbursement highlighting uses a 5-day display threshold
  (`DISBURSEMENT_AT_RISK_DAYS`); the 30-day rule itself is server-owned.
- Encoder branch is taken from the session (an encoder encodes for their own
  branch); admins see all branches in monitoring.
- Loan amounts are whole hundreds of pesos (legacy denomination rule), also
  enforced by the mock backend.
