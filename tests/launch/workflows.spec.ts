import { expect, test, type Page } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
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
async function download(page: Page, path: string) {
  // Chromium accepts secure cookies on loopback HTTP; the API request client does not.
  return page.request.get(path, {
    headers: {
      Cookie: (await page.context().cookies())
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; "),
    },
  });
}
// Staff confirm they looked at the borrower's ID before equipment leaves.
async function checkOutEquipment(page: Page) {
  await page.getByLabel("I checked the borrower's school ID").filter({ visible: true }).check();
  await page.getByRole("button", { name: "Check out equipment" }).filter({ visible: true }).click();
}
test.beforeAll(async () => {
  await query(
    'DELETE FROM "InventoryAudit"; DELETE FROM "BorrowRequest"; DELETE FROM "MaintenanceTicket"; DELETE FROM "PublicRequestAttempt"; DELETE FROM "InventoryItem" WHERE "qrCode" NOT LIKE \'ceit-launch-item-%\'; UPDATE "InventoryItem" SET status=\'OK\', quantity=1;',
  );
});
test.beforeEach(async () => {
  await query('DELETE FROM "PublicRequestAttempt"');
});
async function fillBorrow(
  page: Page,
  item: number,
  student: string,
  later: boolean,
  fromHours = 24,
  toHours = 26,
) {
  await page.goto(`/scan/ceit-launch-item-${item}?view=public`);
  await page.getByRole("button", { name: /Borrow equipment/ }).click();
  if (later) {
    await page.getByLabel("Reserve for later").check();
    await page
      .getByLabel("Pickup date and time")
      .fill(manilaDateTimeInput(new Date(Date.now() + fromHours * 3_600_000)));
  }
  await page
    .getByLabel("Return date and time")
    .fill(manilaDateTimeInput(new Date(Date.now() + toHours * 3_600_000)));
  await page.getByLabel("Full name").fill("Launch Test Student");
  await page.getByLabel("Student number").fill(student);
  await page.getByLabel("Contact number").fill("09123456789");
  await page.getByLabel("Purpose", { exact: false }).fill("Class presentation test");
}

test("inventory handles repeated filters and keeps bulk selection across sorting", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/dashboard/inventory?q=Lab%20equipment&q=ignored&sort=item&sort=status");
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue(
    "Lab equipment",
  );
  await expect(page.locator('input[data-bulk-selection-item="true"]')).toHaveCount(0);
  await page.getByRole("link", { name: "Select items", exact: true }).click();
  await expect(page).toHaveURL(/bulk=1/);
  const selection = page
    .getByRole("checkbox", { name: "Select Lab equipment 2", exact: true })
    .filter({ visible: true });
  await selection.check();
  await page.getByRole("link", { name: /^Sort by Item/ }).click();
  await expect(page).toHaveURL(/bulk=1/);
  await expect(selection).toBeChecked();
  await page.getByRole("link", { name: "Done selecting", exact: true }).click();
  await expect(page.locator('input[data-bulk-selection-item="true"]')).toHaveCount(0);
});

