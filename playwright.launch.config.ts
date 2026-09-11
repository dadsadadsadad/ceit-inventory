import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/launch",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3101", trace: "retain-on-failure" },
  webServer: {
    command: "node --env-file=.env.e2e.local node_modules/next/dist/bin/next start -p 3101 -H 127.0.0.1",
    url: "http://127.0.0.1:3101/auth/login",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [{ name: "launch-chromium", use: { ...devices["Desktop Chrome"] } }],
});
