import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ serviceWorkers: 'block' });

async function seedLocal(page: Page, raw: string) {
  await page.goto('/tests/runtime-fixture.html');
  await page.evaluate(value => localStorage.setItem('inflamm-menu:app-state', value), raw);
  await page.goto('/');
}

for (const [name, raw] of [
  ['tronquée', '{"version":3,"profile":{"firstName":"À récupérer 👩‍🍳"}'],
  ['future', JSON.stringify({version:999,profile:{firstName:'À récupérer'},privateFutureField:['<img src=x onerror=alert(1)>']})],
]) {
  test(`une sauvegarde ${name} reste intacte et peut être récupérée`, async ({ page }) => {
    await seedLocal(page, raw);
    await expect(page.getByRole('heading', {name:'Inflamm’Menu a rencontré une erreur'})).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('inflamm-menu:app-state'))).toBe(raw);
    const download = page.waitForEvent('download');
    await page.getByTestId('fatal-recovery').click();
    const file = await (await download).path();
    const recovery = JSON.parse(await readFile(file!, 'utf8'));
    expect(recovery.format).toBe('inflamm-menu-raw-recovery');
    expect(recovery.replicas.localStorage.rawState).toBe(raw);
    await expect(page.getByTestId('fatal-recovery-error')).toContainText('ne peut pas être importé');
    await page.getByTestId('fatal-reset').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('inflamm-menu:app-state'))).toBe(raw);
    await page.getByRole('button', {name:'Tout réinitialiser',exact:true}).click();
    await expect(page.getByTestId('onboarding-view')).toBeVisible();
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('inflamm-menu:app-state')))! ).version).toBe(3);
  });
}

test('une version IndexedDB future bloque aussi un démarrage avec un profil local valide', async ({ page }) => {
  await page.goto('/tests/runtime-fixture.html');
  const future = {version:999, futureField:{value:'données à conserver'}};
  await page.evaluate(async state => {
    localStorage.setItem('inflamm-menu:app-state', JSON.stringify({version:3,profile:{firstName:'Profil local'}}));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('inflamm-menu',1);
      request.onupgradeneeded = () => request.result.createObjectStore('app-state');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db=request.result; const transaction=db.transaction('app-state','readwrite');
        transaction.objectStore('app-state').put(state,'current');
        transaction.oncomplete=()=>{db.close();resolve();};
        transaction.onerror=()=>{db.close();reject(transaction.error);};
      };
    });
  },future);
  await page.goto('/');
  await expect(page.getByTestId('fatal-recovery')).toBeVisible();
  const download=page.waitForEvent('download');
  await page.getByTestId('fatal-recovery').click();
  const file=await (await download).path();
  const recovery=JSON.parse(await readFile(file!,'utf8'));
  expect(recovery.replicas.IndexedDB.rawState).toEqual(future);
  expect(JSON.parse(recovery.replicas.localStorage.rawState).profile.firstName).toBe('Profil local');
});

test('une édition sans ingrédient conserve la recette, sa note et son favori', async ({ page }) => {
  const source=JSON.parse(await readFile(new URL('../src/data/planner-recipes.json',import.meta.url),'utf8'));
  const recipe={...source[0],id:'perso-recovery-test',title:'Ma recette à conserver',ingredients:[{...source[0].ingredients[0],quantity:5,unit:'g'}]};
  await seedLocal(page,JSON.stringify({version:3,onboardingCompleted:true,customRecipes:[recipe],favoriteRecipeIds:[recipe.id],recipeNotes:{[recipe.id]:'Note à conserver'}}));
  await expect(page.getByTestId('home-view')).toBeVisible();
  await page.getByRole('button',{name:'Favoris',exact:true}).click();
  await page.getByRole('button',{name:/Ma recette à conserver/}).click();
  await page.getByTestId('edit-custom-recipe').click();
  await page.getByRole('button',{name:`Réduire ${recipe.ingredients[0].name}`,exact:true}).click();
  await page.getByTestId('custom-save').click();
  await expect(page.getByTestId('custom-save-error')).toContainText('au moins un ingrédient');
  await expect(page.getByTestId('custom-recipe-view')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('home-view')).toBeVisible();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('inflamm-menu:app-state')!));
  expect(state.customRecipes[0].ingredients).toHaveLength(1);
  expect(state.customRecipes[0].ingredients[0].quantity).toBe(5);
  expect(state.favoriteRecipeIds).toContain(recipe.id);
  expect(state.recipeNotes[recipe.id]).toBe('Note à conserver');
});

