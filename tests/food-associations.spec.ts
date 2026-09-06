import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const greenIds = new Set(JSON.parse(readFileSync(new URL("../research/association-collection.json", import.meta.url), "utf8")).filter((r: any) => r.associations.niveau === "verte").map((r: any) => `catalog-${r.id}`));

async function fresh(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("onboarding-view").or(page.getByTestId("home-view"))).toBeVisible();
  if (await page.getByTestId("onboarding-view").isVisible()) await page.getByTestId("onboarding-skip").click();
  await expect(page.getByTestId("home-view")).toBeVisible();
}
async function library(page: Page) {
  await page.getByRole("button", { name: "Recette", exact: true }).click();
  await page.getByRole("tab", { name: "Catalogue", exact: true }).click();
  await expect(page.getByLabel("Filtrer les associations")).toBeVisible();
}

test("collection, orange pairs, scaled portions and complete meal", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await fresh(page); await library(page);
  const filter = page.getByLabel("Filtrer les associations");
  await filter.selectOption("collection");
  await expect(page.locator(".catalogue-count")).toHaveText("457 résultats");
  await filter.selectOption("verte");
  await expect(page.locator(".catalogue-count")).toHaveText("300 résultats");
  await filter.selectOption("orange");
  await expect(page.locator(".catalogue-count")).toHaveText("157 résultats");
  await page.getByLabel("Rechercher une recette", { exact: true }).fill("Riz complet aux dés de fenouil");
  await expect(page.locator(".catalogue-card")).toHaveCount(1);
  await page.locator(".catalogue-card").click();
  await expect(page.getByTestId("association-notice")).toContainText("Associations orange");
  await expect(page.getByTestId("association-notice").locator("li").first()).toContainText("+");
  await page.getByRole("button", { name: "Ajouter une portion", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter une portion", exact: true }).click();
  await expect(page.locator(".catalogue-detail .ingredient-list")).toContainText("280 g");
  await expect(page.locator(".catalogue-detail .steps")).toContainText("700 ml");
  await page.screenshot({ path: info.outputPath("recette-orange.png"), fullPage: true });
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await page.getByTestId("meal-association-checker").locator("summary").first().click();
  await page.getByLabel("Recette 1 du repas").selectOption("r631");
  await page.getByLabel("Recette 2 du repas").selectOption("r711");
  await expect(page.getByTestId("meal-association-checker").getByTestId("association-notice")).toContainText("Association à exclure");
  await filter.selectOption("verte");
  await page.getByLabel("Rechercher une recette", { exact: true }).fill("Papillotes : poulet, brocoli, poivron");
  await expect(page.locator(".catalogue-card")).toHaveCount(1);
  await page.locator(".catalogue-card").click();
  await expect(page.locator(".catalogue-detail .association-notice")).toContainText("Associations vertes");
  await expect(page.locator(".catalogue-detail .association-notice li")).toHaveCount(0);
  await page.getByRole("button", { name: "Ajouter une portion", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter une portion", exact: true }).click();
  await expect(page.locator(".catalogue-detail .ingredient-list")).toContainText("760 g");
  await page.locator(".catalogue-detail .association-notice").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("nouvelle-recette-verte.png"), fullPage: true });
  const sizes = await page.locator("body").evaluate(el => [el.clientWidth, el.scrollWidth]);
  expect(sizes[1]).toBeLessThanOrEqual(sizes[0] + 1);
  expect(errors).toEqual([]);
});

test("saved association profile governs generation and shopping", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await page.getByLabel("Règles d’association du générateur").selectOption("green");
  await page.getByLabel("Temps actif maximum en cuisine (min)", { exact: true }).fill("45");
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await page.reload();
  await expect(page.getByTestId("home-view")).toBeVisible();
  await page.getByRole("button", { name: "Générer ma semaine" }).click();
  await page.getByRole("button", { name: "Créer ma semaine" }).click();
  await page.getByRole("button", { name: "Voir ma semaine" }).click();
  await expect(page.getByTestId("week-view")).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("inflamm-menu:app-state")!));
  expect(stored.profile.associationMode).toBe("green");
  expect(stored.currentPlan.meals).toHaveLength(14);
  for (const meal of stored.currentPlan.meals) expect(greenIds.has(meal.recipeId)).toBe(true);
  await page.locator(".meal-card__main").first().click();
  await expect(page.getByTestId("association-notice")).toBeVisible();
  await page.getByRole("button", { name: "Ajouter une portion", exact: true }).click();
  await expect(page.getByTestId("recipe-portions")).toHaveText("3");
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await page.getByRole("button", { name: "Courses", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Liste de courses", exact: true })).toBeVisible();
});
