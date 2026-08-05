# Analyse complète — Inflamm’Menu

Audit réalisé sur le commit `f5dd5f5`, branche `claude/website-analysis-ehjlss`.
Toutes les affirmations ci-dessous ont été **vérifiées par exécution** (build, tests,
navigation réelle dans un Chromium, sondes sur le moteur), pas par lecture seule.

---

## 1. Ce qu’est le produit

Inflamm’Menu est une **application web mobile (PWA) de planification de menus
anti-inflammatoires**, en français, entièrement locale : aucun compte, aucun serveur,
aucune requête réseau sortante. L’utilisateur renseigne un profil (foyer, budget,
régime, allergies, temps de cuisine, équipements), l’application génère une semaine de
14 ou 21 repas, une liste de courses agrégée, et permet de remplacer un repas.

| | |
|---|---|
| Stack | React 19.2 + TypeScript 7 (strict) + Vite 8 |
| Rendu | SPA affichée dans une maquette de téléphone (runtime « mobile prototype » protégé) |
| Données | 36 recettes, 82 ingrédients, tout en dur dans `src/recipes.ts` |
| Persistance | IndexedDB avec repli `localStorage`, migration de schéma versionnée |
| Hors-ligne | Service worker `public/sw.js` (précache du shell + découverte des assets hachés) |
| Déploiement | Cloudflare Worker statique (`worker/index.js`) via Sites, `.openai/hosting.json` |
| Poids livré | **62 Mo** de `dist/` dont 57 Mo d’images |

**Maturité : prototype V1 abouti côté forme, fragile côté fond.** Le design, le code
et la documentation sont d’un niveau nettement supérieur à la moyenne des prototypes.
Le moteur de génération, lui, ne tient pas ses promesses.

---

## 2. Vérifications exécutées

| Contrôle | Résultat |
|---|---|
| `npm run check:runtime` | ✅ 28 fichiers runtime intègres |
| `npm run build` (tsc + vite + Sites) | ✅ sans erreur |
| `npm run test:engine` | ✅ 5/5 |
| `npm run test:sites` | ✅ 4/4 |
| `npx playwright test` | ✅ 13/13 (après contournement du binaire Chromium de l’environnement) |
| Console navigateur, parcours complet | ✅ 0 erreur, 0 avertissement |
| `npm audit` | ⚠️ 1 vulnérabilité *high* (postcss, transitive, build uniquement) |

Le harnais de test est donc **vert**. Les problèmes ci-dessous ne sont pas des
régressions : ce sont des angles morts que les tests actuels ne couvrent pas.

---

## 3. P0 — Bloquants

### 3.1 Le moteur produit toujours exactement la même semaine

`makePlan()` passe `seed: Date.now()` à `generateWeeklyPlan`, ce qui suggère une
variation à chaque génération. Mesure réelle :

```
200 seeds différentes  ->  1 seule semaine distincte
1, 2, 3, 4 personnes   ->  1 seule semaine distincte à chaque fois
Recettes réellement servies : 14 / 36
```

Vérifié aussi dans le navigateur : générer la semaine, puis cliquer
« Créer une autre semaine » redonne **le texte identique, repas pour repas**.

**Cause** (`src/engine.ts:178-195`) : le score de tri est dominé par
`- recipe.costPerPortion * people * 7`, un terme continu (les coûts vont de 1,35 € à
4,80 €). `seededRank(seed, …)` n’intervient qu’en cas d’**égalité stricte** de score,
situation qui ne se produit jamais. La sélection est donc un glouton
« le moins cher d’abord » parfaitement déterministe, et la seed est décorative.

**Conséquence produit** : le bouton « Créer une autre semaine » est un bouton mort,
22 recettes sur 36 (61 % du catalogue et des 49 Mo d’images produites pour elles) ne
sont jamais servies, et la promesse « des repas variés » affichée sur l’écran Semaine
est fausse.

**Piste de correction** : injecter le bruit de seed *dans* le score plutôt qu’en
départage — p. ex. `+ seededRank(seed, `${slot.dayIndex}-${recipe.id}`) * 60` — et
réduire le poids du coût à une échelle comparable aux critères nutritionnels
(actuellement le coût pèse jusqu’à 67 points contre 44 pour toute la qualité cumulée).

