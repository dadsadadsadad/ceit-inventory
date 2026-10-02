import { expect, test, type Page } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import pg from "pg";

loadEnvFile(".env.e2e.local");
const schema = process.env.INVENTORY_DB_SCHEMA;
if (!schema || !/^ceit_test_launch_\d+$/.test(schema)) {
  throw new Error("Live-update tests require an isolated test schema.");
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
async function ticket(title: string) {
  const id = randomUUID();
  await query(
    `INSERT INTO "MaintenanceTicket" (id, "inventoryItemId", title, description, "updatedAt")
    SELECT $1, id, $2, 'Test inspection details for live updates.', NOW()
    FROM "InventoryItem" WHERE "qrCode"='ceit-launch-item-27'`,
    [id, title],
  );
  return id;
}

test("live endpoint protects staff data and public revisions are opaque", async ({ request }) => {
  expect((await request.get("/api/live?mode=poll")).status()).toBe(401);
  expect((await request.get("/api/live?qr=bad%27code&mode=poll")).status()).toBe(400);
  const response = await request.get("/api/live?qr=ceit-launch-item-27&mode=poll");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual({ revision: expect.stringMatching(/^[a-f0-9]{64}$/) });
});

test("a public QR issue appears in another session without navigation or reload", async ({
  page,
  browser,
}) => {
  await query('DELETE FROM "PublicRequestAttempt"');
  await signIn(page);
  const title = `Live QR issue ${Date.now()}`;
  await page.goto(`/dashboard/maintenance?q=${encodeURIComponent(title)}`);
  await expect(page.locator(".live-updates")).toContainText("Live updates on");
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  try {
    await publicPage.goto("http://127.0.0.1:3101/scan/ceit-launch-item-27");
    await publicPage.getByRole("button", { name: /Report a problem/ }).click();
    await publicPage.getByLabel("Issue title").fill(title);
    await publicPage
      .getByLabel("What happened")
      .fill("A new equipment issue reported from a separate browser session.");
    await publicPage.getByRole("button", { name: "Send issue report" }).click();
    await expect(publicPage.getByRole("status")).toContainText("Your issue report was sent");
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });
  } finally {
    await publicContext.close();
  }
});

test("maintenance changes appear optimistically, reconcile, and roll back failed saves", async ({
  page,
}) => {
  const title = `Optimistic inspection ${Date.now()}`;
  const id = await ticket(title);
  await signIn(page);
  await page.goto(`/dashboard/maintenance?q=${encodeURIComponent(title)}`);
  const card = page.locator(`#ticket-${id}`);
  await card.locator("summary").filter({ hasText: "Update request" }).click();
  await card.getByRole("combobox", { name: "Status", exact: true }).selectOption("RESOLVED");
  await card.getByLabel("Staff notes").fill("Repaired and tested successfully.");
  let release!: () => void;
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/dashboard/maintenance**", async (route) => {
    if (route.request().method() === "POST") {
      await gate;
    }
    await route.continue();
  });
  await card.getByRole("button", { name: "Save changes" }).click();
  try {
    await expect(card.locator('[data-optimistic="true"]').first()).toContainText("Resolved");
    expect(
      (await query('SELECT status FROM "MaintenanceTicket" WHERE id=$1', [id])).rows[0].status,
    ).toBe("OPEN");
  } finally {
    release();
  }
  await expect(card.getByRole("status")).toContainText("Saved.");
  await expect(card.locator('[data-optimistic="true"]')).toHaveCount(0);
  await card.getByRole("combobox", { name: "Status", exact: true }).selectOption("OPEN");
  await card.getByLabel("Staff notes").fill("Keep these unsaved notes after a conflict.");
  await query('UPDATE "MaintenanceTicket" SET "updatedAt"=NOW() WHERE id=$1', [id]);
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await card.getByRole("button", { name: "Save changes" }).click();
  try {
    await expect(card.locator('[data-optimistic="true"]').first()).toContainText("Needs attention");
  } finally {
    release();
  }
  await expect(card.getByRole("alert")).toBeVisible();
  await expect(card.locator(".status-pill").first()).toContainText("Resolved");
  await expect(card.getByLabel("Staff notes")).toHaveValue(
    "Keep these unsaved notes after a conflict.",
  );
  const latest = (
    await query(
      `SELECT to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS version FROM "MaintenanceTicket" WHERE id=$1`,
      [id],
    )
  ).rows[0].version;
  await card.getByRole("button", { name: "Refresh details, keep my inputs" }).click();
  await expect(card.locator('input[name="updatedAt"]')).toHaveValue(latest);
  await expect(card.getByLabel("Staff notes")).toHaveValue(
    "Keep these unsaved notes after a conflict.",
  );
  await card.getByRole("button", { name: "Save changes" }).click();
  await expect(card.getByRole("status")).toContainText("Saved.");
});

