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
// The form's error message (Next.js also keeps an empty route announcer with the same role).
const formError = (page: Page) => page.getByRole("alert").filter({ hasText: /\S/ });
const hours = (value: number) => manilaDateTimeInput(new Date(Date.now() + value * 3_600_000));

async function itemId(number: number) {
  return (
    await query('SELECT id FROM "InventoryItem" WHERE "qrCode"=$1', [`ceit-launch-item-${number}`])
  ).rows[0].id as string;
}

type RequestRow = {
  student: string;
  status?: string;
  startsAt?: string;
  returns?: string;
  reservation?: boolean;
  checkedOut?: boolean;
};
// SQL interval text such as "'2 hours'" keeps the fixtures readable.
async function insertRequest(item: number, row: RequestRow) {
  await query(
    `INSERT INTO "BorrowRequest" (id,"inventoryItemId","borrowerName","studentNumber",contact,purpose,"requestedQuantity","expectedReturnDate","startsAt","isReservation",status,"checkedOutItemStatus","personalDataExpiresAt","updatedAt")
     VALUES (gen_random_uuid(),$1,'Policy Student',$2,'09170000000','Policy test',1,NOW() + $3::interval,NOW() + $4::interval,$5,$6::"BorrowStatus",$7::"ItemStatus",NOW() + INTERVAL '400 days',NOW())`,
    [
      await itemId(item),
      row.student,
      row.returns ?? "5 hours",
      row.startsAt ?? "0 hours",
      Boolean(row.reservation),
      row.status ?? "REQUESTED",
      row.checkedOut ? "OK" : null,
    ],
  );
}

async function fillBorrowDetails(page: Page, student: string) {
  await page.getByLabel("Full name").fill("Policy Test Student");
  await page.getByLabel("Student number").fill(student);
  await page.getByLabel("Contact number").fill("09123456789");
  await page.getByLabel("Purpose", { exact: false }).fill("Class presentation test");
}

async function openBorrowForm(page: Page, item: number) {
  await page.goto(`/scan/ceit-launch-item-${item}`);
  await page.getByRole("button", { name: /Borrow equipment/ }).click();
}

test.beforeEach(async () => {
  await query(
    `DELETE FROM "BorrowRequest"; DELETE FROM "PublicRequestAttempt";
     UPDATE "InventoryItem" SET status='OK', quantity=1;
     DELETE FROM "Category" WHERE name='Staff test category';`,
  );
});