### 3.2 Poids réseau : 30 Mo pour une session normale

Mesures réelles (Chromium, `content-length`) :

| Écran | Poids |
|---|---|
| Accueil seul, premier chargement | **3,23 Mo** (dont 3,17 Mo d’images) |
| Parcours accueil → génération → 7 jours → courses → favoris | **30,27 Mo** en 32 requêtes |

Détail des gaspillages les plus nets :

- `olive-sprig.png` : **1631×964, 866 Ko téléchargés pour un affichage 42×24 px**
  (le petit rameau d’olivier à côté du logo). Rapport de gâchis : ~1 500×.
- Les 36 photos de recettes sont des PNG 900×900 d’environ 1,4 Mo chacune, affichées
  en vignettes **84×84 px** dans les listes.
- `inflamm-hero-bowl.png` : 1,98 Mo. `og.png` : 1,58 Mo pour une image sociale.
- Aucune image n’a `loading="lazy"`, ni attributs `width`/`height` (donc CLS), ni
  variante WebP/AVIF, ni `srcset`.

Sur une 4G moyenne (≈ 5 Mbit/s réels), l’accueil met plus de 5 secondes à s’afficher
et une session complète consomme 30 Mo de forfait data — pour une application dont
le cas d’usage principal est « je consulte ma liste de courses au supermarché ».

**Piste** : conversion en WebP/AVIF + génération de deux tailles (vignette 200 px,
héro 800 px). Une conversion AVIF qualité 60 sur ces photos ramène typiquement les
57 Mo sous les 3 Mo, sans changement visible à l’écran.

---

## 4. P1 — Défauts fonctionnels et d’accessibilité importants

### 4.1 Le moteur échoue sur des réglages courants

Sondes sur le catalogue réel, profil par défaut modifié d’un seul critère :

| Réglage | Résultat |
|---|---|
| Temps max **20 min** | ❌ `Catalogue insuffisant pour dinner: 2 recette(s), 7 requises` |
| Temps max **15 min** | ❌ `Catalogue insuffisant pour lunch: 6 recette(s), 7 requises` |
| **Végétarien + 3 repas/jour** | ❌ `Aucune recette unique disponible pour le créneau 6-dinner` |
| Végétarien + sans gluten + 3 repas | ❌ `Catalogue insuffisant pour breakfast: 3, 7 requises` |
| 3 repas/jour | ⚠️ 92,80 € pour un budget de 80 € |
| 6 personnes | ⚠️ 196,50 € pour un budget de 80 € |

Le champ « Temps maximum en cuisine » est une saisie numérique libre : un utilisateur
qui tape 20 — une valeur parfaitement raisonnable — obtient un mur d’erreur. Le
catalogue ne compte que 14 recettes ≤ 20 min et 10 ≤ 15 min.

Deux problèmes distincts se cumulent :

1. **Le catalogue est trop petit** pour les combinaisons de filtres proposées par
   l’interface (36 recettes, dont 8 petits-déjeuners seulement — or 3 repas/jour en
   exige 7 uniques).
2. **La pré-vérification est fausse** (`src/engine.ts:152-160`) : elle contrôle la
   disponibilité par type de repas *indépendamment*, alors que déjeuner et dîner
   puisent dans un pool commun de 31 recettes. Elle valide donc des profils qui
   échoueront plus loin avec un message technique différent
   (`Aucune recette unique disponible pour le créneau 6-dinner`).

L’écran d’erreur (« Vos critères sont trop serrés ») est correct dans l’intention,
mais il n’indique **pas quel critère relâcher** ni de combien.

### 4.2 Le mode « Sans porc » dégrade silencieusement les menus

Vérification sur le catalogue : **les 36 recettes déclarent `no-pork`** — aucune ne
contient de porc. Le filtre « Sans porc » ne retire donc rien.

En revanche, `src/engine.ts:169` conditionne l’objectif « ≥ 2 repas avec poisson » à
`profile.diet === "classic"`. Résultat mesuré :

