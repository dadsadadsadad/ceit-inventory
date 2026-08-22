const { existsSync } = require("node:fs");
const { loadEnvFile } = require("node:process");

if (existsSync(".env.local")) loadEnvFile(".env.local");
if (existsSync(".env")) loadEnvFile(".env");

const { Client } = require("pg");

const connectionString = process.env.SCHOOL_DATABASE_URL || process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) throw new Error("SCHOOL_DATABASE_URL, DATABASE_URL, or DIRECT_URL is missing.");

const client = new Client({ connectionString });

async function main() {
  await client.connect();
  const result = await client.query(
    `UPDATE "BorrowRequest"
     SET "borrowerName" = $1, "studentNumber" = $2, contact = $2, purpose = $3, "returnRequestNotes" = NULL, "staffNotes" = NULL
     WHERE status = ANY($4::"BorrowStatus"[])
       AND "personalDataExpiresAt" <= NOW()
       AND "studentNumber" <> $2`,
    ["Archived borrower", "REDACTED", "Archived borrowing history", ["RETURNED", "DECLINED"]],
  );
  console.log(JSON.stringify({ redacted: result.rowCount ?? 0 }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => client.end());
