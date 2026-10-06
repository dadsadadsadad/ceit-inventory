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

async function signIn(page: Page, username = "launch.admin") {
  await page.goto("/auth/login");
  await page.getByLabel("Email address or username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(process.env.CEIT_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function itemId(qrCode: string) {
  return (await query('SELECT id FROM "InventoryItem" WHERE "qrCode"=$1', [qrCode])).rows[0]
    .id as string;
}

// Chromium accepts secure cookies on loopback HTTP; the request client does not, so send it by hand.
async function authed(page: Page, path: string) {
  return page.request.get(path, {
    headers: {
      Cookie: (await page.context().cookies())
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; "),
    },
  });
}

const hours = (value: number) => manilaDateTimeInput(new Date(Date.now() + value * 3_600_000));

test.beforeAll(async () => {
  await query(
    'DELETE FROM "InventoryAudit"; DELETE FROM "BorrowRequest"; DELETE FROM "MaintenanceTicket"; DELETE FROM "PublicRequestAttempt"; DELETE FROM "CalendarEvent"; DELETE FROM "InventoryItem" WHERE "qrCode" NOT LIKE \'ceit-launch-item-%\'; UPDATE "InventoryItem" SET status=\'OK\', quantity=1; UPDATE "User" SET "lockedUntil"=NULL, "failedSignInCount"=0, "firstFailedSignInAt"=NULL;',
  );
});
test.beforeEach(async () => {
  await query('DELETE FROM "PublicRequestAttempt"');
});

test.describe("borrowing rules cannot be bypassed", () => {
  test("a hand-made request cannot borrow equipment that is still out", async ({ page }) => {
    const id = await itemId("ceit-launch-item-11");
    await query("UPDATE \"InventoryItem\" SET status='DEPLOYED' WHERE id=$1", [id]);
    await query(
      `INSERT INTO "BorrowRequest" (id,"inventoryItemId","borrowerName","studentNumber",contact,purpose,"requestedQuantity","expectedReturnDate","startsAt",status,"checkedOutItemStatus","personalDataExpiresAt","updatedAt")
       VALUES ($1,$2,'Current Borrower','SEC-OUT-1','09170000001','Class',1,NOW() + INTERVAL '5 hours',NOW() - INTERVAL '2 hours','BORROWED','OK',NOW() + INTERVAL '30 days',NOW())`,
      [randomUUID(), id],
    );
    await page.goto("/scan/ceit-launch-item-11");
    await page.getByRole("button", { name: /Reserve for later/ }).click();
    await expect(page.getByLabel("Borrow now (in use)")).toBeDisabled();
    await page.getByLabel("Return date and time").fill(hours(2));
    await page.getByLabel("Full name").fill("Hand Made");
    await page.getByLabel("Student number").fill("SEC-CRAFT-1");
    await page.getByLabel("Contact number").fill("09123456789");
    await page.getByLabel("Purpose", { exact: false }).fill("Trying to borrow it right now");
    // Switch the form to "borrow now" by hand, as a script or a curious student could.
    await page.evaluate(() => {
      const now = document.querySelector<HTMLInputElement>(
        'input[name="borrowWhen"][value="now"]',
      )!;
      now.disabled = false;
      now.checked = true;
    });
    // The browser's own limits on the dates would stop the form first; the server must not need them.
    await page.locator("form.request-form").evaluate((form) => form.setAttribute("novalidate", ""));
    await page.getByRole("button", { name: /Request reservation|Send borrowing request/ }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /already requested or reserved/ }),
    ).toBeVisible();
    expect(
      (
        await query(
          `SELECT COUNT(*)::int AS count FROM "BorrowRequest" WHERE "studentNumber"='SEC-CRAFT-1'`,
        )
      ).rows[0].count,
    ).toBe(0);
  });

  test("equipment that is only reserved cannot be returned before it is picked up", async ({
    page,
  }) => {
    const id = await itemId("ceit-launch-item-12");
    await query(
      `INSERT INTO "BorrowRequest" (id,"inventoryItemId","borrowerName","studentNumber",contact,purpose,"requestedQuantity","expectedReturnDate","startsAt","isReservation",status,"personalDataExpiresAt","updatedAt")
       VALUES ($1,$2,'Early Returner','SEC-EARLY-1','09170000002','Class',1,NOW() + INTERVAL '30 hours',NOW() + INTERVAL '24 hours',true,'RESERVED',NOW() + INTERVAL '30 days',NOW())`,
      [randomUUID(), id],
    );
    await page.goto("/scan/ceit-launch-item-12");
    await page.getByRole("button", { name: /Return equipment/ }).click();
    await page.getByLabel("Student number").fill("SEC-EARLY-1");
    await page.getByLabel("Contact number").fill("09170000002");
    await page.getByRole("button", { name: "Request return", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /No active borrowing record matches/ }),
    ).toBeVisible();
    expect(
      (await query('SELECT status FROM "BorrowRequest" WHERE "studentNumber"=\'SEC-EARLY-1\''))
        .rows[0].status,
    ).toBe("RESERVED");
  });

  test("a return time before the pickup time is refused", async ({ page }) => {
    await page.goto("/scan/ceit-launch-item-13");
    await page.getByRole("button", { name: /Borrow equipment/ }).click();
    await page.getByLabel("Reserve for later").check();
    await page.getByLabel("Pickup date and time").fill(hours(24));
    await page.getByLabel("Return date and time").fill(hours(23));
    await page.getByLabel("Full name").fill("Backwards Dates");
    await page.getByLabel("Student number").fill("SEC-BACK-1");
    await page.getByLabel("Contact number").fill("09123456789");
    await page.getByLabel("Purpose", { exact: false }).fill("Return before pickup");
    // The browser's own limits would stop this, so skip them and let the server decide.
    await page.locator("form.request-form").evaluate((form) => form.setAttribute("novalidate", ""));
    await page.getByRole("button", { name: "Request reservation", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /Return time must be after pickup time/ }),
    ).toBeVisible();
  });

  test("the public forms refuse a submission without their signed note", async ({ page }) => {
    await page.goto("/scan/ceit-launch-item-14");
    await page.getByRole("button", { name: /Report a problem/ }).click();
    await page.getByLabel("Your name").fill("No Note");
    await page.getByLabel("Issue title").fill("Sent without a token");
    await page.getByLabel("What happened").fill("This was sent by a script that skipped the form.");
    await page.evaluate(() => document.querySelector('input[name="formToken"]')!.remove());
    await page.getByRole("button", { name: "Send issue report" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /could not be verified/ }),
    ).toBeVisible();
    expect(
      (
        await query(
          `SELECT COUNT(*)::int AS count FROM "MaintenanceTicket" WHERE title='Sent without a token'`,
        )
      ).rows[0].count,
    ).toBe(0);
  });
});