| Régime | Repas avec poisson |
|---|---|
| Classique | 2 |
| **Sans porc** | **0** |
| Végétarien | 0 (attendu) |

Un utilisateur qui choisit « Sans porc » — un choix souvent culturel ou religieux, qui
n’exclut pas le poisson — perd la règle nutritionnelle sans en être informé, et
l’écran de génération cesse d’afficher la ligne « Au moins 2 repas avec poisson ».

### 4.3 Le focus clavier traverse l’écran masqué

`FlowStack` laisse les écrans sous-jacents montés sans `inert` ni `aria-hidden`
(`src/mobile/FlowStack.tsx:202` ne pose que `data-flow-current`). Mesure depuis une
fiche recette :

```
2 éléments <h1> présents simultanément : « Ma semaine » + « Taboulé complet… »
15 boutons focalisables dans l'écran masqué
Ordre de tabulation : 7 contrôles de l'écran masqué (dont toute la barre de
navigation) AVANT d'atteindre le premier bouton de la fiche recette.
```

Un utilisateur au clavier ou au lecteur d’écran navigue donc dans un écran
invisible. C’est un manquement WCAG 2.4.3 (Focus Order) et 1.3.2.

⚠️ `FlowStack.tsx` est un fichier runtime protégé par `AGENTS.md` et le lock de
hachage : la correction (`inert` sur les écrans non courants) nécessite une
modification explicite du runtime et une mise à jour de `mobile-runtime.lock.json`.

### 4.4 Les cases à cocher des courses n’exposent pas leur état

`src/Prototype.tsx:308` : chaque ligne est un `<button aria-label="Cocher ail">`
sans `role="checkbox"`, sans `aria-checked`, sans `aria-pressed`. L’état coché n’est
signalé **que visuellement** (barré + coche dessinée). Un lecteur d’écran annonce
« Cocher ail, bouton » que l’article soit coché ou non, et le libellé reste « Cocher »
même pour décocher. C’est l’écran le plus utilisé en mobilité — WCAG 4.1.2.

### 4.5 Les allergènes ne sont jamais affichés

Le modèle porte `Recipe.allergens` et `Ingredient.allergens`, et le moteur les
utilise correctement comme filtre strict. Mais `grep` sur `src/Prototype.tsx` :
**aucune occurrence de `allergen`**. La fiche recette n’affiche ni les allergènes, ni
un rappel de ce qui a été filtré.

Pour une application qui met les allergies au centre de son profil et qui affiche un
avertissement santé, ne pas montrer « Contient : gluten, fruits à coque » sur la fiche
est une lacune de sécurité alimentaire, pas seulement de confort — d’autant que
l’utilisateur peut consulter une recette en favori qui ne correspond plus à son profil.

### 4.6 `og:image` en URL relative

`index.html:11` et `:15` : `content="/og.png"`. Facebook, LinkedIn, WhatsApp,
X et Slack exigent une **URL absolue**. Aucun aperçu ne s’affichera lors d’un partage —
et l’image pèse par ailleurs 1,58 Mo, au-delà de ce que plusieurs plateformes
acceptent.

---

## 5. P2 — À corriger

