import { expect, type Page } from "@playwright/test"

export const PASSWORD = "Passw0rd!"

/** Sign in through the real login form. */
export async function signIn(
  page: Page,
  username: string,
  password = PASSWORD
) {
  await page.goto("/login")
  await page.getByLabel("Username").fill(username)
  await page.getByLabel(/^Password/).fill(password)
  await page.getByRole("button", { name: /sign in/i }).click()
  await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0)
  // Wait for the app shell sidebar.
  await expect(page.getByRole("link", { name: /alas v3 home/i })).toBeVisible()
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

export async function expectToast(page: Page, text: RegExp) {
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: text }).first()
  ).toBeVisible()
}