test("maintenance finds equipment on demand and accepts an exact item link", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/maintenance?item=------------------------------------");
  await expect(
    page.getByRole("heading", { name: "Maintenance requests", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Inventory item" })).toHaveCount(0);
  await page.getByRole("link", { name: "Report an issue", exact: true }).click();
  await page.getByRole("textbox", { name: "Find equipment", exact: true }).fill("Lab equipment 27");
  await page.getByRole("button", { name: "Find items", exact: true }).click();
  const picker = page.getByRole("combobox", { name: "Inventory item", exact: false });
  await expect(picker.locator("option")).toHaveCount(2);
  await expect(picker.locator("option").last()).toContainText("Lab equipment 27");
  const item = (
    await query('SELECT id FROM "InventoryItem" WHERE "qrCode"=$1', ["ceit-launch-item-27"])
  ).rows[0];
  await page.goto(`/dashboard/maintenance?item=${item.id}`);
  await expect(picker).toHaveValue(item.id);
});

test("QR reports reach maintenance, CSV, PDF, and the item history", async ({ page }) => {
  await page.goto("/scan/ceit-launch-item-1");
  await page.getByRole("button", { name: /Report a problem/ }).click();
  await page.getByLabel("Your name").fill("Test Reporter");
  await page.getByLabel("Issue title").fill("Lamp flickers during class");
  await page
    .getByLabel("What happened")
    .fill("The projector lamp flickers after five minutes of use.");
  await page.getByRole("button", { name: "Send issue report" }).click();
  await expect(page.getByRole("status")).toContainText("Your issue report was sent");
  await page.goto("/scan/ceit-launch-item-1");
  await page.getByRole("button", { name: /Report a problem/ }).click();
  await page.getByLabel("Your name").fill("Test Reporter");
  await page.getByLabel("Issue title").fill("Lamp flickers during class");
  await page
    .getByLabel("What happened")
    .fill("The projector lamp flickers after five minutes of use.");
  await page.getByRole("button", { name: "Send issue report" }).click();
  await expect(page.getByRole("status")).toContainText("Your issue report was sent");
  expect(
    (
      await query('SELECT COUNT(*)::int AS count FROM "MaintenanceTicket" WHERE title=$1', [
        "Lamp flickers during class",
      ])
    ).rows[0].count,
  ).toBe(1);
  await signIn(page);
  await page.goto("/dashboard/maintenance?source=QR");
  await expect(page.getByRole("heading", { name: "Lamp flickers during class" })).toBeVisible();
  const csv = await download(
    page,
    "/dashboard/reports/export?kind=maintenance&maintenanceSource=QR",
  );
  expect(csv.ok()).toBeTruthy();
  expect(await csv.text()).toContain("QR issue report");
  const pdf = await download(
    page,
    "/dashboard/reports/export/pdf?kind=maintenance&maintenanceSource=QR",
  );
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  writeFileSync("test-results/maintenance.pdf", await pdf.body());
  const result = await query('SELECT i.status,i.id FROM "InventoryItem" i WHERE "qrCode"=$1', [
    "ceit-launch-item-1",
  ]);
  expect(result.rows[0].status).toBe("OK");
  await page.goto(`/dashboard/inventory/${result.rows[0].id}`);
  await expect(
    page.getByText("Lamp flickers during class", { exact: false }).first(),
  ).toBeVisible();
  await page.goto("/dashboard/maintenance?source=QR");
  const ticket = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Lamp flickers during class" }) });
  await ticket.locator("summary").filter({ hasText: "Update request" }).click();
  await ticket.getByRole("combobox", { name: "Priority", exact: true }).selectOption("URGENT");
  await ticket.getByRole("combobox", { name: /^Equipment status/ }).selectOption("DEFECTIVE");
  await ticket.getByRole("button", { name: "Save changes" }).click();
  await expect(ticket.getByRole("status")).toContainText("Saved.");
  await expect(ticket.getByRole("combobox", { name: "Priority", exact: true })).toHaveValue(
    "URGENT",
  );
  expect(
    (await query('SELECT status FROM "InventoryItem" WHERE id=$1', [result.rows[0].id])).rows[0]
      .status,
  ).toBe("DEFECTIVE");
  await ticket.getByRole("combobox", { name: "Status", exact: true }).selectOption("RESOLVED");
  await ticket.getByLabel("Staff notes").fill("Replaced the lamp and checked the picture.");
  await ticket.getByRole("combobox", { name: /^Equipment status/ }).selectOption("WORKING");
  await ticket.getByRole("button", { name: "Save changes" }).click();
  await expect(ticket.getByText("Resolved", { exact: true }).first()).toBeVisible();
  const resolution = (
    await query(
      'SELECT status,priority,"resolutionNotes" FROM "MaintenanceTicket" WHERE title=$1',
      ["Lamp flickers during class"],
    )
  ).rows[0];
  expect(resolution).toEqual({
    status: "RESOLVED",
    priority: "URGENT",
    resolutionNotes: "Replaced the lamp and checked the picture.",
  });
});

test("reservations hold a time without checking out equipment, reject overlap, and can be cancelled", async ({
  page,
}) => {
  await fillBorrow(page, 2, "TEST-RESERVE-1", true);
  await page.getByRole("button", { name: "Request reservation", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Your borrowing request was sent");
  await signIn(page);
  await page.goto("/dashboard/borrowing?q=TEST-RESERVE-1");
  await page
    .getByRole("button", { name: "Approve reservation", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByText("Reserved", { exact: true }).filter({ visible: true })).toBeVisible();
  const result = await query(
    'SELECT b.status,i.status AS "itemStatus" FROM "BorrowRequest" b JOIN "InventoryItem" i ON i.id=b."inventoryItemId" WHERE b."studentNumber"=$1',
    ["TEST-RESERVE-1"],
  );
  expect(result.rows[0]).toEqual({ status: "RESERVED", itemStatus: "OK" });
  await fillBorrow(page, 2, "TEST-RESERVE-2", true);
  await page.getByRole("button", { name: "Request reservation", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "already requested or reserved" }),
  ).toBeVisible();
  await expect(page.getByLabel("Student number")).toHaveValue("TEST-RESERVE-2");
  const csv = await download(
    page,
    "/dashboard/reports/export?kind=borrowings&borrowingState=reserved",
  );
  expect(await csv.text()).toContain("TEST-RESERVE-1");
  await page.goto("/dashboard/borrowing?q=TEST-RESERVE-1");
  await page.getByLabel("Cancellation reason").filter({ visible: true }).fill("Class cancelled");
  await page
    .getByRole("button", { name: "Cancel reservation", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByText("Cancelled", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
});

test("same-day checkout and return preserve the individual asset quantity", async ({ page }) => {
  await fillBorrow(page, 3, "TEST-NOW-1", false, 0, 1);
  await page.getByRole("button", { name: "Send borrowing request" }).click();
  await expect(page.getByRole("status")).toContainText("Your borrowing request was sent");
  await signIn(page);
  await page.goto("/dashboard/borrowing?q=TEST-NOW-1");
  await checkOutEquipment(page);
  await expect(page.getByText("Borrowed", { exact: true }).filter({ visible: true })).toBeVisible();
  let item = await query('SELECT status,quantity FROM "InventoryItem" WHERE "qrCode"=$1', [
    "ceit-launch-item-3",
  ]);
  expect(item.rows[0]).toEqual({ status: "DEPLOYED", quantity: 1 });
  await page.getByRole("button", { name: "Mark returned" }).filter({ visible: true }).click();
  await expect(page.getByText("Returned", { exact: true }).filter({ visible: true })).toBeVisible();
  item = await query('SELECT status,quantity FROM "InventoryItem" WHERE "qrCode"=$1', [
    "ceit-launch-item-3",
  ]);
  expect(item.rows[0]).toEqual({ status: "OK", quantity: 1 });
});

test("legacy grouped equipment returns every unit after its last available unit is borrowed", async ({
  page,
}) => {
  await query('UPDATE "InventoryItem" SET quantity=2 WHERE "qrCode"=$1', ["ceit-launch-item-7"]);
  for (const student of ["TEST-LEGACY-A", "TEST-LEGACY-B"]) {
    await fillBorrow(page, 7, student, false, 0, 2);
    await page.getByRole("button", { name: "Send borrowing request" }).click();
    await expect(page.getByRole("status")).toContainText("Your borrowing request was sent");
    await signIn(page);
    await page.goto(`/dashboard/borrowing?q=${student}`);
    await checkOutEquipment(page);
    await expect(
      page.getByText("Borrowed", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
  }
  expect(
    (
      await query('SELECT quantity,status FROM "InventoryItem" WHERE "qrCode"=$1', [
        "ceit-launch-item-7",
      ])
    ).rows[0],
  ).toEqual({ quantity: 0, status: "OK" });
  for (const student of ["TEST-LEGACY-A", "TEST-LEGACY-B"]) {
    await page.goto(`/dashboard/borrowing?q=${student}`);
    await page.getByRole("button", { name: "Mark returned" }).filter({ visible: true }).click();
    await expect(
      page.getByText("Returned", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
  }
  expect(
    (
      await query('SELECT quantity,status FROM "InventoryItem" WHERE "qrCode"=$1', [
        "ceit-launch-item-7",
      ])
    ).rows[0],
  ).toEqual({ quantity: 2, status: "OK" });
});

test("batch labels keep all 27 items across two sheets", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/inventory/labels");
  await page
    .getByRole("combobox", { name: "Room", exact: true })
    .selectOption({ label: "Launch test lab" });
  await page.getByRole("button", { name: "Preview labels" }).click();
  await expect(page.locator(".sheet-label")).toHaveCount(27);
  await expect(page.locator(".label-sheet")).toHaveCount(2);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".label-sheet-page")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  const labels = await page
    .locator(".sheet-label")
    .evaluateAll((elements) =>
      elements.map((element) => ({ width: element.clientWidth, scroll: element.scrollWidth })),
    );
  expect(labels.every((label) => label.scroll <= label.width)).toBeTruthy();
  await page.screenshot({ path: "test-results/launch-labels.png", fullPage: true });
  const compact = await page.pdf({
    path: "test-results/labels-compact.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect((await PDFDocument.load(compact)).getPageCount()).toBe(2);
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("combobox", { name: "Label size" }).selectOption("large");
  await page.getByRole("button", { name: "Preview labels" }).click();
  await expect(page.locator(".label-sheet")).toHaveCount(4);
  await page.emulateMedia({ media: "print" });
  const large = await page.pdf({
    path: "test-results/labels-large.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect((await PDFDocument.load(large)).getPageCount()).toBe(4);
});

test("a reservation checks out only at pickup and the public return accepts phone formatting", async ({
  page,
}) => {
  await fillBorrow(page, 4, "TEST-PICKUP", true);
  await page.getByRole("button", { name: "Request reservation", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Your borrowing request was sent");
  await signIn(page);
  await page.goto("/dashboard/borrowing?q=TEST-PICKUP");
  await page.getByRole("button", { name: "Approve reservation" }).filter({ visible: true }).click();
  await expect(page.getByText("Reserved", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Check out equipment" }).filter({ visible: true }),
  ).toHaveCount(0);
  // Simulate a staff page left open while the scheduled pickup changes.
  await query(
    'UPDATE "BorrowRequest" SET "startsAt"=NOW()-INTERVAL \'1 minute\' WHERE "studentNumber"=$1',
    ["TEST-PICKUP"],
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Check out equipment" }).filter({ visible: true }),
  ).toBeVisible();
  await query(
    'UPDATE "BorrowRequest" SET "startsAt"=NOW()+INTERVAL \'1 day\' WHERE "studentNumber"=$1',
    ["TEST-PICKUP"],
  );
  await checkOutEquipment(page);
  await expect(page.getByRole("alert").filter({ hasText: "has not started yet" })).toBeVisible();
  await query(
    'UPDATE "BorrowRequest" SET "startsAt"=NOW()-INTERVAL \'1 minute\' WHERE "studentNumber"=$1',
    ["TEST-PICKUP"],
  );
  await page.reload();
  await checkOutEquipment(page);
  await expect(page.getByText("Borrowed", { exact: true }).filter({ visible: true })).toBeVisible();
  const item = (
    await query('SELECT id FROM "InventoryItem" WHERE "qrCode"=$1', ["ceit-launch-item-4"])
  ).rows[0];
  await page.goto(`/dashboard/inventory/${item.id}`);
  await page.locator("#edit-record > summary").click();
  await page
    .locator("#edit-record")
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("OK");
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "still borrowed" })).toBeVisible();
  await page.goto("/scan/ceit-launch-item-4?view=public");
  await page.getByRole("button", { name: /Return equipment/ }).click();
  await page.getByLabel("Student number").fill("TEST-PICKUP");
  await page.getByLabel("Contact number").fill("+63 912 345 6789");
  await page.getByRole("button", { name: "Request return", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("return request was sent");
  await page.goto("/dashboard/borrowing?q=TEST-PICKUP");
  await expect(
    page.getByText("Return pending", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm returned" }).filter({ visible: true }).click();
  await expect(page.getByText("Returned", { exact: true }).filter({ visible: true })).toBeVisible();
  expect(
    (await query('SELECT status,quantity FROM "InventoryItem" WHERE id=$1', [item.id])).rows[0],
  ).toEqual({ status: "OK", quantity: 1 });
});

test("simultaneous reservation requests cannot overbook an individual asset", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await fillBorrow(page, 5, "TEST-RACE-A", true);
  await fillBorrow(other, 5, "TEST-RACE-B", true);
  await Promise.all(
    [page, other].map(async (tab) => {
      await tab.getByRole("button", { name: "Request reservation", exact: true }).click();
      await expect(
        tab
          .locator('[role="status"]')
          .or(tab.getByRole("alert").filter({ hasText: /already requested|could not be saved/ }))
          .first(),
      ).toBeVisible();
    }),
  );
  expect(
    (
      await query(
        'SELECT COUNT(*)::int AS count FROM "BorrowRequest" WHERE "studentNumber" LIKE \'TEST-RACE-%\'',
      )
    ).rows[0].count,
  ).toBe(1);
  await other.close();
});

test("item creation, stale edits, and import preview keep records and inputs consistent", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/dashboard/inventory/new");
  await page.locator('input[name="name"]').fill("Launch test camera");
  await page
    .getByLabel("Category", { exact: false })
    .selectOption({ label: "Launch test equipment" });
  await page.locator('select[name="locationId"]').selectOption({ label: "Launch test lab" });
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page).toHaveURL(/\/dashboard\/inventory\/[a-f0-9-]{36}$/);
  const created = (
    await query('SELECT id,"assetTag" FROM "InventoryItem" WHERE name=$1', ["Launch test camera"])
  ).rows[0];
  expect(created.assetTag).toMatch(/^INV-TST-OK-01-\d{4}$/);
  await expect(page.locator('#edit-record input[name="updatedAt"]')).toBeAttached();
  await page.locator("#edit-record > summary").click();
  await query('UPDATE "InventoryItem" SET "updatedAt"=NOW(), name=$1 WHERE id=$2', [
    "Camera updated by another staff member",
    created.id,
  ]);
  await page.locator("#edit-record").getByLabel("Name", { exact: true }).fill("Stale camera edit");
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed since you opened it" }),
  ).toBeVisible();
  expect(
    (await query('SELECT name FROM "InventoryItem" WHERE id=$1', [created.id])).rows[0].name,
  ).toBe("Camera updated by another staff member");
  await page.goto("/dashboard/inventory/import");
  await page.getByLabel("CSV or Excel file").setInputFiles({
    name: "launch-test.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name,category,location,type,quantity,serial number\nImported launch camera,Launch test equipment,Launch test lab,asset,1,LAUNCH-SERIAL-1\n",
    ),
  });
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("1 row looks good", { exact: false })).toBeVisible();
  await expect(page.getByLabel("CSV or Excel file")).not.toHaveValue("");
  expect(
    (
      await query('SELECT COUNT(*)::int AS count FROM "InventoryItem" WHERE "serialNumber"=$1', [
        "LAUNCH-SERIAL-1",
      ])
    ).rows[0].count,
  ).toBe(0);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("1 row imported", { exact: false })).toBeVisible();
  expect(
    (
      await query('SELECT COUNT(*)::int AS count FROM "InventoryItem" WHERE "serialNumber"=$1', [
        "LAUNCH-SERIAL-1",
      ])
    ).rows[0].count,
  ).toBe(1);
});

test("every report downloads as CSV and PDF and can be generated on the page", async ({ page }) => {
  await signIn(page);
  const kinds = [
    "overview",
    "inventory",
    "pcs",
    "hardware",
    "software",
    "borrowing",
    "maintenance",
    "activity",
  ];
  for (const kind of kinds) {
    const csv = await download(page, `/dashboard/reports/export?kind=${kind}`);
    expect(csv.status(), kind).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const pdf = await download(page, `/dashboard/reports/export/pdf?kind=${kind}`);
    expect(pdf.status(), kind).toBe(200);
    expect((await PDFDocument.load(await pdf.body())).getPageCount()).toBeGreaterThan(0);
    writeFileSync(`test-results/${kind}.pdf`, await pdf.body());
  }
  const invalid = await download(
    page,
    "/dashboard/reports/export?kind=maintenance&maintenanceSource=invalid",
  );
  expect(invalid.status()).toBe(400);
  expect((await download(page, "/dashboard/reports/export/pdf?kind=nothing")).status()).toBe(400);
  expect(
    (await download(page, "/dashboard/reports/export?kind=inventory&category=not-an-id")).status(),
  ).toBe(400);

  // Pick a report, narrow it, generate it in the page, and download the same filters.
  await page.goto("/dashboard/reports");
  const form = page.getByRole("form", { name: "Report builder" });
  await expect(page.getByRole("article")).toHaveCount(0);
  await form.getByRole("radio", { name: "Inventory" }).check({ force: true });
  await form.locator('select[name="inventoryStatus"]').selectOption("OK");
  await form.getByRole("button", { name: "Generate report" }).click();
  await expect(page).toHaveURL(/kind=inventory/);
  const sheet = page.getByRole("article", { name: "Inventory report" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Status: OK", { exact: true })).toBeVisible();
  await expect(sheet.getByRole("table").first()).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
    "href",
    /export\/pdf\?.*inventoryStatus=OK/,
  );
  await expect(sheet.getByRole("link", { name: "Download CSV" })).toHaveAttribute(
    "href",
    /export\?.*kind=inventory/,
  );

  // A quick report opens already generated.
  await page.goto("/dashboard/reports");
  await page.getByRole("link", { name: /Licenses ending soon/ }).click();
  await expect(page.getByRole("article", { name: "Software report" })).toBeVisible();
});

test("faculty staff can use every page except account management", async ({ page }) => {
  await signIn(page, "launch.staff");
  await page.goto("/dashboard/users");
  await expect(page).toHaveURL(/\/dashboard$/);
  const navigation = page.getByRole("navigation", { name: "Dashboard navigation" });
  await expect(navigation.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Audit trail", exact: true })).toBeVisible();
  for (const path of [
    "/dashboard/inventory",
    "/dashboard/borrowing",
    "/dashboard/maintenance",
    "/dashboard/reports",
    "/dashboard/settings",
    "/dashboard/activity",
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /Something went wrong/i })).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Locations and categories" })).toBeVisible();
});

test("all main pages fit mobile and desktop without page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  for (const theme of ["dark", "light"]) {
    await page.evaluate((value) => localStorage.setItem("ceit-theme", value), theme);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        "/dashboard",
        "/dashboard/inventory",
        "/dashboard/borrowing",
        "/dashboard/maintenance",
        "/dashboard/reports",
        "/dashboard/settings",
        "/dashboard/users",
        "/dashboard/activity",
        "/dashboard/inventory/new",
        "/dashboard/inventory/import",
        "/scan",
      ]) {
        const response = await page.goto(path);
        expect(response?.status(), path).toBe(200);
        await expect(page.locator("main h1").first()).toBeVisible();
        await expect(page.locator(".loading-page")).toHaveCount(0);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(overflow, path).toBeFalsy();
      }
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: "Inventory dashboard" })).toBeVisible();
      await page.screenshot({
        path: `test-results/dashboard-${theme}-${width}.png`,
        fullPage: true,
      });
      if (width === 390) {
        await page.getByRole("button", { name: "Open navigation" }).click();
        await expect(page.getByRole("navigation", { name: "Dashboard navigation" })).toBeVisible();
        await page
          .getByRole("navigation", { name: "Dashboard navigation" })
          .getByRole("link", { name: "Inventory", exact: true })
          .click();
        await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Dashboard navigation" })).toBeHidden();
        await expect(page).toHaveURL(/\/dashboard\/inventory$/);
        await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
      }
    }
  }
  expect(errors).toEqual([]);
});

test("concurrent failed sign-ins are counted without losing the account lockout", async ({
  context,
}) => {
  const tabs = await Promise.all(Array.from({ length: 5 }, () => context.newPage()));
  try {
    await query(
      'UPDATE "User" SET "failedSignInCount"=0,"firstFailedSignInAt"=NULL,"lockedUntil"=NULL WHERE username=$1',
      ["launch.staff"],
    );
    await Promise.all(
      tabs.map(async (tab) => {
        await tab.goto("/auth/login");
        await tab.getByLabel("Email address or username").fill("launch.staff");
        await tab.getByLabel("Password", { exact: true }).fill("Incorrect-password9");
      }),
    );
    await Promise.all(
      tabs.map(async (tab) => {
        await tab.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(tab).toHaveURL(/error=(invalid-credentials|temporarily-locked)/);
      }),
    );
    const account = (
      await query(
        'SELECT "failedSignInCount","lockedUntil" IS NOT NULL AS locked FROM "User" WHERE username=$1',
        ["launch.staff"],
      )
    ).rows[0];
    expect(account.failedSignInCount).toBe(5);
    expect(account.locked).toBe(true);
  } finally {
    await query(
      'UPDATE "User" SET "failedSignInCount"=0,"firstFailedSignInAt"=NULL,"lockedUntil"=NULL WHERE username=$1',
      ["launch.staff"],
    );
    await Promise.all(tabs.map((tab) => tab.close()));
  }
});
