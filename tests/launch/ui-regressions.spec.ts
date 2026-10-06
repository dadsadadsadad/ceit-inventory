import { expect, test, type Page } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { contrastRatio, rgbToHex } from "../../src/lib/appearance";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

loadEnvFile(".env.e2e.local");
if (!/^ceit_test_launch_\d+$/.test(process.env.INVENTORY_DB_SCHEMA ?? "")) {
  throw new Error("UI regressions require the isolated launch-test schema.");
}

async function signIn(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email address or username").fill("launch.admin");
  await page.getByLabel("Password", { exact: true }).fill(process.env.CEIT_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Inventory dashboard", exact: true }),
  ).toBeVisible();
}

test("hover, press, and keyboard feedback remain distinct in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await signIn(page);
  for (const theme of ["Light", "Dark"]) {
    await page.getByRole("button", { name: "Open appearance settings" }).click();
    await page
      .getByRole("dialog", { name: "Appearance", exact: true })
      .getByRole("button", { name: theme, exact: true })
      .click();
    await page.keyboard.press("Escape");
    const browse = page.getByRole("link", { name: "Browse inventory" });
    await page.mouse.move(300, 0);
    const resting = await browse.evaluate((node) => getComputedStyle(node).backgroundColor);
    await browse.hover();
    await expect
      .poll(() => browse.evaluate((node) => getComputedStyle(node).backgroundColor))
      .not.toBe(resting);
    await expect
      .poll(() => browse.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m42))
      .toBeLessThan(0);
    await page.mouse.down();
    await expect
      .poll(() => browse.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m42))
      .toBeGreaterThan(0);
    // Release away from the link, then exercise a queue link with the keyboard.
    await page.mouse.move(300, 0);
    await page.mouse.up();
    const queue = page.locator(".queue-row").first();
    const rowBackground = await queue.evaluate((node) => getComputedStyle(node).backgroundColor);
    await queue.hover();
    await expect
      .poll(() => queue.evaluate((node) => getComputedStyle(node).backgroundColor))
      .not.toBe(rowBackground);
    await page.mouse.move(300, 0);
    await page.keyboard.press("Tab");
    await queue.focus();
    await expect(queue).toBeFocused();
    expect(await queue.evaluate((node) => node.matches(":focus-visible"))).toBe(true);
    expect(await queue.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dashboard\/borrowing\?status=REQUESTED$/);
    await expect(page.locator("main h1")).toBeVisible();
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Inventory dashboard", exact: true }),
    ).toBeVisible();
  }
});

test("reduced motion preserves feedback without moving controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  const browse = page.getByRole("link", { name: "Browse inventory" });
  const resting = await browse.evaluate((node) => getComputedStyle(node).backgroundColor);
  await browse.hover();
  expect(await browse.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(resting);
  expect(await browse.evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  await page.mouse.down();
  expect(await browse.evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  await page.mouse.move(300, 0);
  await page.mouse.up();
  await page.getByRole("link", { name: "Inventory", exact: true }).hover();
  expect(
    await page
      .getByRole("link", { name: "Inventory", exact: true })
      .evaluate((node) => getComputedStyle(node).transform),
  ).toBe("none");
  await page.locator(".queue-row").first().hover();
  expect(
    await page
      .locator(".queue-row > svg")
      .first()
      .evaluate((node) => getComputedStyle(node).transform),
  ).toBe("none");
});

test("saving a note gives visible pending feedback and prevents another submission", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  let releaseSave!: () => void;
  const heldRequest = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route("**/dashboard", async (route) => {
    if (route.request().method() === "POST") {
      await heldRequest;
    }
    await route.continue();
  });
  await page.getByLabel("Department note", { exact: true }).fill("Interaction review: note saved.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  try {
    const saving = page.getByRole("button", { name: "Saving note…", exact: true });
    await expect(saving).toBeVisible();
    await expect(saving).toBeDisabled();
    await expect(saving).toHaveAttribute("aria-busy", "true");
    await expect(saving.locator(".submit-spinner")).toBeVisible();
    expect(await saving.evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  } finally {
    releaseSave();
  }
  await expect(page.getByRole("button", { name: "Save note", exact: true })).toBeEnabled();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Inventory dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Department note", { exact: true })).toHaveValue(
    "Interaction review: note saved.",
  );
});

test("appearance controls receive pointer clicks above dashboard content", async ({ page }) => {
  await page.setViewportSize({ width: 1851, height: 985 });
  await signIn(page);
  await page.getByRole("button", { name: "Open appearance settings" }).click();
  const panel = page.getByRole("dialog", { name: "Appearance", exact: true });
  await expect(panel).toBeVisible();
  const light = panel.getByRole("button", { name: "Light", exact: true });
  const receivesClicks = await light.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    return button.contains(
      document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
    );
  });
  expect(receivesClicks, "Light button is covered by another element").toBe(true);
  await light.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("desktop sidebar stays with the viewport while the document scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/dashboard/inventory/new");
  await expect(page.locator("main h1")).toBeVisible();
  await page.mouse.move(1000, 600);
  await page.mouse.wheel(0, 800);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const sidebar = await page.locator(".dashboard-sidebar").boundingBox();
  expect(Math.abs(sidebar!.y)).toBeLessThan(1);
  expect(sidebar!.height).toBe(900);

  await page.setViewportSize({ width: 1280, height: 600 });
  const pageScroll = await page.evaluate(() => scrollY);
  await page.mouse.move(140, 300);
  await page.mouse.wheel(0, 1500);
  await expect
    .poll(() => page.locator(".dashboard-sidebar").evaluate((node) => node.scrollTop))
    .toBeGreaterThan(100);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
  await page.getByRole("button", { name: "Open appearance settings" }).click();
  const panel = page.getByRole("dialog", { name: "Appearance", exact: true });
  await panel.getByRole("button", { name: "Light", exact: true }).click();
  await panel.getByRole("button", { name: "Use Ocean" }).click();
  await page.screenshot({ path: "test-results/ui-short-screen-scrolled.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open appearance settings" })).toBeFocused();
});

