import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
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
