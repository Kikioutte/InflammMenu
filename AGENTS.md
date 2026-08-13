# Mobile Prototype Agent Guide

## Prototype Instructions

### InflammMenu production surface

- The published InflammMenu experience is a responsive web/PWA surface. Do not wrap the production app in `PhoneFrame`, show a device picker, render an iPhone/Pixel bezel, or display simulated status-bar, home-indicator, cursor, or keyboard chrome.
- Keep the phone runtime available only for its dedicated runtime fixtures and tests. Production must remain full-width on mobile and use a centered responsive web canvas on larger screens.

### Reviewed recipe catalogue

- The imported 42-recipe catalogue must retain one explicit editorial review per recipe in `src/catalog.ts`. Do not present the source `score_anti_inflammatoire` as a scientific or medical measurement.
- Integrate only source recipes that are not materially duplicated by the V1 catalogue. Keep the six reviewed duplicate mappings explicit in `DUPLICATE_CATALOGUE_RECIPES` so they remain auditable and excluded from both the visible catalogue and weekly generator.
- Describe compatibility at the level of the overall Mediterranean-style dietary pattern. Do not render the source mechanism text as proof that an isolated ingredient prevents or treats inflammation.
- Keep visible cautions for concentrated turmeric/piperine preparations, seaweed/iodine, fermentation safety, high-sodium ingredients, coconut-rich recipes, and concentrated sweet snacks. Preserve the medical disclaimer and the official source links in the information screen.

### Semaine : conserver, cuisiner, archiver

- Un repas « conservé » (cadenas) garde son créneau, sa recette et ses portions à la génération suivante, reste hors du rééquilibrage budgétaire et n'est jamais dupliqué ailleurs dans la semaine. Un cadenas n'est jamais une raison de servir une recette qui viole une allergie, le régime, l'équipement ou le temps actif maximum : dans ce cas il est ignoré silencieusement et le créneau est régénéré (`preservableLockedMeals`).
- Le repère « cuisiné » (`PlannedMeal.completed`) est purement déclaratif : il alimente la progression de la semaine, ne modifie pas la liste de courses, et repart de zéro quand le repas est remplacé ou quand une semaine archivée est reprise.
- L'export de la liste de courses (partage natif, presse-papiers, fichier `.txt`) utilise `formatShoppingListText` : rayons en majuscules, quantités culinaires exactes suivies du conseil d'achat entre parenthèses, articles cochés ou en réserve résumés en pied de liste et jamais listés. La mention « quantités et prix indicatifs » reste dans le texte exporté.
- Reprendre une semaine archivée crée un nouveau menu daté de la semaine en cours : portions issues du profil actuel, repères « cuisiné » et cadenas remis à zéro. La reprise est refusée, avec explication visible, dès qu'un repas archivé ne correspond plus au profil ou que la semaine ne couvre pas tous les créneaux demandés (`inspectPlanReplay`).
- Chaque carte de repas affiche son coût estimé pour ses portions et ses allergènes déclarés (recette + ingrédients, normalisés sur les 14 allergènes réglementaires). L'absence d'allergène s'affiche explicitement et ne dispense pas de vérifier les étiquettes.
- Le temps de repos (`Recipe.restMinutes`, projeté depuis `temps.repos`) ne se mélange jamais au temps actif : à partir d'une heure il est signalé comme « repos à prévoir », à partir de quatre heures comme « à lancer la veille », avec un rappel sur l'accueil pour les repas du lendemain. Il n'entre pas dans le filtre `maxPrepMinutes`.
- Une semaine dont le lundi est antérieur de plus de six jours à la date du jour est archivée à l'ouverture, jamais affichée comme courante. L'accueil explique l'archivage.
- Les portions se règlent repas par repas (1 à 8) depuis la fiche d'un repas planifié ; courses et coût suivent immédiatement.
- Les restes (`PlannedMeal.leftoverOf`) rejouent un plat dans les deux jours qui suivent, sur un repas du même type. Ils ne se verrouillent pas, ne se re-cuisinent pas, suivent leur plat source en cas de remplacement, et n'allègent ni les courses ni le coût : cuisiner en double, c'est acheter en double. `PlanSummary.cookingSessions` compte les repas réellement cuisinés.
- Le bilan de la semaine décrit des habitudes d'organisation (légumineuses, poisson, céréales complètes, noix/graines, saison) et des moyennes estimatives par portion. Il ne doit jamais être présenté comme une évaluation nutritionnelle ou un avis médical.

