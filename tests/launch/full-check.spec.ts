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

test.describe("QR labels", () => {
  test("labels are chosen from a grid of every item, with filters, paging, and four sizes", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/dashboard/inventory/labels");
    const tiles = page.locator(".label-tile");
    const labels = page.locator(".sheet-label");
    const sheets = page.locator(".label-sheet");
    const tile = (name: string) =>
      page.locator(".label-tile", { has: page.getByText(name, { exact: true }) });

    // Every item is listed at first, 24 to a page, with nothing chosen.
    await expect(tiles).toHaveCount(24);
    await expect(page.getByText("No labels selected yet.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Items pages" })).toBeVisible();

    // Click to choose, click again to take it out.
    await tile("Classroom projector").click();
    await expect(tile("Classroom projector")).toHaveAttribute("aria-pressed", "true");
    await expect(labels).toHaveCount(1);
    // Choosing keeps the place: focus stays on the tile and the label size stays shown.
    await expect(tile("Classroom projector")).toBeFocused();
    await expect(page.getByRole("combobox", { name: "Label size" })).toHaveValue("");
    await expect(
      page.getByRole("combobox", { name: "Label size" }).locator("option:checked"),
    ).toHaveText(/Medium/);
    await tile("Classroom projector").click();
    await expect(labels).toHaveCount(0);

    // A filter narrows the grid and keeps what is already chosen.
    await tile("Lab equipment 10").click();
    await expect(labels).toHaveCount(1);
    await page.getByLabel("Search", { exact: true }).fill("INV-TST-OK-01-0004");
    await expect(tiles).toHaveCount(1);
    await tile("Lab equipment 4").click();
    await expect(labels).toHaveCount(2);
    await page.getByRole("link", { name: "Show all items" }).first().click();
    await expect(tiles).toHaveCount(24);
    await expect(labels).toHaveCount(2);
    await expect(tile("Lab equipment 10")).toHaveAttribute("aria-pressed", "true");

    // Choose many at once, across pages.
    await page.getByRole("button", { name: "Clear selection" }).click();
    await expect(labels).toHaveCount(0);
    await page.getByRole("button", { name: "Select this page" }).click();
    await expect(labels).toHaveCount(24);
    await page
      .getByRole("navigation", { name: "Items pages" })
      .getByRole("link", { name: "Next" })
      .click();
    await expect(tiles).toHaveCount(3);
    await page.getByRole("button", { name: "Select this page" }).click();
    await expect(labels).toHaveCount(27);
    await expect(page.getByRole("button", { name: "Print labels" })).toBeVisible();

    // The sizes: 40, 24, 8, and 2 labels per sheet, keeping the choice.
    const size = page.getByRole("combobox", { name: "Label size" });
    for (const [layout, count] of [
      ["small", 1],
      ["large", 4],
      ["poster", 14],
      ["", 2],
    ] as const) {
      await size.selectOption(layout);
      await expect(sheets).toHaveCount(count);
    }
    await expect(labels).toHaveCount(27);
    await size.selectOption("small");
    await expect(sheets).toHaveCount(1);
    const overflow = await labels.evaluateAll((elements) =>
      elements.some((element) => element.scrollWidth > element.clientWidth + 1),
    );
    expect(overflow).toBe(false);
  });

  test("a single label can be printed at different sizes", async ({ page }) => {
    await signIn(page);
    const id = await itemId("ceit-launch-item-3");
    await page.goto(`/dashboard/inventory/${id}/label`);
    const code = page.locator(".print-label-code");
    const width = () => code.evaluate((element) => element.getBoundingClientRect().width);
    await expect(code).toBeVisible();
    await expect.poll(width).toBeGreaterThan(200);
    const medium = await width();
    await page.getByRole("combobox", { name: "Label size" }).selectOption("small");
    await expect(page).toHaveURL(/size=small/);
    await expect.poll(width).toBeLessThan(medium);
    await page.getByRole("combobox", { name: "Label size" }).selectOption("large");
    await expect.poll(width).toBeGreaterThan(medium);
    await page.getByRole("link", { name: "Print several labels on one sheet" }).click();
    await expect(page).toHaveURL(/\/dashboard\/inventory\/labels\?ids=/);
    await expect(page.locator(".sheet-label")).toHaveCount(1);
  });
});

