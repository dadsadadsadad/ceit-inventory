import { expect, test } from "@playwright/test";

test("login page is available without a database query", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("login error state is rendered without leaking credentials", async ({ page }) => {
  await page.goto("/auth/login?error=invalid-credentials");
  await expect(
    page.getByText("The email address, username, or password is incorrect.", { exact: true }),
  ).toBeVisible();
});

test("unknown routes receive the application not-found page", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");
  await expect(
    page.getByRole("heading", { name: "That inventory record is not available" }),
  ).toBeVisible();
});

test("audit trail is not available without an authenticated administrator", async ({ page }) => {
  await page.goto("/dashboard/activity");
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("appearance choices persist after a reload", async ({ page }) => {
  await page.goto("/auth/login");

  await page.getByRole("button", { name: "Open appearance settings" }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Use Ocean" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "custom");
  await expect(page.getByRole("button", { name: "Use Ocean" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "custom");
});

test("appearance popover stays within a compact viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/auth/login");
  await page.getByRole("button", { name: "Open appearance settings" }).click();

  const layout = await page.getByRole("dialog", { name: "Appearance" }).evaluate((popover) => {
    const picker = popover.querySelector<HTMLElement>(".appearance-color-picker");
    const bounds = popover.getBoundingClientRect();

    return {
      bottom: bounds.bottom,
      left: bounds.left,
      right: bounds.right,
      scrollWidth: popover.scrollWidth,
      top: bounds.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      pickerScrollWidth: picker?.scrollWidth ?? 0,
      pickerWidth: picker?.getBoundingClientRect().width ?? 0,
    };
  });

  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.top).toBeGreaterThanOrEqual(0);
  expect(layout.bottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.scrollWidth).toBeLessThanOrEqual(Math.ceil(layout.right - layout.left));
  expect(layout.pickerScrollWidth).toBeLessThanOrEqual(Math.ceil(layout.pickerWidth));
});

test("deployed global styles match the appearance controls and neutral themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/auth/login");
  await page.getByRole("button", { name: "Open appearance settings" }).click();
  const panel = page.getByRole("dialog", { name: "Appearance", exact: true });
  await expect(panel).toBeVisible();
  const layout = await panel.evaluate((element) => {
    const button = element.querySelector<HTMLButtonElement>(".appearance-mode-button")!;
    const bounds = button.getBoundingClientRect();
    return {
      position: getComputedStyle(element).position,
      buttonHeight: bounds.height,
      receivesClicks: button.contains(
        document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
      ),
      bodyOverflow: getComputedStyle(document.body).overflowX,
    };
  });
  expect(layout.position).toBe("fixed");
  expect(layout.buttonHeight).toBeGreaterThanOrEqual(44);
  expect(layout.receivesClicks).toBe(true);
  expect(layout.bodyOverflow).toBe("clip");
  for (const mode of ["Light", "Dark"]) {
    await panel.getByRole("button", { name: mode, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", mode.toLowerCase());
    const surfaces = await page.evaluate(() => {
      const background = getComputedStyle(document.body).backgroundColor;
      const label = getComputedStyle(document.querySelector(".login-panel .text-xs")!);
      return { background, captionSize: parseFloat(label.fontSize) };
    });
    expect(surfaces.background).toBe(mode === "Light" ? "rgb(245, 245, 245)" : "rgb(21, 21, 21)");
    expect(surfaces.captionSize).toBeGreaterThanOrEqual(14);
  }
  await panel.getByRole("button", { name: "Close appearance panel" }).click();
  await expect(panel).toHaveCount(0);
});

test("public buttons distinguish hovering from pressing and respect reduced motion", async ({
  page,
}) => {
  await page.goto("/auth/login");
  const button = page.getByRole("button", { name: "Sign in", exact: true });
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    await button.hover();
    const offset = () =>
      button.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m42);
    await expect.poll(offset).toBe(reducedMotion === "reduce" ? 0 : -1);
    await page.mouse.down();
    await expect.poll(offset).toBe(reducedMotion === "reduce" ? 0 : 1);
    // End the press away from the control so this never submits credentials.
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
  await expect(page).toHaveURL(/\/auth\/login$/);
});
