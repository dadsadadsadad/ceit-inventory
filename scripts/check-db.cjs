const { databaseClient, databaseError } = require("./database.cjs");
const client = databaseClient();

// Check the connection, tables, and inventory count.
async function main() {
  await client.connect();
  const { rows } = await client.query(
    "SELECT current_database() AS database, current_user AS user",
  );
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  const inventory = await client.query('SELECT COUNT(*)::int AS count FROM public."InventoryItem"');
  console.log(
    JSON.stringify({
      connected: true,
      ...rows[0],
      inventory_count: inventory.rows[0].count,
      tables: tables.rows.map((row) => row.table_name),
    }),
  );
}

main()
  .catch(databaseError)
  .finally(() => client.end());
