import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { parseEnv } from "node:util";
import pg from "pg";

const envPath = ".env.e2e.local";
if (!existsSync(envPath)) {
  console.log("No test database configured.");
  process.exit(0);
}

const savedEnv = readFileSync(envPath, "utf8");
const env = parseEnv(savedEnv);
const schema = env.INVENTORY_DB_SCHEMA;
if (!/^ceit_test_launch_\d+$/.test(schema ?? "")) {
  throw new Error("Cleanup requires an isolated launch-test schema.");
}
if (!env.DATABASE_URL) {
  throw new Error("The test database connection is missing.");
}
const apply = process.argv.includes("--apply");
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
});

try {
  await client.connect();
  const tables = await client.query(
    "SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = $1",
    [schema],
  );
  if (apply) {
    // The validated name comes only from the test setup file.
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    if (readFileSync(envPath, "utf8") === savedEnv) {
      unlinkSync(envPath);
    }
  }
  console.log(
    JSON.stringify({ mode: apply ? "apply" : "preview", schema, tables: tables.rows[0].count }),
  );
} catch (error) {
  console.error("Test cleanup failed:", error.code ?? error.name);
  process.exitCode = 1;
} finally {
  await client.end();
}
