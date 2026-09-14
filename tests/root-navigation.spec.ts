import { expect, test } from "@playwright/test";

test("chaque onglet repart en haut sans interrompre les actions du même écran @webkit-smoke", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("onboarding-view").or(page.getByTestId("home-view"))).toBeVisible();
  if (await page.getByTestId("onboarding-view").isVisible()) await page.getByTestId("onboarding-skip").click();
  const current = page.getByTestId("flow-current");
  const scroll = current.locator(".app-shell > .mobile-page > .mobile-scroll");
  const nav = (name: string) => current.getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name, exact: true }).click();
  const scrollDown = async () => {
    await scroll.evaluate((element) => { element.scrollTop = 300; });
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  };
  await page.getByRole("button", { name: "Générer ma semaine", exact: true }).click();
  await page.getByRole("button", { name: "Créer ma semaine", exact: true }).click();
  await page.getByRole("button", { name: "Voir ma semaine", exact: true }).click();
  await expect(page.getByTestId("week-view")).toBeVisible();

  for (const name of ["Recette", "Courses", "Accueil", "Semaine"]) {
    await scrollDown();
    await nav(name);
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
    if (name === "Recette") await expect(page.locator(".catalogue-card").first()).toBeVisible();
  }

  await nav("Courses");
  await scrollDown();
  // Checking an item updates the store but must not remount the current tab.
  const item = current.getByRole("button", { name: /^Cocher / }).first();
  await item.scrollIntoViewIfNeeded();
  const container = await scroll.elementHandle();
  await item.click();
  expect(await container!.evaluate((element) => element.isConnected)).toBe(true);
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);

  await nav("Recette");
  await page.getByLabel("Rechercher une recette", { exact: true }).fill("Cabillaud en papillote de chou et fenouil");
  await expect(page.locator(".catalogue-card")).toHaveCount(1);
  await page.locator(".catalogue-card").click();
  await current.getByTestId("compose-meal").click();
  await expect(current.getByTestId("meal-builder-view")).toBeVisible();
  await nav("Courses");
  await expect(page.getByTestId("courses-view")).toBeVisible();
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
});
