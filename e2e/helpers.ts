import { expect, type Page } from "@playwright/test"

export const PASSWORD = "Passw0rd!"

/** Sign out through the account menu and wait for the login screen. */
export async function signOut(page: Page) {
  await page.getByRole("button", { name: /account menu/i }).click()
  await page.getByRole("menuitem", { name: /sign out/i }).click()
  await page.waitForURL("**/login", { timeout: 30_000 })
}

/** Fill and submit the login form when already on the login screen. */
export async function submitLogin(
  page: Page,
  username: string,
  password = PASSWORD
) {
  const field = page.getByLabel("Username")
  await field.waitFor({ state: "visible", timeout: 45_000 })
  await field.fill(username)
  await page.getByLabel(/^Password/).fill(password)
  await page.getByRole("button", { name: /sign in/i }).click()
  await expect(page.getByRole("heading", { name: "Welcome back" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: /alas v3 home/i })).toBeVisible()
}

/** Sign in through the real login form. */
export async function signIn(
  page: Page,
  username: string,
  password = PASSWORD
) {
  // Dev-server + service-worker reload cycles can keep the `load` event
  // pending; wait for DOM instead, then for the meaningful element.
  await page.goto("/login", { waitUntil: "domcontentloaded" })
  await submitLogin(page, username, password)
}

/** Reset the mock database to its seeded state between journeys. */
export async function resetMockData(page: Page) {
  await page.evaluate(() => window.__alasMock?.resetDb())
}

/** Switch the mock failure scenario (dev-only control surface). */
export async function setScenario(page: Page, scenario: string) {
  await page.evaluate((value) => {
    window.__alasMock?.setScenario(value as never)
  }, scenario)
}

/** Navigate inside the SPA through the sidebar (real user flow). */
export async function nav(page: Page, name: RegExp) {
  await page.getByRole("link", { name }).first().click()
}

/**
 * Open one application through Monitoring search (the operational path a
 * reviewer actually uses), landing on its detail screen.
 */
export async function openLoanViaMonitoring(page: Page, lamId: string) {
  await nav(page, /^monitoring$/i)
  await page
    .getByPlaceholder(/lam id, client, group, product/i)
    .fill(lamId)
  const link = page.getByRole("link", { name: lamId }).first()
  await link.click()
  try {
    await page
      .getByRole("heading", { name: lamId })
      .waitFor({ timeout: 10_000 })
  } catch {
    // The row can re-render between query and click; retry once.
    await link.click()
    await page
      .getByRole("heading", { name: lamId })
      .waitFor({ timeout: 20_000 })
  }
}

/**
 * Radix Select on Firefox occasionally swallows the opening click when the
 * portal mounts late; retry once after asserting the listbox state.
 */
export async function selectOption(page: Page, trigger: RegExp, option: RegExp) {
  const combobox = page.getByRole("combobox", { name: trigger })
  await combobox.click()
  let optionLocator = page.getByRole("option", { name: option })
  try {
    await optionLocator.first().waitFor({ state: "visible", timeout: 5_000 })
  } catch {
    // Diagnostics for flaky portal mounts (visible in the test log).
    console.log(
      `[select] retry: options=${await page.getByRole("option").count()} listbox=${await page.getByRole("listbox").count()} expanded=${await combobox.getAttribute("aria-expanded")}`
    )
    await combobox.click()
    optionLocator = page.getByRole("option", { name: option })
    await optionLocator.first().waitFor({ state: "visible", timeout: 10_000 })
  }
  await optionLocator.first().click()
}

export async function expectToast(page: Page, text: RegExp) {
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: text }).first()
  ).toBeVisible()
}
