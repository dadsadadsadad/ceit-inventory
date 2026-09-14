const { databaseClient, databaseError } = require("./database.cjs");
const client = databaseClient();

// Remove personal details from expired, closed requests.
async function main() {
  await client.connect();
  const result = await client.query(
    `UPDATE "BorrowRequest"
     SET "borrowerName" = $1, "studentNumber" = $2, contact = $2, purpose = $3, "returnRequestNotes" = NULL, "staffNotes" = NULL
     WHERE status = ANY($4::"BorrowStatus"[])
       AND "personalDataExpiresAt" <= NOW()
       AND "studentNumber" <> $2`,
    [
      "Archived borrower",
      "REDACTED",
      "Archived borrowing history",
      ["RETURNED", "DECLINED", "CANCELLED"],
    ],
  );
  console.log(JSON.stringify({ redacted: result.rowCount ?? 0 }));
}

main()
  .catch(databaseError)
  .finally(() => client.end());