test("dashboard supporting text is readable without browser zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const smallText = await page.locator(".dashboard-shell").evaluate((root) => {
    return [...root.querySelectorAll<HTMLElement>("*")]
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        const hasText = [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        return (
          hasText &&
          bounds.width > 1 &&
          bounds.height > 1 &&
          !element.closest('[aria-hidden="true"], .sr-only') &&
          parseFloat(getComputedStyle(element).fontSize) < 14
        );
      })
      .map(
        (element) =>
          `${element.textContent?.trim().slice(0, 70)}: ${getComputedStyle(element).fontSize}`,
      );
  });
  expect(smallText).toEqual([]);
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 700 });
    await expect(page.locator(".overview-metrics strong")).toHaveCount(4);
    // The four metrics sit in one row or two; the figures in a row must line up.
    const rows = await page.locator(".overview-metrics > div").evaluateAll((metrics) => {
      const byRow = new Map<number, number[]>();
      for (const metric of metrics) {
        const row = Math.round(metric.getBoundingClientRect().top);
        const figure = metric.querySelector("strong")!.getBoundingClientRect().top;
        byRow.set(row, [...(byRow.get(row) ?? []), figure]);
      }
      return [...byRow.values()];
    });
    for (const tops of rows) {
      expect(Math.max(...tops) - Math.min(...tops), `Metric alignment at ${width}px`).toBeLessThan(
        1,
      );
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const overlappingSymbols = await page.locator(".overview-metrics > div").evaluateAll(
      (metrics) =>
        metrics.filter((metric) => {
          const symbol = metric.querySelector(".metric-symbol")!;
          if (getComputedStyle(symbol).display === "none") {
            return false;
          }
          const icon = symbol.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(metric.querySelector("p")!);
          return [...range.getClientRects()].some(
            (text) =>
              text.left < icon.right &&
              text.right > icon.left &&
              text.top < icon.bottom &&
              text.bottom > icon.top,
          );
        }).length,
    );
    expect(overlappingSymbols, `Metric caption overlap at ${width}px`).toBe(0);
  }
  await page.screenshot({ path: "test-results/ui-dashboard-narrow.png", fullPage: true });
});

