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

test("public request choices keep keyboard focus and failed return details", async ({ page }) => {
  await page.goto("/scan/ceit-launch-item-24");
  await expect(page).toHaveTitle("Equipment details · CEIT Inventory");
  for (const [choice, heading] of [
    ["borrow", "Borrow Lab equipment 24"],
    ["return", "Return Lab equipment 24"],
    ["issue", "Report a problem"],
  ]) {
    const option = page.locator(`[data-request-mode="${choice}"]`);
    await option.focus();
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
      await photoRow.getByRole("button", { name: "Remove", exact: true }).click();
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

test("mobile quick navigation opens with the sidebar closed and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const navigationButton = page.getByRole("button", { name: "Open navigation" });
  await navigationButton.focus();
  await page.keyboard.press("Control+k");
  const menu = page.getByRole("dialog", { name: "Where would you like to go?" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("textbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(navigationButton).toBeFocused();
});

test("report reset clears edited and initially selected filters", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/reports?kind=maintenance&maintenanceSource=QR&period=today");
  const form = page.locator(".reports-export-form");
  await form.getByLabel("From", { exact: true }).fill("2026-09-01");
  await form.getByRole("button", { name: "Reset filters" }).click();
  await expect(form.getByRole("combobox", { name: "Report", exact: true })).toHaveValue(
    "inventory",
  );
  await expect(form.getByLabel("Timeframe")).toHaveValue("all");
  await expect(form.getByLabel("From", { exact: true })).toHaveValue("");
  await expect(form.getByLabel("To", { exact: true })).toHaveValue("");
  await form.getByLabel("Inventory status").selectOption("DEFECTIVE");
  await form.getByLabel("PC / Mac only").check();
  await form.getByRole("button", { name: "Reset filters" }).click();
  await expect(form.getByLabel("Inventory status")).toHaveValue("");
  await expect(form.getByLabel("PC / Mac only")).not.toBeChecked();
  await form.getByRole("combobox", { name: "Report", exact: true }).selectOption("maintenance");
  await expect(form.getByLabel("Report source")).toHaveValue("");
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
    ["public-item", "/scan/ceit-launch-item-24"],
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
