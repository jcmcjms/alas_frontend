import { expect, test } from "@playwright/test"

import {
  expectToast,
  nav,
  openLoanViaMonitoring,
  resetMockData,
  setScenario,
  signOut,
  submitLogin,
} from "./helpers"

/**
 * Journey 1-4 (spec §18): one application walks the configured pipeline
 * Encoder → Recommender → Evaluator → Approver, with role handoffs performed
 * on a single workstation (sign out / sign in) — the operational reality for
 * shared branch machines, and deterministic under the mock session model.
 */
test("encoder submits and the application walks the configured pipeline", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" })
  await resetMockData(page)

  // --- Encoder creates and submits ------------------------------------------
  await submitLogin(page, "encoder")
  await nav(page, /new application/i)

  await page
    .getByPlaceholder(/cis number, name, or employee number/i)
    .fill("Delgado")
  await page.getByRole("button", { name: /delgado, fernando/i }).click()
  await page.getByRole("radio", { name: /0118-3390-19/i }).click()
  await page.getByRole("radio", { name: /reloan/i }).check()
  await page.getByRole("button", { name: /continue/i }).click()
  await page
    .getByRole("button", { name: /add application/i })
    .waitFor({ timeout: 20_000 })

  await page.getByRole("button", { name: /add application/i }).click()
  await page.getByLabel(/loan product/i).selectOption("SAL-REG")
  await page.getByLabel(/^purpose/i).fill("House extension")
  await page.getByLabel(/loan amount/i).fill("300000")
  await page.getByLabel(/term \(days\)/i).fill("1080")
  await page.getByRole("button", { name: /continue/i }).click()
  await page.getByText(/required documents/i).waitFor({ timeout: 20_000 })

  // Documents: mark all on hand.
  const checkboxes = page.getByRole("checkbox")
  for (let index = 0; index < (await checkboxes.count()); index++) {
    await checkboxes.nth(index).check()
  }
  await page.getByRole("button", { name: /continue/i }).click()

  await page.getByText(/group total/i).waitFor({ timeout: 20_000 })
  await page
    .getByRole("button", { name: /submit 1 application/i })
    .dispatchEvent("click")
  await expect(page.getByText(/application group submitted/i)).toBeVisible()
  // Recommendation is ON by default → backend routes to ForRecommendation.
  await expect(page.getByText("For Recommendation")).toBeVisible()
  const createdLink = page.getByRole("link", { name: /^LAM-2026-/ }).first()
  const lamId = (await createdLink.textContent())?.trim()
  expect(lamId).toMatch(/^LAM-2026-/)

  // --- Recommender: claim the bundle and recommend ---------------------------
  await signOut(page)
  await submitLogin(page, "recommender")
  await nav(page, /review desk/i)
  await expect(
    page.getByRole("heading", { name: /recommendation desk/i })
  ).toBeVisible()
  const bundleRow = page.getByRole("row", { name: /delgado/i }).first()
  await bundleRow.getByRole("button", { name: /claim bundle/i }).click()
  await expect(page.getByText(/now serving/i)).toBeVisible()
  await page
    .getByRole("region", { name: /your current claims/i })
    .getByRole("link", { name: /^open$/i })
    .first()
    .click()

  await expect(page.getByRole("heading", { name: lamId! })).toBeVisible()
  await page.getByRole("button", { name: /^recommend$/i }).first().click()
  const recDialog = page.getByRole("dialog")
  await recDialog
    .getByLabel(/remarks/i)
    .fill("Client verified; reloan supported by clean amortization history.")
  await recDialog.getByRole("button", { name: /^recommend$/i }).dispatchEvent("click")
  await expectToast(page, /recommended for evaluation/i)
  await expect(page.getByText("For Checking")).toBeVisible()

  // --- Evaluator: recommend for approval -------------------------------------
  await signOut(page)
  await submitLogin(page, "evaluator")
  await openLoanViaMonitoring(page, lamId!)
  await page.getByRole("link", { name: /open evaluation/i }).click()
  await expect(page.getByRole("heading", { name: lamId! })).toBeVisible()
  await page.getByRole("button", { name: /recommend for approval/i }).click()
  const evalDialog = page.getByRole("dialog")
  await evalDialog
    .getByLabel(/evaluation findings/i)
    .fill("Capacity verified against NTHP; obligations consistent with core records.")
  await evalDialog.getByRole("button", { name: /^recommend$/i }).dispatchEvent("click")
  await expectToast(page, /recommended for approval/i)

  // --- Approver: approve; the 30-day window opens ----------------------------
  await signOut(page)
  await submitLogin(page, "approver")
  await openLoanViaMonitoring(page, lamId!)
  await page.getByRole("link", { name: /open approval review/i }).click()
  await expect(page.getByRole("heading", { name: lamId! })).toBeVisible()
  await page.getByRole("button", { name: /^approve$/i }).click()
  const appDialog = page.getByRole("dialog")
  await appDialog
    .getByLabel(/approval remarks/i)
    .fill("Approved within authority; exposure and documents verified.")
  await appDialog.getByRole("button", { name: /approve loan/i }).dispatchEvent("click")
  await expectToast(page, /approved\. disbursement window: 30 days/i)
  await expect(
    page.getByRole("button", { name: /prepare disbursement/i })
  ).toBeVisible()
  await expect(page.getByText(/30-day deadline/i)).toBeVisible()
})

