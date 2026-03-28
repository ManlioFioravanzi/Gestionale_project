import { expect, test } from "@playwright/test";

test("public tenant page exposes booking flow", async ({ page }) => {
  await page.goto("/studio-aurora");

  await expect(page.getByRole("heading", { name: "Studio Aurora" })).toBeVisible();
  await expect(page.getByLabel("Servizio")).toBeVisible();
  await expect(page.getByRole("button", { name: "Conferma e vai al checkout" })).toBeVisible();
});

test("can create a mock booking and return to success state", async ({ page }) => {
  await page.goto("/studio-aurora");

  await page.getByLabel("Nome e cognome").fill("Mario Test");
  await page.getByLabel("Email").fill("mario.test@example.com");
  await page.getByLabel("Telefono").fill("+39 320 000 0000");

  const firstSlot = page.locator(".slot-button").first();
  await expect(firstSlot).toBeVisible();
  await firstSlot.click();

  await page.getByRole("button", { name: "Conferma e vai al checkout" }).click();

  await expect(page).toHaveURL(/checkout=success/);
  await expect(page.getByText(/Caparra registrata con successo/)).toBeVisible();
});