test.describe("hostile input is only ever data", () => {
  const payloads = [
    "' OR 1=1 --",
    '"; DROP TABLE "InventoryItem"; --',
    "%",
    "_",
    "\\",
    "%00",
    "a%00b",
    "<script>window.__xss=1</script>",
    "😀".repeat(40),
    "x".repeat(300),
  ];

  test("odd search text never breaks a page or the database", async ({ page }) => {
    await signIn(page);
    const pages = [
      "/dashboard/inventory?q=",
      "/dashboard/inventory/hardware?q=",
      "/dashboard/inventory/software?q=",
      "/dashboard/borrowing?q=",
      "/dashboard/maintenance?q=",
      "/dashboard/activity?q=",
      "/dashboard/users?q=",
      "/dashboard/reports?kind=inventory&generate=1&q=",
    ];
    for (const path of pages) {
      for (const payload of payloads) {
        const response = await page.goto(
          `${path}${payload.includes("%00") ? payload : encodeURIComponent(payload)}`,
        );
        expect(response?.status(), `${path} with ${JSON.stringify(payload)}`).toBeLessThan(500);
        await expect(page.locator("h1").first()).toBeVisible();
        // A null byte used to make the page's database query fail and show an error notice.
        if (payload.includes("%00")) {
          await expect(page.locator('main [role="alert"]'), `${path} with ${payload}`).toHaveCount(
            0,
          );
        }
      }
    }
    expect(
      await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
    ).toBeUndefined();
    // Nothing was dropped.
    expect(
      (await query('SELECT COUNT(*)::int AS count FROM "InventoryItem"')).rows[0].count,
    ).toBeGreaterThan(20);
  });

  test("names and notes are shown as text, never run", async ({ page }) => {
    const source = (await query('SELECT "categoryId","locationId" FROM "InventoryItem" LIMIT 1'))
      .rows[0];
    const name = `<img src=x onerror="window.__xss=1"> Evil <b>bold</b>`;
    await query(
      `INSERT INTO "InventoryItem" (id,name,"assetTag","qrCode","categoryId","locationId",notes,"updatedAt")
       VALUES ($1,$2,'INV-TST-OK-01-9001','ceit-xss-item-01',$3,$4,$5,NOW())`,
      [randomUUID(), name, source.categoryId, source.locationId, "<script>window.__xss=2</script>"],
    );
    await page.goto("/scan/ceit-xss-item-01");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await signIn(page);
    await page.goto("/dashboard/inventory?q=Evil");
    await expect(
      page.getByText("Evil", { exact: false }).filter({ visible: true }).first(),
    ).toBeVisible();
    await page.goto(`/dashboard/inventory/${await itemId("ceit-xss-item-01")}`);
    await expect(
      page.locator("main p", { hasText: "<script>window.__xss=2</script>" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
    ).toBeUndefined();
    await expect(page.locator("main img[src='x']")).toHaveCount(0);
  });
});

test.describe("access is checked everywhere", () => {
  test("signed-out visitors are turned away from staff data", async ({ request }) => {
    expect((await request.get("/api/calendar?month=2026-10")).status()).toBe(401);
    expect((await request.get("/api/live?scope=dashboard")).status()).toBe(401);
    const id = randomUUID();
    for (const path of [
      "/dashboard",
      "/dashboard/inventory",
      "/dashboard/reports/export?kind=inventory",
      "/dashboard/reports/export/pdf?kind=inventory",
      `/dashboard/inventory/${id}/photos/${id}`,
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      expect(response.headers().location, path).toContain("/auth/login");
    }
  });

  test("security headers are on every page", async ({ request }) => {
    for (const path of ["/auth/login", "/scan/ceit-launch-item-1"]) {
      const headers = (await request.get(path)).headers();
      expect(headers["content-security-policy"], path).toContain("object-src 'none'");
      expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
      expect(headers["strict-transport-security"]).toContain("max-age=");
      expect(headers["x-powered-by"]).toBeUndefined();
    }
  });

  test("the calendar feed only answers for real months", async ({ page }) => {
    await signIn(page);
    for (const bad of [
      "",
      "2026-13",
      "2026-00",
      "26-10",
      "2026-10'--",
      "../../etc",
      "1999-01",
      "9999-12",
    ]) {
      const response = await authed(page, `/api/calendar?month=${encodeURIComponent(bad)}`);
      expect(response.status(), JSON.stringify(bad)).toBe(400);
    }
    const good = await authed(page, "/api/calendar?month=2026-10");
    expect(good.status()).toBe(200);
    expect(good.headers()["cache-control"]).toContain("no-store");
    expect(Array.isArray((await good.json()).entries)).toBe(true);
  });

  test("sign-in gives the same answer for a wrong password, a locked account, and no account", async ({
    page,
  }) => {
    const failed = async (identifier: string) => {
      await page.goto("/auth/login");
      await page.getByLabel("Email address or username").fill(identifier);
      await page.getByLabel("Password", { exact: true }).fill("Wrong-password9");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/auth\/login\?error=/);
      return new URL(page.url()).searchParams.get("error");
    };
    const unknown = await failed("nobody.at.all");
    const wrong = await failed("launch.staff");
    await query(
      `UPDATE "User" SET "lockedUntil"=NOW() + INTERVAL '10 minutes', "failedSignInCount"=5 WHERE username='launch.staff'`,
    );
    const locked = await failed("launch.staff");
    expect([unknown, wrong, locked]).toEqual([
      "invalid-credentials",
      "invalid-credentials",
      "invalid-credentials",
    ]);
    await query(
      `UPDATE "User" SET "lockedUntil"=NULL, "failedSignInCount"=0, "firstFailedSignInAt"=NULL WHERE username='launch.staff'`,
    );
    // A query-shaped username is just a username that does not exist.
    expect(await failed("' OR '1'='1")).toBe("invalid-credentials");
    expect(await failed("admin'--@example.com")).toBe("invalid-credentials");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe("the dashboard calendar", () => {
  test("shows loans, takes events, and treats their text as text", async ({ page }) => {
    // A loan due back later today (Manila) lands on today's cell.
    const id = await itemId("ceit-launch-item-15");
    await query("UPDATE \"InventoryItem\" SET status='DEPLOYED' WHERE id=$1", [id]);
    await query(
      `INSERT INTO "BorrowRequest" (id,"inventoryItemId","borrowerName","studentNumber",contact,purpose,"requestedQuantity","expectedReturnDate","startsAt",status,"checkedOutItemStatus","personalDataExpiresAt","updatedAt")
       VALUES ($1,$2,'Calendar Borrower','SEC-CAL-1','09170000003','Class',1,NOW() + INTERVAL '10 minutes',NOW() - INTERVAL '1 hour','BORROWED','OK',NOW() + INTERVAL '30 days',NOW())`,
      [randomUUID(), id],
    );
    await signIn(page);
    const calendar = page.getByRole("region", { name: "Calendar" });
    await expect(calendar).toBeVisible();
    await expect(calendar.getByText("Calendar Borrower", { exact: false })).toBeVisible();

    const title = `Lab check <b>now</b> ${Date.now()}`;
    await calendar.getByLabel(/New event for/).fill(title);
    await calendar.getByRole("button", { name: /^Add to / }).click();
    await expect(calendar.getByText(title, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.querySelectorAll(".dashboard-calendar b").length),
    ).toBe(0);

    // It is saved for everyone, and can be removed again.
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Calendar" }).getByText(title, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("region", { name: "Calendar" })
      .getByRole("button", { name: /^Remove the event / })
      .first()
      .click();
    await expect(
      page.getByRole("region", { name: "Calendar" }).getByText(title, { exact: true }),
    ).toHaveCount(0);

    // Next month opens without leaving the page, and the notepad sits beneath the calendar.
    await calendar.getByRole("button", { name: "Next month" }).click();
    await expect(calendar.getByText(/loading/)).toHaveCount(0);
    const boxes = await page.evaluate(() => {
      const top = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect().top;
      return { calendar: top(".dashboard-calendar"), note: top(".dashboard-note-card") };
    });
    expect(boxes.calendar).toBeLessThan(boxes.note);
  });
});

test.describe("guessing passwords is slowed down", () => {
  test("a device that keeps failing is turned away, even with the right password", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await query('DELETE FROM "PublicRequestAttempt"');
    const attempt = async (identifier: string, password: string) => {
      await page.goto("/auth/login");
      await page.getByLabel("Email address or username").fill(identifier);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/auth\/login\?error=|\/dashboard$/);
      return new URL(page.url()).searchParams.get("error");
    };
    // Many different usernames, each guessed once: the accounts never lock, but the device does.
    for (let guess = 1; guess <= 30; guess += 1) {
      expect(await attempt(`guess.${guess}`, "Not-the-password9")).toBe("invalid-credentials");
    }
    expect(await attempt("launch.admin", process.env.CEIT_TEST_PASSWORD!)).toBe(
      "too-many-attempts",
    );
    await expect(page.getByText(/Too many failed sign-in attempts/)).toBeVisible();
    // After the window it works again; here the counter is cleared to the same effect.
    await query('DELETE FROM "PublicRequestAttempt"');
    expect(await attempt("launch.admin", process.env.CEIT_TEST_PASSWORD!)).toBeNull();
  });
});