test("remote changes wait for unfinished edits and resume after saving", async ({ page }) => {
  const title = `Protected draft ${Date.now()}`;
  const id = await ticket(title);
  await signIn(page);
  await page.goto(`/dashboard/maintenance?q=${encodeURIComponent(title)}`);
  await expect(page.locator(".live-updates")).toContainText("Live updates on");
  const card = page.locator(`#ticket-${id}`);
  await card.locator("summary").filter({ hasText: "Update request" }).click();
  await card.getByLabel("Staff notes").fill("My in-progress inspection notes.");
  const added = `${title} second issue`;
  await ticket(added);
  await expect(page.locator(".live-updates")).toContainText("Updates waiting", { timeout: 15_000 });
  await expect(card.getByLabel("Staff notes")).toHaveValue("My in-progress inspection notes.");
  await expect(page.getByRole("heading", { name: added, exact: true })).toHaveCount(0);
  await card.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: added, exact: true })).toBeVisible({
    timeout: 15_000,
  });
});

test("public availability catches external changes and reconnects after going offline", async ({
  page,
  context,
}) => {
  await page.goto("/scan/ceit-launch-item-26");
  await expect(page.locator(".live-updates")).toContainText("Live updates on");
  await context.setOffline(true);
  await expect(page.locator(".live-updates")).toContainText("Offline");
  await query(
    'UPDATE "InventoryItem" SET status=\'DEFECTIVE\', "updatedAt"=NOW() WHERE "qrCode"=\'ceit-launch-item-26\'',
  );
  await context.setOffline(false);
  await expect(page.locator(".live-updates")).toContainText("Live updates on", { timeout: 15_000 });
  await expect(page.getByText("Defective", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await query(
    'UPDATE "InventoryItem" SET status=\'OK\', "updatedAt"=NOW() WHERE "qrCode"=\'ceit-launch-item-26\'',
  );
  await expect(page.getByText("OK", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
});

test("new records have an immediate preview and synchronize additions, edits, and deletions", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const name = `Live camera ${Date.now()}`;
  await page.goto(`/dashboard/inventory?q=${encodeURIComponent(name)}`);
  await expect(page.locator(".live-updates")).toContainText("Live updates on");
  const context = await browser.newContext();
  const editor = await context.newPage();
  try {
    await signIn(editor);
    await editor.goto("/dashboard/inventory/new");
    await editor.getByLabel("Item name").fill(name);
    await editor
      .getByLabel("Category", { exact: false })
      .selectOption({ label: "Launch test equipment" });
    await editor
      .getByLabel("Location", { exact: false })
      .selectOption({ label: "Launch test lab" });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await editor.route("**/dashboard/inventory/new", async (route) => {
      if (route.request().method() === "POST") {
        await gate;
      }
      await route.continue();
    });
    await editor.getByRole("button", { name: "Create item" }).click();
    try {
      await expect(editor.locator(".optimistic-preview")).toContainText(name);
      expect(
        (await query('SELECT id FROM "InventoryItem" WHERE name=$1', [name])).rows,
      ).toHaveLength(0);
    } finally {
      release();
    }
    await expect(editor).toHaveURL(/\/dashboard\/inventory\/[a-f0-9-]{36}$/);
    const id = editor.url().split("/").pop()!;
    await expect(
      page.getByRole("link", { name, exact: true }).filter({ visible: true }),
    ).toBeVisible({ timeout: 15_000 });
    await editor.locator("#edit-record > summary").click();
    await editor
      .locator("#edit-record")
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption("DEFECTIVE");
    await editor.getByRole("button", { name: "Save update" }).click();
    await expect(editor.getByRole("status")).toContainText("Saved.");
    const row = page
      .locator(`[data-inventory-row-url="/dashboard/inventory/${id}"]`)
      .filter({ visible: true });
    await expect(row).toContainText("Defective", { timeout: 15_000 });
    await page.getByRole("link", { name: "Select items", exact: true }).click();
    await page
      .getByRole("checkbox", { name: `Select ${name}`, exact: true })
      .filter({ visible: true })
      .check();
    await page.getByRole("combobox", { name: "New status" }).selectOption("WORKING");
    let releaseBulk!: () => void;
    const bulkGate = new Promise<void>((resolve) => {
      releaseBulk = resolve;
    });
    await page.route("**/dashboard/inventory**", async (route) => {
      if (route.request().method() === "POST") {
        await bulkGate;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "Apply to 1", exact: true }).click();
    try {
      await expect(row.locator('[data-optimistic="true"]')).toContainText("Working");
    } finally {
      releaseBulk();
    }
    await expect(page).toHaveURL(/bulk=updated/);
    await expect(editor.locator(".status-pill").first()).toContainText("Working", {
      timeout: 15_000,
    });
    await page.goto(`/dashboard/inventory?q=${encodeURIComponent(name)}`);
    await query('DELETE FROM "InventoryItem" WHERE id=$1', [id]);
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await context.close();
  }
});

test("polling recovers when a proxy cannot deliver the live stream", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/live*", async (route) => {
    if (!route.request().url().includes("mode=poll")) {
      await route.abort();
    } else {
      await route.continue();
    }
  });
  const title = `Polling fallback ${Date.now()}`;
  await page.goto(`/dashboard/maintenance?q=${encodeURIComponent(title)}`);
  await ticket(title);
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 20_000 });
});

