import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DEFAULT_APP_STATE, APP_STATE_DATA_KEYS } from "../src/storage";
import { beforeInstructionsReview } from "./helpers/recipe-instructions-review.mjs";

test.use({ serviceWorkers: "block" });

test("une ancienne copie reste utilisable puis se met à jour sans rechargement @webkit-smoke", async ({ page }) => {
  test.setTimeout(45_000);
  const catalogue = JSON.parse(await readFile(new URL("../src/data/recettes-anti-inflammatoires.json", import.meta.url), "utf8"));
  const editions = JSON.parse(await readFile(new URL("../src/data/catalogue-offline-editions.json", import.meta.url), "utf8"));
  // Reconstruct the exact approved historical payload from the evidenced
  // before/after journal, without duplicating a 9 MB fixture in the repository.
  // Its explicit digest assertion prevents this test from silently blessing a
  // truncated catalogue when those historical recipes are edited in the future.
  const previous = { ...catalogue, meta: { ...catalogue.meta, nombre_recettes: 1087, date_mise_a_jour: "2026-09-06" }, recipes: catalogue.recipes.slice(0, 1087).map(beforeInstructionsReview) };
  const previousBody = JSON.stringify(previous);
  expect(createHash("sha256").update(previousBody).digest("hex")).toBe(editions.previous.find((edition: { recipeCount: number }) => edition.recipeCount === 1087).sha256);
  const state = {
    ...structuredClone(DEFAULT_APP_STATE),
    onboardingCompleted: true,
    favoriteRecipeIds: ["catalog-r711"],
    recipeCollections: [{ id: "collection-cache-update", name: "À conserver", recipeIds: ["catalog-r711"] }],
    shoppingItems: [{ id: "article-cache-update", name: "Papier cuisson", checked: true }],
  };
  const catalogueRequest = /\/src\/data\/recettes-anti-inflammatoires\.json(?:\?.*)?$/;
  await page.goto("/tests/runtime-fixture.html");
  await page.evaluate((state) => localStorage.setItem("inflamm-menu:app-state", JSON.stringify(state)), state);
  await page.route(catalogueRequest, (route) => route.abort());
  await page.goto("/");
  const current = page.getByTestId("flow-current");
  await expect(current.getByTestId("home-view")).toBeVisible();
  // This UI test starts with an old copy already available in the document.
  // Installed-worker persistence and cross-build reloads are covered separately
  // by the PWA suite, not by this serviceWorkers:block fixture.
  await page.evaluate(async (previousBody) => {
    const cache = await caches.open("inflamm-menu-catalogue-v2");
    await cache.put("/assets/recettes-anti-inflammatoires-BbsV96k4.json", new Response(previousBody, { headers: { "Content-Type": "application/json" } }));
  }, previousBody);
  const nav = (name: string) => current.getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name, exact: true }).click();
  await nav("Recette");
  await expect(current.getByTestId("catalogue-outdated")).toContainText(/1\s?087 recettes/);
  await expect(current.getByText("1081 résultats", { exact: true })).toBeVisible();
  await expect(current.locator(".catalogue-card")).toHaveCount(60);

  await nav("Accueil");
  await current.getByRole("button", { name: "Ajuster mon profil" }).click();
  await current.getByRole("button", { name: /Informations et confidentialité/ }).click();
  const offlineSection = current.getByTestId("offline-catalogue");
  const download = offlineSection.getByTestId("offline-catalogue-download");
  await expect(offlineSection.getByTestId("offline-catalogue-outdated")).toContainText(/1\s?087 recettes/);
  await expect(download).toHaveText("Mettre à jour le catalogue");
  await expect(download).toBeEnabled();
  await download.click();
  await expect(offlineSection.getByRole("alert")).toContainText("Votre copie hors ligne précédente est conservée.");
  await expect(download).toBeEnabled();
  await expect(offlineSection.getByTestId("offline-catalogue-outdated")).toBeVisible();

  await page.unroute(catalogueRequest);
  await download.click();
  await expect(download).toHaveText("Catalogue vérifié hors ligne");
  await expect(download).toBeDisabled();
  await expect(offlineSection.getByTestId("offline-catalogue-outdated")).toHaveCount(0);
  await expect(offlineSection.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await nav("Recette");
  await expect(current.getByTestId("catalogue-outdated")).toHaveCount(0);
  await expect(current.getByText("1251 résultats", { exact: true })).toBeVisible();
  await expect(current.locator(".catalogue-card")).toHaveCount(60);
  const preserved = await page.evaluate((keys) => {
    const stored = JSON.parse(localStorage.getItem("inflamm-menu:app-state")!);
    return Object.fromEntries(keys.map((key) => [key, stored[key]]));
  }, [...APP_STATE_DATA_KEYS]);
  for (const key of ["favoriteRecipeIds", "recipeCollections", "shoppingItems"] as const) expect(preserved[key]).toEqual(state[key]);
});
