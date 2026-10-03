import { defineConfig, devices } from "@playwright/test";

// Public tests only change their own browser's preferences, so the same suite
// can verify a deployed release without signing in or editing inventory data.
const deployedBaseURL = process.env.CEIT_E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: deployedBaseURL || "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: deployedBaseURL
    ? undefined
    : {
        command: "npm run build && npm run start -- -p 3100 -H 127.0.0.1",
        env: {
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:5432/unused",
          NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
        },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: "http://127.0.0.1:3100/auth/login",
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
