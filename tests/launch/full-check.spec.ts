import { expect, test, type Page } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
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

async function attemptSignIn(page: Page, username: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email address or username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login\?error=|\/dashboard$/);
  return new URL(page.url()).searchParams.get("error");
}

async function signIn(page: Page, username = "launch.admin") {
  expect(await attemptSignIn(page, username, process.env.CEIT_TEST_PASSWORD!)).toBeNull();
}

async function itemId(qrCode: string) {
  return (await query('SELECT id FROM "InventoryItem" WHERE "qrCode"=$1', [qrCode])).rows[0]
    .id as string;
}

const unlockAll = () =>
  query('UPDATE "User" SET "lockedUntil"=NULL, "failedSignInCount"=0, "firstFailedSignInAt"=NULL');

test.beforeAll(async () => {
  await query(
    'DELETE FROM "InventoryAudit"; DELETE FROM "BorrowRequest"; DELETE FROM "MaintenanceTicket"; DELETE FROM "PublicRequestAttempt"; DELETE FROM "InventoryItem" WHERE "qrCode" NOT LIKE \'ceit-launch-item-%\'; UPDATE "InventoryItem" SET status=\'OK\', quantity=1;',
  );
  await unlockAll();
});
test.beforeEach(async () => {
  await query('DELETE FROM "PublicRequestAttempt"');
});
test.afterAll(async () => {
  await unlockAll();
});

test.describe("account locks cannot be used to keep people out", () => {
  test("the owner's own browser can still sign in while the account is locked", async ({
    page,
    browser,
  }) => {
    await signIn(page, "launch.staff");
    // The session ends, as it does after a week, without the owner signing out.
    await page.context().clearCookies({ name: "ceit_inventory_session" });
    await query(
      `UPDATE "User" SET "lockedUntil"=NOW() + INTERVAL '10 minutes', "failedSignInCount"=5, "firstFailedSignInAt"=NOW() WHERE username='launch.staff'`,
    );

    // A browser that has never signed in is refused, even with the right password.
    const strangerContext = await browser.newContext({ baseURL: "http://127.0.0.1:3101" });
    const stranger = await strangerContext.newPage();
    expect(await attemptSignIn(stranger, "launch.staff", process.env.CEIT_TEST_PASSWORD!)).toBe(
      "invalid-credentials",
    );
    await strangerContext.close();

    // The owner's browser gets in, and that clears the lock.
    await signIn(page, "launch.staff");
    const account = (
      await query(`SELECT "lockedUntil" IS NULL AS open FROM "User" WHERE username='launch.staff'`)
    ).rows[0];
    expect(account.open).toBe(true);

    // Signing out forgets the browser, so a shared computer does not keep the pass.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === "ceit_known_device")).toBe(false);
  });

  test("wrong current passwords on Settings count toward the same lock", async ({ page }) => {
    await unlockAll();
    await signIn(page, "launch.staff");
    await page.goto("/dashboard/settings");
    const newPassword = page.getByLabel("New password", { exact: true });
    await expect(newPassword).toHaveAccessibleName("New password");
    await expect(newPassword).toHaveAccessibleDescription(
      "At least 8 characters with a letter and number.",
    );
    const save = async () => {
      await page.getByLabel("Current password", { exact: true }).fill("Not-the-password9");
      await page.getByLabel("New password", { exact: true }).fill("Another-pass9");
      await page.getByLabel("Confirm new password", { exact: true }).fill("Another-pass9");
      await page.getByRole("button", { name: "Update account" }).click();
    };
    for (let guess = 1; guess <= 5; guess += 1) {
      await save();
      await expect(
        page.getByRole("alert").filter({ hasText: "Your current password is incorrect." }),
      ).toBeVisible();
    }
    await save();
    await expect(
      page.getByRole("alert").filter({ hasText: /Too many wrong passwords/ }),
    ).toBeVisible();
    await unlockAll();
  });
});