| # | Constat | Localisation |
|---|---|---|
| 5.1 | **Contrastes sous AA.** `--muted #74766a` sur ivoire = **4,32:1** (< 4,5), utilisé pour tout le texte secondaire ; `--terracotta #bc5a32` (eyebrows) = **4,22:1** ; `--turmeric` = 1,98:1. Aggravé par des tailles de 9 à 10 px. | `src/prototype.css:15-16` |
| 5.2 | **Aucun routage URL.** L’URL ne change jamais. Le bouton Retour du navigateur **quitte l’application** (vérifié : page vide après `goBack`). Pas de lien partageable vers une recette, pas de restauration d’écran au rechargement. | `src/Prototype.tsx` (FlowStack en état pur) |
| 5.3 | **Artefacts de QA publiés en production.** `public/qa/` (2 Mo, dont `source-option-1.png` 1,8 Mo et deux pages HTML de comparaison interne) est copié dans `dist/client/qa/` et servi publiquement. | `public/qa/` |
| 5.4 | **Incohérence d’allergène.** `yaourt-pomme-amandes` contient de l’avoine (gluten) mais ne déclare pas `gluten` dans `recipe.allergens`. Sans effet aujourd’hui (le moteur agrège aussi les allergènes d’ingrédients), mais piège si l’on se met à afficher `recipe.allergens` (§4.5). | `src/recipes.ts` |
| 5.5 | **2 recettes inatteignables par défaut.** Elles exigent `steamer`, décoché dans `DEFAULT_PROFILE.equipment`. Elles n’apparaissent jamais tant que l’utilisateur ne coche pas « Vapeur ». | `src/domain.ts:121` |
| 5.6 | **`role="tab"` sans `tabpanel`.** Le sélecteur Favoris/Historique déclare `role="tablist"`/`role="tab"` sans `aria-controls` ni panneau associé. | `src/Prototype.tsx:320` |
| 5.7 | **Barre de progression non sémantique.** `.shopping-progress` est un `div`+`span` sans `role="progressbar"` ni `aria-valuenow`. | `src/Prototype.tsx:302` |
| 5.8 | **Aucun en-tête de sécurité.** Le worker ne pose ni CSP, ni `X-Frame-Options`, ni `X-Content-Type-Options`. L’application est encadrable (clickjacking). | `worker/index.js` |
| 5.9 | **`npm audit` : 1 *high*** (postcss ≤ 8.5.22, path traversal via sourceMappingURL). Transitive via Vite, exposition limitée au build. | `package-lock.json` |
| 5.10 | **Icône PWA = photo de salade de lentilles**, sans marque ni wordmark, déclarée `purpose: "any maskable"` alors qu’elle est en plein cadre : le masquage rognera l’image. Illisible à 48 px sur un écran d’accueil. | `public/icons/`, `manifest.webmanifest` |
| 5.11 | **`theme-color` hors palette.** `#536345` (index.html + manifest) n’existe dans aucun token CSS (`--sage #687747`, `--sage-dark #334126`). | `index.html:6` |
| 5.12 | **État persisté dupliqué.** `createState()` écrit chaque collection deux fois (`favoriteRecipeIds` **et** `favorites`, etc.) pour compatibilité v0. Rétrocompatibilité en lecture déjà assurée par `migrateAppState` — l’écriture double est inutile. | `src/storage.ts:52-69` |
| 5.13 | **Chemins locaux dans le dépôt.** `design-qa.md` référence `/Users/alexis/.codex/…` et `/Users/alexis/Documents/…` (nom d’utilisateur + arborescence de la machine de l’auteur). | `design-qa.md:5-8` |
| 5.14 | **Pas de CI, pas de licence, README d’une ligne.** Aucun workflow GitHub : les 22 tests existants ne tournent sur aucune PR. | racine |

---

## 6. P3 — Finitions

- **3ᵉ repas invisible sur l’accueil.** `HomeView` fait `.slice(0, 2)` : en mode
  3 repas/jour, le dîner du jour n’est jamais affiché sur l’écran d’accueil
  (`src/Prototype.tsx:230`).
- **Semaine périmée.** `currentDayIndex()` clampe à `[0, 6]` : une fois la semaine
  passée, l’application affiche indéfiniment « dimanche » et la plage de dates
  écoulée, sans inviter à régénérer (`src/Prototype.tsx:135-140`).
- **Bundle JS de 536 Ko** (166 Ko gzip) en un seul chunk — Vite l’avertit au build.
  Les 36 recettes avec descriptions et étapes y sont intégrées.
- **Pas de thème sombre**, alors que le manifeste déclare `background_color` clair et
  que la cible est une PWA installée.
- **Cibles tactiles à 43 px** dans la barre de navigation (recommandation Apple : 44).
- **`type="button"` incohérent** : présent sur la plupart des boutons, absent sur les
  onglets segmentés, les puces de motif et les cartes de remplacement. Sans effet ici
  (aucun `<form>`), mais source de régression future.
