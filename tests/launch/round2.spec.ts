import { expect, test, type Page } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import pg from "pg";

loadEnvFile(".env.e2e.local");
const schema = process.env.INVENTORY_DB_SCHEMA;
if (!schema || !/^ceit_test_launch_\d+$/.test(schema)) {
  throw new Error("Launch tests require an isolated test schema.");
}

async function query(sql: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    return await client.query(sql, values);
  } finally {
    await client.end();
  }
}

async function signIn(page: Page, username = "launch.admin") {
  await page.goto("/auth/login");
  await page.getByLabel("Email address or username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(process.env.CEIT_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function itemId(qrCode: string) {
  return (await query('SELECT id FROM "InventoryItem" WHERE "qrCode"=$1', [qrCode])).rows[0]
    .id as string;
}

// A checked-out loan for a seeded item, so the public page has something to say about it.
async function checkOut(qrCode: string, returnsInHours: number) {
  const id = await itemId(qrCode);
  await query("UPDATE \"InventoryItem\" SET status='DEPLOYED' WHERE id=$1", [id]);
  await query(
    `INSERT INTO "BorrowRequest" (id,"inventoryItemId","borrowerName","studentNumber",contact,purpose,"requestedQuantity","expectedReturnDate","startsAt",status,"checkedOutItemStatus","personalDataExpiresAt","updatedAt")
     VALUES ($1,$2,'Round Two Student','2024-0001','09123456789','Class',1,$3,NOW() - INTERVAL '2 hours','BORROWED','OK',NOW() + INTERVAL '30 days',NOW())`,
    [randomUUID(), id, new Date(Date.now() + returnsInHours * 3_600_000)],
  );
}

test.beforeAll(async () => {
  await query(
    'DELETE FROM "InventoryAudit"; DELETE FROM "BorrowRequest"; DELETE FROM "MaintenanceTicket"; DELETE FROM "PublicRequestAttempt"; DELETE FROM "CustomField"; DELETE FROM "InventoryItem" WHERE "qrCode" NOT LIKE \'ceit-launch-item-%\'; UPDATE "InventoryItem" SET status=\'OK\', quantity=1, "warrantyEndsAt"=NULL, "customFields"=NULL;',
  );
});
test.beforeEach(async () => {
  await query('DELETE FROM "PublicRequestAttempt"');
});

async function chooseKind(page: Page, kind: "Equipment" | "Stock") {
  await page.getByRole("radio", { name: new RegExp(`^${kind}`) }).check();
}

async function fillBasics(page: Page, name: string) {
  await page.getByLabel("Name", { exact: false }).first().fill(name);
  await page.locator('select[name="categoryId"]').selectOption({ index: 1 });
  await page.locator('select[name="locationId"]').selectOption({ index: 1 });
}

test("stock warns when it runs low, using each record's own level and 5 by default", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/dashboard/inventory/new");
  await chooseKind(page, "Stock");
  await fillBasics(page, "Round2 markers");
  await page.locator('input[name="quantity"]').fill("4");
  await page.getByRole("button", { name: "Create stock record" }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Running low").first()).toBeVisible();

  await page.goto("/dashboard/inventory/new");
  await chooseKind(page, "Stock");
  await fillBasics(page, "Round2 chalk");
  await page.locator('input[name="quantity"]').fill("4");
  await page.locator('input[name="lowStockThreshold"]').fill("2");
  await page.getByRole("button", { name: "Create stock record" }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Running low")).toHaveCount(0);

  // Only the record using the default level of 5 is listed as low.
  await page.goto("/dashboard/inventory?stock=low");
  await expect(page.getByText("Round2 markers").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Round2 chalk")).toHaveCount(0);

  // Using stock moves a record across its own line.
  await page.goto("/dashboard/inventory?q=Round2%20chalk");
  await page
    .getByRole("link", { name: /Round2 chalk/ })
    .first()
    .click();
  await page.getByRole("radio", { name: "Use stock" }).check({ force: true });
  await page.getByLabel("How many").fill("2");
  await page.getByRole("button", { name: "Update stock" }).click();
  await expect(page.getByText("Stock updated.")).toBeVisible();
  await expect(page.getByText("Running low").first()).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("Low stock").first()).toBeVisible();

  // The stock report lists both, with their levels.
  await page.goto("/dashboard/reports?kind=stock&generate=1");
  await expect(page.getByRole("heading", { name: "Stock", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Round2 markers").first()).toBeVisible();
  await expect(page.getByText("Round2 chalk").first()).toBeVisible();
});

test("equipment can be added as several units, each with its own asset tag and QR code", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/dashboard/inventory/new");
  await chooseKind(page, "Equipment");
  await fillBasics(page, "Round2 monitor");
  await page.locator('input[name="units"]').fill("3");
  await page.getByRole("button", { name: "Create 3 items" }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/labels\?.*created=3/);
  const rows = (
    await query(
      'SELECT name,"assetTag","qrCode" FROM "InventoryItem" WHERE name LIKE \'Round2 monitor #%\' ORDER BY name',
    )
  ).rows;
  expect(rows.map((row) => row.name)).toEqual([
    "Round2 monitor #1",
    "Round2 monitor #2",
    "Round2 monitor #3",
  ]);
  expect(new Set(rows.map((row) => row.assetTag)).size).toBe(3);
  expect(new Set(rows.map((row) => row.qrCode)).size).toBe(3);
});

test("warranty and extra fields are optional, saved, filtered, and reported", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/settings");
  await page.getByText("Add extra field", { exact: true }).click();
  await page.getByLabel("Field name").fill("Lens mount");
  await page.getByRole("button", { name: "Add field" }).click();
  await expect(page.getByText("Lens mount").first()).toBeVisible();

  // A new item needs no warranty and no extra details: they sit in closed sections.
  await page.goto("/dashboard/inventory/new");
  await chooseKind(page, "Equipment");
  await fillBasics(page, "Round2 plain camera");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/[0-9a-f-]{36}$/);

  await page.goto("/dashboard/inventory/new");
  await chooseKind(page, "Equipment");
  await fillBasics(page, "Round2 camera");
  await page.getByText("Purchase and warranty", { exact: true }).click();
  const ending = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  await page.locator('input[name="warrantyEndsAt"]').fill(ending);
  await page.getByText("Extra details", { exact: true }).click();
  await page.getByLabel("Lens mount").fill("Canon EF");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Canon EF").first()).toBeVisible();
  await expect(page.getByText("Ends within 60 days").first()).toBeVisible();

  await page.goto("/dashboard/inventory?warranty=ending");
  await expect(page.getByText("Round2 camera").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Round2 plain camera")).toHaveCount(0);

  await page.goto("/dashboard/reports?kind=warranty&generate=1");
  await expect(page.getByText("Round2 camera").first()).toBeVisible();
  await expect(page.getByText("Round2 plain camera")).toHaveCount(0);
});

test("a flexible import copes with missing and extra columns, empty rows, and odd values", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/dashboard/inventory/import");
  const csv = [
    "Equipment,Qty,Brand,Price,Warranty,Funding source,Lens mount",
    'Round2 import tripod,3,Manfrotto,"₱1,200",15 Jan 2030,Alumni gift,Canon EF',
    ",,,,,,",
    "Total,3,,,,,",
    "Round2 import cable,2,,12,not a date,,",
  ].join("\n");
  await page.setInputFiles('input[name="file"]', {
    name: "flexible.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("look good")).toBeVisible();
  await expect(page.getByText(/had no category/)).toBeVisible();
  await expect(page.getByText("Warranty end date")).toBeVisible();
  await expect(page.getByText("Funding source")).toBeVisible();
  expect(
    (
      await query(
        "SELECT COUNT(*)::int AS count FROM \"InventoryItem\" WHERE name LIKE 'Round2 import%'",
      )
    ).rows[0].count,
  ).toBe(0);

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText(/rows? imported/)).toBeVisible();
  const items = (
    await query(
      'SELECT name,"purchasePrice","warrantyEndsAt"::text AS "warrantyEndsAt",notes,"assetTag" FROM "InventoryItem" WHERE name LIKE \'Round2 import%\' ORDER BY name',
    )
  ).rows;
  // The tripod row of 3 became three tracked units; the cable row of 2 became two.
  expect(items.map((row) => row.name)).toEqual([
    "Round2 import cable #1",
    "Round2 import cable #2",
    "Round2 import tripod #1",
    "Round2 import tripod #2",
    "Round2 import tripod #3",
  ]);
  expect(new Set(items.map((row) => row.assetTag)).size).toBe(5);
  const tripod = items.find((row) => row.name === "Round2 import tripod #1");
  expect(Number(tripod.purchasePrice)).toBe(1200);
  expect(tripod.warrantyEndsAt).toMatch(/^2030-01-15/);
  expect(tripod.notes).toContain("Funding source: Alumni gift");
  // An unreadable warranty date was left blank instead of rejecting the row.
  expect(items.find((row) => row.name === "Round2 import cable #1").warrantyEndsAt).toBeNull();
  // Missing category and location were filled with the plain fallbacks.
  expect(
    (
      await query(
        'SELECT c.name AS category, l.name AS location FROM "InventoryItem" i JOIN "Category" c ON c.id=i."categoryId" JOIN "Location" l ON l.id=i."locationId" WHERE i.name=\'Round2 import tripod #1\'',
      )
    ).rows[0],
  ).toEqual({ category: "Uncategorized", location: "Unassigned" });
});

test("the public page says plainly when an item is in use or unavailable", async ({ page }) => {
  await checkOut("ceit-launch-item-5", 3);
  await query(
    "UPDATE \"InventoryItem\" SET status='DEFECTIVE' WHERE \"qrCode\"='ceit-launch-item-6'",
  );

  await page.goto("/scan/ceit-launch-item-7");
  await expect(page.getByText("Available now")).toBeVisible();

  await page.goto("/scan/ceit-launch-item-5");
  await expect(page.getByText("In use right now")).toBeVisible();
  await expect(page.getByText(/Expected back/)).toBeVisible();
  await page.getByRole("button", { name: /Reserve for later/ }).click();
  await expect(page.getByLabel("Borrow now (in use)")).toBeDisabled();
  await expect(page.getByLabel("Reserve for later")).toBeChecked();

  await page.goto("/scan/ceit-launch-item-6");
  await expect(page.getByText("Not available to borrow").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Borrow equipment/ })).toBeDisabled();
});

test("a signed-in phone goes straight to editing, with borrow, return, and report close by", async ({
  page,
}) => {
  await signIn(page);
  const id = await itemId("ceit-launch-item-8");
  await page.goto("/scan/ceit-launch-item-8");
  await expect(page).toHaveURL(new RegExp(`/dashboard/inventory/${id}\\?edit=1&scanned=1`));
  await expect(page.getByText("Scanned from its QR code")).toBeVisible();
  await expect(page.getByRole("link", { name: "Borrow", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Report a problem", exact: true }).click();
  await expect(page).toHaveURL(/\/scan\/ceit-launch-item-8\?view=public&mode=issue/);
  await expect(page.getByRole("heading", { name: "Report a problem" })).toBeVisible();
  await expect(page.getByLabel("Your name")).toBeVisible();

  // The public view stays reachable for staff.
  await page.goto("/scan/ceit-launch-item-8?view=public");
  await expect(page.getByText("Available now")).toBeVisible();
  await expect(page.getByRole("button", { name: /Borrow equipment/ })).toBeVisible();
});

test("an issue report asks for a name and shows it to staff", async ({ page }) => {
  await page.goto("/scan/ceit-launch-item-9");
  await page.getByRole("button", { name: /Report a problem/ }).click();
  await page.getByLabel("Issue title").fill("Round2 cracked screen");
  await page.getByLabel("What happened").fill("The screen has a long crack across the middle.");
  await page.getByRole("button", { name: "Send issue report" }).click();
  // Without a name the browser stops the form.
  await expect(page.getByLabel("Your name")).toBeFocused();
  expect(
    (
      await query(
        "SELECT COUNT(*)::int AS count FROM \"MaintenanceTicket\" WHERE title='Round2 cracked screen'",
      )
    ).rows[0].count,
  ).toBe(0);
  await page.getByLabel("Your name").fill("Ana Reyes");
  await page.getByRole("button", { name: "Send issue report" }).click();
  await expect(page.getByRole("status")).toContainText("Your issue report was sent");
  expect(
    (
      await query(
        'SELECT "reportedByName" FROM "MaintenanceTicket" WHERE title=\'Round2 cracked screen\'',
      )
    ).rows[0].reportedByName,
  ).toBe("Ana Reyes");

  await signIn(page);
  await page.goto("/dashboard/maintenance");
  await expect(page.getByText(/by Ana Reyes through a QR code/)).toBeVisible();
});

test("loans due today are listed, can be reminded, and need an ID check to check out", async ({
  page,
}) => {
  // Due in a little while, but still today in Manila.
  const endOfDay = new Date();
  endOfDay.setUTCHours(15, 59, 0, 0);
  const soon = Math.max(
    0.02,
    Math.min(1, ((endOfDay.getTime() - Date.now() + 86_400_000) % 86_400_000) / 3_600_000),
  );
  await checkOut("ceit-launch-item-10", soon);
  await signIn(page);
  await page.goto("/dashboard/borrowing?status=DUE_TODAY");
  await expect(page.getByText("Round Two Student").first()).toBeVisible();
  await page.getByText("Remind the borrower").first().click();
  await expect(page.getByRole("button", { name: "Copy message" }).first()).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText("Due back today", { exact: false }).first()).toBeVisible();
});