test("shared notes update pristine fields without overwriting a draft", async ({ page }) => {
  await signIn(page);
  await expect(page.locator(".live-updates")).toContainText("Live updates on");
  const content = `Shared note from another staff member ${Date.now()}`;
  await query(
    `INSERT INTO "DashboardNote" (id, scope, content, "updatedAt") VALUES ($1, 'shared-dashboard', $2, NOW())
    ON CONFLICT (scope) DO UPDATE SET content=EXCLUDED.content, "updatedAt"=NOW()`,
    [randomUUID(), content],
  );
  await expect(page.getByLabel("Department note")).toHaveValue(content, { timeout: 15_000 });
  await page.getByLabel("Department note").fill("Keep my unfinished note.");
  await query(
    'UPDATE "DashboardNote" SET content=$1, "updatedAt"=NOW() WHERE scope=\'shared-dashboard\'',
    [`${content} updated`],
  );
  await expect(page.locator(".live-updates")).toContainText("Updates waiting", { timeout: 15_000 });
  await expect(page.getByLabel("Department note")).toHaveValue("Keep my unfinished note.");
});

test("workspace layouts keep readable controls within their containers at four widths", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page);
  const routes = [
    "/dashboard",
    "/dashboard/inventory",
    "/dashboard/inventory/new",
    "/dashboard/borrowing",
    "/dashboard/maintenance",
    "/dashboard/reports",
    "/dashboard/activity",
    "/dashboard/settings",
    "/dashboard/users",
    "/scan/ceit-launch-item-27",
  ];
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("h1").first()).toBeVisible();
      const problems = await page.evaluate(() => {
        const issues: string[] = [];
        const liveStatus = document.querySelector(".live-updates")?.getBoundingClientRect();
        if (document.documentElement.scrollWidth > innerWidth + 1) {
          issues.push(`page overflow: ${document.documentElement.scrollWidth}`);
        }
        for (const element of document.querySelectorAll<HTMLElement>(
          ".field, .primary-button, .secondary-button, .danger-button",
        )) {
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height || element.closest(".honeypot")) {
            continue;
          }
          if (parseFloat(getComputedStyle(element).fontSize) < 14) {
            issues.push(`small text: ${element.textContent?.slice(0, 40)}`);
          }
          if (
            liveStatus &&
            liveStatus.left < rect.right &&
            liveStatus.right > rect.left &&
            liveStatus.top < rect.bottom &&
            liveStatus.bottom > rect.top
          ) {
            issues.push("live status overlaps a form control");
          }
          if (
            !element.closest(".overflow-x-auto") &&
            (rect.left < -1 || rect.right > innerWidth + 1)
          ) {
            issues.push(
              `control outside viewport: ${element.getAttribute("name") ?? element.textContent?.slice(0, 40)}`,
            );
          }
        }
        for (const element of document.querySelectorAll<HTMLElement>(
          ".record-table td:last-child .accent-link, .record-table .status-pill",
        )) {
          if (!element.getBoundingClientRect().width) {
            continue;
          }
          const style = getComputedStyle(element);
          const oneLine =
            parseFloat(style.lineHeight) +
            parseFloat(style.paddingTop) +
            parseFloat(style.paddingBottom) +
            parseFloat(style.borderTopWidth) +
            parseFloat(style.borderBottomWidth) +
            1; // Allow subpixel rounding while the page entrance animation settles.
          if (element.getBoundingClientRect().height > oneLine) {
            issues.push(`wrapped short table label: ${element.textContent}`);
          }
        }
        return issues;
      });
      expect(problems, `${route} at ${width}px`).toEqual([]);
      if (
        [360, 1440].includes(width) &&
        [
          "/dashboard",
          "/dashboard/users",
          "/dashboard/maintenance",
          "/dashboard/inventory",
        ].includes(route)
      ) {
        await page.screenshot({
          path: `test-results/polish-${route.split("/").pop()}-${width}.png`,
          fullPage: true,
        });
      }
    }
  }
});
