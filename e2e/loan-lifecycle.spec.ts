import { expect, test } from "@playwright/test"

import { expectToast, resetMockData, signIn } from "./helpers"

/**
 * Journey 1 + 2 + 3 + 4 (spec §18): an application follows the configured
 * recommendation path through evaluation to approval, including the 30-day
 * disbursement window opening on approval.
 */
test("encoder submits and the application walks the configured pipeline", async ({
  page,
  browser,
}) => {
  await page.goto("/login")
  await resetMockData(page)

  // --- Encoder creates and submits ------------------------------------------
  await signIn(page, "encoder")
  await page.getByRole("link", { name: /new application/i }).click()

  await page
    .getByPlaceholder(/cis number, name, or employee number/i)
    .fill("Delgado")
  await page.getByRole("button", { name: /delgado, fernando/i }).click()
  await page.getByRole("radio", { name: /0118-3390-19/i }).click()
  // Existing obligation → confirm encoding as Reloan.
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("radio", { name: /reloan/i }).check()
  await page.getByRole("button", { name: /continue/i }).click()

  await page.getByRole("button", { name: /add application/i }).click()
  await page.getByRole("combobox", { name: /loan product/i }).click()
  await page.getByRole("option", { name: /sal-regular/i }).click()
  await page.getByLabel(/^purpose/i).fill("House extension")
  await page.getByLabel(/loan amount/i).fill("300000")
  await page.getByLabel(/term \(days\)/i).fill("1080")
  await page.getByRole("button", { name: /continue/i }).click()

  // Documents: mark all on hand.
  const checkboxes = page.getByRole("checkbox")
  for (let index = 0; index < (await checkboxes.count()); index++) {
    await checkboxes.nth(index).check()
  }
  await page.getByRole("button", { name: /continue/i }).click()

  await expect(page.getByText(/group total/i)).toBeVisible()
  await page.getByRole("button", { name: /submit 1 application/i }).click()
  await expect(page.getByText(/application group submitted/i)).toBeVisible()
  // Recommendation is ON by default → backend routes to ForRecommendation.
  await expect(page.getByText("For Recommendation")).toBeVisible()
  const lamId = (
    await page.locator("a[href^='/loans/']").first().textContent()
  )?.trim()
  expect(lamId).toMatch(/^LAM-2026-/)

  // --- Recommender acts -------------------------------------------------------
  const recContext = await browser.newContext()
  const recPage = await recContext.newPage()
  await signIn(recPage, "recommender")
  await recPage.getByRole("link", { name: /review desk/i }).click()
  await expect(
    recPage.getByRole("heading", { name: /recommendation desk/i })
  ).toBeVisible()
  const bundleRow = recPage.getByRole("row", { name: /delgado/i }).first()
  await bundleRow.getByRole("button", { name: /claim bundle/i }).click()
  await expect(recPage.getByText(/now serving/i)).toBeVisible()
  await recPage
    .getByRole("link", { name: /^open$/i })
    .first()
    .click()

  // Detail screen: recommend inline.
  await expect(recPage.getByRole("heading", { name: lamId! })).toBeVisible()
  await recPage
    .getByRole("button", { name: /^recommend$/i })
    .first()
    .click()
  const recDialog = recPage.getByRole("dialog")
  await recDialog
    .getByLabel(/remarks/i)
    .fill("Client verified; reloan supported by existing clean amortizations.")
  await recDialog.getByRole("button", { name: /^recommend$/i }).click()
  await expectToast(recPage, /recommended for evaluation/i)
  await expect(recPage.getByText("For Checking")).toBeVisible()
  await recContext.close()

  // --- Evaluator acts ---------------------------------------------------------
  const evalContext = await browser.newContext()
  const evalPage = await evalContext.newPage()
  await signIn(evalPage, "evaluator")
  // Find the application through monitoring (LAM ID search), then open the desk action.
  await evalPage.goto("/monitoring")
  await evalPage
    .getByPlaceholder(/lam id, client, group, product/i)
    .fill(lamId!)
  await evalPage.getByRole("link", { name: lamId! }).first().click()
  await evalPage.getByRole("link", { name: /open evaluation/i }).click()

  await expect(evalPage.getByRole("heading", { name: lamId! })).toBeVisible()
  await evalPage
    .getByRole("button", { name: /recommend for approval/i })
    .click()
  await evalPage
    .getByLabel(/evaluation findings/i)
    .fill(
      "Capacity verified against NTHP; obligations consistent with core records."
    )
  await evalPage.getByRole("button", { name: /^recommend$/i }).click()
  await expectToast(evalPage, /recommended for approval/i)
  await evalContext.close()

  // --- Approver acts; 30-day window opens ------------------------------------
  const appContext = await browser.newContext()
  const appPage = await appContext.newPage()
  // Routing assigns Tier 2 (exposure ≈ ₱421k, severity 0) to the first active
  // approver — Jose Mendoza (username "approver").
  await signIn(appPage, "approver")
  await appPage.goto("/monitoring")
  await appPage.getByPlaceholder(/lam id, client, group, product/i).fill(lamId!)
  await appPage.getByRole("link", { name: lamId! }).first().click()
  await appPage.getByRole("link", { name: /open approval review/i }).click()

  await expect(appPage.getByRole("heading", { name: lamId! })).toBeVisible()
  await appPage.getByRole("button", { name: /^approve$/i }).click()
  await appPage
    .getByLabel(/approval remarks/i)
    .fill("Approved within Tier 3 authority; exposure verified.")
  await appPage.getByRole("button", { name: /approve loan/i }).click()
  await expectToast(appPage, /approved\. disbursement window: 30 days/i)
  // Post-approval processing controls appear; window deadline is displayed.
  await expect(
    appPage.getByRole("button", { name: /prepare disbursement/i })
  ).toBeVisible()
  await expect(appPage.getByText(/30-day deadline/i)).toBeVisible()
  await appContext.close()
})

