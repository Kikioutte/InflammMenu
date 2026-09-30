import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
const recipes = JSON.parse(readFileSync(new URL('../src/data/recettes-anti-inflammatoires.json', import.meta.url), 'utf8')).recipes.slice(-50) as { titre: string; id: string }[];
test('les 50 nouvelles fiches sont recherchables avec une photo chargée', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await expect(page.getByTestId('onboarding-view').or(page.getByTestId('home-view'))).toBeVisible();
  if (await page.getByTestId('onboarding-view').isVisible()) await page.getByTestId('onboarding-skip').click();
  await page.getByRole('button', { name: 'Recette', exact: true }).click();
  await page.getByRole('tab', { name: 'Catalogue', exact: true }).click();
  const current = page.getByTestId('flow-current');
  await expect(current.locator('.catalogue-count')).toHaveText('1251 résultats');
  for (const recipe of recipes) {
    await current.getByLabel('Rechercher une recette', { exact: true }).fill(recipe.titre);
    const card = current.locator('.catalogue-card').filter({ hasText: recipe.titre });
    await expect(card).toHaveCount(1);
    await card.click();
    await expect(current.locator('.catalogue-detail')).toBeVisible();
    await expect(current.getByTestId('association-notice')).toContainText('Associations vertes');
    const photo = current.locator('.catalogue-detail img').first();
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.getByRole('button', { name: 'Retour', exact: true }).click();
  }
});
