import { expect, test } from "@playwright/test";

test("login page is available without a database query", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("workspace font loads locally and sign-in remains usable when fonts fail", async ({
  page,
}) => {
  const fontResponses: { url: string; ok: boolean }[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "font") {
      fontResponses.push({ url: response.url(), ok: response.ok() });
    }
  });
  await page.goto("/auth/login");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  expect(fontResponses.length).toBeGreaterThan(0);
  for (const font of fontResponses) {
    expect(new URL(font.url).origin).toBe(new URL(page.url()).origin);
    expect(font.ok).toBe(true);
  }

  await page.route("**/*.woff2", (route) => route.abort());
  await page.setViewportSize({ width: 320, height: 640 });
  await page.reload();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.getByLabel("Email address or username")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await page.getByLabel("Email address or username").fill("font-fallback-check");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("login error state is rendered without leaking credentials", async ({ page }) => {
  await page.goto("/auth/login?error=invalid-credentials");
  await expect(
    page.getByText(/^The email address, username, or password is incorrect, or the account is/),
  ).toBeVisible();
});

test("sign-in shows one brand at desktop and mobile widths", async ({ page }) => {
  await page.goto("/auth/login");
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".login-page .brand-lockup:visible")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
});

test("unknown routes receive the application not-found page", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");
  await expect(
    page.getByRole("heading", { name: "That inventory record is not available" }),
  ).toBeVisible();
});

test("audit trail is not available without signing in", async ({ page }) => {
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

test("deployed global styles match the appearance controls and paper and ink themes", async ({
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
    expect(surfaces.background).toBe(mode === "Light" ? "rgb(242, 237, 225)" : "rgb(19, 17, 16)");
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

test.describe("display options", () => {
  async function openPanel(page: import("@playwright/test").Page) {
    await page.getByRole("button", { name: "Open appearance settings" }).click();
    return page.getByRole("dialog", { name: "Appearance", exact: true });
  }

  test("backgrounds, text size, corners, titles, contrast and motion apply and persist", async ({
    page,
  }) => {
    await page.goto("/auth/login");
    const html = page.locator("html");
    const panel = await openPanel(page);

    // The standard look carries no extra attributes.
    await expect(html).not.toHaveAttribute("data-tone", /.+/);
    await expect(html).not.toHaveAttribute("data-text", /.+/);

    await panel.getByRole("button", { name: "Dark", exact: true }).click();
    await panel.getByRole("button", { name: "Midnight" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(html).toHaveAttribute("data-tone", "midnight");
    const midnight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(midnight).toBe("rgb(13, 17, 23)");

    await panel.getByRole("button", { name: "Black" }).click();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      "rgb(0, 0, 0)",
    );

    await panel.getByText("More options").click();
    await panel.getByRole("button", { name: "Larger" }).click();
    await panel.getByRole("button", { name: "Round" }).click();
    await panel.getByRole("button", { name: "Sans" }).click();
    await panel.getByRole("button", { name: "High" }).click();
    await panel.getByRole("button", { name: "Reduced" }).click();
    await expect(html).toHaveAttribute("data-text", "larger");
    await expect(html).toHaveAttribute("data-corners", "round");
    await expect(html).toHaveAttribute("data-titles", "sans");
    await expect(html).toHaveAttribute("data-contrast", "high");
    await expect(html).toHaveAttribute("data-motion", "reduced");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(
      "20px",
    );
    // Titles now use the interface font, so the two font tokens resolve to the same thing.
    const [display, ui] = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return [
        style.getPropertyValue("--font-display").trim(),
        style.getPropertyValue("--font-ui").trim(),
      ];
    });
    expect(display.length).toBeGreaterThan(0);
    expect(display).toBe(ui);

    // Everything survives a reload, applied before the page shows.
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(html).toHaveAttribute("data-tone", "black");
    await expect(html).toHaveAttribute("data-text", "larger");
    await expect(html).toHaveAttribute("data-corners", "round");

    // One button returns to the standard look.
    const again = await openPanel(page);
    await again.getByRole("button", { name: "Reset appearance" }).click();
    await expect(html).toHaveAttribute("data-theme", "light");
    for (const name of [
      "data-tone",
      "data-text",
      "data-corners",
      "data-titles",
      "data-contrast",
      "data-motion",
    ]) {
      await expect(html).not.toHaveAttribute(name, /.+/);
    }
  });

  test("auto follows the device and each mode keeps its own background", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/auth/login");
    const html = page.locator("html");
    const panel = await openPanel(page);
    await panel.getByRole("button", { name: "Auto", exact: true }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(html).toHaveAttribute("data-mode", "auto");
    await panel.getByRole("button", { name: "Midnight" }).click();

    // The device changes to light: the page follows, with the light mode's own background.
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(html).not.toHaveAttribute("data-tone", /.+/);
    await expect(panel.getByRole("button", { name: "Paper" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveAttribute("data-tone", "midnight");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(html).toHaveAttribute("data-tone", "midnight");
  });

  test("the panel stays compact and inside a phone screen with every option open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/auth/login");
    const panel = await openPanel(page);
    const closed = await panel.boundingBox();
    expect(closed!.height).toBeLessThan(560);
    await panel.getByText("More options").click();
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(640);
    // Taller than the screen is fine because the panel scrolls, but nothing may spill sideways.
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
  });
});