/**
 * Journey 5 (spec §18): an application is returned for correction and
 * resubmitted — feedback travels with it and history is preserved.
 */
test("returned application is corrected and resubmitted to the returning stage", async ({
  page,
  browser,
}) => {
  await page.goto("/login")
  await resetMockData(page)

  // Evaluator returns LAM-2026-0004 with section feedback.
  await signIn(page, "evaluator")
  await page.goto("/loans/1004/evaluate")
  await expect(
    page.getByRole("heading", { name: "LAM-2026-0004" })
  ).toBeVisible()
  await page.getByRole("button", { name: /return for correction/i }).click()
  await page.getByRole("checkbox", { name: /obligations/i }).check()
  await page
    .getByLabel(/correction details for obligations/i)
    .fill("Buy-out quotation is older than 30 days; refresh the figures.")
  await page
    .getByLabel(/overall reason/i)
    .fill("Stale buy-out quotation — refresh before approval routing.")
  await page.getByRole("button", { name: /return to encoder/i }).click()
  await expectToast(page, /returned to the encoder/i)

  // Encoder sees the feedback and resubmits.
  const encContext = await browser.newContext()
  const encPage = await encContext.newPage()
  await signIn(encPage, "encoder")
  await encPage.goto("/loans/1004/revise")
  await expect(
    encPage.getByText(/returned by maria domingo \(evaluator\)/i)
  ).toBeVisible()
  await expect(encPage.getByText(/stale buy-out quotation/i)).toBeVisible()
  await encPage
    .getByLabel(/what did you correct\?/i)
    .fill(
      "Refreshed the buy-out quotation from the creditor's latest statement."
    )
  await encPage.getByRole("button", { name: /resubmit application/i }).click()
  await expectToast(encPage, /resubmitted for review/i)
  // Back at the stage that issued the return (ForChecking) — not reset to start.
  await expect(encPage.getByText("For Checking")).toBeVisible()
  // Previous decisions preserved.
  await expect(encPage.getByText(/recommend/i).first()).toBeVisible()
  await encContext.close()
})

