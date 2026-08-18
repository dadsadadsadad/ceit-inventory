require("dotenv/config");

const { Client } = require("pg");

async function main() {
  const candidates = [
    ["DATABASE_URL", process.env.DATABASE_URL],
    ["DIRECT_URL", process.env.DIRECT_URL],
  ].filter(([, connectionString]) => connectionString);
  if (!candidates.length) throw new Error("DATABASE_URL or DIRECT_URL is missing.");

  const failures = [];
  for (const [source, connectionString] of candidates) {
    const target = new URL(connectionString);
    const client = new Client({ connectionString });
    try {
      await client.connect();
      const { rows } = await client.query(
        'SELECT current_database() AS database, current_user AS user, to_regclass(\'public."InventoryItem"\') AS inventory_table',
      );
      const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
      const itemCount = rows[0].inventory_table ? await client.query('SELECT COUNT(*)::int AS count FROM "InventoryItem"') : null;
      console.log(JSON.stringify({ connected: true, source, host: target.hostname, ...rows[0], inventory_count: itemCount?.rows[0].count ?? 0, tables: tables.rows.map((row) => row.table_name) }));
      await client.end();
      return;
    } catch (error) {
      failures.push({ source, host: target.hostname, code: error.code ?? null, message: error.message || null });
      try {
        await client.end();
      } catch {}
    }
  }

  console.log(JSON.stringify({ connected: false, failures }));
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ connected: false, error: error.message }));
  process.exitCode = 1;
});