test("appearance on mobile supports keyboard controls and dismisses without closing navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await signIn(page);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Open appearance settings" });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: "Appearance", exact: true });
  await expect(panel.getByRole("button", { name: "Close appearance panel" })).toBeFocused();
  await panel.getByText("Custom color", { exact: true }).click();
  const hue = panel.getByRole("slider", { name: /^Hue/ });
  const before = await hue.inputValue();
  await hue.focus();
  await page.keyboard.press("ArrowRight");
  await expect(hue).not.toHaveValue(before);
  await panel.getByRole("button", { name: "Use Ocean" }).click();
  await expect(panel.getByRole("button", { name: "Use Ocean" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.screenshot({ path: "test-results/ui-mobile-appearance.png" });
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Dashboard navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeFocused();
});

test("both themes use neutral surfaces and accents visibly update controls, links, and selections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  for (const mode of ["Light", "Dark"]) {
    await page.getByRole("button", { name: "Open appearance settings" }).click();
    const panel = page.getByRole("dialog", { name: "Appearance", exact: true });
    await panel.getByRole("button", { name: mode, exact: true }).click();
    await panel.getByRole("button", { name: "Use CEIT orange default" }).click();
    const colors = () =>
      page.evaluate(() => {
        const css = (selector: string) => getComputedStyle(document.querySelector(selector)!);
        return {
          background: css("body").backgroundColor,
          sidebar: css(".dashboard-sidebar").backgroundColor,
          card: css(".work-queue").backgroundColor,
          button: css(".dashboard-header .primary-button").backgroundColor,
          link: css(".activity-ledger .accent-link").color,
          selection: css(".nav-link-active").boxShadow,
        };
      });
    const defaults = await colors();
    // The surfaces are warm paper and ink: dark enough in Dark mode, light enough in Light mode,
    // and never tinted by the accent color (checked again after the accent changes below).
    for (const surface of [defaults.background, defaults.sidebar, defaults.card]) {
      const channels = surface.match(/[\d.]+/g)!.map(Number);
      const spread = Math.max(...channels.slice(0, 3)) - Math.min(...channels.slice(0, 3));
      expect(spread).toBeLessThan(24);
      if (mode === "Dark") {
        expect(channels[0]).toBeLessThan(60);
      } else {
        expect(channels[0]).toBeGreaterThan(230);
      }
    }
    await panel.getByRole("button", { name: "Use Ocean" }).click();
    const custom = await colors();
    expect(custom.button).not.toBe(defaults.button);
    expect(custom.link).not.toBe(defaults.link);
    expect(custom.selection).not.toBe(defaults.selection);
    expect(custom.background).toBe(defaults.background);
    expect(custom.sidebar).toBe(defaults.sidebar);
    await page.screenshot({ path: `test-results/ui-appearance-${mode.toLowerCase()}.png` });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", mode.toLowerCase());
    await expect(page.locator(".work-queue")).toBeVisible();
    expect(await colors()).toEqual(custom);
    await page.screenshot({ path: `test-results/ui-dashboard-${mode.toLowerCase()}.png` });
  }
  await page.getByRole("button", { name: "Open appearance settings" }).click();
  await page.getByText("Custom color", { exact: true }).click();
  await page.getByLabel("Hex color").fill("123456");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "custom");
  await page.getByRole("button", { name: "Use CEIT orange default" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "orange");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open appearance settings" }).click();
  await page.locator("h1").click();
  await expect(page.getByRole("dialog", { name: "Appearance", exact: true })).toHaveCount(0);
});

test("inventory tools remain clickable above filters on desktop and mobile", async ({ page }) => {
  await signIn(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard/inventory");
    await page.locator("summary").filter({ hasText: "Inventory tools" }).click();
    await page.getByRole("link", { name: "Import file", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/inventory\/import$/);
    await expect(page.locator("h1")).toBeVisible();
  }
});

test("login branding stays readable in both modes and with custom accents", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/auth/login");
  for (const mode of ["Light", "Dark"]) {
    await page.getByRole("button", { name: "Open appearance settings" }).click();
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page.getByRole("button", { name: "Use Ocean" }).click();
    await page.keyboard.press("Escape");
    const samples = await page.locator(".login-panel").evaluate((panel) => {
      return [...panel.querySelectorAll<HTMLElement>("h2, .text-xs, .text-base")].map((text) => ({
        color: getComputedStyle(text).color,
        background: getComputedStyle(panel).backgroundColor,
      }));
    });
    for (const { color, background } of samples) {
      const hex = (rgb: string) => {
        const [red, green, blue] = rgb.match(/[\d.]+/g)!.map(Number);
        return rgbToHex({ red, green, blue });
      };
      expect(contrastRatio(hex(color), hex(background))).toBeGreaterThanOrEqual(4.5);
    }
    await page.screenshot({
      path: `test-results/ui-login-${mode.toLowerCase()}.png`,
      fullPage: true,
    });
  }
});
