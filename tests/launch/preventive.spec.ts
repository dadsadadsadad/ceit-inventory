import { expect, test, type Page } from "@playwright/test";
import { loadEnvFile } from "node:process";
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
async function signIn(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email address or username").fill("launch.admin");
  await page.getByLabel("Password", { exact: true }).fill(process.env.CEIT_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("preventive maintenance can be scheduled, done, paused and removed", async ({ page }) => {
  const title = `Dust the lab ${Date.now()}`;
  // marking done changes check dates, put them back after so other tests see the same data
  const checked = (await query(`SELECT id, "lastCheckedAt"::text AS at FROM "InventoryItem"`)).rows;
  const pcs = (await query(`SELECT id, "lastCheckedAt"::text AS at FROM "Computer"`)).rows;
  await query(`UPDATE "InventoryItem" SET "lastCheckedAt" = NOW() - INTERVAL '200 days'`);
  try {
    await signIn(page);
    await page.goto("/dashboard/maintenance?view=preventive&add=1");
    const form = page.locator("#add-schedule");
    await form.getByLabel("Task *").fill(title);
    await form.getByRole("combobox", { name: "Room" }).selectOption({ label: "Launch test lab" });
    await form
      .getByRole("combobox", { name: "Category" })
      .selectOption({ label: "Launch test equipment" });
    await form.getByRole("combobox", { name: "Repeat" }).selectOption("custom");
    await form.getByLabel("Every how many days? *").fill("10");
    await form.getByRole("button", { name: "Add schedule" }).click();

    const card = page.locator("article.plan-card", { hasText: title });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Due today");
    await expect(card).toContainText("Every 10 days");
    const items = Number(
      (
        await query(
          `SELECT COUNT(*)::int AS n FROM "InventoryItem" i JOIN "Location" l ON l.id = i."locationId" JOIN "Category" c ON c.id = i."categoryId"
           WHERE i.status NOT IN ('RETIRED','LOST') AND l.name = 'Launch test lab' AND c.name = 'Launch test equipment'`,
        )
      ).rows[0].n,
    );
    await expect(card).toContainText(`${items} items`);
    const dueCount = (
      await query(
        `SELECT COUNT(*)::int AS n FROM "MaintenancePlan" WHERE "isActive" AND "nextDueOn" <= (NOW() AT TIME ZONE 'Asia/Manila')::date`,
      )
    ).rows[0].n;
    await expect(page.locator(".view-tab-count")).toHaveText(String(dueCount));

    await card.getByPlaceholder("Notes (optional)").fill("All clean");
    await card.getByRole("button", { name: "Mark done" }).click();
    await expect(card).toContainText("Marked done.");
    await expect(card).toContainText("Last done");

    const plan = (
      await query(
        `SELECT id, "nextDueOn"::text AS due, "lastDoneByName" FROM "MaintenancePlan" WHERE title = $1`,
        [title],
      )
    ).rows[0];
    expect(plan.lastDoneByName).toBe("launch.admin");
    const today = (await query(`SELECT (NOW() AT TIME ZONE 'Asia/Manila')::date::text AS d`))
      .rows[0].d;
    const due = new Date(`${today}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 10);
    expect(plan.due).toBe(due.toISOString().slice(0, 10));
    const log = (
      await query(`SELECT notes, "itemCount" FROM "MaintenancePlanLog" WHERE "planId" = $1`, [
        plan.id,
      ])
    ).rows;
    expect(log).toEqual([{ notes: "All clean", itemCount: items }]);
    const unchecked = (
      await query(
        `SELECT COUNT(*)::int AS n FROM "InventoryItem" i JOIN "Location" l ON l.id = i."locationId" JOIN "Category" c ON c.id = i."categoryId"
           WHERE i.status NOT IN ('RETIRED','LOST') AND l.name = 'Launch test lab' AND c.name = 'Launch test equipment' AND i."lastCheckedAt" < NOW() - INTERVAL '1 day'`,
      )
    ).rows[0].n;
    expect(unchecked).toBe(0);

    // the schedule shows on the items it covers
    const itemId = (
      await query(`SELECT id FROM "InventoryItem" WHERE "qrCode" = 'ceit-launch-item-3'`)
    ).rows[0].id;
    await page.goto(`/dashboard/inventory/${itemId}`);
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    await page.goto("/dashboard/maintenance?view=preventive");
    await card.getByText("Edit schedule").click();
    await card.getByRole("button", { name: "Pause" }).click();
    await expect(card.getByText("Paused", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Mark done" })).toHaveCount(0);

    await card.getByText("Remove this schedule").click();
    const remove = card.getByRole("button", { name: "Remove schedule" });
    await remove.click();
    await card.getByRole("button", { name: "Confirm removal", exact: true }).click();
    await expect(card).toHaveCount(0);
    expect(
      (await query(`SELECT COUNT(*)::int AS n FROM "MaintenancePlan" WHERE title = $1`, [title]))
        .rows[0].n,
    ).toBe(0);
    const audit = (
      await query(
        `SELECT summary FROM "InventoryAudit" WHERE "entityType" = 'maintenance-plan' AND "entityLabel" = $1 ORDER BY "createdAt"`,
        [title],
      )
    ).rows.map((row) => row.summary);
    expect(audit).toEqual([
      `Preventive maintenance scheduled: ${title} (every 10 days).`,
      `Preventive maintenance done: ${title} (${items} items).`,
      `Preventive maintenance paused: ${title}.`,
      `Preventive maintenance schedule removed: ${title}.`,
    ]);
  } finally {
    await query(`DELETE FROM "MaintenancePlan" WHERE title = $1`, [title]);
    await query(
      `UPDATE "InventoryItem" i SET "lastCheckedAt" = saved.at::timestamp
       FROM unnest($1::uuid[], $2::text[]) AS saved(id, at) WHERE i.id = saved.id`,
      [checked.map((row) => row.id), checked.map((row) => row.at)],
    );
    await query(
      `UPDATE "Computer" c SET "lastCheckedAt" = saved.at::timestamp
       FROM unnest($1::uuid[], $2::text[]) AS saved(id, at) WHERE c.id = saved.id`,
      [pcs.map((row) => row.id), pcs.map((row) => row.at)],
    );
  }
});

test("a schedule needs something to cover", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/maintenance?view=preventive&add=1");
  const form = page.locator("#add-schedule");
  await form.getByLabel("Task *").fill("Nothing picked");
  await form.getByRole("button", { name: "Add schedule" }).click();
  await expect(form.getByRole("alert")).toContainText("Pick an item, a room or a category.");
});