test.describe("borrowing", () => {
  test("the list shows what needs staff first, then loans in progress, then history", async ({
    page,
  }) => {
    await query('DELETE FROM "BorrowRequest"');
    const insert = (qr: string, borrower: string, status: string, requestedHoursAgo: number) =>
      itemId(qr).then((id) =>
        query(
          `INSERT INTO "BorrowRequest" (id,"inventoryItemId","borrowerName","studentNumber",contact,purpose,"requestedQuantity","expectedReturnDate","startsAt",status,"checkedOutItemStatus","personalDataExpiresAt","requestedAt","updatedAt")
           VALUES ($1,$2,$3,$4,'09170000001','Class',1,NOW() + INTERVAL '20 hours',NOW() + INTERVAL '1 hour',$5,'OK',NOW() + INTERVAL '30 days',NOW() - make_interval(hours => $6),NOW())`,
          [randomUUID(), id, borrower, `ORD-${status}`, status, requestedHoursAgo],
        ),
      );
    // The newest is finished history and the oldest is still waiting on staff.
    await insert("ceit-launch-item-14", "Cy Returned", "RETURNED", 1);
    await insert("ceit-launch-item-15", "Ben Borrowed", "BORROWED", 2);
    await insert("ceit-launch-item-16", "Ana Requested", "REQUESTED", 3);

    await signIn(page);
    await page.goto("/dashboard/borrowing");
    await expect(page.locator(".request-card")).toHaveCount(3);
    const borrowers = await page
      .locator(".request-card")
      .evaluateAll((cards) =>
        cards.map(
          (card) => (card.textContent?.match(/Ana Requested|Ben Borrowed|Cy Returned/) ?? [""])[0],
        ),
      );
    expect(borrowers).toEqual(["Ana Requested", "Ben Borrowed", "Cy Returned"]);
  });

  test("a return that was asked for but never happened can be kept on loan", async ({ page }) => {
    await query('DELETE FROM "BorrowRequest"');
    const id = await itemId("ceit-launch-item-17");
    const requestId = randomUUID();
    await query("UPDATE \"InventoryItem\" SET status='DEPLOYED' WHERE id=$1", [id]);
    await query(
      `INSERT INTO "BorrowRequest" (id,"inventoryItemId","borrowerName","studentNumber",contact,purpose,"requestedQuantity","expectedReturnDate","startsAt",status,"checkedOutItemStatus","personalDataExpiresAt","returnRequestedAt","updatedAt")
       VALUES ($1,$2,'Still Has It','KEEP-1','09170000001','Class',1,NOW() + INTERVAL '3 hours',NOW() - INTERVAL '2 hours','RETURN_REQUESTED','OK',NOW() + INTERVAL '30 days',NOW(),NOW())`,
      [requestId, id],
    );

    await signIn(page);
    await page.goto("/dashboard/borrowing?status=RETURN_REQUESTED");
    const card = page.locator(".request-card").filter({ hasText: "Still Has It" });
    await card.locator("summary", { hasText: "Not back yet? Keep it on loan" }).click();
    await card
      .getByLabel("New return date and time")
      .fill(manilaDateTimeInput(new Date(Date.now() + 30 * 3_600_000)));
    await card.getByRole("button", { name: "Save return time" }).click();
    // Back on loan, it leaves the list of returns to confirm.
    await expect(page.getByText("No borrowing requests match these filters.")).toBeVisible();
    const saved = (
      await query(
        `SELECT status, "returnRequestedAt" IS NULL AS cleared FROM "BorrowRequest" WHERE id=$1`,
        [requestId],
      )
    ).rows[0];
    expect(saved).toEqual({ status: "BORROWED", cleared: true });
  });
});

test.describe("public pages and missing records", () => {
  test("live updates are only offered for labels that exist", async ({ request }) => {
    const missing = await request.get("/api/live?qr=ceit-not-a-real-label&mode=poll");
    expect(missing.status()).toBe(404);
    const real = await request.get("/api/live?qr=ceit-launch-item-11&mode=poll");
    expect(real.status()).toBe(200);
    expect((await real.json()).revision).toMatch(/^[a-f0-9]{64}$/);
  });

  test("a missing record keeps the workspace navigation", async ({ page }) => {
    await signIn(page);
    await page.goto("/dashboard/inventory/00000000-0000-4000-8000-000000000000");
    await expect(
      page.getByRole("heading", { name: "That inventory record is not available" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Search the inventory" })).toBeVisible();
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Inventory" }),
    ).toBeVisible();
  });
});
