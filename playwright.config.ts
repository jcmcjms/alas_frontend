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
  expect: { timeout: 20_000 },
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
    {
      // Sandbox/CI with 2 cores: first navigation includes MSW worker
      // registration and Vite transforms; measured ~40-70 s cold.
      name: "firefox",
      timeout: 240_000,
      // This sandbox's Firefox intermittently reload-loops on first document
      // load (SW claim race); one retry distinguishes environment flakes from
      // defects (failures reproducing on retry are investigated, not hidden).
      retries: 1,
      use: { ...devices["Desktop Firefox"] },
    },
  ],
  webServer: {
    // E2E runs against the BUILT app (dev-mode build keeps MSW enabled),
    // served by `vite preview`: no on-the-fly transforms, deterministic
    // load times, and the tests exercise the production artifact shape.
    command: "npm run build:e2e && npm run preview:e2e",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