/**
 * Journey 9 (spec §18): return for correction → encoder corrects → resubmit
 * to the returning stage, with feedback and history preserved.
 */
test("returned application is corrected and resubmitted to the returning stage", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" })
  await resetMockData(page)

  // Evaluator returns LAM-2026-0004 with section feedback.
  await submitLogin(page, "evaluator")
  await openLoanViaMonitoring(page, "LAM-2026-0004")
  await page.getByRole("link", { name: /open evaluation/i }).click()
  await expect(
    page.getByRole("heading", { name: "LAM-2026-0004" })
  ).toBeVisible()
  await page.getByRole("button", { name: /return for correction/i }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("checkbox", { name: /obligations/i }).check()
  await dialog
    .getByLabel(/correction details for obligations/i)
    .fill("Buy-out quotation is older than 30 days; refresh the figures.")
  await dialog
    .getByLabel(/overall reason/i)
    .fill("Stale buy-out quotation — refresh before approval routing.")
  await dialog.getByRole("button", { name: /return to encoder/i }).dispatchEvent("click")
  await expectToast(page, /returned to the encoder/i)

  // Encoder sees the feedback, corrects and resubmits.
  await signOut(page)
  await submitLogin(page, "encoder")
  await openLoanViaMonitoring(page, "LAM-2026-0004")
  await page.getByRole("link", { name: /correct & resubmit/i }).click()
  await expect(
    page.getByText(/returned by maria domingo \(evaluator\)/i)
  ).toBeVisible()
  await expect(page.getByText(/stale buy-out quotation/i).first()).toBeVisible()
  await page
    .getByLabel(/what did you correct\?/i)
    .fill("Refreshed the buy-out quotation from the creditor's latest statement.")
  await page.getByRole("button", { name: /resubmit application/i }).dispatchEvent("click")
  await expectToast(page, /resubmitted for review/i)
  // Back at the stage that issued the return (ForChecking), history intact.
  await expect(page.getByText("For Checking").first()).toBeVisible()
  await expect(page.getByText(/pushback/i).first()).toBeVisible()
})

/**
 * Journeys 4-5 + 7 (spec §18): disabling the recommendation step reroutes only
 * NEW submissions; in-flight bundles keep their Recommender stage.
 */
