import { expect, test } from "@playwright/test"

/**
 * Login screen responsive + keyboard contract (spec §10, §16). Every viewport
 * must render the form without horizontal overflow, keep the primary action
 * reachable, and keep Enterprise Bank branding visible.
 */
const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  // Short windows: browser zoom / split screens / virtual keyboards.
  { width: 1280, height: 600 },
  { width: 800, height: 400 },
]

for (const viewport of VIEWPORTS) {
  test(`login fits ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto("/login", { waitUntil: "domcontentloaded" })

    const username = page.getByLabel("Username")
    await username.waitFor({ state: "visible", timeout: 45_000 })

    // No unintended horizontal scrolling at any width.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)

    // Form, primary action and branding stay visible.
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible()
    await expect(
      page.getByRole("button", { name: /^sign in$/i })
    ).toBeVisible()
    const logos = page.locator("img[alt='Enterprise Bank']:visible")
    await expect(logos).toHaveCount(1)

    if (viewport.width >= 1024) {
      // Split layout: the brand panel carries the application identity.
      await expect(
        page.getByText("Automated Loan Application System").first()
      ).toBeVisible()
    }

    // On normally-proportioned windows the submit button is above the fold.
    if (viewport.height >= 640) {
      const box = await page
        .getByRole("button", { name: /^sign in$/i })
        .boundingBox()
      expect(box).not.toBeNull()
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
    }
  })
}

test("keyboard order walks username → password → toggle → forgot → submit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/login", { waitUntil: "domcontentloaded" })
  const username = page.getByLabel("Username")
  await username.waitFor({ state: "visible", timeout: 45_000 })

  await expect(username).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByLabel(/^Password/)).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(
    page.getByRole("button", { name: "Show password" })
  ).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(
    page.getByRole("link", { name: /forgot password/i })
  ).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeFocused()
})

test("mock accounts stay behind a collapsed, secondary disclosure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/login", { waitUntil: "domcontentloaded" })
  const disclosure = page.getByRole("button", {
    name: /development mock accounts/i,
  })
  await disclosure.waitFor({ state: "visible", timeout: 45_000 })
  await expect(page.getByText("Passw0rd!")).toHaveCount(0)

  await disclosure.click()
  await expect(page.getByText("Passw0rd!")).toBeVisible()
  await page.getByRole("button", { name: "evaluator" }).click()
  await expect(page.getByLabel("Username")).toHaveValue("evaluator")
})
