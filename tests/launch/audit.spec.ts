import { expect, test, type Page } from "@playwright/test";
import { loadEnvFile } from "node:process";
import pg from "pg";

loadEnvFile(".env.e2e.local");
const schema = process.env.INVENTORY_DB_SCHEMA;
if (!schema || !/^ceit_test_launch_\d+$/.test(schema)) {
  throw new Error("Website audit requires an isolated launch-test schema.");
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

test("inventory overview shows real status counts and opens the matching filter", async ({
  page,
}) => {
  const originals = (
    await query(
      `SELECT id, status, "qrCode" FROM "InventoryItem" WHERE "qrCode" IN ('ceit-launch-item-24', 'ceit-launch-item-25', 'ceit-launch-item-26')`,
    )
  ).rows;
  try {
    await query(
      `UPDATE "InventoryItem" SET status = CASE "qrCode"
      WHEN 'ceit-launch-item-24' THEN 'DEFECTIVE'::"ItemStatus"
      WHEN 'ceit-launch-item-25' THEN 'DEPLOYED'::"ItemStatus"
      ELSE 'RETIRED'::"ItemStatus" END WHERE id = ANY($1::uuid[])`,
      [originals.map((row) => row.id)],
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signIn(page);
    const mix = page.getByRole("region", { name: "Your inventory, at a glance" });
    const total = (await query('SELECT COUNT(*)::int AS count FROM "InventoryItem"')).rows[0].count;
    await expect(mix).toContainText(`${total} records`);
    for (const name of ["Defective 1", "Deployed 1", "Retired 1"]) {
      await expect(mix.getByRole("link", { name, exact: true })).toBeVisible();
    }
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: "Open appearance settings" }).click();
      await page.getByRole("button", { name: theme, exact: true }).click();
      await page.keyboard.press("Escape");
      await page.screenshot({
        path: `test-results/overview-mix-${theme.toLowerCase()}.png`,
        fullPage: true,
      });
    }
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await mix.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({ path: `test-results/overview-mix-${width}.png`, fullPage: true });
    }
    await mix.getByRole("link", { name: "Defective 1", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/inventory\?status=DEFECTIVE$/);
    await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue(
      "DEFECTIVE",
    );
    await expect(
      page.getByRole("link", { name: "Lab equipment 24", exact: true }).filter({ visible: true }),
    ).toBeVisible();
  } finally {
    for (const row of originals) {
      await query('UPDATE "InventoryItem" SET status=$1::"ItemStatus" WHERE id=$2', [
        row.status,
        row.id,
      ]);
    }
  }
});

test("public request choices keep keyboard focus and failed return details", async ({ page }) => {
  await page.goto("/scan/ceit-launch-item-24");
  await expect(page).toHaveTitle("Equipment details · CEIT Inventory");
  for (const [choice, heading] of [
    ["borrow", "Borrow Lab equipment 24"],
    ["return", "Return Lab equipment 24"],
    ["issue", "Report a problem"],
  ]) {
    const option = page.locator(`[data-request-mode="${choice}"]`);
    await expect(option).toBeVisible();
    await expect(option).toBeEnabled();
    await option.focus();
    await expect(option).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Back to item options" }).click();
    await expect(option).toBeFocused();
  }
  await page.getByRole("button", { name: /Return equipment/ }).click();
  await page.getByLabel("Student number").fill("AUDIT-NO-LOAN");
  await page.getByLabel("Contact number").fill("09123456789");
  await page.getByLabel("Return notes").fill("Keep these notes after validation fails.");
  await page.getByRole("button", { name: "Request return", exact: true }).click();
  const error = page.getByRole("alert").filter({ hasText: "No active borrowing record" });
  await expect(error).toBeVisible();
  await expect(error).toBeFocused();
  await expect(page.getByLabel("Student number")).toHaveValue("AUDIT-NO-LOAN");
  await expect(page.getByLabel("Return notes")).toHaveValue(
    "Keep these notes after validation fails.",
  );
});

