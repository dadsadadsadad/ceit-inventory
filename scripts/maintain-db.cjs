const { databaseClient, databaseError } = require("./database.cjs");
const apply = process.argv.includes("--apply");
const client = databaseClient();

// Check inventory integrity and clean up expired operational data.
async function main() {
  await client.connect();
  await client.query("BEGIN");
  try {
    // Only expired operational data is eligible for removal.
    const expiredSessions = await client.query(
      'SELECT COUNT(*)::int AS count FROM public."UserSession" WHERE "expiresAt" <= NOW()',
    );
    const oldAttempts = await client.query(
      'SELECT COUNT(*)::int AS count FROM public."PublicRequestAttempt" WHERE "updatedAt" < NOW() - INTERVAL \'24 hours\'',
    );
    const inventory = await client.query(
      'SELECT COUNT(*)::int AS count FROM public."InventoryItem"',
    );
    const checks = await client.query(`SELECT
      (SELECT COUNT(*)::int FROM public."InventoryItem" WHERE quantity < 0) AS negative_stock,
      (SELECT COUNT(*)::int FROM public."MaintenanceTicket" WHERE source NOT IN ('QR', 'STAFF')) AS invalid_issue_sources,
      (SELECT COUNT(*)::int FROM public."InventoryItem" i LEFT JOIN public."Category" c ON c.id=i."categoryId" LEFT JOIN public."Location" l ON l.id=i."locationId" WHERE c.id IS NULL OR l.id IS NULL) AS orphaned_items,
      (SELECT COUNT(*)::int FROM public."BorrowRequest" b LEFT JOIN public."InventoryItem" i ON i.id=b."inventoryItemId" WHERE i.id IS NULL) AS orphaned_loans`);
    const testSchemas = await client.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'ceit_test_launch_%' ORDER BY schema_name",
    );
    let removedSessions = 0,
      removedAttempts = 0;
    if (apply) {
      removedSessions = (
        await client.query('DELETE FROM public."UserSession" WHERE "expiresAt" <= NOW()')
      ).rowCount;
      removedAttempts = (
        await client.query(
          'DELETE FROM public."PublicRequestAttempt" WHERE "updatedAt" < NOW() - INTERVAL \'24 hours\'',
        )
      ).rowCount;
    }
    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "preview",
          inventory: inventory.rows[0].count,
          checks: checks.rows[0],
          expiredSessions: expiredSessions.rows[0].count,
          oldAttempts: oldAttempts.rows[0].count,
          removedSessions,
          removedAttempts,
          testSchemas: testSchemas.rows.map((row) => row.schema_name),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

main()
  .catch(databaseError)
  .finally(() => client.end());
