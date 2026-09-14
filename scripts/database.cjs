const { existsSync } = require("node:fs");
const { loadEnvFile } = require("node:process");
const { Client } = require("pg");

if (existsSync(".env.local")) {
  loadEnvFile(".env.local");
}
if (existsSync(".env")) {
  loadEnvFile(".env");
}

// Use the same database choice as the application.
function databaseClient() {
  const connectionString =
    process.env.SCHOOL_DATABASE_URL || process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error("Set a database connection before running this script.");
  }
  return new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  });
}

// Keep connection details out of command output.
function databaseError(error) {
  console.error(`Database task failed (${error.code || error.name || "unknown error"}).`);
  process.exitCode = 1;
}

module.exports = { databaseClient, databaseError };
