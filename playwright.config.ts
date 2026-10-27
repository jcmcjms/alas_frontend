import { defineConfig, devices } from "@playwright/test"

/**
 * E2E for the critical ALAS workflows (spec §18). Runs against the dev server
 * with the MSW mock API enabled (.env.development), so journeys are
 * deterministic and need no backend.
 *
 * Run:  npm run test:e2e          (after: npx playwright install chromium)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      // Container/CI friendly: no GPU device and a small /dev/shm.
      args: ["--disable-gpu", "--disable-dev-shm-usage"],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