test.describe("inventory views", () => {
  test("the list can be shown as a table, cards, or a compact list, and is remembered", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/dashboard/inventory");
    const views = page.getByRole("navigation", { name: "Inventory view" });
    await expect(views.getByRole("link", { name: "List" })).toHaveAttribute("aria-current", "true");

    await views.getByRole("link", { name: "Cards" }).click();
    await expect(page).toHaveURL(/view=cards/);
    await expect(page.locator(".record-tile")).toHaveCount(25);
    // A card opens its record.
    await page.locator(".record-tile").first().locator(".record-tile-facts").click();
    await expect(page).toHaveURL(/\/dashboard\/inventory\/[0-9a-f-]{36}$/);

    await page.goto("/dashboard/inventory");
    // The last choice is remembered on this device.
    await expect(page.locator(".record-tile")).toHaveCount(25);
    await views.getByRole("link", { name: "Compact" }).click();
    await expect(page).toHaveURL(/view=compact/);
    await expect(page.locator(".record-compact-row")).toHaveCount(25);

    // Filters and paging keep the view, and selecting items works in it.
    await page.getByLabel("Search", { exact: true }).fill("Lab equipment 2");
    await expect(page).toHaveURL(/view=compact/);
    await page.getByRole("link", { name: "Select items" }).click();
    await expect(page.locator('.record-compact-row input[type="checkbox"]').first()).toBeVisible();

    await views.getByRole("link", { name: "List" }).click();
    await expect(page.locator(".record-compact-row")).toHaveCount(0);
  });
});

test.describe("units that are borrowed one at a time", () => {
  test("a counted stock record can be split so each unit has its own QR code", async ({ page }) => {
    const source = (
      await query(
        `SELECT "categoryId","locationId" FROM "InventoryItem" WHERE "qrCode"='ceit-launch-item-1'`,
      )
    ).rows[0];
    const id = randomUUID();
    await query(
      `INSERT INTO "InventoryItem" (id,name,"qrCode","categoryId","locationId","itemType",quantity,"updatedAt")
       VALUES ($1,'Screwdriver set',$2,$3,$4,'SUPPLY',3,NOW())`,
      [id, `ceit-split-${id.slice(0, 8)}`, source.categoryId, source.locationId],
    );
    await signIn(page);
    await page.goto(`/dashboard/inventory/${id}?edit=1`);
    await expect(
      page.getByRole("heading", { name: "Give each unit its own QR code" }),
    ).toBeVisible();
    await page.getByLabel("Type SPLIT to give each unit its own record").fill("SPLIT");
    await page.getByRole("button", { name: "Split into 3 units" }).click();

    // Their labels open, already chosen.
    await expect(page).toHaveURL(/\/dashboard\/inventory\/labels\?ids=.*created=3/);
    await expect(page.locator(".sheet-label")).toHaveCount(3);
    const units = (
      await query(
        `SELECT name,"itemType",quantity,"assetTag","qrCode" FROM "InventoryItem" WHERE name LIKE 'Screwdriver set (unit %' ORDER BY name`,
      )
    ).rows;
    expect(units.map((unit) => unit.name)).toEqual([
      "Screwdriver set (unit 1)",
      "Screwdriver set (unit 2)",
      "Screwdriver set (unit 3)",
    ]);
    expect(units.every((unit) => unit.itemType === "ASSET" && unit.quantity === 1)).toBe(true);
    expect(new Set(units.map((unit) => unit.assetTag)).size).toBe(3);
    expect(new Set(units.map((unit) => unit.qrCode)).size).toBe(3);
  });
});

test.describe("report charts", () => {
  test("reports show charts above their tables", async ({ page }) => {
    await signIn(page);
    await page.goto("/dashboard/reports?kind=overview&generate=1");
    await expect(page.locator(".report-chart").first()).toBeVisible();
    await expect(page.getByText("Equipment status", { exact: true }).first()).toBeVisible();
    const bar = page.locator(".report-chart .chart-bars li").first();
    await expect(bar).toHaveAttribute("aria-label", /: \d+ records$/);
    const item = await itemId("ceit-launch-item-20");
    await query(
      `INSERT INTO "BorrowRequest" (id,"inventoryItemId","borrowerName","studentNumber",contact,purpose,"requestedQuantity","expectedReturnDate","startsAt",status,"personalDataExpiresAt","updatedAt")
       VALUES ($1,$2,'Chart Reader','CHART-1','09170000001','Class',1,NOW() + INTERVAL '30 hours',NOW() + INTERVAL '2 hours','REQUESTED',NOW() + INTERVAL '30 days',NOW())`,
      [randomUUID(), item],
    );
    await page.goto("/dashboard/reports?kind=borrowing&generate=1");
    await expect(page.getByText("Requests per month", { exact: true })).toBeVisible();
    await expect(page.locator(".chart-columns li")).toHaveCount(6);
  });
});