/**
 * Journey 2b + 7 (spec §18): an administrator disables the recommendation
 * step; NEW applications skip it while EXISTING ones keep their route.
 */
test("admin changes the recommendation setting without rerouting in-flight loans", async ({
  page,
  browser,
}) => {
  await page.goto("/login")
  await resetMockData(page)

  await signIn(page, "admin")
  await page.goto("/admin/workflow")
  await expect(
    page.getByRole("switch", { name: /require recommendation/i })
  ).toBeChecked()
  await page.getByRole("switch", { name: /require recommendation/i }).click()

  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toContainText(/skip the branch head/i)
  await expect(dialog).toContainText(/already waiting for recommendation/i)
  await expect(dialog).toContainText(/keep the recommender stage/i)
  await dialog.getByRole("button", { name: /disable step/i }).click()
  await expectToast(page, /recommendation step disabled/i)
  await expect(
    page.getByRole("switch", { name: /require recommendation/i })
  ).not.toBeChecked()

  // Existing ForRecommendation applications are untouched (recommender desk still holds them).
  const recContext = await browser.newContext()
  const recPage = await recContext.newPage()
  await signIn(recPage, "recommender")
  await recPage.getByRole("link", { name: /review desk/i }).click()
  await expect(recPage.getByRole("row", { name: /bautista/i })).toBeVisible()
  await recContext.close()

  // New submissions skip recommendation → evaluator desk receives them.
  const encContext = await browser.newContext()
  const encPage = await encContext.newPage()
  await signIn(encPage, "encoder")
  await encPage.goto("/loans/new")
  await encPage
    .getByPlaceholder(/cis number, name, or employee number/i)
    .fill("Tan")
  await encPage.getByRole("button", { name: /tan, grace/i }).click()
  await encPage.getByRole("radio", { name: /0118-4471-66/i }).click()
  await encPage.getByRole("button", { name: /continue/i }).click()
  await encPage.getByRole("button", { name: /add application/i }).click()
  await encPage.getByRole("combobox", { name: /loan product/i }).click()
  await encPage.getByRole("option", { name: /c02/i }).click()
  await encPage.getByLabel(/^purpose/i).fill("Appliance replacement")
  await encPage.getByLabel(/loan amount/i).fill("50000")
  await encPage.getByLabel(/term \(days\)/i).fill("360")
  await encPage.getByRole("button", { name: /continue/i }).click()
  const checkboxes = encPage.getByRole("checkbox")
  for (let index = 0; index < (await checkboxes.count()); index++) {
    await checkboxes.nth(index).check()
  }
  await encPage.getByRole("button", { name: /continue/i }).click()
  await encPage.getByRole("button", { name: /submit 1 application/i }).click()
  await expect(encPage.getByText(/application group submitted/i)).toBeVisible()
  // Backend assigned ForChecking directly (recommendation disabled).
  await expect(encPage.getByText("For Checking")).toBeVisible()
  await encContext.close()

  // Restore the setting for later tests.
  await page.goto("/admin/workflow")
  await page.getByRole("switch", { name: /require recommendation/i }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /enable step/i })
    .click()
  await expectToast(page, /recommendation step enabled/i)
})

/**
 * Journey 9 (spec §18): a failed mutation displays an appropriate error and
 * never fakes success.
 */
test("failed workflow mutation shows the error and keeps data", async ({
  page,
}) => {
  await page.goto("/login")
  await resetMockData(page)

  await signIn(page, "evaluator")
  await page.goto("/loans/1004/evaluate")
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
  // Remarks preserved for retry.
  await expect(dialog.getByLabel(/evaluation findings/i)).toHaveValue(
    "All requirements verified; proceeding."
  )
  // Status unchanged.
  await dialog.getByRole("button", { name: /^cancel$/i }).click()
  await expect(page.getByText("For Checking")).toBeVisible()

  await setScenario(page, "default")
})
