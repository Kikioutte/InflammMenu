import { expect, test, type Page } from "@playwright/test";

async function fresh(page: Page) {
  await page.goto("/");
  const onboarding = page.getByTestId("onboarding-view");
  await expect(onboarding.or(page.getByTestId("home-view"))).toBeVisible();
  if (await onboarding.isVisible()) await page.getByTestId("onboarding-skip").click();
}
async function nav(page: Page, name: string) {
  await page.getByTestId("flow-current").getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name, exact: true }).click();
}
async function recipe(page: Page) {
  await nav(page, "Recette");
  await page.getByLabel("Rechercher une recette", { exact: true }).fill("Cabillaud en papillote de chou et fenouil");
  await expect(page.locator(".catalogue-card")).toHaveCount(1);
  await page.locator(".catalogue-card").click();
}

test("typos and reordered words keep the selected food filters", async ({ page }) => {
  await fresh(page); await nav(page, "Recette");
  await page.getByLabel("Filtrer les associations").selectOption("verte");
  await page.getByLabel("Rechercher une recette", { exact: true }).fill("courgete");
  await expect(page.locator(".catalogue-card").first()).toBeVisible();
  await expect(page.locator(".catalogue-card").filter({ hasNotText: "Associations vertes" })).toHaveCount(0);
  await page.getByLabel("Filtrer les associations").selectOption("all");
  await page.getByLabel("Rechercher une recette", { exact: true }).fill("fenouil cabillaud");
  await expect(page.locator(".catalogue-card").filter({ hasText: "Cabillaud en papillote de chou et fenouil" })).toBeVisible();
  await page.getByLabel("Rechercher une recette", { exact: true }).fill("zzzzzzzzz");
  await expect(page.getByRole("heading", { name: "Aucune recette trouvée" })).toBeVisible();
});

test("standalone shopping adds, updates, exports and restores without creating a week", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await fresh(page); await nav(page, "Courses");
  await page.getByLabel("Ajouter un article", { exact: true }).fill("Papier cuisson");
  await page.getByRole("button", { name: "Ajouter l’article", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cocher Papier cuisson", exact: true })).toBeVisible();
  await recipe(page);
  await page.getByRole("button", { name: "Ajouter aux courses", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Courses mises à jour" })).toBeVisible();
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await nav(page, "Courses");
  await page.getByText("Recettes ajoutées aux courses · 1", { exact: true }).click();
  await page.getByLabel("Personnes pour les courses de Cabillaud en papillote de chou et fenouil").selectOption("4");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("inflamm-menu:app-state")!).shoppingRecipes[0].portions)).toBe(4);
  await page.reload(); await nav(page, "Courses");
  await expect(page.getByRole("button", { name: /Cocher.*cabillaud/i })).toBeVisible();
  const download = page.waitForEvent("download"); await page.getByTestId("download-list").click();
  const file = await download; expect(file.suggestedFilename()).toBe("liste-courses-libres.txt");
  const path = await file.path();
  const { readFile } = await import("node:fs/promises"); expect(await readFile(path!, "utf8")).toContain("Papier cuisson");
  await page.getByRole("button", { name: "Supprimer Papier cuisson", exact: true }).click();
  await page.getByRole("button", { name: "Annuler la suppression de l’article", exact: true }).click();
  await page.getByTestId("enter-store-mode").click();
  await expect(page.getByTestId("store-mode")).toBeVisible();
  await page.getByTestId("exit-store-mode").click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("inflamm-menu:app-state")!));
  expect(state.currentPlan).toBeNull(); expect(state.shoppingItems).toHaveLength(1); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath("courses-autonomes.png"), fullPage: true });
  await nav(page, "Accueil");
  await page.getByRole("button", { name: "Générer ma semaine", exact: true }).click();
  await page.getByRole("button", { name: "Créer ma semaine", exact: true }).click();
  await page.getByRole("button", { name: "Voir ma semaine", exact: true }).click();
  await nav(page, "Courses");
  await expect(page.getByRole("button", { name: "Cocher Papier cuisson", exact: true })).toBeVisible();
  const withWeek = await page.evaluate(() => JSON.parse(localStorage.getItem("inflamm-menu:app-state")!));
  expect(withWeek.currentPlan).not.toBeNull(); expect(withWeek.shoppingRecipes[0].portions).toBe(4);
});

test("collections keep recipes independently of favorites and support rename and undo", async ({ page }, info) => {
  await fresh(page); await recipe(page);
  await page.getByRole("button", { name: "Classer dans une collection", exact: true }).click();
  await page.getByLabel("Nom de la collection", { exact: true }).fill("À essayer");
  await page.getByRole("button", { name: "Enregistrer la collection", exact: true }).click();
  await page.reload(); await nav(page, "Recette");
  await page.getByText("Mes collections · 1", { exact: true }).click();
  await page.getByLabel("Choisir une collection", { exact: true }).selectOption({ label: "À essayer (1)" });
  await expect(page.locator(".collection-recipe-row")).toContainText("Cabillaud en papillote de chou et fenouil");
  await page.getByRole("button", { name: "Renommer la collection", exact: true }).click();
  await page.getByLabel("Nom de la collection", { exact: true }).fill("Mes soirées");
  await page.getByRole("button", { name: "Enregistrer la collection", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mes soirées", exact: true })).toBeVisible();
  await page.getByLabel("Rechercher dans cette collection", { exact: true }).fill("cabilllaud");
  await expect(page.locator(".collection-recipe-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Supprimer la collection", exact: true }).click();
  await page.getByRole("button", { name: "Annuler la suppression de la collection", exact: true }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("inflamm-menu:app-state")!));
  expect(state.favoriteRecipeIds).toEqual([]); expect(state.recipeCollections[0].name).toBe("Mes soirées");
  await page.screenshot({ path: info.outputPath("collections.png"), fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByLabel("Choisir une collection", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("collections-320.png"), fullPage: true });
});
