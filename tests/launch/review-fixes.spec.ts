import { expect, test, type Page } from "@playwright/test";
import { loadEnvFile } from "node:process";
import pg from "pg";
import { manilaDateTimeInput } from "../../src/lib/borrow-schedule";

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
  return (await query('SELECT id FROM "InventoryItem" WHERE "qrCode"=$1', [qrCode])).rows[0].id;
}

test.beforeEach(async () => {
  await query(
    `DELETE FROM "BorrowRequest";
     UPDATE "InventoryItem" SET status='OK', quantity=1;
     UPDATE "User" SET "lockedUntil"=NULL, "failedSignInCount"=0, "firstFailedSignInAt"=NULL;`,
  );
});

test("import checking explains row problems, adjusts odd values, and checks Settings and existing records", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/dashboard/inventory/import");
  const csv = [
    "name,category,location,type,quantity,serial number,asset tag,purchase date,memory GB",
    "Valid row,Launch test equipment,Launch test lab,asset,1,REVIEW-SER-1,,,",
    "Unknown category,Review missing category,Launch test lab,asset,1,REVIEW-SER-2,,,",
    "Bad date,Launch test equipment,Launch test lab,asset,1,REVIEW-SER-3,,2026-13-45,",
    "Existing tag,Launch test equipment,Launch test lab,asset,1,REVIEW-SER-4,INV-TST-OK-01-0001,,",
    "Bad memory,Launch test equipment,Launch test lab,asset,1,REVIEW-SER-5,,,lots",
  ].join("\n");
  await page.getByLabel("CSV or Excel file").setInputFiles({
    name: "review.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByLabel("Create missing categories and locations", { exact: false }).uncheck();
  await page.getByRole("button", { name: "Check file" }).click();
  // A bad date and an unreadable memory size are adjusted, not fatal; the other two rows are skipped.
  await expect(page.getByText("3 rows look good", { exact: false })).toBeVisible();
  await expect(page.getByText("2 skipped", { exact: false })).toBeVisible();
  await expect(page.getByText("category “Review missing category” does not exist")).toBeVisible();
  await expect(
    page.getByText("asset tag INV-TST-OK-01-0001 is already assigned to a record."),
  ).toBeVisible();
  await expect(
    page.getByText("Purchase date “2026-13-45” is not a date I could read"),
  ).toBeVisible();
  await expect(page.getByText("Memory “lots” is not a size I could read")).toBeVisible();
  expect(
    (
      await query(
        'SELECT COUNT(*)::int AS count FROM "InventoryItem" WHERE "serialNumber" LIKE $1',
        ["REVIEW-SER-%"],
      )
    ).rows[0].count,
  ).toBe(0);
});

test("saving an edit keeps the Philippine inspection date and logs only real changes", async ({
  page,
}) => {
  const id = await itemId("ceit-launch-item-5");
  // 02:30 on 21 September in Manila is still 20 September in UTC.
  await query('UPDATE "InventoryItem" SET "lastCheckedAt"=$1, name=$2 WHERE id=$3', [
    "2026-09-20 18:30:00",
    "Lab equipment 5",
    id,
  ]);
  await query('DELETE FROM "InventoryAudit" WHERE "itemId"=$1', [id]);
  await signIn(page);
  await page.goto(`/dashboard/inventory/${id}?edit=1`);
  const edit = page.locator("#edit-record");
  await expect(edit.locator('input[name="lastCheckedAt"]')).toHaveValue("2026-09-21");
  await edit.getByLabel("Name", { exact: true }).fill("Lab equipment 5 renamed");
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  const saved = (
    await query('SELECT "lastCheckedAt"::text AS checked, name FROM "InventoryItem" WHERE id=$1', [
      id,
    ])
  ).rows[0];
  expect(saved).toEqual({ checked: "2026-09-20 18:30:00", name: "Lab equipment 5 renamed" });
  const summaries = (
    await query('SELECT summary FROM "InventoryAudit" WHERE "itemId"=$1', [id])
  ).rows.map((row) => row.summary);
  expect(summaries).toEqual(["Updated name."]);
  await query('UPDATE "InventoryItem" SET name=$1 WHERE id=$2', ["Lab equipment 5", id]);
});

test("overdue loans are listed, can get a new return time, and cannot overlap a booking", async ({
  page,
}) => {
  const id = await itemId("ceit-launch-item-6");
  await query("UPDATE \"InventoryItem\" SET status='DEPLOYED' WHERE id=$1", [id]);
  await query(
    `INSERT INTO "BorrowRequest" (id,"inventoryItemId","borrowerName","studentNumber",contact,purpose,"requestedQuantity","expectedReturnDate","startsAt",status,"checkedOutItemStatus","personalDataExpiresAt","updatedAt")
     VALUES (gen_random_uuid(),$1,'Overdue Student','2024-00099','09170000000','Overdue test',1,NOW() - INTERVAL '2 hours',NOW() - INTERVAL '5 hours','BORROWED','OK',NOW() + INTERVAL '400 days',NOW())`,
    [id],
  );
  await signIn(page);
  const overdueRow = page.locator(".queue-row", { hasText: "Overdue loans" });
  await expect(overdueRow).toContainText("1");
  await overdueRow.click();
  await expect(page).toHaveURL(/status=OVERDUE/);
  const table = page.locator(".request-card");
  await expect(table).toHaveCount(1);
  await expect(table.first()).toContainText("Overdue");

  // A later reservation by someone else blocks an extension through it.
  await query(
    `INSERT INTO "BorrowRequest" (id,"inventoryItemId","borrowerName","studentNumber",contact,purpose,"requestedQuantity","expectedReturnDate","startsAt","isReservation",status,"personalDataExpiresAt","updatedAt")
     VALUES (gen_random_uuid(),$1,'Next Student','2024-00098','09170000001','Later booking',1,NOW() + INTERVAL '3 days 2 hours',NOW() + INTERVAL '3 days','true','RESERVED',NOW() + INTERVAL '400 days',NOW())`,
    [id],
  );
  await table.first().locator("summary", { hasText: "Set a new return time" }).click();
  const returnTime = table.first().getByLabel("New return date and time");
  await returnTime.fill(manilaDateTimeInput(new Date(Date.now() + 5 * 24 * 3_600_000)));
  await table.first().getByRole("button", { name: "Save return time" }).click();
  await expect(table.first().getByRole("alert")).toContainText("requested or reserved by someone");

  await returnTime.fill(manilaDateTimeInput(new Date(Date.now() + 24 * 3_600_000)));
  await table.first().getByRole("button", { name: "Save return time" }).click();
  await expect(page.locator(".request-card")).toHaveCount(0);
  const loan = (
    await query(
      `SELECT "expectedReturnDate" > NOW() AS future FROM "BorrowRequest" WHERE status='BORROWED'`,
    )
  ).rows[0];
  expect(loan.future).toBe(true);
  expect(
    (
      await query(
        `SELECT COUNT(*)::int AS count FROM "InventoryAudit" WHERE "itemId"=$1 AND summary LIKE 'Return time changed%'`,
        [id],
      )
    ).rows[0].count,
  ).toBe(1);
});

test("a public item page lists booked times without borrower details", async ({ page }) => {
  const id = await itemId("ceit-launch-item-7");
  await query(
    `INSERT INTO "BorrowRequest" (id,"inventoryItemId","borrowerName","studentNumber",contact,purpose,"requestedQuantity","expectedReturnDate","startsAt","isReservation",status,"personalDataExpiresAt","updatedAt")
     VALUES (gen_random_uuid(),$1,'Private Borrower Name','2024-00077','09170000077','Private purpose',1,NOW() + INTERVAL '3 days 2 hours',NOW() + INTERVAL '3 days','true','RESERVED',NOW() + INTERVAL '400 days',NOW())`,
    [id],
  );
  await page.goto("/scan/ceit-launch-item-7");
  await expect(
    page.getByRole("heading", { name: "When this item is not available" }),
  ).toBeVisible();
  await expect(page.getByText("Booked", { exact: true })).toBeVisible();
  await expect(page.getByText("Private Borrower Name")).toHaveCount(0);
  await expect(page.getByText("Private purpose")).toHaveCount(0);
});

test("search matches every word and the needs-attention filter shares one definition", async ({
  page,
}) => {
  await query(
    `UPDATE "InventoryItem" SET status='DEFECTIVE' WHERE "qrCode"='ceit-launch-item-8';
     UPDATE "InventoryItem" SET condition='POOR', status='RETIRED' WHERE "qrCode"='ceit-launch-item-9';
     UPDATE "InventoryItem" SET condition='POOR' WHERE "qrCode"='ceit-launch-item-10'`,
  );
  try {
    await signIn(page);
    await page.goto("/dashboard/inventory?q=launch%20lab%20equipment%2012");
    await expect(
      page.getByRole("link", { name: "Lab equipment 12", exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("1 record ·")).toBeVisible();

    // Retired equipment in poor condition does not need attention.
    await page.goto("/dashboard/inventory?attention=1");
    await expect(page.getByText("2 records ·")).toBeVisible();
    await expect(page.locator(".record-table")).toContainText("Lab equipment 8");
    await expect(page.locator(".record-table")).toContainText("Lab equipment 10");
    await expect(page.locator(".record-table")).not.toContainText("Lab equipment 9");
    await page.goto("/dashboard");
    await expect(page.locator(".overview-metrics")).toContainText("2");
  } finally {
    await query(
      `UPDATE "InventoryItem" SET status='OK', condition='GOOD' WHERE "qrCode" IN ('ceit-launch-item-8','ceit-launch-item-9','ceit-launch-item-10')`,
    );
  }
});

test("an administrator can unlock a locked account", async ({ page }) => {
  await query(
    `UPDATE "User" SET "lockedUntil"=NOW() + INTERVAL '10 minutes', "failedSignInCount"=5, "firstFailedSignInAt"=NOW() WHERE username='launch.staff'`,
  );
  await signIn(page);
  await page.goto("/dashboard/users");
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await page.locator("summary", { hasText: "launch.staff" }).click();
  await page.getByRole("button", { name: "Unlock account" }).click();
  await expect
    .poll(async () => {
      const row = (
        await query(
          `SELECT "lockedUntil" IS NULL AS open, "failedSignInCount" AS failed FROM "User" WHERE username='launch.staff'`,
        )
      ).rows[0];
      return `${row.open}:${row.failed}`;
    })
    .toBe("true:0");
  await expect(page.getByText("Locked", { exact: true })).toHaveCount(0);
});

test("bulk inspection records today's check for selected equipment", async ({ page }) => {
  const id = await itemId("ceit-launch-item-27");
  await query('UPDATE "InventoryItem" SET "lastCheckedAt"=NULL WHERE id=$1', [id]);
  await query('DELETE FROM "InventoryAudit" WHERE "itemId"=$1', [id]);
  await signIn(page);
  await page.goto("/dashboard/inventory?q=equipment%2027&checked=overdue");
  await expect(page.getByText("1 record ·")).toBeVisible();
  await page.getByRole("link", { name: "Select items", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Select Lab equipment 27", exact: true })
    .filter({ visible: true })
    .check();
  await page
    .locator("select")
    .filter({ has: page.locator('option[value="inspect"]') })
    .selectOption("inspect");
  await page.getByRole("button", { name: "Apply to 1" }).click();
  await expect(page.getByText("The selected inventory records were updated.")).toBeVisible();
  const row = (
    await query(
      `SELECT "lastCheckedAt" > NOW() - INTERVAL '5 minutes' AS fresh FROM "InventoryItem" WHERE id=$1`,
      [id],
    )
  ).rows[0];
  expect(row.fresh).toBe(true);
  expect(
    (
      await query(
        `SELECT COUNT(*)::int AS count FROM "InventoryAudit" WHERE "itemId"=$1 AND summary='Bulk update: inspection recorded.'`,
        [id],
      )
    ).rows[0].count,
  ).toBe(1);
});
