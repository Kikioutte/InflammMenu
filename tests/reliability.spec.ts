import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ serviceWorkers: 'block' });

async function seedLocal(page: Page, raw: string) {
  await page.goto('/tests/runtime-fixture.html');
  await page.evaluate(value => localStorage.setItem('inflamm-menu:app-state', value), raw);
  await page.goto('/');
}

for (const available of [true, false]) {
  test(`la nutrition d’une variante est ${available ? 'recalculée et persistée' : 'signalée sans recalcul si le module est indisponible'}`, async ({ page }) => {
    const source=JSON.parse(await readFile(new URL('../src/data/planner-recipes.json',import.meta.url),'utf8'));
    const original=source.find((recipe:{id:string})=>recipe.id==='catalog-r051');
    const recipe={...original,id:'perso-catalog-r051-review',title:'Mes flocons personnalisés'};
    if (!available) await page.route('**/src/recipe-nutrition.ts*',route=>route.abort());
    await seedLocal(page,JSON.stringify({version:3,onboardingCompleted:true,customRecipes:[recipe],favoriteRecipeIds:[recipe.id],recipeNotes:{[recipe.id]:'Ma note'}}));
    await page.getByRole('button',{name:'Favoris',exact:true}).click();
    await page.getByRole('button',{name:/Mes flocons personnalisés/}).click();
    await page.getByTestId('edit-custom-recipe').click();
    await page.getByRole('button',{name:`Augmenter ${recipe.ingredients[0].name}`,exact:true}).click();
    await page.getByTestId('custom-cost').fill('2,75');
    await page.getByTestId('custom-save').click();
    await expect(page.getByTestId('edit-custom-recipe')).toBeVisible();
    const state = await page.evaluate(()=>JSON.parse(localStorage.getItem('inflamm-menu:app-state')!));
    expect(state.customRecipes[0].ingredients[0].quantity).toBe(recipe.ingredients[0].quantity+5);
    expect(state.customRecipes[0].costPerPortion).toBe(2.75);
    expect(state.recipeNotes[recipe.id]).toBe('Ma note');
    if (available) {
      expect(state.customRecipes[0].nutritionRecalculated).toBe(true);
      expect(state.customRecipes[0].nutrition.calories).toBeGreaterThan(recipe.nutrition.calories);
      await expect(page.getByText(/Estimations recalculées pour les quantités/)).toBeVisible();
    } else {
      expect(state.customRecipes[0].nutritionRecalculated).toBeUndefined();
      expect(state.customRecipes[0].nutrition).toEqual(recipe.nutrition);
      await expect(page.getByText(/non recalculées après adaptation/)).toBeVisible();
    }
    await page.reload();
    await page.getByRole('button',{name:'Favoris',exact:true}).click();
    await page.getByRole('button',{name:/Mes flocons personnalisés/}).click();
    await expect(page.getByText(available ? /Estimations recalculées pour les quantités/ : /non recalculées après adaptation/)).toBeVisible();
  });
}

test('le coût corrigé d’une recette actualise les semaines actives et conserve l’historique', async ({ page }) => {
  const source=JSON.parse(await readFile(new URL('../src/data/planner-recipes.json',import.meta.url),'utf8'));
  const recipe={...source.find((item:{id:string})=>item.id==='catalog-r051'),id:'perso-catalog-r051-price',title:'Mon coût à jour',mealTypes:['lunch','dinner'],costPerPortion:2};
  const monday=new Date(); monday.setUTCHours(12,0,0,0); monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
  const next=new Date(monday); next.setUTCDate(next.getUTCDate()+7);
  const previous=new Date(monday); previous.setUTCDate(previous.getUTCDate()-7);
  const profile={people:1,maxPrepMinutes:1440};
  const plan={id:'price-current',version:1,startsOn:monday.toISOString().slice(0,10),generatedAt:new Date().toISOString(),profileSnapshot:profile,estimatedCost:28,meals:Array.from({length:7},(_,dayIndex)=>['lunch','dinner'].map(mealType=>({id:`price-${dayIndex}-${mealType}`,recipeId:recipe.id,dayIndex,mealType,portions:1}))).flat()};
  await seedLocal(page,JSON.stringify({version:3,onboardingCompleted:true,profile,customRecipes:[recipe],favoriteRecipeIds:[recipe.id],currentPlan:plan,upcomingPlan:{...plan,id:'price-upcoming',startsOn:next.toISOString().slice(0,10)},history:[{...plan,id:'price-history',startsOn:previous.toISOString().slice(0,10)}],actualSpend:{'price-current':25}}));
  await expect(page.getByTestId('home-view')).toBeVisible();
  await page.getByRole('button',{name:'Favoris',exact:true}).click();
  await page.getByRole('button',{name:/Mon coût à jour/}).click();
  await page.getByTestId('edit-custom-recipe').click();
  await page.getByTestId('custom-cost').fill('3');
  await page.getByTestId('custom-save').click();
  await expect.poll(()=>page.evaluate(()=>{
    const state=JSON.parse(localStorage.getItem('inflamm-menu:app-state')!);
    return {current:state.currentPlan?.estimatedCost,upcoming:state.upcomingPlan?.estimatedCost,history:state.history[0].estimatedCost,spent:state.actualSpend['price-current']};
  })).toEqual({current:42,upcoming:42,history:28,spent:25});
});

