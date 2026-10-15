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
async function signIn(page: Page, username = "launch.admin") {
  await page.goto("/auth/login");
  await page.getByLabel("Email address or username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(process.env.CEIT_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const categoryName = "Directory test computers";
const roomName = "Directory test room";
const marker = "Zq-Directory";

// 3 pcs with some shared parts and different license states
test.beforeAll(async () => {
  await cleanUp();
  const category = (
    await query(
      `INSERT INTO "Category" (id,name,"assetTagCode","updatedAt") VALUES (gen_random_uuid(),$1,'DTC',NOW()) RETURNING id`,
      [categoryName],
    )
  ).rows[0].id as string;
  const room = (
    await query(
      `INSERT INTO "Location" (id,name,"assetTagCode","updatedAt") VALUES (gen_random_uuid(),$1,'DR',NOW()) RETURNING id`,
      [roomName],
    )
  ).rows[0].id as string;
  const pcs = [
    ["A", "Intel Core i5-10400", 16, "Windows 11 Pro"],
    ["B", "Intel Core i5-10400", 16, "Windows 11 Pro"],
    ["C", null, null, null],
  ] as const;
  const computers: string[] = [];
  for (const [letter, processor, memory, system] of pcs) {
    const item = (
      await query(
        `INSERT INTO "InventoryItem" (id,name,"assetTag","qrCode","categoryId","locationId","isComputer","lastCheckedAt","updatedAt")
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,true,NOW(),NOW()) RETURNING id`,
        [
          `${marker} PC ${letter}`,
          `INV-DTC-OK-DR-ZZ${letter}`,
          `ceit-directory-pc-${letter}`,
          category,
          room,
        ],
      )
    ).rows[0].id as string;
    computers.push(
      (
        await query(
          `INSERT INTO "Computer" (id,"itemId",processor,"memoryGb","storageGb","operatingSystem","updatedAt")
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,NOW()) RETURNING id`,
          [item, processor, memory, memory ? 512 : null, system],
        )
      ).rows[0].id as string,
    );
  }
  const software = [
    ["Zq Studio", "2.0", "'-20 days'", [0, 1]],
    ["zq studio", "1.0", null, [2]],
    ["Zq Render", "5", "'10 days'", [0]],
    ["Zq Notes", "3", "'300 days'", [1]],
  ] as const;
  for (const [name, version, interval, targets] of software) {
    for (const index of targets) {
      await query(
        `INSERT INTO "ComputerSoftware" (id,"computerId",name,version,"licenseExpiresAt","updatedAt")
         VALUES (gen_random_uuid(),$1,$2,$3,${interval ? `NOW() + INTERVAL ${interval}` : "NULL"},NOW())`,
        [computers[index], name, version],
      );
    }
  }
});

test.afterAll(cleanUp);

async function cleanUp() {
  await query(
    `DELETE FROM "InventoryItem" WHERE "qrCode" LIKE 'ceit-directory-pc-%' OR name LIKE $1`,
    [`${marker}%`],
  );
  await query(`DELETE FROM "Category" WHERE name=$1`, [categoryName]);
  await query(`DELETE FROM "Location" WHERE name=$1`, [roomName]);
  await query(`DELETE FROM "InventoryAudit" WHERE "entityLabel" LIKE 'Audit view test%'`);
}

test("the inventory page switches between equipment, hardware, and software", async ({ page }) => {
  await signIn(page, "launch.staff");
  await page.goto("/dashboard/inventory");
  const tabs = page.getByRole("navigation", { name: "Inventory views" });
  await expect(tabs.getByRole("link", { name: "Inventory" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await tabs.getByRole("link", { name: "Hardware" }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/hardware/);
  await expect(page.getByRole("heading", { name: "Hardware", level: 1 })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Inventory views" })
    .getByRole("link", { name: "Software" })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/software/);
  await expect(page.getByRole("heading", { name: "Software", level: 1 })).toBeVisible();
});

test("software groups the same title across PCs and filters by license", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/inventory/software?q=${encodeURIComponent("Zq")}`);
  const list = page.getByRole("region", { name: "Installed software" });

  // case insensitive title grouping
  const studio = list.getByRole("listitem").filter({ hasText: "Zq Studio" }).first();
  await expect(studio).toContainText("3 PCs");
  await expect(studio).toContainText("2 versions");
  await expect(studio).toContainText(`${marker} PC A`);
  await expect(studio).toContainText(`${marker} PC C`);
  await expect(list.getByRole("heading", { name: /^zq studio$/i })).toHaveCount(1);
  await expect(list.getByRole("heading", { name: "Zq Notes" })).toBeVisible();

  await page.locator('select[name="license"]').selectOption("expired");
  await expect(page).toHaveURL(/license=expired/);
  await expect(list.getByRole("heading", { name: /^zq studio$/i })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Zq Notes" })).toHaveCount(0);
  await expect(list.getByRole("heading", { name: "Zq Render" })).toHaveCount(0);

  await page.locator('select[name="license"]').selectOption("expiring");
  await expect(page).toHaveURL(/license=expiring/);
  await expect(list.getByRole("heading", { name: "Zq Render" })).toBeVisible();
  await expect(list.getByRole("heading", { name: /^zq studio$/i })).toHaveCount(0);

  // search by pc name
  await page.goto(
    `/dashboard/inventory/software?q=${encodeURIComponent(`${marker} PC B`)}&sort=installs`,
  );
  await expect(list.getByRole("heading", { name: /^zq studio$/i })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Zq Notes" })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Zq Render" })).toHaveCount(0);

  await expect(page.getByRole("link", { name: "Open as report" })).toHaveAttribute(
    "href",
    /kind=software/,
  );
});

test("hardware lists components and which PCs have them", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/inventory/hardware?q=${encodeURIComponent(marker)}`);

  const byComponent = page.getByRole("region", { name: /PCs grouped by/ });
  const processorGroup = byComponent
    .getByRole("listitem")
    .filter({ hasText: "Intel Core i5-10400" });
  await expect(processorGroup).toContainText("2 PCs");
  await expect(processorGroup).toContainText(`${marker} PC A`);
  await expect(processorGroup).toContainText(`${marker} PC B`);
  await expect(processorGroup).not.toContainText(`${marker} PC C`);

  await page.getByRole("radio", { name: "By PC" }).check({ force: true });
  await expect(page).toHaveURL(/view=pcs/);
  const machines = page.getByRole("region", { name: "PCs and their hardware" });
  await expect(machines).toContainText(`${marker} PC C`);

  await page.getByLabel("Only PCs missing details").check();
  await expect(page).toHaveURL(/incomplete=1/);
  await expect(machines).toContainText(`${marker} PC C`);
  await expect(machines).not.toContainText(`${marker} PC A`);
});

test("pc labels show hardware and software and grow with long lists", async ({ page }) => {
  const ids = Object.fromEntries(
    (
      await query(`SELECT id, name FROM "InventoryItem" WHERE name LIKE $1`, [`${marker} PC %`])
    ).rows.map((row) => [String(row.name).slice(-1), row.id as string]),
  );
  const extra = Array.from({ length: 20 }, (_, index) => `Zz Lab app ${index + 1}`);
  await query(
    `INSERT INTO "ComputerSoftware" (id,"computerId",name,"updatedAt")
     SELECT gen_random_uuid(), c.id, n, NOW() FROM "Computer" c, unnest($2::text[]) n WHERE c."itemId"=$1`,
    [ids.C, extra],
  );
  await query(
    `INSERT INTO "InventoryItem" (id,name,"qrCode","categoryId","locationId","updatedAt")
     SELECT gen_random_uuid(), $1, 'ceit-directory-pc-projector', "categoryId", "locationId", NOW()
     FROM "InventoryItem" WHERE id=$2`,
    [`${marker} Projector`, ids.A],
  );
  try {
    await signIn(page);
    await page.goto(`/dashboard/inventory/${ids.A}`);
    await page.getByRole("link", { name: "Print PC label" }).click();
    await expect(page).toHaveURL(/type=pc/);
    await expect(page.getByRole("heading", { name: "PC labels", level: 1 })).toBeVisible();

    const first = page.getByRole("article", { name: `PC label for ${marker} PC A` });
    await expect(first.getByRole("rowheader", { name: "CPU" })).toBeVisible();
    await expect(first).toContainText("Intel Core i5-10400");
    await expect(first).toContainText("16 GB");
    await expect(first).toContainText("Zq Studio 2.0");
    await expect(first).toContainText("Zq Render 5");
    await expect(first.getByRole("img", { name: /QR code/ })).toBeVisible();
    await expect(first.locator("thead th").nth(1)).toHaveAttribute("colspan", "1");

    // 21 programs split into two columns
    await page.goto(`/dashboard/inventory/labels?type=pc&ids=${ids.A},${ids.C}`);
    const long = page.getByRole("article", { name: `PC label for ${marker} PC C` });
    await expect(long.locator("thead th").nth(1)).toHaveAttribute("colspan", "2");
    await expect(long).toContainText("Zz Lab app 20");
    await expect(long).toContainText("zq studio 1.0");
    await expect(page.getByRole("article", { name: /^PC label for/ })).toHaveCount(2);

    await page.locator('select[name="size"]').selectOption("small");
    await expect(page).toHaveURL(/size=small/);
    await expect(page.locator(".pc-label-small")).toHaveCount(2);

    // only pcs show up as tiles
    await page.goto(`/dashboard/inventory/labels?type=pc&q=${encodeURIComponent(marker)}`);
    await expect(page.getByText(`${marker} PC B`).first()).toBeVisible();
    await expect(page.getByText(`${marker} Projector`)).toHaveCount(0);
    await page.goto(`/dashboard/inventory/labels?q=${encodeURIComponent(marker)}`);
    await expect(page.getByText(`${marker} Projector`).first()).toBeVisible();
    await page.goto(
      `/dashboard/inventory/labels?type=pc&q=${encodeURIComponent(`${marker} Projector`)}`,
    );
    await expect(page.getByText("No PCs found.")).toBeVisible();

    await page
      .getByRole("navigation", { name: "Label type" })
      .getByRole("link", { name: "QR labels" })
      .click();
    await expect(page).not.toHaveURL(/type=pc/);
    await expect(page.getByRole("heading", { name: "QR labels", level: 1 })).toBeVisible();
  } finally {
    await query(`DELETE FROM "ComputerSoftware" WHERE name LIKE 'Zz Lab app %'`);
    await query(`DELETE FROM "InventoryItem" WHERE "qrCode"='ceit-directory-pc-projector'`);
  }
});

test("audit trail shows important events first", async ({ page }) => {
  await query(
    `INSERT INTO "InventoryAudit" (id,action,summary,"entityType","entityLabel") VALUES
     (gen_random_uuid(),'SCANNED','Audit view test routine scan.','inventory-item','Audit view test scan'),
     (gen_random_uuid(),'UPDATED','Audit view test record edit.','inventory-item','Audit view test edit'),
     (gen_random_uuid(),'UPDATED','Audit view test borrowing event.','borrow-request','Audit view test borrowing')`,
  );
  await signIn(page);
  await page.goto("/dashboard/activity?q=Audit+view+test");
  const events = page.getByRole("region", { name: "Audit events" });
  await expect(events).toContainText("Audit view test record edit.");
  await expect(events).toContainText("Audit view test borrowing event.");
  await expect(events).not.toContainText("Audit view test routine scan.");
  await expect(page.getByRole("heading", { name: "Today", level: 2 })).toBeVisible();

  await page.getByRole("radio", { name: "Borrowing" }).check({ force: true });
  await expect(page).toHaveURL(/view=borrowing/);
  await expect(events).toContainText("Audit view test borrowing event.");
  await expect(events).not.toContainText("Audit view test record edit.");

  await page.getByRole("radio", { name: "Routine" }).check({ force: true });
  await expect(page).toHaveURL(/view=routine/);
  await expect(events).toContainText("Audit view test routine scan.");
  await expect(events).not.toContainText("Audit view test record edit.");

  await page.getByRole("radio", { name: "Everything" }).check({ force: true });
  await expect(events).toContainText("Audit view test routine scan.");
  await expect(events).toContainText("Audit view test record edit.");

  // unknown view falls back with a notice
  await page.goto("/dashboard/activity?view=nonsense");
  await expect(page.getByRole("alert").filter({ hasText: "Invalid audit view" })).toBeVisible();
});