test('le profil refuse une restriction inconnue sans perdre ses réglages précédents', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('onboarding-skip').click();
  await page.getByRole('button',{name:'Ajuster mon profil'}).click();
  const field=page.getByLabel('Autre allergie ou ingrédient à exclure');
  await field.fill('brocoli');
  await page.getByRole('button',{name:'Enregistrer mon profil'}).click();
  await expect(page.getByTestId('home-view')).toBeVisible();
  await page.getByRole('button',{name:'Ajuster mon profil'}).click();
  await field.fill('brocolii');
  await page.getByRole('button',{name:'Enregistrer mon profil'}).click();
  await expect(field).toHaveAttribute('aria-invalid','true');
  await expect(field).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('Terme non reconnu');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('inflamm-menu:app-state')!).profile.allergies)).toEqual(['brocoli']);
});

test('les jours restent tactiles aux six largeurs et une recherche vide peut être réinitialisée', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('onboarding-skip').click();
  await page.getByRole('button',{name:'Ajuster mon profil'}).click();
  await expect(page.getByRole('heading',{name:'Mon profil alimentaire'})).toBeFocused();
  for(const width of [320,375,390,430,768,1440]) {
    await page.setViewportSize({width,height:900});
    const button=await page.getByTestId('constraint-day-0').boundingBox();
    expect(button!.width).toBeGreaterThanOrEqual(44);
    expect(button!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  }
  await page.getByRole('button',{name:'Retour',exact:true}).click();
  await page.getByRole('button',{name:'Favoris',exact:true}).click();
  await page.getByRole('tab',{name:'Catalogue'}).click();
  await page.getByLabel('Rechercher une recette').fill('zzzzaucunrésultat');
  await expect(page.getByTestId('catalogue-empty')).toBeVisible();
  await expect(page.getByText('624 recettes uniques disponibles')).toBeVisible();
  await page.getByTestId('catalogue-empty-reset').click();
  await expect(page.getByText('624 résultats')).toBeVisible();
  await expect(page.getByLabel('Rechercher une recette')).toHaveValue('');
});

test('une fiche catalogue suit les changements de favori dans un autre onglet', async ({ page, context }) => {
  test.slow();
  await page.goto('/');
  await page.getByTestId('onboarding-skip').click();
  const second=await context.newPage();
  await second.goto('/');
  await expect(second.getByTestId('home-view')).toBeVisible();
  for(const current of [page,second]) {
    await current.getByRole('button',{name:'Favoris',exact:true}).click();
    await current.getByRole('tab',{name:'Catalogue'}).click();
    await current.locator('.catalogue-card').first().click();
    await expect(current.getByTestId('catalogue-favorite')).toHaveAttribute('aria-pressed','false');
  }
  await second.getByTestId('catalogue-favorite').click();
  await expect(page.getByTestId('catalogue-favorite')).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('catalogue-favorite').click();
  await expect(second.getByTestId('catalogue-favorite')).toHaveAttribute('aria-pressed','false');
});

test('une base IndexedDB de schéma plus récent reste récupérable sans être rétrogradée', async ({ page }) => {
  await page.goto('/tests/runtime-fixture.html');
  const original={version:3,futureDatabaseField:'Valeur à conserver'};
  await page.evaluate(async value=>{
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open('inflamm-menu',2);
      request.onupgradeneeded=()=>request.result.createObjectStore('app-state');
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const database=request.result;
        const transaction=database.transaction('app-state','readwrite');
        transaction.objectStore('app-state').put(value,'current');
        transaction.oncomplete=()=>{database.close();resolve();};
        transaction.onerror=()=>{database.close();reject(transaction.error);};
      };
    });
  },original);
  await page.goto('/');
  await expect(page.getByTestId('fatal-recovery')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('inflamm-menu:app-state'))).toBeNull();
  const download=page.waitForEvent('download');
  await page.getByTestId('fatal-recovery').click();
  const file=await (await download).path();
  expect(JSON.parse(await readFile(file!,'utf8')).replicas.IndexedDB.rawState).toEqual(original);
  await page.getByTestId('fatal-reset').click();
  await page.getByRole('button',{name:'Tout réinitialiser',exact:true}).click();
  await expect(page.getByRole('alertdialog')).toContainText('version plus récente');
  expect(await page.evaluate(()=>localStorage.getItem('inflamm-menu:app-state'))).toBeNull();
});
