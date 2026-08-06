import { expect, test, type Locator, type Page } from "@playwright/test";

async function openFreshApp(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("home-view")).toBeVisible();
}

async function expectNoHorizontalOverflow(locator: Locator) {
  const overflow = await locator.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function generateWeek(page: Page) {
  await page.getByRole("button", { name: "Générer ma semaine" }).click();
  await expect(page.getByRole("heading", { name: "Prête en quelques secondes" })).toBeVisible();
  await page.getByRole("button", { name: "Créer ma semaine" }).click();
  await expect(page.getByRole("heading", { name: "Votre semaine est prête" })).toBeVisible();
  await page.getByRole("button", { name: "Voir ma semaine" }).click();
  await expect(page.getByTestId("week-view")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openFreshApp(page);
});

test("l’accueil expose les repères et actions principales avec des noms accessibles", async ({ page }) => {
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /Une semaine/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Générer ma semaine" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ajuster mon profil" })).toBeVisible();

  for (const name of ["Accueil", "Semaine", "Courses", "Favoris"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }

  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("le profil est modifiable et conserve ses libellés accessibles", async ({ page }) => {
  await page.getByRole("button", { name: "Ajuster mon profil" }).click();
  await expect(page.getByRole("heading", { name: "Mon profil alimentaire" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retour" })).toBeVisible();

  const budget = page.getByLabel("Budget hebdomadaire (€)");
  const prepTime = page.getByLabel("Temps maximum en cuisine (min)");
  const allergies = page.getByLabel("Autre allergie ou ingrédient à exclure");
  const excluded = page.getByLabel("Aliments refusés");

  await expect(budget).toHaveValue("80");
  await expect(prepTime).toHaveValue("30");
  await expect(page.getByRole("button", { name: "Gluten", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(allergies).toHaveAttribute("placeholder", "Sélectionnez ci-dessus ou saisissez un terme");
  await expect(excluded).toHaveAttribute("placeholder", "Ex. brocoli, saumon");
  await expect(page.getByRole("button", { name: "Retirer une personne" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ajouter une personne" })).toBeVisible();

  await budget.fill("95");
  await page.getByRole("button", { name: "Végétarien" }).click();
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await expect(page.getByTestId("home-view")).toBeVisible();
  await expect(page.getByText("95 € maximum")).toBeVisible();

  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("la génération construit une semaine navigable puis une liste de courses", async ({ page }) => {
  await generateWeek(page);

  await expect(page.getByRole("heading", { name: "Ma semaine" })).toBeVisible();
  await expect(page.getByText("14", { exact: true })).toBeVisible();
  await expect(page.getByText("repas", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Remplacer/ }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));

  await page.getByRole("button", { name: "Courses", exact: true }).click();
  await expect(page.getByTestId("courses-view")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Liste de courses" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retirer ce que j’ai déjà" })).toBeVisible();

  const firstShoppingItem = page.getByRole("button", { name: /^Cocher / }).first();
  await expect(firstShoppingItem).toBeVisible();
  await firstShoppingItem.click();
  await expect(page.getByText(/1 sur \d+ articles/)).toBeVisible();
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("la semaine permet d’ouvrir une recette et le remplacement d’un repas", async ({ page }) => {
  await generateWeek(page);

  const firstMeal = page.locator(".meal-card__main").first();
  await firstMeal.click();
  await expect(page.getByText("Repères par portion")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retour" })).toBeVisible();
  await page.getByTestId("flow-current").getByRole("button", { name: "Remplacer" }).click();

  await expect(page.locator(".replace-page h1")).toBeVisible();
  await expect(page.getByText(/Les allergies, le régime et le temps maximum/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Choisir ce repas" })).toBeVisible();
});

test("les favoris et l’historique restent accessibles depuis la navigation principale", async ({ page }) => {
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await expect(page.getByTestId("favorites-view")).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Catalogue, favoris et historique" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Favoris", selected: true })).toBeVisible();
  await expect(page.locator(".favorite-card").first()).toBeVisible();

  await page.getByRole("tab", { name: "Historique" }).click();
  await expect(page.getByRole("tab", { name: "Historique", selected: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aucun historique" })).toBeVisible();
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});

test("le catalogue expose les recettes uniques relues et leurs précautions", async ({ page }) => {
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await page.getByRole("tab", { name: "Catalogue" }).click();

  await expect(page.getByText("544 recettes uniques disponibles")).toBeVisible();
  await expect(page.getByText("544 résultats")).toBeVisible();

  await page.getByPlaceholder("Recette ou ingrédient").fill("wakame");
  await expect(page.getByText("1 résultat", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Soupe miso au wakame/ }).click();

  await expect(page.getByRole("heading", { name: "Soupe miso au wakame, shiitakés et tofu" })).toBeVisible();
  await expect(page.getByText("Validée avec repères")).toBeVisible();
  await expect(page.getByText(/sodium et d'iode/)).toBeVisible();
  await expect(page.getByText(/ne garantit pas un bénéfice clinique individuel/)).toBeVisible();
  await expectNoHorizontalOverflow(page.getByTestId("mobile-app-viewport"));
});