### Catalogue, favoris et préférences durables

- `app.planner.eligible: false` est une décision de relecture par recette (sodium élevé, interaction connue, brouillon, ou catégorie d'appoint). Elle se rend visible via `plannerAvailabilityFor` — recette d'appoint ou exclusion éditoriale — et ne se contourne jamais, y compris pour la planification manuelle.
- Les favoris couvrent tout le catalogue. L'identifiant d'un favori de catalogue est `catalog-<id>`, identique à celui de la projection du planificateur, et les favoris non résolus sont conservés jusqu'au chargement du chunk catalogue.
- `UserProfile.dislikedRecipeIds` écarte durablement une recette de la génération, des remplacements, des reprises de semaine et des repas conservés. La liste est réversible depuis le profil.
- Le profil ne comporte pas de cible calorique : les valeurs nutritionnelles sont estimatives et un objectif chiffré suggérerait une précision que ces données n'ont pas.
- L'export de sauvegarde (`exportAppState` / `importAppState`) passe par la même migration que les données stockées, refuse les fichiers étrangers avec un message explicite, et remplace intégralement l'état local à la restauration.
- L'invite d'installation et le bandeau hors-ligne se contentent de refléter ce que le navigateur expose (`beforeinstallprompt`, `appinstalled`, `online`/`offline`). Ne jamais simuler un état d'installation ou de connectivité.
- Aucun favori n'est pré-coché : un favori est un choix de l'utilisateur, et il pèse désormais sur la génération. Les favoris apportent un bonus de préférence au score, jamais une dérogation aux filtres de sécurité ni aux objectifs hebdomadaires.
- `UserProfile.weeklyTargets` porte les fréquences visées (légumineuses, poisson), réglables de 0 à 7 dans le profil et reprises dans le bilan. Ne jamais recoder ces seuils en dur.
- `loadCatalogue` ne doit jamais mémoriser une promesse rejetée : le chunk catalogue est chargé à la demande et une seule coupure réseau condamnerait la session. L'échec s'affiche avec un bouton « Réessayer ».
- Les articles cochés de la liste de courses ne se vident qu'au changement de semaine (nouvelle génération, reprise, semaine périmée). Toute autre modification passe par `reconcileCheckedItems`, qui ne retire que les articles réellement disparus.
- Les motifs de remplacement doivent correspondre à leur libellé : « Autres ingrédients » éloigne les recettes qui partagent les ingrédients actuels, « Réutiliser mes ingrédients » les rapproche.
- Le service worker s'active immédiatement (`skipWaiting` + `clients.claim`) : `watchForAppUpdate` doit rester branché pour proposer un rechargement, sans quoi un onglet ouvert demande des chunks que le nouveau cache ne sert plus.
- Le mode cuisine demande le Wake Lock quand le navigateur l'expose, le redemande au retour au premier plan, et reste pleinement utilisable en cas de refus.

### Robustesse de l'état local

- Un plan stocké est une donnée non fiable : `normalizePlan` valide date, repas, créneaux et coût avant tout rendu, et écarte ce qui est invalide plutôt que de laisser planter l'écran. Ne jamais transtyper un plan directement depuis le stockage ou une sauvegarde.
- Les nombres du profil sont bornés à la persistance, pas seulement dans le formulaire : `typeof NaN` et `typeof Infinity` valent « number ».
- FlowStack rend les écrans empilés depuis la fermeture où ils ont été créés, et un changement d'état d'`AppShell` ne les re-rend pas. Les gestionnaires de ces écrans lisent donc `stateRef.current` et écrivent via un `setAppState` fonctionnel. Ne jamais transporter un `WeeklyPlan` en paramètre d'écran pour le réécrire ensuite.
- `ACTIVE_RECIPES` et `recipeById` forment le registre des recettes planifiables : catalogue relu plus recettes personnelles. `useRecipeRegistry` le rafraîchit dans `AppShell`; tout appel moteur passe par `ACTIVE_RECIPES`, jamais par `RECIPES` directement.

### Semaine, courses et préférences

- Un repas « hors foyer » (`skipped`) ne coûte rien, n'achète rien, ne se cuisine pas et sort de la progression. Un repas de restes ne se déplace pas sans son plat d'origine : `swapPlannedMeals` refuse et explique.
- `upcomingPlan` prépare la semaine suivante sans toucher à la semaine en cours ; elle est promue automatiquement à l'ouverture quand son lundi est arrivé.
- Le garde-manger accepte des quantités : elles sont déduites de la liste de courses dans la même unité seulement, sans conversion hasardeuse. Le budget réel saisi ne corrige jamais les estimations, il en mesure l'écart.
- La notation est à quatre états exclusifs : « j'aime » (bonus), « sans avis », « bof » (malus, jamais une exclusion), « ne plus proposer » (exclusion). Un seul état à la fois par recette.
- Les recettes personnelles portent le préfixe `perso-` et conservent les identifiants d'ingrédients canoniques, sans quoi la liste de courses cesse d'être juste.
- Les rappels sont produits localement à l'ouverture de l'application, une fois par jour, uniquement si l'autorisation a été accordée. Ne jamais laisser entendre qu'ils sont programmés côté serveur.
- Le catalogue complet n'est pas préchargé : il se télécharge à la demande depuis l'écran Informations. Toute formulation sur le hors-ligne doit rester exacte sur ce point.
- `UserProfile.dayConstraints` personnalise un jour avant génération : plafond de temps actif, portions et créneaux hors foyer. Une contrainte quotidienne ne contourne jamais les allergies, le régime ou l’équipement. Les échanges et planifications manuelles doivent aussi respecter le plafond du jour.
- « Que cuisiner ce soir ? » classe toutes les recettes compatibles de `ACTIVE_RECIPES`, en affiche six puis six de plus à la demande. Le garde-manger, les favoris, la saison et le coût influencent l’ordre, jamais les filtres de sécurité.
- La présence se règle par repas dans `DayConstraint.mealPortions` : un déjeuner peut accueillir un nombre de personnes différent du dîner. Ce réglage pilote les portions générées, les coûts et les courses; `DayConstraint.portions` reste le repli compatible des anciens profils.
- La liste de courses fusionne automatiquement les variantes typographiques strictes d’un même nom (accents, apostrophes, casse) et utilise les correspondances éditoriales pour les synonymes ou pluriels connus. Ne jamais déduire une équivalence culinaire ambiguë par simple ressemblance de texte.
- Un état sans recette explique les critères réellement bloquants (temps, équipement, régime, allergies, exclusions, préférences ou variété déjà utilisée). Il peut proposer d’augmenter le temps ou de vérifier l’équipement, mais ne relâche jamais automatiquement allergies, exclusions ni régime.
- Les rappels contextuels couvrent les repos à lancer le jour même ou la veille et les restes prévus aujourd’hui. Ils sont visibles sur l’accueil et notifiés au plus une fois par date quand l’application est ouverte.
- La diversité végétale compte les végétaux distincts, légumineuses, céréales, herbes et épices de la semaine, en excluant notamment eau, sel, huiles, bouillons, sucrants et produits animaux. C’est un indicateur descriptif transparent, jamais un score de santé ni un objectif médical.
- Une substitution applicable est une règle relue et structurée, jamais une suggestion libre : elle conserve l’unité culinaire, recalcule quantités, allergènes déclarés, coût estimé et courses, suit les restes liés, et ne peut introduire un allergène ou ingrédient exclu par le profil. Les étiquettes et traces restent à vérifier.
- Le mode magasin simplifié réutilise la même liste de courses : un seul rayon à la fois, texte et cibles tactiles agrandis, navigation précédent/suivant et cases faciles à cocher d’une main. Il ne crée aucun second état de courses.

In ChatGPT Work Mode, run `sites-preview start "$PWD"`, open `http://terminal.local:4173/` in the cloud browser, and verify the rendered app and its primary interactions. Keep that preview open and tell the user to inspect it in the cloud browser; do not present the local URL as a user-facing chat link. In Codex Desktop, run the local server yourself, open the preview in the in-app browser, and provide the clickable local URL. Do not deploy to Sites unless the user explicitly asks to share, publish, or deploy. Do not give the user server-start instructions when you can run it.

Before planning or implementing any mobile-app change, read this `AGENTS.md` in full. It is the source of truth for the template's runtime and component guidance.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Editing Boundary

- Build app-specific UI in `src/Prototype.tsx` and `src/prototype.css`.
- Treat `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `src/mobile/`, `public/assets/iphone/`, `public/assets/android/`, `public/assets/status/`, `vite.config.ts`, `worker/index.js`, and `scripts/prepare-sites-build.mjs` as protected runtime files. Do not edit, replace, remove, or recreate them unless the user explicitly asks to change the mobile runtime itself. For an explicit runtime change, update the affected lock hashes only after verifying the new runtime behavior.
- Run `npm run check:runtime` before preview or handoff. If it fails, restore the protected runtime instead of weakening or bypassing the check.
- `npm run build` preserves the mobile runtime and prepares the static Cloudflare Worker output required by Sites. Before a Sites handoff, confirm `dist/client/index.html`, `dist/server/index.js`, `dist/.openai/hosting.json`, and source `.openai/hosting.json` exist, then run `npm run test:sites`. Do not replace this project with a Vinext starter.

## Runtime Contract

- Preserve the mobile device runtime unless the user's task explicitly asks otherwise. Do not replace it with a standalone page. Visual fidelity applies to app-owned content inside the device screen, not to template-owned device chrome.
- Keep `App` composed around `PhoneFrame` -> `KeyboardProvider`, with `StatusBar`, app content, `HomeIndicator`, and `KeyboardDock` mounted inside the phone frame. `StatusBar` and the iOS home indicator are overlaid device chrome. When the Android keyboard is closed, the app viewport reserves the protected navigation-bar region instead of painting behind it. When the Android keyboard is open, preserve the current full-screen keyboard layout: its asset includes the IME navigation strip and the separate black navigation bar is hidden. iOS screens continue to paint behind the home-indicator area and own their safe-area content padding.
- Preserve the `iPhone` / `Pixel 10` device picker and both calibrated device presets. The Pixel screen is `427 x 952`; its `32 x 32` camera circle and `public/assets/android/navigation-bar.svg` bottom navigation bar are protected device chrome, not app content.
- Preserve the device picker's intentionally lightweight Codex styling in the top-right corner: its trigger wrapper is borderless and transparent, its trigger sizes to content, and its right-aligned menu uses the compact 3px inset plus the specified hairline and elevation shadow layers. Keep the prototype root and default app screen white.
- Preserve `StatusBar` as live device chrome, including its platform-specific typography, source status-icon assets, and spacing. Pixel 10 uses Roboto, Android indicators, and 32px top, left, and right padding. iPhone uses its iOS indicators, system typography, and calibrated spacing. Do not hardcode screenshot times like `9:41` into the status bar, replace its real-time clock, or move status bar content into app markup unless the user explicitly asks for a fixed/mock device time.
- `PhoneFrame` owns the calibrated device frame, screen portal, device picker, camera cutout, and custom cursor. Keep device assets in `public/assets/iphone/` and `public/assets/android/`; if an asset fails to load, repair the asset path or restore the asset instead of removing the frame, keyboard, or image render.
- Use `MobileScroll` directly for simple single-screen prototypes. Use `FlowStack` for conventional multi-screen flows whose routes can own their fixed header and footer; when using it, define each route as a `FlowScreen`: `{ id, header?, headerHeight?, footer?, footerHeight?, render }`, and use `flow.push(screen)`, `flow.pop()`, and `flow.replace(screen)` from `FlowStack` render callbacks or `useFlow()` instead of introducing another router.
- Use `Carousel` for a carousel, horizontal rail, swipeable cards, image or media strip, horizontally scrollable cards, chip rail, or other horizontal collection.
- For a layered app shell—such as a persistent composer, independently presented sheet, pushed/peek sidebar, or app-wide transition—compose directly in `Prototype.tsx` rather than forcing it through `FlowStack`. Keep app-owned fixed chrome as sibling layers outside `MobileScroll`.
- When using `FlowScreen`, put route-owned fixed headers or footers in `FlowScreen.header` or `FlowScreen.footer`. Set `headerHeight` to the visible app-toolbar height; `FlowStack` adds the device's top safe-area/status-bar inset automatically. Do not include `StatusBar` or its height in the header. Set `footerHeight` to the full app-footer height. `FlowScreen.footer` is an overlay, not reserved layout space; screens using it must add their own bottom content padding such as `padding-bottom: calc(var(--flow-footer-height) + var(--mobile-safe-area-height) + 24px)` so final content can scroll above the footer while still painting behind it.
- Render only scrollable content inside `MobileScroll`; it is for content that should move with scroll and rubber-band overscroll. Keep app-owned headers, nav bars, tabs, composers, and overlays outside it. This keeps scroll physics, safe areas, keyboard insets, scrollbars, and drag click suppression active without letting content paint under fixed chrome.
- Buttons, links, cards, and images inside `MobileScroll` should still allow drag scrolling when the pointer moves beyond tap slop. Use `data-scroll-drag="ignore"` only for rare controls that must own the drag gesture themselves.
- Do not add `var(--keyboard-height)` to ordinary screen/content padding inside `MobileScroll`; the scroll viewport already shrinks above the simulated keyboard. For custom fixed composers, search bars, or toast chrome, use `useKeyboardInsets().bottomInset`. It is relative to the app viewport: Android returns `0` while the closed-keyboard viewport already reserves navigation, then returns the keyboard height while open; iOS continues to clear the home indicator while closed and ride directly above the keyboard while open. Do not pin custom bottom chrome to `bottom: 0` or only `keyboardHeight`.
- Use `KeyboardInput`, `KeyboardTextarea`, or `MobileTextField` for every text-entry control. A raw `input` or `textarea` disconnects focus, keyboard animation, safe-area insets, and attached surfaces.
- Use `BottomSheet` for phone-scoped sheets. Its props are `open`, `onOpenChange`, `title`, optional `description`, optional `snap`, and `children`; it renders through the phone screen portal and dismisses the keyboard before opening.

## Horizontal Carousels

- Use `Carousel` for horizontally draggable cards, images, media, chips, or other horizontal collections. Do not recreate these with `overflow-x`, custom pointer handlers, or a generic div.
- `Carousel` can be nested directly inside `MobileScroll`. It owns horizontal gestures and automatically yields vertical gestures to the parent.
- Never put `data-scroll-drag="ignore"` on or around a `Carousel`; doing so prevents vertical parent scrolling when a gesture begins inside it.
- Do not add CSS scroll snapping to `Carousel`; its runtime owns momentum and release motion.
- Use `data-scroll-drag="ignore"` only when a control must prevent parent scrolling in every drag direction.

See `src/mobile/COMPONENTS.md` for the full component and gesture contract.

## Keyboard Rule

The simulated keyboard is a separate top-layer component. Before presenting anything that behaves like iOS navigation or modal UI, dismiss it first.

Call `keyboard.hide()` before:

- pushing, popping, or replacing FlowStack routes
- opening bottom sheets, action sheets, dialogs, menus, or navigation sheets
- starting transitions where the destination should not inherit text-input focus

`FlowStack` already hides the keyboard for `push`, `pop`, and `replace`. `BottomSheet` already hides it before opening. If you add new modal/sheet/navigation primitives, follow the same rule.

When a composer, search surface, or other keyboard-attached component closes, call `keyboard.hide()` in the same event before changing that component's open state. Position attached surfaces from `useKeyboardInsets()` rather than a separate timer or visibility flag so both dismiss together.

When any text-entry control loses focus, dismiss the simulated keyboard. If the control is custom or does not use the runtime's keyboard-aware fields, handle its blur event and call `keyboard.hide()` explicitly. Keep the keyboard open only when focus is moving directly to another text-entry control that should share the same keyboard session.

## Interaction Rules

- Do not trigger buttons or inputs after a pointer has become a drag. Preserve the drag suppression behavior in `MobileScroll`.
- Do not allow native browser image/file dragging inside the phone frame. Preserve the phone-level `dragstart` suppression and non-draggable image styles so scroll drags that begin on images still scroll the prototype.
- Use `KeyboardInput`, `KeyboardTextarea`, or `MobileTextField` for text entry so the simulated keyboard and safe-area insets stay connected.
- Fixed phone chrome should not animate with pushed screens. Screen content can animate; the status bar, camera cutout, and preview chrome should stay put.
- Keep the keyboard below the home indicator/safe area layer in z-index, and above ordinary app UI while visible.
- Keep the home indicator as the topmost safe-area layer in the z-index above everything else in the prototype.