test('le montant réel accepte les centimes saisis caractère par caractère', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('onboarding-skip').click();
  await page.getByRole('button', {name:'Générer ma semaine'}).click();
  await page.getByRole('button', {name:'Créer ma semaine'}).click();
  await page.getByRole('button', {name:'Voir ma semaine'}).click();
  await page.getByRole('button', {name:'Courses', exact:true}).click();
  const amount = page.getByTestId('spend-input');
  await amount.pressSequentially('72,50');
  await amount.blur();
  await expect(amount).toHaveValue('72,5');
  const persisted = () => page.evaluate(() => { const state=JSON.parse(localStorage.getItem('inflamm-menu:app-state')!); return state.actualSpend[state.currentPlan.id]; });
  await expect.poll(persisted).toBe(72.5);
  await amount.fill('invalide');
  await amount.blur();
  await expect(amount).toHaveAttribute('aria-invalid','true');
  expect(await persisted()).toBe(72.5);
  await page.reload();
  await page.getByRole('button', {name:'Courses', exact:true}).click();
  await expect(amount).toHaveValue('72,5');
});

test('les quarts de cuillère restent précis à l’affichage et à la sauvegarde', async ({ page }) => {
  const source=JSON.parse(await readFile(new URL('../src/data/planner-recipes.json',import.meta.url),'utf8'));
  const recipe={...source[0],id:'perso-quantities-test',title:'Ma recette précise',ingredients:[
    {id:'salt',name:'Sel',quantity:0.25,unit:'c_cafe',category:'grocery'},
    {id:'olive-oil',name:'Huile d’olive',quantity:0.25,unit:'c_soupe',category:'grocery'},
    {id:'pepper',name:'Poivre',quantity:0.01,unit:'g',category:'grocery'},
  ]};
  await seedLocal(page,JSON.stringify({version:3,onboardingCompleted:true,customRecipes:[recipe],favoriteRecipeIds:[recipe.id]}));
  await page.getByRole('button',{name:'Favoris',exact:true}).click();
  await page.getByRole('button',{name:/Ma recette précise/}).click();
  await page.getByRole('button',{name:'Retirer une portion',exact:true}).click();
  await expect(page.getByText('0,25 c. à café', {exact:true})).toBeVisible();
  await expect(page.getByText('0,01 g', {exact:true})).toBeVisible();
  await page.getByTestId('edit-custom-recipe').click();
  await expect(page.getByRole('heading',{name:'Adapter la recette'})).toBeFocused();
  const time = page.getByTestId('custom-time');
  const initialTime = await time.inputValue();
  await time.fill('');
  await page.getByTestId('custom-save').click();
  await expect(time).toHaveAttribute('aria-invalid','true');
  await expect(time).toBeFocused();
  await time.fill(initialTime);
  await page.getByRole('button',{name:'Augmenter Sel',exact:true}).click();
  await page.getByRole('button',{name:'Augmenter Huile d’olive',exact:true}).click();
  await page.getByTestId('custom-save').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('inflamm-menu:app-state')!).customRecipes[0].ingredients.map((i:{quantity:number})=>i.quantity))).toEqual([0.5,0.5,0.01]);
});

test('un budget ou un temps vide ne remplace pas silencieusement le profil', async ({ page }) => {
  await seedLocal(page,JSON.stringify({version:3,onboardingCompleted:true,profile:{firstName:'Camille',weeklyBudget:95,maxPrepMinutes:45}}));
  await page.getByRole('button',{name:'Ajuster mon profil'}).click();
  await expect(page.getByRole('heading',{name:'Mon profil alimentaire'})).toBeFocused();
  const budget=page.getByLabel('Budget hebdomadaire (€)');
  await budget.fill('');
  await page.getByRole('button',{name:'Enregistrer mon profil'}).click();
  await expect(budget).toHaveAttribute('aria-invalid','true');
  await expect(budget).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('inflamm-menu:app-state')!).profile.weeklyBudget)).toBe(95);
  await budget.fill('110');
  const time=page.getByLabel('Temps actif maximum en cuisine (min)');
  await time.fill('');
  await page.getByRole('button',{name:'Enregistrer mon profil'}).click();
  await expect(time).toHaveAttribute('aria-invalid','true');
  await expect(time).toBeFocused();
  await time.fill('50');
  await page.getByRole('button',{name:'Enregistrer mon profil'}).click();
  await expect(page.getByTestId('home-view')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('inflamm-menu:app-state')!).profile.weeklyBudget)).toBe(110);
});

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

test('un stockage de rappel refusé ne bloque pas le démarrage ni les données', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Notification', { configurable: true, value: class { static permission = 'granted'; } });
    const nativeGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key === 'inflamm-menu:reminded-on') throw new DOMException('Lecture refusée pour le test', 'SecurityError');
      return nativeGet.call(this, key);
    };
  });
  await seedLocal(page, JSON.stringify({ version: 3, onboardingCompleted: true, remindersEnabled: true, profile: { firstName: 'Camille' } }));
  await expect(page.getByTestId('home-view')).toBeVisible();
  await page.getByRole('button', { name: 'Ajuster mon profil' }).click();
  await expect(page.getByLabel('Votre prénom')).toHaveValue('Camille');
  await page.reload();
  await expect(page.getByTestId('home-view')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('inflamm-menu:app-state')!).remindersEnabled)).toBe(true);
});
