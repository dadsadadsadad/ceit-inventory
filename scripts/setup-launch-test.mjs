import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import pg from "pg";

if (existsSync(".env.local")) loadEnvFile(".env.local");
if (existsSync(".env")) loadEnvFile(".env");
const schema = `ceit_test_launch_${Date.now()}`;
const connectionString = process.env.DIRECT_URL || process.env.SCHOOL_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("No development database configured.");
const client = new pg.Client({ connectionString, connectionTimeoutMillis:10_000 });
try {
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}"`);
  const migrations = readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const migration of migrations) {
    const sql = readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8").replace(/\bpublic\b/g, schema);
    await client.query(sql);
  }
  const categoryId=randomUUID(),locationId=randomUUID();
  await client.query('INSERT INTO "Category" (id,name,"assetTagCode","updatedAt") VALUES ($1,$2,$3,NOW())',[categoryId,"Launch test equipment","TST"]);
  await client.query('INSERT INTO "Location" (id,name,"assetTagCode","updatedAt") VALUES ($1,$2,$3,NOW())',[locationId,"Launch test lab","01"]);
  const password = randomBytes(18).toString("base64url") + "9a";
  const salt = randomBytes(16).toString("hex");
  const hash = `scrypt-v1:${salt}:${scryptSync(password,salt,64).toString("hex")}`;
  for (const [username,role] of [["launch.admin","ADMINISTRATOR"],["launch.staff","STAFF"]]) {
    await client.query('INSERT INTO "User" (id,email,username,"passwordHash",role,"updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',[randomUUID(),`${username}@ceit.invalid`,username,hash,role]);
  }
  for (let i=1;i<=27;i++) {
    await client.query('INSERT INTO "InventoryItem" (id,name,"assetTag","qrCode","categoryId","locationId","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',[randomUUID(),i===1?"Classroom projector":`Lab equipment ${i}`,`INV-TST-OK-01-${String(i).padStart(4,"0")}`,`ceit-launch-item-${i}`,categoryId,locationId]);
  }
  const env = { DATABASE_URL:connectionString, SCHOOL_DATABASE_URL:connectionString, INVENTORY_DB_SCHEMA:schema, NEXT_PUBLIC_APP_URL:"http://127.0.0.1:3101", REQUEST_RATE_LIMIT_SECRET:randomBytes(32).toString("hex"), CEIT_TEST_PASSWORD:password };
  writeFileSync(".env.e2e.local",Object.entries(env).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join("\n")+"\n");
  console.log(JSON.stringify({ migrations:migrations.length, schema, seededItems:27 }));
} catch (error) {
  console.error("Isolated test setup failed:", error.code ?? error.name, error.message?.replaceAll(connectionString ?? "", "[connection]"));
  process.exitCode=1;
} finally { await client.end(); }
