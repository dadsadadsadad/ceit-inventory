import { spawnSync } from "node:child_process";
import { loadEnvFile } from "node:process";

loadEnvFile(".env.e2e.local");
if (!/^ceit_test_[a-z0-9_]+$/.test(process.env.INVENTORY_DB_SCHEMA ?? "")) {
  throw new Error("Run test:launch:setup to create an isolated test database first.");
}

// Pass environment values without forwarding --env-file to Next.js build workers.
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  env: process.env,
  stdio: "inherit",
});
if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
