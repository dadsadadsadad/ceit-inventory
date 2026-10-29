const { randomBytes, randomUUID, scrypt } = require("node:crypto");
const { promisify } = require("node:util");
const { databaseClient, databaseError } = require("./database.cjs");

// first admin on a new database: npm run db:create-admin -- <username> <email>
const [username = "", email = ""] = process.argv
  .slice(2)
  .map((value) => value.trim().toLowerCase());
const client = databaseClient();

// same format as hashPassword in src/lib/inventory-auth.ts
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await promisify(scrypt)(password, salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt-v1:${salt}:${hash.toString("hex")}`;
}

async function main() {
  if (!/^[a-z0-9._-]{3,32}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Usage: npm run db:create-admin -- <username> <email>");
    process.exitCode = 1;
    return;
  }
  await client.connect();
  const taken = await client.query('SELECT 1 FROM "User" WHERE username = $1 OR email = $2', [
    username,
    email,
  ]);
  if (taken.rowCount) {
    console.error("That username or email is already used.");
    process.exitCode = 1;
    return;
  }
  // letters and a number so it passes the password rules
  const password = `${randomBytes(12).toString("base64url")}7a`;
  await client.query(
    `INSERT INTO "User" (id, email, username, "passwordHash", role, "updatedAt")
     VALUES ($1, $2, $3, $4, 'ADMINISTRATOR', NOW())`,
    [randomUUID(), email, username, await hashPassword(password)],
  );
  console.log(`Created ${username}. Temporary password: ${password}`);
  console.log("Sign in and change it in Settings.");
}

main()
  .catch(databaseError)
  .finally(() => client.end());
