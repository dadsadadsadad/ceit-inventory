import { expect, test } from "@playwright/test";

test("login page is available without a database query", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("login error state is rendered without leaking credentials", async ({ page }) => {
  await page.goto("/auth/login?error=invalid-credentials");
  await expect(page.getByText("The email address, username, or password is incorrect.", { exact: true })).toBeVisible();
});

test("unknown routes receive the application not-found page", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");
  await expect(page.getByRole("heading", { name: "That inventory record is not available" })).toBeVisible();
});
