import { expect, test } from "@playwright/test"

import { expectToast, resetMockData, setScenario, signIn } from "./helpers"

/**
 * Journey 6 (spec §18): a reviewer claims and releases a GROUPED queue item —
 * both applications of one client are served together.
 */
test("grouped bundle is claimed and released as one unit", async ({ page }) => {
  await page.goto("/login")
  await resetMockData(page)

  await signIn(page, "recommender")
  await page.getByRole("link", { name: /review desk/i }).click()
  await expect(
    page.getByRole("heading", { name: /recommendation desk/i })
  ).toBeVisible()

  // GRP-2026-0001 carries two applications for Roberto Bautista.
  const bundleRow = page.getByRole("row", { name: /bautista/i }).first()
  await expect(bundleRow).toContainText("GRP-2026-0001")

  await bundleRow.getByRole("button", { name: /claim bundle/i }).click()
  await expect(page.getByText(/now serving/i)).toBeVisible()

  const serving = page.getByRole("region", { name: /your current claims/i })
  await expect(serving).toContainText("LAM-2026-0001")
  await expect(serving).toContainText("LAM-2026-0002")
  // The bundle left the waiting queue.
  await expect(
    page.getByRole("region", { name: /waiting queue/i })
  ).not.toContainText("GRP-2026-0001")

  // Release returns it to everyone's queue.
  await serving.getByRole("button", { name: /^release$/i }).click()
  await expectToast(page, /claim released/i)
  await expect(
    page.getByRole("region", { name: /waiting queue/i })
  ).toContainText("GRP-2026-0001")

  // Concurrent claim conflict is surfaced, not silently swallowed.
  await setScenario(page, "claim-conflict")
  await bundleRow.getByRole("button", { name: /claim bundle/i }).click()
  await expectToast(page, /another officer claimed/i)
  await expect(
    page.getByRole("region", { name: /your current claims/i })
  ).toHaveCount(0)
  await setScenario(page, "default")
})

/**
 * Journey 8 (spec §18): account details update correctly and only after the
 * server confirms (profile shows the saved value, not an optimistic one).
 */
test("account details update after server confirmation", async ({ page }) => {
  await page.goto("/login")
  await resetMockData(page)

  await signIn(page, "encoder")
  await page.goto("/account")
  await expect(page.getByText("ana.reyes@alas.mock")).toBeVisible()

  await page.getByRole("button", { name: /^edit$/i }).click()
  const dialog = page.getByRole("dialog")
  const email = dialog.getByLabel(/^email$/i)
  await email.fill("ana.reyes+e2e@alas.mock")
  await dialog.getByRole("button", { name: /save changes/i }).click()

  await expectToast(page, /account details saved/i)
  await expect(page.getByText("ana.reyes+e2e@alas.mock")).toBeVisible()
  await expect(page.getByText("ana.reyes@alas.mock")).toHaveCount(0)

  // A reload shows the persisted value (server state, not client cache).
  await page.reload()
  await page.goto("/account")
  await expect(page.getByText("ana.reyes+e2e@alas.mock")).toBeVisible()
})

/**
 * Journey 10 (spec §18): a session change never exposes the previous user's
 * cached data.
 */
test("session change does not leak the previous user's cached data", async ({
  page,
}) => {
  await page.goto("/login")
  await resetMockData(page)

  await signIn(page, "encoder")
  await page.goto("/account")
  await expect(page.getByText("ana.reyes@alas.mock")).toBeVisible()

  // Sign out via the account menu.
  await page.getByRole("button", { name: /account menu/i }).click()
  await page.getByRole("menuitem", { name: /sign out/i }).click()
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()

  // A different user signs in on the same page/session storage.
  await signIn(page, "evaluator")
  await page.goto("/account")
  await expect(page.getByText("maria.domingo@alas.mock")).toBeVisible()
  await expect(page.getByText("ana.reyes@alas.mock")).toHaveCount(0)
  // Role-scoped navigation changed with the identity.
  await expect(page.getByRole("link", { name: /review desk/i })).toBeVisible()
  await expect(
    page.getByRole("link", { name: /new application/i })
  ).toHaveCount(0)
})

/**
 * Journey 11 (spec §18): disbursement monitoring displays overdue and voided
 * applications exactly as the API represents them, and voiding an overdue
 * application goes through the backend rule.
 */
test("disbursement board shows overdue and voided applications", async ({
  page,
}) => {
  await page.goto("/login")
  await resetMockData(page)

  await signIn(page, "approver")
  await page.goto("/monitoring/disbursement")
  await expect(
    page.getByRole("heading", { name: /disbursement monitoring/i })
  ).toBeVisible()

  // Overdue application is flagged with days past the deadline.
  const overdueRow = page.getByRole("row", { name: /lam-2026-0010/i })
  await expect(overdueRow).toContainText(/days overdue/i)

  // Voiding requires a reason and goes through the server rule.
  await overdueRow.getByRole("link", { name: /process/i }).click()
  await expect(
    page.getByRole("heading", { name: "LAM-2026-0010" })
  ).toBeVisible()
  await expect(
    page.getByText(/30-day disbursement window lapsed/i)
  ).toBeVisible()
  await page
    .getByRole("button", { name: /void application \(timeout\)/i })
    .click()
  const dialog = page.getByRole("dialog")
  await dialog
    .getByLabel(/void reason/i)
    .fill("Advised twice; client did not claim proceeds within the window.")
  await dialog.getByRole("button", { name: /void application/i }).click()
  await expectToast(page, /voided \(disbursement timeout\)/i)
  await expect(page.getByText("Expired (Voided)").first()).toBeVisible()

  // The voided tab archives it with the reason preserved.
  await page.goto("/monitoring/disbursement")
  await page.getByRole("tab", { name: /^voided/i }).click()
  await expect(page.getByRole("row", { name: /lam-2026-0015/i })).toBeVisible()
  await expect(page.getByRole("row", { name: /lam-2026-0010/i })).toBeVisible()
})

/**
 * Backend enforcement (spec §5.7): an application inside the window cannot be
 * voided — the UI hides the action and the server refuses it.
 */
test("cannot void an application inside the disbursement window", async ({
  page,
}) => {
  await page.goto("/login")
  await resetMockData(page)

  await signIn(page, "approver")
  await page.goto("/loans/1011/approve")
  await expect(
    page.getByRole("heading", { name: "LAM-2026-0011" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: /void application/i })
  ).toHaveCount(0)
  await expect(page.getByText(/3 days left/i)).toBeVisible()
})
