import { expect, test as base, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import pg from "pg";

loadEnvFile(".env.e2e.local");
const schema = process.env.INVENTORY_DB_SCHEMA;
if (!/^ceit_test_launch_\d+$/.test(schema ?? "")) {
  throw new Error("Hold-delete tests require the isolated launch-test schema.");
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

const test = base.extend<{ record: { id: string; button: Locator } }>({
  record: async ({ page }, runWithRecord) => {
    const id = randomUUID();
    await query(
      `INSERT INTO "InventoryItem" (id, name, "qrCode", "categoryId", "locationId", "updatedAt")
      SELECT $1, 'Hold interaction test', $2, "categoryId", "locationId", NOW()
      FROM "InventoryItem" WHERE "qrCode"='ceit-launch-item-24'`,
      [id, `hold-${id}`],
    );
    try {
      await page.goto("/auth/login");
      await page.getByLabel("Email address or username").fill("launch.admin");
      await page.getByLabel("Password", { exact: true }).fill(process.env.CEIT_TEST_PASSWORD!);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.goto(`/dashboard/inventory/${id}?edit=1`);
      await page.locator("summary").filter({ hasText: "Permanently delete this item" }).click();
      const button = page.getByRole("button", { name: "Permanently delete", exact: true });
      await button.scrollIntoViewIfNeeded();
      await runWithRecord({ id, button });
    } finally {
      await query('DELETE FROM "MaintenanceTicket" WHERE "inventoryItemId"=$1', [id]);
      await query('DELETE FROM "InventoryItem" WHERE id=$1', [id]);
    }
  },
});

async function exists(id: string) {
  return (await query('SELECT id FROM "InventoryItem" WHERE id=$1', [id])).rowCount;
}

test("holding never deletes before release, and moving away or Escape cancels", async ({
  page,
  record,
}) => {
  await record.button.click();
  await expect(page.getByRole("group", { name: "Confirm removal" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await exists(record.id)).toBe(1);

  const restingBounds = (await record.button.boundingBox())!;
  // Start near the edge to catch labels that shrink the target while holding.
  await page.mouse.move(restingBounds.x + restingBounds.width - 5, restingBounds.y + 20);
  await page.mouse.down();
  await expect(record.button).toHaveAttribute("data-phase", "ready");
  expect((await record.button.boundingBox())!.width).toBe(restingBounds.width);
  expect(await exists(record.id)).toBe(1);
  await page.screenshot({ path: "test-results/hold-ready.png" });
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await expect(record.button).toHaveAttribute("data-phase", "idle");
  expect(await exists(record.id)).toBe(1);

  await record.button.hover();
  await page.mouse.down();
  await expect(record.button).toHaveAttribute("data-phase", "holding");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByRole("group", { name: "Confirm removal" })).toHaveCount(0);
  expect(await exists(record.id)).toBe(1);

  await record.button.hover();
  await page.mouse.down();
  await expect(record.button).toHaveAttribute("data-phase", "ready");
  await page.mouse.up();
  await expect(page).toHaveURL(/\/dashboard\/inventory$/);
  expect(await exists(record.id)).toBe(0);
  const events = await query(
    'SELECT id FROM "InventoryAudit" WHERE "entityId"=$1 AND action=\'DELETED\'',
    [record.id],
  );
  expect(events.rowCount).toBe(1);
});

test("keyboard deletion has an untimed confirmation with cancel and restored focus", async ({
  page,
  record,
}) => {
  await record.button.focus();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("button", { name: "Confirm removal", exact: true });
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(record.button).toBeFocused();
  await expect(confirm).toHaveCount(0);
  expect(await exists(record.id)).toBe(1);
  await page.keyboard.press("Space");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/inventory$/);
  expect(await exists(record.id)).toBe(0);
});

test.describe("touch input", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("touch cancellation is safe and a complete hold submits on finger release", async ({
    page,
    record,
  }) => {
    const session = await page.context().newCDPSession(page);
    const bounds = (await record.button.boundingBox())!;
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await expect(record.button).toHaveAttribute("data-phase", "holding");
    await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect(record.button).toHaveAttribute("data-phase", "idle");
    expect(await exists(record.id)).toBe(1);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await expect(record.button).toHaveAttribute("data-phase", "ready");
    expect(await exists(record.id)).toBe(1);
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page).toHaveURL(/\/dashboard\/inventory$/);
    expect(await exists(record.id)).toBe(0);
  });
});

test("reduced motion keeps hold feedback without a sweeping animation", async ({
  page,
  record,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await record.button.hover();
  await page.mouse.down();
  await expect(record.button).toHaveAttribute("data-phase", "holding");
  expect(
    await record.button.locator(".hold-fill").evaluate((node) => getComputedStyle(node).opacity),
  ).toBe("0");
  await expect(record.button).toHaveAttribute("data-phase", "ready");
  expect(
    await record.button.locator(".hold-fill").evaluate((node) => getComputedStyle(node).opacity),
  ).toBe("1");
  await page.mouse.up();
  await expect(page).toHaveURL(/\/dashboard\/inventory$/);
});

test("protected history still blocks deletion and a failed hold can be retried", async ({
  page,
  record,
}) => {
  await query(
    `INSERT INTO "MaintenanceTicket" (id, "inventoryItemId", title, description, "updatedAt") VALUES ($1, $2, 'Test history', 'Protect this record', NOW())`,
    [randomUUID(), record.id],
  );
  await record.button.hover();
  await page.mouse.down();
  await expect(record.button).toHaveAttribute("data-phase", "ready");
  await page.mouse.up();
  await expect(page.locator(".form-feedback[role='alert']")).toContainText("maintenance history");
  await expect(record.button).toBeEnabled();
  expect(await exists(record.id)).toBe(1);
  await query('DELETE FROM "MaintenanceTicket" WHERE "inventoryItemId"=$1', [record.id]);
  await record.button.hover();
  await page.mouse.down();
  await expect(record.button).toHaveAttribute("data-phase", "ready");
  await page.mouse.up();
  await expect(page).toHaveURL(/\/dashboard\/inventory$/);
});