test("scanner handles denied camera access and opens only trusted item links", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("Camera permission denied", "NotAllowedError");
      },
      configurable: true,
    });
  });
  await signIn(page);
  await page.goto("/scan");
  await page.getByRole("button", { name: "Use camera" }).click();
  await expect(page.locator("#scanner-status")).toContainText("Camera permission was not granted");
  await expect(page.getByRole("button", { name: "Use camera" })).toBeEnabled();
  await page
    .getByLabel("QR code", { exact: true })
    .fill("https://example.invalid/scan/ceit-launch-item-24");
  await page.getByRole("button", { name: "Open item", exact: true }).click();
  await expect(page.locator("#scanner-status")).toContainText("not a CEIT inventory QR code");
  await expect(page).toHaveURL(/\/scan$/);
  await page.getByLabel("QR code", { exact: true }).fill("ceit-launch-item-24");
  await page.getByRole("button", { name: "Open item", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lab equipment 24", exact: true })).toBeVisible();
});

test("photos upload, open above the page, preserve navigation focus, and can be removed", async ({
  page,
  request,
}) => {
  const item = (
    await query('SELECT id FROM "InventoryItem" WHERE "qrCode"=$1', ["ceit-launch-item-24"])
  ).rows[0];
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHZkAAAAASUVORK5CYII=",
    "base64",
  );
  await signIn(page);
  await page.goto(`/dashboard/inventory/${item.id}?edit=1`);
  try {
    for (const fileName of ["audit-front.png", "audit-back.png"]) {
      await page
        .getByLabel("Choose item photo")
        .setInputFiles({ name: fileName, mimeType: "image/png", buffer: png });
      await page.getByRole("button", { name: "Add photo", exact: true }).click();
      await expect(
        page.getByRole("button", { name: `Open ${fileName}`, exact: true }),
      ).toBeVisible();
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const row = page.locator(".photo-editor-row").first();
      await row.scrollIntoViewIfNeeded();
      expect(await row.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(
        await row
          .locator("p")
          .first()
          .evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
      expect((await row.boundingBox())!.height).toBeLessThan(220);
      await page.screenshot({ path: `test-results/photo-controls-${width}.png` });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const opener = page.getByRole("button", { name: "Open audit-front.png", exact: true });
    await opener.click();
    const viewer = page.getByRole("dialog");
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Close photo viewer" })).toBeFocused();
    await viewer.getByRole("button", { name: "Next photo" }).click();
    await expect(viewer.getByRole("button", { name: "Next photo" })).toBeFocused();
    await expect(viewer).toHaveAccessibleName("audit-back.png");
    await page.keyboard.press("Tab");
    await expect(viewer.getByRole("button", { name: "Close photo viewer" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(opener).toBeFocused();
    const photo = (
      await query(
        'SELECT id FROM "InventoryItemPhoto" WHERE "inventoryItemId"=$1 AND "fileName"=$2',
        [item.id, "audit-front.png"],
      )
    ).rows[0];
    const publicResponse = await request.get(`/dashboard/inventory/${item.id}/photos/${photo.id}`, {
      maxRedirects: 0,
    });
    expect(publicResponse.status()).toBe(307);
    expect(publicResponse.headers().location).toContain("/auth/login");
    for (const fileName of ["audit-front.png", "audit-back.png"]) {
      const photoRow = page
        .locator(".card-muted")
        .filter({ has: page.getByRole("button", { name: `Open ${fileName}`, exact: true }) });
      await photoRow.getByRole("button", { name: "Remove photo", exact: true }).click();
      await photoRow.getByRole("button", { name: "Confirm removal", exact: true }).click();
      await expect(page.getByRole("button", { name: `Open ${fileName}`, exact: true })).toHaveCount(
        0,
      );
    }
  } finally {
    await query(
      'DELETE FROM "InventoryItemPhoto" WHERE "inventoryItemId"=$1 AND "fileName" IN ($2,$3)',
      [item.id, "audit-front.png", "audit-back.png"],
    );
  }
});

test("the report builder clears filters and only offers controls that fit the report", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/dashboard/reports?kind=maintenance&maintenanceSource=QR&period=today");
  const form = page.getByRole("form", { name: "Report builder" });
  await expect(form.locator('select[name="maintenanceSource"]')).toHaveValue("QR");
  await expect(form.locator('select[name="period"]')).toHaveValue("today");

  await form.getByLabel("From", { exact: true }).fill("2026-09-01");
  await expect(form.locator('select[name="period"]')).toHaveValue("");
  await expect(form.getByText("Filters changed", { exact: false })).toBeVisible();

  await form.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/dashboard\/reports\?kind=maintenance$/);
  await expect(form.locator('select[name="maintenanceSource"]')).toHaveValue("");
  await expect(form.locator('select[name="period"]')).toHaveValue("");
  await expect(form.getByLabel("From", { exact: true })).toHaveValue("");

  await form.getByRole("radio", { name: "Borrowing" }).check({ force: true });
  await expect(form.locator('select[name="borrowingState"]')).toBeVisible();
  await expect(form.locator('select[name="maintenanceSource"]')).toHaveCount(0);
  await form.getByRole("radio", { name: "Software" }).check({ force: true });
  await expect(form.locator('select[name="license"]')).toBeVisible();
  await expect(form.locator('select[name="period"]')).toHaveCount(0);
  await form.getByRole("radio", { name: "Maintenance" }).check({ force: true });
  await expect(form.locator('select[name="maintenanceSource"]')).toBeVisible();
  await expect(form.locator('select[name="borrowingState"]')).toHaveCount(0);
});

test("every route has a readable mobile and desktop view in both themes", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  const item = (
    await query('SELECT id FROM "InventoryItem" WHERE "qrCode"=$1', ["ceit-launch-item-24"])
  ).rows[0];
  const routes = [
    ["dashboard", "/dashboard"],
    ["inventory", "/dashboard/inventory"],
    ["item", `/dashboard/inventory/${item.id}`],
    ["new-item", "/dashboard/inventory/new"],
    ["import", "/dashboard/inventory/import"],
    ["labels", "/dashboard/inventory/labels"],
    ["label", `/dashboard/inventory/${item.id}/label`],
    ["borrowing", "/dashboard/borrowing"],
    ["maintenance", "/dashboard/maintenance"],
    ["reports", "/dashboard/reports"],
    ["student-survey", "/dashboard/student-survey"],
    ["activity", "/dashboard/activity"],
    ["settings", "/dashboard/settings"],
    ["users", "/dashboard/users"],
    ["scanner", "/scan"],
    ["public-item", "/scan/ceit-launch-item-24?view=public"],
    ["scanned-item", `/dashboard/inventory/${item.id}?edit=1&scanned=1`],
    ["hardware", "/dashboard/inventory/hardware"],
    ["software", "/dashboard/inventory/software"],
    ["login", "/auth/login"],
  ];
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => localStorage.setItem("ceit-theme", value), theme);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      for (const [name, path] of routes) {
        await page.goto(path);
        await expect(page.locator("h1").first()).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const issues = await page.evaluate(() => {
          const issues: string[] = [];
          if (document.documentElement.scrollWidth > innerWidth + 1) {
            issues.push("horizontal page overflow");
          }
          const headings = [...document.querySelectorAll("h1")].filter(
            (element) => element.getBoundingClientRect().width,
          );
          if (headings.length !== 1) {
            issues.push(`${headings.length} visible page headings`);
          }
          const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
          if (new Set(ids).size !== ids.length) {
            issues.push("duplicate element IDs");
          }
          // Check rendered text, including small metadata; compact printed labels
          // deliberately retain their physical print dimensions.
          for (const element of document.querySelectorAll<HTMLElement>("body *")) {
            if (element.closest('.sr-only, [aria-hidden="true"], .sheet-label')) {
              continue;
            }
            const bounds = element.getBoundingClientRect();
            if (bounds.width <= 1 || bounds.height <= 1 || !element.checkVisibility()) {
              continue;
            }
            const hasText = [...element.childNodes].some(
              (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
            );
            if (hasText && parseFloat(getComputedStyle(element).fontSize) < 14) {
              issues.push(`small text: ${element.textContent?.trim().slice(0, 60)}`);
            }
          }
          return issues;
        });
        expect(issues, `${path} / ${theme} / ${width}`).toEqual([]);
        await page.screenshot({
          path: `test-results/audit-${name}-${theme}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }
  expect(errors).toEqual([]);
});

test("account creation, password changes, resets, and deactivation enforce session access", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const username = `audit.staff.${Date.now()}`;
  const email = `${username}@ceit.invalid`;
  const initialPassword = process.env.CEIT_TEST_PASSWORD!;
  const changedPassword = `${initialPassword}Change9`;
  const resetPassword = `${initialPassword}Reset9`;
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  staff.setDefaultTimeout(15_000);
  const login = async (password: string) => {
    await staff.goto("/auth/login");
    await staff.getByLabel("Email address or username").fill(username);
    await staff.getByLabel("Password", { exact: true }).fill(password);
    await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  };
  try {
    await signIn(page);
    await page.goto("/dashboard/users");
    const create = page
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: "Add account" }) });
    await create.locator("summary").click();
    await create.getByLabel("Email address").fill(email);
    await create.getByLabel("Username").fill("invalid!username");
    expect(
      await create
        .getByLabel("Username")
        .evaluate((input: HTMLInputElement) => input.validity.patternMismatch),
    ).toBe(true);
    await create.getByLabel("Username").fill(username);
    await create.getByLabel("Initial password").fill(initialPassword);
    await create.getByRole("button", { name: "Create account" }).click();
    await expect
      .poll(
        async () =>
          (await query('SELECT COUNT(*)::int AS count FROM "User" WHERE email=$1', [email])).rows[0]
            .count,
      )
      .toBe(1);
    await login(initialPassword);
    await expect(staff).toHaveURL(/\/dashboard$/);
    await staff.goto("/dashboard/settings");
    await staff.getByLabel("Current password", { exact: true }).fill(initialPassword);
    await staff.locator('input[name="newPassword"]').fill(changedPassword);
    await staff.getByLabel("Confirm new password", { exact: true }).fill(changedPassword);
    await staff.getByRole("button", { name: "Update account" }).click();
    await expect(staff).toHaveURL(/\/auth\/login\?notice=password-updated/);
    await login(initialPassword);
    await expect(staff).toHaveURL(/error=invalid-credentials/);
    await login(changedPassword);
    await expect(staff).toHaveURL(/\/dashboard$/);
    await page.reload();
    const account = page
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: email }) });
    await account.locator("summary").click();
    await account.getByLabel("New password", { exact: true }).fill(resetPassword);
    await account.getByRole("button", { name: "Save account" }).click();
    await expect
      .poll(
        async () =>
          (
            await query(
              'SELECT COUNT(*)::int AS count FROM "UserSession" s JOIN "User" u ON u.id=s."userId" WHERE u.email=$1',
              [email],
            )
          ).rows[0].count,
      )
      .toBe(0);
    await staff.goto("/dashboard");
    await expect(staff).toHaveURL(/\/auth\/login/);
    await login(resetPassword);
    await expect(staff).toHaveURL(/\/dashboard$/);
    await page.reload();
    await account.locator("summary").click();
    await account.getByLabel("Active", { exact: true }).uncheck();
    await account.getByRole("button", { name: "Save account" }).click();
    await expect
      .poll(
        async () =>
          (await query('SELECT "isActive" FROM "User" WHERE email=$1', [email])).rows[0].isActive,
      )
      .toBe(false);
    await staff.goto("/dashboard");
    await expect(staff).toHaveURL(/\/auth\/login/);
    await login(resetPassword);
    await expect(staff).toHaveURL(/error=invalid-credentials/);
  } finally {
    await staffContext.close().catch(() => {});
    await query('DELETE FROM "User" WHERE email=$1', [email]);
  }
});