- **États locaux désynchronisables** : `RecipeView` copie `favorite` dans un `useState`
  et les écrans empilés capturent `appState` par closure au moment du `push`.

---

## 7. Ce qui est solide — à préserver

À contre-courant de la liste ci-dessus, plusieurs choses sont réellement bien faites
et méritent d’être notées :

- **Confidentialité tenue, et vérifiée.** Aucune requête sortante, aucun analytics,
  aucun CDN tiers. Les polices sont auto-hébergées via `@fontsource` (pas de Google
  Fonts) — conformité RGPD par construction. La page « Informations » décrit
  honnêtement le fonctionnement local, les estimations et l’avertissement santé, avec
  des sources officielles (Ciqual/ANSES, Santé publique France).
- **Séparation domaine / moteur / UI exemplaire.** `domain.ts` (types purs),
  `engine.ts` (fonctions pures, testables sans DOM), `storage.ts` (persistance isolée),
  `Prototype.tsx` (vues). Le moteur est testé en Node sans navigateur.
- **Persistance robuste.** IndexedDB avec repli `localStorage`, migration explicite
  d’un schéma v0 non versionné, validation défensive de chaque collection avant
  exposition à React, gestion du mode privé Safari. C’est un niveau de soin rare.
- **Service worker correct.** Précache du shell, découverte des assets hachés dans le
  HTML à l’installation, `cacheFirst` par destination, `navigationResponse` avec repli
  HTML, purge des anciens caches à l’activation.
- **Qualité des données.** 36 recettes, 0 doublon d’id, 0 image manquante, 0 image
  orpheline, allergènes cohérents à une exception près, cohérence végétarien/viande
  parfaite, 3 étapes et une consigne de conservation par recette.
- **Qualité éditoriale.** Français soigné et homogène, ton juste, aucune promesse
  médicale abusive, nutrition explicitement estimative.
- **Design.** Palette ivoire/olive/terracotta cohérente, hiérarchie serif éditorial +
  sans-serif UI, photos toutes du même registre. `design-qa.md` documente une
  vraie campagne de QA visuelle avec passes et correctifs.
- **Discipline du runtime.** `AGENTS.md`, le lock de hachage et
  `check:runtime` en pre-hook empêchent la dérive du runtime mobile partagé.

---

## 8. Plan d’action proposé

**Sprint 1 — rendre le produit crédible**

1. Rendre la seed effective et rééquilibrer le score (§3.1). *Sans cela, tout le
   reste du produit repose sur une seule semaine figée.*
2. Optimiser les images : WebP/AVIF + deux tailles + `loading="lazy"` +
   `width`/`height` (§3.2). Objectif : accueil < 400 Ko, session < 2 Mo.
3. Retirer `public/qa/` du build (§5.3) et corriger `og:image` en URL absolue (§4.6).

**Sprint 2 — fiabilité et sécurité d’usage**

4. Étendre le catalogue (viser ≥ 20 petits-déjeuners et ≥ 15 recettes ≤ 20 min) et
   corriger la pré-vérification de faisabilité (§4.1).
5. Appliquer la règle poisson à `no-pork`, ou fusionner les deux modes (§4.2).
6. Afficher les allergènes sur la fiche recette (§4.5) et corriger
   `yaourt-pomme-amandes` (§5.4).
7. Message d’erreur actionnable : indiquer le critère bloquant et la valeur minimale.

**Sprint 3 — accessibilité et plateforme**

8. `role="checkbox"` + `aria-checked` sur la liste de courses (§4.4) ; `progressbar` ;
   `tabpanel`.
9. `inert` sur les écrans FlowStack non courants — **modification runtime explicite**
   avec mise à jour du lock (§4.3).
10. Remonter `--muted` et `--terracotta` au-dessus de 4,5:1 et passer les tailles de
    9-10 px à 12 px minimum (§5.1).
11. Routage URL (History API) pour rétablir le bouton Retour (§5.2).
12. Workflow GitHub Actions exécutant `check:runtime`, `test:engine`, `test:sites` et
    Playwright sur chaque PR (§5.14).