test("the borrow form states the rules and a reservation cannot be booked more than three days ahead", async ({
  page,
}) => {
  await openBorrowForm(page, 11);
  await expect(page.getByText("Reservations can be made up to 3 days ahead")).toBeVisible();
  await expect(page.getByText("kept for up to 7 days")).toBeVisible();
  await page.getByLabel("Reserve for later").check();
  const pickup = page.getByLabel("Pickup date and time");
  await expect(pickup).toHaveAttribute("max", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

  // Browsers enforce `max`; remove it so the server's own check is exercised.
  await page.evaluate(() =>
    document.querySelectorAll("input[type=datetime-local]").forEach((input) => {
      input.removeAttribute("max");
    }),
  );
  await pickup.fill(hours(4 * 24));
  await page.getByLabel("Return date and time").fill(hours(4 * 24 + 2));
  await fillBorrowDetails(page, "POLICY-ADVANCE");
  await page.getByRole("button", { name: "Request reservation" }).click();
  await expect(formError(page)).toContainText("up to 3 days in advance");
  expect((await query('SELECT COUNT(*)::int AS count FROM "BorrowRequest"')).rows[0].count).toBe(0);
});

test("equipment cannot be requested for longer than seven days", async ({ page }) => {
  await openBorrowForm(page, 12);
  await page.evaluate(() =>
    document.querySelectorAll("input[type=datetime-local]").forEach((input) => {
      input.removeAttribute("max");
    }),
  );
  await page.getByLabel("Return date and time").fill(hours(8 * 24));
  await fillBorrowDetails(page, "POLICY-LONG");
  await page.getByRole("button", { name: "Send borrowing request" }).click();
  await expect(formError(page)).toContainText("at most 7 days");
  expect((await query('SELECT COUNT(*)::int AS count FROM "BorrowRequest"')).rows[0].count).toBe(0);
});

test("a student with overdue equipment cannot request more", async ({ page }) => {
  await query('UPDATE "InventoryItem" SET status=\'DEPLOYED\' WHERE "qrCode"=$1', [
    "ceit-launch-item-13",
  ]);
  await insertRequest(13, {
    student: "POLICY-OVERDUE",
    status: "BORROWED",
    startsAt: "-5 hours",
    returns: "-2 hours",
    checkedOut: true,
  });
  await openBorrowForm(page, 14);
  await page.getByLabel("Return date and time").fill(hours(2));
  await fillBorrowDetails(page, "POLICY-OVERDUE");
  await page.getByRole("button", { name: "Send borrowing request" }).click();
  await expect(formError(page)).toContainText("past its return time");
  expect(
    (await query(`SELECT COUNT(*)::int AS count FROM "BorrowRequest" WHERE status='REQUESTED'`))
      .rows[0].count,
  ).toBe(0);
});

test("a student cannot hold more than three open requests at once", async ({ page }) => {
  for (const item of [15, 16, 17]) {
    await insertRequest(item, { student: "POLICY-CAP", status: "REQUESTED", returns: "6 hours" });
  }
  await openBorrowForm(page, 18);
  await page.getByLabel("Return date and time").fill(hours(2));
  await fillBorrowDetails(page, "POLICY-CAP");
  await page.getByRole("button", { name: "Send borrowing request" }).click();
  await expect(formError(page)).toContainText("already have 3 open requests");
});

test("a missed pickup releases the equipment and is labelled for staff", async ({
  page,
  browser,
}) => {
  await insertRequest(19, {
    student: "POLICY-NOSHOW",
    status: "RESERVED",
    reservation: true,
    startsAt: "-3 hours",
    returns: "5 hours",
  });
  // The missed booking no longer holds the equipment, so it is not listed as unavailable...
  await page.goto("/scan/ceit-launch-item-19");
  await expect(page.getByText("When this item is not available")).toHaveCount(0);
  // ...and another student can borrow it now.
  await openBorrowForm(page, 19);
  await page.getByLabel("Return date and time").fill(hours(2));
  await fillBorrowDetails(page, "POLICY-NEXT");
  await page.getByRole("button", { name: "Send borrowing request" }).click();
  await expect(page.getByRole("status")).toContainText("Your borrowing request was sent");

  const staff = await browser.newPage();
  await signIn(staff);
  await staff.goto("/dashboard/borrowing?status=RESERVED");
  await expect(staff.getByText("Pickup missed").filter({ visible: true }).first()).toBeVisible();
  await staff.close();
});

test("staff cannot extend a loan beyond the total limit", async ({ page }) => {
  await query('UPDATE "InventoryItem" SET status=\'DEPLOYED\' WHERE "qrCode"=$1', [
    "ceit-launch-item-20",
  ]);
  await insertRequest(20, {
    student: "POLICY-TOTAL",
    status: "BORROWED",
    startsAt: "-13 days",
    returns: "1 hour",
    checkedOut: true,
  });
  await signIn(page);
  await page.goto("/dashboard/borrowing");
  const row = page.locator("tbody tr").filter({ visible: true }).first();
  await row.locator("summary", { hasText: "Change return time" }).click();
  const field = row.getByLabel("New return date and time");
  await field.fill(hours(3 * 24));
  await row.getByRole("button", { name: "Save return time" }).click();
  await expect(row.getByRole("alert").filter({ hasText: /\S/ })).toContainText(
    "at most 14 days in total",
  );
  await field.fill(hours(12));
  await row.getByRole("button", { name: "Save return time" }).click();
  await expect(row.getByText("Return time updated.")).toBeVisible();
});

test("faculty staff can add and delete categories, which only administrators could before", async ({
  page,
}) => {
  await signIn(page, "launch.staff");
  await page.goto("/dashboard/settings");
  await page.locator("summary", { hasText: "Add category" }).click();
  await page.getByRole("textbox", { name: /Category name/ }).fill("Staff test category");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await query(
            `SELECT COUNT(*)::int AS count FROM "Category" WHERE name='Staff test category'`,
          )
        ).rows[0].count,
    )
    .toBe(1);
  await page.reload();
  await page.locator("summary", { hasText: "Staff test category" }).click();
  await page.getByLabel("Type DELETE to remove Staff test category").fill("DELETE");
  await page.getByRole("button", { name: "Delete category" }).click();
  await expect
    .poll(
      async () =>
        (
          await query(
            `SELECT COUNT(*)::int AS count FROM "Category" WHERE name='Staff test category'`,
          )
        ).rows[0].count,
    )
    .toBe(0);
});