test("admin changes the recommendation setting without rerouting in-flight loans", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" })
  await resetMockData(page)

  await submitLogin(page, "admin")
  await nav(page, /workflow settings/i)
  await expect(
    page.getByRole("switch", { name: /require recommendation/i })
  ).toBeChecked()
  await page.getByRole("switch", { name: /require recommendation/i }).click()

  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toContainText(/skip the branch head/i)
  await expect(dialog).toContainText(/already waiting for recommendation/i)
  await expect(dialog).toContainText(/keep the recommender stage/i)
  await dialog.getByRole("button", { name: /disable step/i }).dispatchEvent("click")
  await expectToast(page, /recommendation step disabled/i)
  await expect(
    page.getByRole("switch", { name: /require recommendation/i })
  ).not.toBeChecked()

  // In-flight bundles stay on the Recommender desk.
  await signOut(page)
  await submitLogin(page, "recommender")
  await nav(page, /review desk/i)
  await expect(page.getByRole("row", { name: /bautista/i })).toBeVisible()

  // New submissions skip recommendation and land at ForChecking.
  await signOut(page)
  await submitLogin(page, "encoder")
  await nav(page, /new application/i)
  await page.getByPlaceholder(/cis number, name, or employee number/i).fill("Tan")
  await page.getByRole("button", { name: /tan, grace/i }).click()
  await page.getByRole("radio", { name: /0118-4471-66/i }).click()
  await page.getByRole("button", { name: /continue/i }).click()
  await page
    .getByRole("button", { name: /add application/i })
    .waitFor({ timeout: 20_000 })
  await page.getByRole("button", { name: /add application/i }).click()
  await page.getByLabel(/loan product/i).selectOption("C02")
  await page.getByLabel(/^purpose/i).fill("Appliance replacement")
  await page.getByLabel(/loan amount/i).fill("50000")
  await page.getByLabel(/term \(days\)/i).fill("360")
  await page.getByRole("button", { name: /continue/i }).click()
  await page.getByText(/required documents/i).waitFor({ timeout: 20_000 })
  const boxes = page.getByRole("checkbox")
  for (let index = 0; index < (await boxes.count()); index++) {
    await boxes.nth(index).check()
  }
  await page.getByRole("button", { name: /continue/i }).click()
  await page.getByText(/group total/i).waitFor({ timeout: 20_000 })
  await page
    .getByRole("button", { name: /submit 1 application/i })
    .dispatchEvent("click")
  await expect(page.getByText(/application group submitted/i)).toBeVisible()
  await expect(page.getByText("For Checking")).toBeVisible()

  // Restore the setting for subsequent runs.
  await signOut(page)
  await submitLogin(page, "admin")
  await nav(page, /workflow settings/i)
  await page.getByRole("switch", { name: /require recommendation/i }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /enable step/i })
    .dispatchEvent("click")
  await expectToast(page, /recommendation step enabled/i)
})

/**
 * Journey (spec §18 #9): a failed workflow mutation shows the error inside the
 * dialog, keeps the officer's input, and changes nothing.
 */
test("failed workflow mutation shows the error and keeps data", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" })
  await resetMockData(page)

  await submitLogin(page, "evaluator")
  await openLoanViaMonitoring(page, "LAM-2026-0004")
  await page.getByRole("link", { name: /open evaluation/i }).click()
  await expect(
    page.getByRole("heading", { name: "LAM-2026-0004" })
  ).toBeVisible()

  await setScenario(page, "mutation-failure")
  await page.getByRole("button", { name: /recommend for approval/i }).click()
  const dialog = page.getByRole("dialog")
  await dialog
    .getByLabel(/evaluation findings/i)
    .fill("All requirements verified; proceeding.")
  await dialog.getByRole("button", { name: /^recommend$/i }).click()

  await expect(dialog.getByText(/action failed/i)).toBeVisible()
  await expect(dialog).toContainText(/nothing changed/i)
  await expect(dialog.getByLabel(/evaluation findings/i)).toHaveValue(
    "All requirements verified; proceeding."
  )
  await dialog.getByRole("button", { name: /^cancel$/i }).dispatchEvent("click")
  await expect(page.getByText("For Checking")).toBeVisible()

  await setScenario(page, "default")
})
