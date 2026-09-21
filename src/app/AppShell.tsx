import { type FlowControls, type FlowScreen, MobileScroll } from "../mobile";
import { useState, useSyncExternalStore, useEffect, useMemo, useCallback, useRef } from "react";
import { type WeeklyPlan, type Recipe, type PlannedMeal, type PantryAmount, type IngredientCategory } from "../domain";
import { normalizeCustomRecipe, loadAppState, HISTORY_LIMIT, watchForStoredState, saveAppState, StoredStateReadError, type AppState } from "../storage";
import { refreshPlanEstimate, reconcileCheckedItems, isPlanExpired, planDayOffset, inspectActivePlan, contextualRemindersForDate, preservableLockedMeals, setPlannedMealLock, setMealSkipped, setPlannedMealCompleted, getReplacementCandidates, replacePlannedMeal, assignRecipeToSlot, setMealPortions, ingredientsForPlannedMeal, setMealIngredientSubstitution, restorePlan, planLeftover, swapPlannedMeals } from "../engine";
import { type CatalogueData, loadCatalogue, type CatalogueRecipe, catalogueFavoriteId, catalogueImageFor, visibleCatalogueRecipes } from "../catalog";
import { storedShoppingItemMatches, shoppingIdentityFor } from "../shopping";
import { CalendarIcon, ArrowLeftIcon, ReloadIcon, Cross2Icon } from "@radix-ui/react-icons";
import { catalogueShoppingRecipe } from "../personal-library";
import { type SavedMeal } from "../saved-meals";
import { type CompositionTarget, composeMeal, updatePlannedComposition } from "../composed-meal";
import { evaluateAssociationMeal } from "../food-associations";
import { type AppStateStore } from "./app-state-store";
import { type TabId, type RecipeRating } from "./types";
import { useInstallAndConnectivity } from "./useInstallAndConnectivity";
import { useRecipeRegistry, recipesForState, recipeById, ACTIVE_RECIPES } from "./recipe-registry";
import { isoDate, mondayOf, formatWeekRange } from "../components/format";
import { makePlan } from "./planning";
import { mealActionTarget, matchingActionMeal, STALE_MEAL_ACTION } from "./meal-actions";
import { Header } from "../components/Header";
import { LiveAppState } from "./LiveAppState";
import { StaleMealAction } from "../components/StaleMealAction";
import { ReplaceView } from "../screens/ReplaceView";
import { PrepareWeekForMeal, PlanSlotView } from "../screens/PlanSlotView";
import { EmptyRoot } from "../components/EmptyRoot";
import { popFlowToRoot } from "./navigation";
import { CustomRecipeView, customRecipeFrom } from "../screens/CustomRecipeView";
import { CookingView } from "../screens/CookingView";
import { RecipeView } from "../screens/RecipeView";
import { RecipeTools, availabilityForShopping, CollectionsView } from "../screens/CollectionsView";
import { mealBuilderGroupFor, mealBuilderEligible, MEAL_BUILDER_GROUPS, MealBuilderView } from "../screens/MealBuilderView";
import { HistoryPlanView } from "../screens/HistoryPlanView";
import { CatalogueRecipeView } from "../screens/CatalogueRecipeView";
import { Wordmark } from "../components/Wordmark";
import { MEAL_LABELS, DAY_LABELS } from "../components/constants";
import { InformationView } from "../screens/InformationView";
import { ProfileView } from "../screens/ProfileView";
import { GenerateView } from "../screens/GenerateView";
import { TonightView } from "../screens/TonightView";
import { LeftoverView } from "../screens/LeftoverView";
import { SwapView } from "../screens/SwapView";
import { WeekView } from "../screens/WeekView";
import { CoursesView } from "../screens/CoursesView";
import { RecipesView } from "../screens/RecipesView";
import { OnboardingView, HomeView } from "../screens/HomeView";
import { BottomNav } from "../components/BottomNav";

export function AppShell({ flow, appStore }: { flow: FlowControls; appStore: AppStateStore }) {
  const [tab, setTab] = useState<TabId>("home");
  const appState = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("is-large-text", appState.textScale === "large");
    return () => root.classList.remove("is-large-text");
  }, [appState.textScale]);
  const setAppState = appStore.setState;
  const replaceAppState = appStore.replaceState;
  const hydrateAppState = appStore.hydrateState;
  const mergeAppState = appStore.mergeState;
  const [hydrated, setHydrated] = useState(false);
  const [startupError, setStartupError] = useState<Error | null>(null);
  const [archivedWeek, setArchivedWeek] = useState<WeeklyPlan | null>(null);
  const [appNotice, setAppNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const { offline, canInstall, install, updateReady, reload } = useInstallAndConnectivity();
  const registeredPersonalRecipes = useMemo(() => [...appState.customRecipes, ...appState.composedRecipes], [appState.customRecipes, appState.composedRecipes]);
  const activeRecipeSnapshot = useRecipeRegistry(registeredPersonalRecipes);

  const rateRecipe = (recipeId: string, rating: RecipeRating) => setAppState((current) => {
    const favorites = current.favoriteRecipeIds.filter((id) => id !== recipeId);
    const disliked = current.profile.dislikedRecipeIds.filter((id) => id !== recipeId);
    const softDisliked = current.profile.softDislikedRecipeIds.filter((id) => id !== recipeId);
    return {
      ...current,
      favoriteRecipeIds: rating === "loved" ? [...favorites, recipeId] : favorites,
      profile: {
        ...current.profile,
        dislikedRecipeIds: rating === "avoided" ? [...disliked, recipeId] : disliked,
        softDislikedRecipeIds: rating === "meh" ? [...softDisliked, recipeId] : softDisliked,
      },
    };
  });
  const ratingOf = (recipeId: string): RecipeRating => {
    const live = appStore.getSnapshot();
    if (live.profile.dislikedRecipeIds.includes(recipeId)) return "avoided";
    if (live.profile.softDislikedRecipeIds.includes(recipeId)) return "meh";
    if (live.favoriteRecipeIds.includes(recipeId)) return "loved";
    return "neutral";
  };
  const setRecipeNote = (recipeId: string, note: string) => setAppState((current) => {
    const notes = { ...current.recipeNotes };
    if (note.trim()) notes[recipeId] = note.slice(0, 2000); else delete notes[recipeId];
    return { ...current, recipeNotes: notes };
  });
  const saveCustomRecipe = (recipe: Recipe, generation: string, previous?: Recipe) => {
    const normalized = normalizeCustomRecipe(recipe);
    if (!normalized) throw new Error("Cette recette est invalide. La version précédente est conservée.");
    setAppState((current) => {
      const existing = current.customRecipes.find((item) => item.id === recipe.id);
      if (current.storageGeneration !== generation || JSON.stringify(existing) !== JSON.stringify(previous)) {
        throw new Error("Cette recette ou vos données ont changé. Rouvrez la recette avant de l’enregistrer.");
      }
      if (!existing && current.customRecipes.length >= 200) throw new Error("La limite de 200 recettes personnelles est atteinte.");
      const next = { ...current, customRecipes: [...current.customRecipes.filter((item) => item.id !== recipe.id), normalized] };
      const recipes = recipesForState(next);
      return {
        ...next,
        currentPlan: next.currentPlan ? refreshPlanEstimate(next.currentPlan, recipes) : null,
        upcomingPlan: next.upcomingPlan ? refreshPlanEstimate(next.upcomingPlan, recipes) : null,
        checkedShoppingItemIds: next.currentPlan ? reconcileCheckedItems(next.currentPlan, recipes, next.checkedShoppingItemIds) : next.checkedShoppingItemIds,
      };
    });
    return normalized;
  };
  const deleteCustomRecipe = (recipeId: string) => setAppState((current) => {
    const recipeNotes = { ...current.recipeNotes };
    delete recipeNotes[recipeId];
    return {
      ...current,
      customRecipes: current.customRecipes.filter((item) => item.id !== recipeId),
      favoriteRecipeIds: current.favoriteRecipeIds.filter((id) => id !== recipeId),
      recipeNotes,
      profile: {
        ...current.profile,
        dislikedRecipeIds: current.profile.dislikedRecipeIds.filter((id) => id !== recipeId),
        softDislikedRecipeIds: current.profile.softDislikedRecipeIds.filter((id) => id !== recipeId),
      },
    };
  });
  const [catalogue, setCatalogue] = useState<CatalogueData | null>(null);
  const [catalogueError, setCatalogueError] = useState(false);
  const [catalogueAttempt, setCatalogueAttempt] = useState(0);
  const ensureCatalogue = useCallback(() => {
    if (catalogue) return;
    setCatalogueError(false);
    void loadCatalogue().then(setCatalogue).catch(() => setCatalogueError(true));
  }, [catalogue, catalogueAttempt]);
  const retryCatalogue = useCallback(() => {
    setCatalogueError(false);
    setCatalogueAttempt((value) => value + 1);
    void loadCatalogue().then(setCatalogue).catch(() => setCatalogueError(true));
  }, []);

  useEffect(() => {
    let active = true;
    void loadAppState().then((stored) => {
      if (!active) return;
      // Catalogue-only favourites and restored personal recipes are kept even
      // before the lazy catalogue or live recipe registry has finished updating.
      const storedCustomRecipeIds = new Set(stored.customRecipes.map((recipe) => recipe.id));
      const validFavorites = stored.favoriteRecipeIds.filter((id) =>
        recipeById.has(id) || storedCustomRecipeIds.has(id) || id.startsWith("catalog-"),
      );
      const today = isoDate(new Date());
      const expired = stored.currentPlan;
      // A finished week must not keep posing as the current one: archive it, and
      // promote the week prepared in advance if it covers the days ahead.
      if (expired && isPlanExpired(expired, today)) {
        const promoted = stored.upcomingPlan && !isPlanExpired(stored.upcomingPlan, today) && planDayOffset(stored.upcomingPlan, today) >= 0 ? stored.upcomingPlan : null;
        setArchivedWeek(expired);
        setAppState({
          ...stored,
          favoriteRecipeIds: validFavorites,
          currentPlan: promoted,
          upcomingPlan: promoted ? null : stored.upcomingPlan,
          history: [expired, ...stored.history.filter((item) => item.id !== expired.id)].slice(0, HISTORY_LIMIT),
          checkedShoppingItemIds: [],
        });
      } else if (!expired && stored.upcomingPlan && !isPlanExpired(stored.upcomingPlan, today) && planDayOffset(stored.upcomingPlan, today) >= 0) {
        setAppState({ ...stored, favoriteRecipeIds: validFavorites, currentPlan: stored.upcomingPlan, upcomingPlan: null });
      } else {
        const restored = { ...stored, favoriteRecipeIds: validFavorites };
        const favoritesUnchanged = validFavorites.length === stored.favoriteRecipeIds.length
          && validFavorites.every((id, index) => id === stored.favoriteRecipeIds[index]);
        if (favoritesUnchanged) hydrateAppState(restored);
        else setAppState(restored);
      }
      setHydrated(true);
    }).catch((error: unknown) => {
      if (active) setStartupError(error instanceof Error ? error : new Error("Impossible de lire les données locales."));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => watchForStoredState((incoming) => {
    if (mergeAppState(incoming)) {
      setAppNotice("Les modifications d’un autre onglet ont été synchronisées.");
    }
  }), [appStore, mergeAppState]);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void saveAppState(appState).then((result) => {
      if (!active) return;
      if (mergeAppState(result.state)) {
        setAppNotice("Les données locales les plus récentes ont été synchronisées.");
      }
      setStorageWarning(result.localSaved && result.indexedSaved ? "" : "Vos données sont enregistrées dans un seul stockage local. Exportez une sauvegarde par précaution.");
    }).catch((error: unknown) => {
      if (active) setStorageWarning(error instanceof StoredStateReadError
        ? "Une copie locale est illisible ou provient d’une version plus récente. L’enregistrement est suspendu pour la préserver. Exportez vos changements depuis À propos avant de fermer la page."
        : "Impossible d’enregistrer vos changements sur cet appareil. Exportez vos données avant de fermer la page.");
    });
    return () => { active = false; };
  }, [appState, hydrated, mergeAppState]);

  useEffect(() => {
    if (!hydrated) return;
    const rollPlans = () => {
      const today = isoDate(new Date());
      setAppState((current) => {
        const activeCurrent = current.currentPlan && !isPlanExpired(current.currentPlan, today) ? current.currentPlan : null;
        const expiredCurrent = current.currentPlan && !activeCurrent ? current.currentPlan : null;
        const expiredUpcoming = current.upcomingPlan && isPlanExpired(current.upcomingPlan, today) ? current.upcomingPlan : null;
        const upcomingReady = current.upcomingPlan && !expiredUpcoming && planDayOffset(current.upcomingPlan, today) >= 0
          ? current.upcomingPlan
          : null;
        const promoted = !activeCurrent ? upcomingReady : null;
        if (!expiredCurrent && !expiredUpcoming && !promoted) return current;

        const archived = [expiredCurrent, expiredUpcoming].filter((plan): plan is WeeklyPlan => Boolean(plan));
        if (expiredCurrent || expiredUpcoming) setArchivedWeek(expiredCurrent ?? expiredUpcoming);
        const archivedIds = new Set(archived.map((plan) => plan.id));
        return {
          ...current,
          currentPlan: activeCurrent ?? promoted,
          upcomingPlan: promoted || expiredUpcoming ? null : current.upcomingPlan,
          history: [...archived, ...current.history.filter((plan) => !archivedIds.has(plan.id))].slice(0, HISTORY_LIMIT),
          checkedShoppingItemIds: expiredCurrent || promoted ? [] : current.checkedShoppingItemIds,
        };
      });
    };
    rollPlans();
    const interval = window.setInterval(rollPlans, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") rollPlans(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [hydrated, setAppState]);

  useEffect(() => {
    if (!hydrated) return;
    setAppState((current) => {
      const recipes = recipesForState(current);
      const currentSafe = !current.currentPlan || inspectActivePlan(current.currentPlan, recipes, current.profile).canActivate;
      const upcomingSafe = !current.upcomingPlan || inspectActivePlan(current.upcomingPlan, recipes, current.profile).canActivate;
      const currentPlan = currentSafe && current.currentPlan ? refreshPlanEstimate(current.currentPlan, recipes) : null;
      const upcomingPlan = upcomingSafe && current.upcomingPlan ? refreshPlanEstimate(current.upcomingPlan, recipes) : null;
      if (currentSafe && upcomingSafe) return currentPlan === current.currentPlan && upcomingPlan === current.upcomingPlan
        ? current : { ...current, currentPlan, upcomingPlan };
      const removed = [!currentSafe ? current.currentPlan : null, !upcomingSafe ? current.upcomingPlan : null]
        .filter((plan): plan is WeeklyPlan => Boolean(plan));
      const removedIds = new Set(removed.map((plan) => plan.id));
      setAppNotice("Une semaine incompatible avec votre profil a été déplacée dans l’historique.");
      return {
        ...current,
        currentPlan,
        upcomingPlan,
        history: [...removed, ...current.history.filter((plan) => !removedIds.has(plan.id))].slice(0, HISTORY_LIMIT),
        checkedShoppingItemIds: currentSafe ? current.checkedShoppingItemIds : [],
      };
    });
  }, [hydrated, appState.currentPlan, appState.upcomingPlan, appState.profile, appState.customRecipes, appState.composedRecipes]);

  // Local contextual digest. Fires once per day while the app is open: nothing
  // is scheduled on a server and failure never blocks the application.
  const remindedOn = useRef<string>("");
  useEffect(() => {
    if (!hydrated || !appState.remindersEnabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const today = isoDate(new Date());
    const reminderStorageKey = "inflamm-menu:reminded-on";
    if (remindedOn.current === today) return;
    try { if (window.localStorage.getItem(reminderStorageKey) === today) return; } catch { /* Storage access may be denied; the in-memory guard remains available. */ }
    const due = contextualRemindersForDate(appState.currentPlan, ACTIVE_RECIPES, today);
    if (!due.length) return;
    remindedOn.current = today;
    const showReminder = async () => {
      const options = {
        body: due.map((item) => `${item.title} — ${item.body}`).join("\n"),
        tag: `inflamm-menu-${today}`,
      };
      try {
        const registration = "serviceWorker" in navigator
          ? await navigator.serviceWorker.getRegistration()
          : undefined;
        if (registration?.showNotification) await registration.showNotification("Vos rappels cuisine", options);
        else new Notification("Vos rappels cuisine", options);
        remindedOn.current = today;
        try { window.localStorage.setItem(reminderStorageKey, today); } catch { /* In-memory guard still prevents repeats. */ }
      } catch {
        remindedOn.current = "";
        // A revoked or platform-level permission must not break the application.
      }
    };
    void showReminder();
  }, [hydrated, appState.remindersEnabled, appState.currentPlan]);

  const toggleFavorite = (id: string) => setAppState((current) => ({ ...current, favoriteRecipeIds: current.favoriteRecipeIds.includes(id) ? current.favoriteRecipeIds.filter((entry) => entry !== id) : [...current.favoriteRecipeIds, id] }));
  const toggleChecked = (id: string) => setAppState((current) => {
    const checked = [...current.checkedShoppingItemIds, ...current.extraShoppingCheckedIds].some((entry) => storedShoppingItemMatches(entry, id));
    const withoutIngredient = current.checkedShoppingItemIds.filter((entry) => !storedShoppingItemMatches(entry, id));
    const belongsToExtras = current.shoppingRecipes.some((entry) => entry.recipe.ingredients.some((item) => storedShoppingItemMatches(item.id, id)));
    const extraWithout = current.extraShoppingCheckedIds.filter((entry) => !storedShoppingItemMatches(entry, id));
    return { ...current, extraShoppingCheckedIds: !checked && belongsToExtras ? [...extraWithout, shoppingIdentityFor(id).shoppingId] : extraWithout, checkedShoppingItemIds: checked ? withoutIngredient : [...withoutIngredient, shoppingIdentityFor(id).shoppingId] };
  });
  const togglePantry = (id: string) => setAppState((current) => {
    const shoppingId = shoppingIdentityFor(id).shoppingId;
    const inPantry = current.pantryIngredientIds.some((entry) => shoppingIdentityFor(entry).shoppingId === shoppingId);
    const withoutIngredient = current.pantryIngredientIds.filter((entry) => shoppingIdentityFor(entry).shoppingId !== shoppingId);
    return { ...current, pantryIngredientIds: inPantry ? withoutIngredient : [...withoutIngredient, shoppingId] };
  });

  function createPlan(target: "current" | "upcoming" = "current"): WeeklyPlan {
    const live = appStore.getSnapshot();
    const monday = mondayOf();
    if (target === "upcoming") monday.setDate(monday.getDate() + 7);
    const plan = makePlan(
      live.profile,
      // Preparing next week never disturbs the running one.
      target === "upcoming" ? [] : preservableLockedMeals(live.currentPlan, ACTIVE_RECIPES, live.profile),
      live.favoriteRecipeIds,
      Date.now(),
      isoDate(monday),
    );
    setAppState((current) => (target === "upcoming"
      ? { ...current, upcomingPlan: plan }
      : {
          ...current,
          currentPlan: plan,
          history: current.currentPlan ? [current.currentPlan, ...current.history.filter((item) => item.id !== current.currentPlan?.id)].slice(0, HISTORY_LIMIT) : current.history,
          checkedShoppingItemIds: [],
        }));
    return plan;
  }

  /**
   * Applies a change to the running week. Ticked shopping items are kept when
   * they still belong to the list, so editing a meal in the shop is harmless.
   */
  const withUpdatedPlan = (current: AppState, plan: WeeklyPlan, recipes: readonly Recipe[] = ACTIVE_RECIPES): AppState => ({
    ...current,
    currentPlan: plan,
    checkedShoppingItemIds: reconcileCheckedItems(plan, recipes, current.checkedShoppingItemIds),
  });

  const toggleMealLock = (planned: PlannedMeal) => setAppState((current) => (current.currentPlan
    ? { ...current, currentPlan: setPlannedMealLock(current.currentPlan, planned.id, planned.locked !== true) }
    : current));
  const setPantryAmount = (id: string, unit: PantryAmount["unit"], quantity: number | null) => setAppState((current) => {
    const amounts = { ...current.pantryAmounts };
    for (const [storedId, storedAmount] of Object.entries(amounts)) {
      if (storedShoppingItemMatches(storedId, id) && storedAmount.unit === unit) delete amounts[storedId];
    }
    if (quantity !== null) amounts[`${shoppingIdentityFor(id).shoppingId}:${unit}`] = { quantity, unit };
    return { ...current, pantryAmounts: amounts };
  });
  const moveCategory = (category: IngredientCategory, direction: -1 | 1) => setAppState((current) => {
    const order = [...current.shoppingCategoryOrder];
    const index = order.indexOf(category);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return current;
    [order[index], order[target]] = [order[target], order[index]];
    return { ...current, shoppingCategoryOrder: order };
  });
  const setSpent = (amount: number | null) => setAppState((current) => {
    if (!current.currentPlan) return current;
    const spend = { ...current.actualSpend };
    if (amount === null) delete spend[current.currentPlan.id]; else spend[current.currentPlan.id] = amount;
    return { ...current, actualSpend: spend };
  });
  const toggleMealSkipped = (planned: PlannedMeal) => {
    try {
      setAppState((current) => (current.currentPlan
        ? withUpdatedPlan(current, setMealSkipped(current.currentPlan, planned.id, planned.skipped !== true, ACTIVE_RECIPES))
        : current));
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : "Impossible de modifier ce repas.");
    }
  };
  const toggleMealCompleted = (planned: PlannedMeal) => setAppState((current) => (current.currentPlan
    ? { ...current, currentPlan: setPlannedMealCompleted(current.currentPlan, planned.id, planned.completed !== true) }
    : current));

  function replacementScreen(planned: PlannedMeal): FlowScreen {
    const openedState = appStore.getSnapshot();
    const target = mealActionTarget(openedState.currentPlan, planned, openedState.storageGeneration);
    return { id: `replace-${planned.id}`, title: "Remplacer le repas", headerHeight: 56, header: (route) => <Header title="Remplacer" onBack={route.pop} />, render: (route) => <LiveAppState store={appStore}>{(liveState) => {
      const plan = liveState.currentPlan;
      const source = matchingActionMeal(plan, target, liveState.storageGeneration);
      if (!plan || !source) return <StaleMealAction />;
      return <ReplaceView plan={plan} current={source} profile={liveState.profile} onConfirm={(recipe, options) => {
        try {
          setAppState((current) => {
            const liveSource = matchingActionMeal(current.currentPlan, target, current.storageGeneration);
            if (!current.currentPlan || !liveSource) throw new Error(STALE_MEAL_ACTION);
            const recipes = recipesForState(current);
            // Recheck the latest profile and registry, even if an old click
            // arrived before React painted a newly synchronized candidate list.
            const replacement = getReplacementCandidates(current.currentPlan, liveSource.id, recipes, current.profile)
              .find((candidate) => candidate.id === recipe.id);
            if (!replacement) throw new Error("Cette recette n’est plus disponible pour ce repas. Choisissez une autre proposition.");
            const updatedPlan = replacePlannedMeal(current.currentPlan, liveSource.id, replacement, recipes);
            if (!inspectActivePlan(updatedPlan, recipes, current.profile).canActivate) {
              throw new Error("Ce remplacement ne respecte plus votre profil ou les contraintes de la semaine.");
            }
            return {
              ...withUpdatedPlan(current, updatedPlan, recipes),
              profile: options.dislikeCurrent && !current.profile.dislikedRecipeIds.includes(liveSource.recipeId)
                ? { ...current.profile, dislikedRecipeIds: [...current.profile.dislikedRecipeIds, liveSource.recipeId] }
                : current.profile,
            };
          });
          route.pop();
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : "Impossible de remplacer ce repas.";
        }
      }} />;
    }}</LiveAppState> };
  }

  function planSlotScreen(recipe: Recipe): FlowScreen {
    return { id: `plan-${recipe.id}`, title: "Planifier", headerHeight: 56, header: (route) => <Header title="Planifier" onBack={route.pop} />, render: (route) => <LiveAppState store={appStore}>{(liveState) => {
      const plan = liveState.currentPlan;
      if (!plan && recipe.composition) return <PrepareWeekForMeal onProfile={openProfile} onCreate={() => { if (!appStore.getSnapshot().currentPlan) createPlan("current"); }} />;
      if (!plan) return <EmptyRoot icon={CalendarIcon} title="Aucune semaine" body="Générez une semaine avant d’y placer une recette." />;
      return <PlanSlotView onProfile={openProfile} plan={plan} recipe={recipe} profile={liveState.profile} onConfirm={(slot, portions) => {
        const live = appStore.getSnapshot();
        if (!live.currentPlan) return "Cette semaine n’est plus disponible.";
        try {
          if (recipe.composition && live.composedRecipes.length >= 200 && !live.composedRecipes.some((item) => item.id === recipe.id)) return "La limite de 200 repas planifiés enregistrés est atteinte.";
          const registry = recipe.composition ? [...ACTIVE_RECIPES.filter((item) => item.id !== recipe.id), recipe] : ACTIVE_RECIPES;
          let updated = assignRecipeToSlot(live.currentPlan, slot, recipe, registry, live.profile);
          const target = updated.meals.find((meal) => meal.dayIndex === slot.dayIndex && meal.mealType === slot.mealType)!;
          if (recipe.composition) updated = setMealPortions(updated, target.id, portions, registry);
          setAppState((current) => ({ ...current, currentPlan: updated, checkedShoppingItemIds: reconcileCheckedItems(updated, registry, current.checkedShoppingItemIds), composedRecipes: recipe.composition ? [...current.composedRecipes.filter((item) => item.id !== recipe.id), recipe] : current.composedRecipes }));
          setTab("week");
          popFlowToRoot(route);
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : "Impossible de planifier cette recette.";
        }
      }} />;
    }}</LiveAppState> };
  }

  function customRecipeScreen(draft: Recipe, existing = false, planned?: PlannedMeal): FlowScreen {
    const generation = appStore.getSnapshot().storageGeneration;
    const cancellation = new AbortController();
    return { id: `custom-${draft.id}`, title: "Ma version", headerHeight: 56, header: (route) => <Header title="Ma version" onBack={() => { cancellation.abort(); route.pop(); }} />, render: (route) => <CustomRecipeView draft={draft} signal={cancellation.signal} onSave={async (recipe) => { const saved = saveCustomRecipe(recipe, generation, existing ? draft : undefined); route.replace(recipeScreen(saved, planned)); }} onDelete={existing ? () => {
      const current = appStore.getSnapshot();
      const plans = [current.currentPlan, current.upcomingPlan, ...current.history].filter((plan): plan is WeeklyPlan => Boolean(plan));
      if (plans.some((plan) => plan.meals.some((meal) => meal.recipeId === draft.id))) {
        route.push({
          id: "custom-delete-blocked", title: "Suppression impossible", headerHeight: 56,
          header: (noticeRoute) => <Header title="Recette utilisée" onBack={noticeRoute.pop} />,
          render: () => <MobileScroll className="app-screen"><main className="page-content pushed-page"><p className="notice-banner" role="alert">Cette recette est encore utilisée dans une semaine. Remplacez-la dans le menu avant de la supprimer.</p></main></MobileScroll>,
        });
        return;
      }
      deleteCustomRecipe(draft.id);
      route.pop();
    } : undefined} /> };
  }

  function cookingScreen(recipe: Recipe, portions: number, planned?: PlannedMeal): FlowScreen {
    return { id: `cooking-${recipe.id}`, title: "Mode cuisine", headerHeight: 56, header: (route) => <Header title="Mode cuisine" onBack={route.pop} />, render: () => <CookingView recipe={recipe} portions={portions} planned={planned} /> };
  }

  function recipeScreen(recipe: Recipe, planned?: PlannedMeal, initialPortions?: number): FlowScreen {
    return {
      id: `recipe-${planned?.id ?? recipe.id}`,
      title: recipe.title,
      headerHeight: 56,
      header: (route) => <Header title="Recette" onBack={route.pop} />,
      render: (route) => <LiveAppState store={appStore}>{(live) => {
        const livePlanned = planned ? live.currentPlan?.meals.find((meal) => meal.id === planned.id) ?? planned : undefined;
        const personalRecipe = live.customRecipes.find((item) => item.id === recipe.id);
        const visibleRecipe = personalRecipe ?? recipe;
        return <RecipeView tools={(portions) => <RecipeTools store={appStore} recipeId={visibleRecipe.id} recipe={{ ...visibleRecipe, ingredients: ingredientsForPlannedMeal(visibleRecipe, livePlanned, 1) }} portions={portions} />}
          recipe={visibleRecipe}
          planned={livePlanned}
          profile={live.profile}
          initialPortions={initialPortions ?? live.profile.people}
          favorite={live.favoriteRecipeIds.includes(visibleRecipe.id)}
          onFavorite={() => toggleFavorite(visibleRecipe.id)}
          rating={ratingOf(visibleRecipe.id)}
          onRate={(rating) => rateRecipe(visibleRecipe.id, rating)}
          note={live.recipeNotes[visibleRecipe.id] ?? ""}
          onNoteChange={(note) => setRecipeNote(visibleRecipe.id, note)}
          onRecompose={visibleRecipe.composition ? async () => {
            const currentPlan = appStore.getSnapshot().currentPlan;
            const currentMeal = currentPlan?.meals.find((meal) => meal.id === livePlanned?.id);
            const source = currentMeal?.leftoverOf ? currentPlan?.meals.find((meal) => meal.id === currentMeal.leftoverOf) : currentMeal;
            const target = currentPlan && source ? { planId: currentPlan.id, slotId: source.id, recipeId: source.recipeId, dayIndex: source.dayIndex, mealType: source.mealType } : undefined;
            if (livePlanned && (!target || target.recipeId !== visibleRecipe.id)) throw new Error("Le repas a changé.");
            const data = await loadCatalogue();
            const main = data.recipes.find((item) => item.id === visibleRecipe.composition!.main);
            if (!main || mealBuilderGroupFor(main) !== "main" || !mealBuilderEligible(main)) throw new Error("Recette indisponible");
            setCatalogue(data);
            route.push(mealBuilderScreen(main, { id: `meal-${crypto.randomUUID()}`, recipeIds: visibleRecipe.composition! }, data, target));
          } : undefined}
          onEdit={personalRecipe ? () => route.replace(customRecipeScreen(personalRecipe, true, livePlanned)) : undefined}
          onDuplicate={visibleRecipe.composition ? undefined : () => {
            const current = appStore.getSnapshot();
            if (current.customRecipes.length >= 200) {
              route.push({
                id: "custom-limit", title: "Limite atteinte", headerHeight: 56,
                header: (noticeRoute) => <Header title="Recettes personnelles" onBack={noticeRoute.pop} />,
                render: () => <MobileScroll className="app-screen"><main className="page-content pushed-page"><p className="notice-banner" role="alert">La limite de 200 recettes personnelles est atteinte. Supprimez une recette inutilisée avant d’en créer une autre.</p></main></MobileScroll>,
              });
              return;
            }
            route.push(customRecipeScreen(customRecipeFrom(visibleRecipe)));
          }}
          onReplace={livePlanned ? () => route.replace(replacementScreen(livePlanned)) : undefined}
          onPlan={!livePlanned ? () => route.push(planSlotScreen(visibleRecipe)) : undefined}
          onPortionsChange={livePlanned ? (portions) => setAppState((current) => (current.currentPlan ? withUpdatedPlan(current, setMealPortions(current.currentPlan, livePlanned.id, portions, ACTIVE_RECIPES)) : current)) : undefined}
          onSubstitutionChange={livePlanned ? (ingredientId, substitutionId) => {
            const target = mealActionTarget(live.currentPlan, livePlanned, live.storageGeneration);
            try {
              setAppState((current) => {
                const meal = matchingActionMeal(current.currentPlan, target, current.storageGeneration);
                if (!meal || meal.recipeId !== visibleRecipe.id || !current.currentPlan) throw new Error(STALE_MEAL_ACTION);
                const recipes = recipesForState(current);
                return withUpdatedPlan(current, setMealIngredientSubstitution(current.currentPlan, meal.id, ingredientId, substitutionId, recipes, current.profile), recipes);
              });
              return null;
            } catch (error) { return error instanceof Error ? error.message : "Cette substitution est incompatible avec votre profil."; }
          } : undefined}
          onCook={(portions) => route.push(cookingScreen(visibleRecipe, portions, livePlanned))}
        />;
      }}</LiveAppState>,
    };
  }

  function replayPlan(plan: WeeklyPlan): void {
    setAppState((current) => {
      const restored = restorePlan(plan, ACTIVE_RECIPES, current.profile, {
        startsOn: isoDate(mondayOf()),
        generatedAt: new Date().toISOString(),
      });
      return {
        ...current,
        currentPlan: restored,
        history: current.currentPlan
          ? [current.currentPlan, ...current.history.filter((item) => item.id !== current.currentPlan?.id)].slice(0, HISTORY_LIMIT)
          : current.history,
        checkedShoppingItemIds: [],
      };
    });
  }

  function historyPlanScreen(plan: WeeklyPlan): FlowScreen {
    return { id: `history-${plan.id}`, title: formatWeekRange(plan.startsOn), headerHeight: 56, header: (route) => <Header title="Semaine archivée" onBack={route.pop} />, render: (route) => <LiveAppState store={appStore}>{(live) => <HistoryPlanView plan={plan} profile={live.profile} onOpenRecipe={(recipe) => route.push(recipeScreen(recipe))} onReplay={() => { replayPlan(plan); setTab("week"); route.pop(); }} />}</LiveAppState> };
  }

  function catalogueRecipeScreen(recipe: CatalogueRecipe): FlowScreen {
    const favoriteId = catalogueFavoriteId(recipe);
    const projected = recipeById.get(favoriteId);
    return { id: `catalogue-${recipe.id}`, title: recipe.titre, headerHeight: 56, header: (route) => <Header title="Recette vérifiée" onBack={route.pop} />, render: (route) => <LiveAppState store={appStore}>{(live) => <CatalogueRecipeView tools={(portions) => <RecipeTools store={appStore} recipeId={favoriteId} recipe={catalogueShoppingRecipe(recipe, catalogueImageFor(recipe)) ?? undefined} portions={portions} shoppingAllowed={availabilityForShopping(recipe)} />} recipe={recipe} favorite={live.favoriteRecipeIds.includes(favoriteId)} onFavorite={() => toggleFavorite(favoriteId)} onPlan={projected ? () => route.push(planSlotScreen(projected)) : undefined} onComposeMeal={mealBuilderEligible(recipe) ? () => route.push(mealBuilderScreen(recipe)) : undefined} />}</LiveAppState> };
  }

  function mealBuilderScreen(recipe: CatalogueRecipe, saved?: SavedMeal, availableCatalogue = catalogue, target?: CompositionTarget): FlowScreen {
    const recipes = availableCatalogue ? visibleCatalogueRecipes(availableCatalogue) : [recipe];
    const initialSelection = saved ? Object.fromEntries(MEAL_BUILDER_GROUPS.map(({ id }) => [id, recipes.find((item) => item.id === saved.recipeIds[id] && mealBuilderGroupFor(item) === id && mealBuilderEligible(item))])) : undefined;
    return { id: `meal-builder-${recipe.id}`, title: "Composer mon repas", headerHeight: 56, header: (route) => <div className="app-header meal-builder-header"><button type="button" className="icon-button" aria-label="Retour" onClick={route.pop}><ArrowLeftIcon /></button><Wordmark /><span /></div>, render: (route) => <MealBuilderView initialRecipe={recipe} initialSelection={initialSelection} initialName={saved?.name} planLabel={target ? "Enregistrer les modifications du repas" : "Planifier ce repas"} planningContext={target ? `Modifier le ${MEAL_LABELS[target.mealType].toLocaleLowerCase("fr")} du ${DAY_LABELS[target.dayIndex]} — le créneau et les portions seront conservés.` : undefined} recipes={recipes} onSave={(selection, name) => {
      const { starter, main, dessert } = selection;
      if (!starter || !main || !dessert) return "Complétez les trois catégories.";
      const result = evaluateAssociationMeal([starter, main, dessert]);
      if (result.level !== "verte" && result.level !== "orange") return "Les associations de ce repas doivent être revues.";
      const recipeIds = { starter: starter.id, main: main.id, dessert: dessert.id };
      const current = appStore.getSnapshot();
      const duplicate = current.savedMeals.find((meal) => MEAL_BUILDER_GROUPS.every(({ id }) => meal.recipeIds[id] === recipeIds[id]));
      const cleanName = name.trim().slice(0, 80);
      if (duplicate && (duplicate.name ?? "") === cleanName) return "Ce repas est déjà enregistré dans Mes repas.";
      if (current.savedMeals.length >= 200 && !saved) return "Vos 200 repas sont enregistrés. Supprimez-en un pour libérer une place.";
      const id = duplicate?.id ?? saved?.id ?? `meal-${crypto.randomUUID()}`;
      setAppState((live) => ({ ...live, savedMeals: [{ id, ...(cleanName ? { name: cleanName } : {}), recipeIds }, ...live.savedMeals.filter((meal) => meal.id !== id)].slice(0, 200) }));
      return "Repas enregistré sur cet appareil dans Mes repas.";
    }} onPlan={(selection) => {
      const { starter, main, dessert } = selection;
      if (!starter || !main || !dessert) return "Complétez les trois catégories.";
      try {
        const composed = composeMeal(starter, main, dessert, catalogueImageFor(main));
        if (target) {
          const live = appStore.getSnapshot();
          if (!live.currentPlan) return "La semaine a changé. Rouvrez votre repas depuis la semaine.";
          const registry = [...ACTIVE_RECIPES.filter((item) => item.id !== composed.id), composed];
          const updated = updatePlannedComposition(live.currentPlan, target, composed, registry, live.profile);
          if (live.composedRecipes.length >= 200 && !live.composedRecipes.some((item) => item.id === composed.id)) return "La limite des repas planifiés enregistrés est atteinte.";
          setAppState((current) => ({ ...current, currentPlan: updated, composedRecipes: [...current.composedRecipes.filter((item) => item.id !== composed.id), composed], checkedShoppingItemIds: reconcileCheckedItems(updated, registry, current.checkedShoppingItemIds) }));
          setAppNotice("Repas modifié au même créneau. Les portions sont conservées et les courses ont été mises à jour.");
          setTab("week"); popFlowToRoot(route);
        } else route.push(planSlotScreen(composed));
        return null;
      } catch (error) { return error instanceof Error ? error.message : "Ce repas ne peut pas être planifié."; }
    }} onNavigate={(next) => { setTab(next); for (let index = 1; index < route.stack.length; index++) route.pop(); }} /> };
  }

  const informationScreen = (): FlowScreen => ({ id: "information", title: "Informations", headerHeight: 56, header: (route) => <Header title="Informations" onBack={route.pop} />, render: () => <LiveAppState store={appStore}>{(live) => <InformationView state={live} onRestore={async (restored) => { await replaceAppState(restored); setArchivedWeek(null); }} onTextScale={(textScale) => setAppState((current) => ({ ...current, textScale }))} onReminders={(remindersEnabled) => setAppState((current) => ({ ...current, remindersEnabled }))} />}</LiveAppState> });
  const openProfile = () => flow.push({ id: "profile", title: "Profil alimentaire", headerHeight: 56, header: (route) => <Header title="Mon profil" onBack={route.pop} />, render: (route) => <LiveAppState store={appStore}>{(live) => <ProfileView key={JSON.stringify(live.profile)} initial={live.profile} onOpenInformation={() => route.push(informationScreen())} onSave={(profile) => {
    const snapshot = appStore.getSnapshot();
    const currentReport = snapshot.currentPlan ? inspectActivePlan(snapshot.currentPlan, ACTIVE_RECIPES, profile) : null;
    const upcomingReport = snapshot.upcomingPlan ? inspectActivePlan(snapshot.upcomingPlan, ACTIVE_RECIPES, profile) : null;
    const currentCompatible = !currentReport || currentReport.canActivate;
    const upcomingCompatible = !upcomingReport || upcomingReport.canActivate;
    if (!currentCompatible || !upcomingCompatible) setAppNotice("Une semaine incompatible avec votre nouveau profil a été déplacée dans l’historique. Générez un nouveau menu pour appliquer vos critères en toute sécurité.");
    setAppState((current) => {
      const removed = [!currentCompatible ? current.currentPlan : null, !upcomingCompatible ? current.upcomingPlan : null].filter((plan): plan is WeeklyPlan => Boolean(plan));
      const removedIds = new Set(removed.map((plan) => plan.id));
      return {
        ...current,
        profile,
        onboardingCompleted: true,
        currentPlan: currentCompatible && current.currentPlan
          ? { ...current.currentPlan, profileSnapshot: { ...profile, mealsPerDay: currentReport?.inferredMealsPerDay ?? profile.mealsPerDay } }
          : null,
        upcomingPlan: upcomingCompatible && current.upcomingPlan
          ? { ...current.upcomingPlan, profileSnapshot: { ...profile, mealsPerDay: upcomingReport?.inferredMealsPerDay ?? profile.mealsPerDay } }
          : null,
        history: [...removed, ...current.history.filter((plan) => !removedIds.has(plan.id))].slice(0, HISTORY_LIMIT),
        checkedShoppingItemIds: currentCompatible ? current.checkedShoppingItemIds : [],
      };
    });
    route.pop();
  }} />}</LiveAppState> });
  const openGenerate = () => flow.push({ id: "generate", title: "Générer ma semaine", headerHeight: 56, header: (route) => <Header title="Nouvelle semaine" onBack={route.pop} />, render: (route) => <LiveAppState store={appStore}>{(live) => <GenerateView profile={live.profile} lockedCount={preservableLockedMeals(live.currentPlan, ACTIVE_RECIPES, live.profile).length} canPrepareNext={Boolean(live.currentPlan)} onCreate={createPlan} onOpenProfile={openProfile} onComplete={(target) => { if (target === "current") setTab("week"); route.pop(); }} />}</LiveAppState> });
  const openTonight = () => flow.push({ id: "tonight", title: "Que cuisiner ce soir ?", headerHeight: 56, header: (route) => <Header title="Ce soir" onBack={route.pop} />, render: (route) => <LiveAppState store={appStore}>{(live) => <TonightView profile={live.profile} pantryIds={[...live.pantryIngredientIds, ...Object.keys(live.pantryAmounts)]} favoriteIds={live.favoriteRecipeIds} onOpenProfile={openProfile} onOpenRecipe={(recipe, portions) => route.push(recipeScreen(recipe, undefined, portions))} />}</LiveAppState> });
  function leftoverScreen(planned: PlannedMeal): FlowScreen {
    const openedState = appStore.getSnapshot();
    const target = mealActionTarget(openedState.currentPlan, planned, openedState.storageGeneration);
    return { id: `leftover-${planned.id}`, title: "Restes", headerHeight: 56, header: (route) => <Header title="Cuisiner en double" onBack={route.pop} />, render: (route) => <LiveAppState store={appStore}>{(liveState) => {
      const plan = liveState.currentPlan;
      const source = matchingActionMeal(plan, target, liveState.storageGeneration);
      const recipe = source ? recipeById.get(source.recipeId) : undefined;
      if (!plan || !source || !recipe) return <StaleMealAction />;
      return <LeftoverView plan={plan} source={source} recipe={recipe} onConfirm={(targetSlotId) => {
        const displayedMeal = plan.meals.find((meal) => meal.id === targetSlotId);
        const displayedTarget = displayedMeal ? mealActionTarget(plan, displayedMeal, liveState.storageGeneration) : null;
        try {
          setAppState((current) => {
            if (!current.currentPlan || !matchingActionMeal(current.currentPlan, target, current.storageGeneration)) throw new Error(STALE_MEAL_ACTION);
            if (!matchingActionMeal(current.currentPlan, displayedTarget, current.storageGeneration)) throw new Error("Le repas à remplacer a changé. Vérifiez la liste avant de choisir à nouveau.");
            const recipes = recipesForState(current);
            const updated = planLeftover(current.currentPlan, source.id, targetSlotId, recipes);
            if (!inspectActivePlan(updated, recipes, current.profile).canActivate) {
              throw new Error("Ces restes ne respectent plus votre profil ou les contraintes du jour choisi.");
            }
            return withUpdatedPlan(current, updated, recipes);
          });
          route.pop();
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : "Impossible de replanifier ces restes.";
        }
      }} />;
    }}</LiveAppState> };
  }

  function swapScreen(planned: PlannedMeal): FlowScreen {
    const openedState = appStore.getSnapshot();
    const target = mealActionTarget(openedState.currentPlan, planned, openedState.storageGeneration);
    return { id: `swap-${planned.id}`, title: "Échanger", headerHeight: 56, header: (route) => <Header title="Échanger" onBack={route.pop} />, render: (route) => <LiveAppState store={appStore}>{(liveState) => {
      const plan = liveState.currentPlan;
      const source = matchingActionMeal(plan, target, liveState.storageGeneration);
      if (!plan || !source) return <StaleMealAction />;
      return <SwapView plan={plan} source={source} profile={liveState.profile} onConfirm={(targetSlotId) => {
        const displayedMeal = plan.meals.find((meal) => meal.id === targetSlotId);
        const displayedTarget = displayedMeal ? mealActionTarget(plan, displayedMeal, liveState.storageGeneration) : null;
        try {
          setAppState((current) => {
            if (!current.currentPlan || !matchingActionMeal(current.currentPlan, target, current.storageGeneration)) throw new Error(STALE_MEAL_ACTION);
            if (!matchingActionMeal(current.currentPlan, displayedTarget, current.storageGeneration)) throw new Error("Le repas à échanger a changé. Vérifiez la liste avant de choisir à nouveau.");
            const recipes = recipesForState(current);
            const updated = swapPlannedMeals(current.currentPlan, source.id, targetSlotId, recipes, current.profile);
            return withUpdatedPlan(current, updated, recipes);
          });
          route.pop();
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : "Échange impossible.";
        }
      }} />;
    }}</LiveAppState> };
  }

  const openSwap = (planned: PlannedMeal) => flow.push(swapScreen(planned));
  const openMeal = (planned: PlannedMeal, recipe: Recipe) => flow.push(recipeScreen(recipe, planned));
  const openLeftover = (planned: PlannedMeal) => flow.push(leftoverScreen(planned));
  const openReplace = (planned: PlannedMeal) => flow.push(replacementScreen(planned));
  const currentView = useMemo(() => {
    if (tab === "week") return <WeekView plan={appState.currentPlan} onOpenMeal={openMeal} onReplace={openReplace} onToggleLock={toggleMealLock} onToggleCompleted={toggleMealCompleted} onPlanLeftover={openLeftover} onToggleSkipped={toggleMealSkipped} onSwap={openSwap} />;
    if (tab === "courses") return <CoursesView store={appStore} onRecipes={() => setTab("recipes")} plan={appState.currentPlan} profile={appState.profile} checkedIds={appState.checkedShoppingItemIds} pantryIds={appState.pantryIngredientIds} pantryAmounts={appState.pantryAmounts} categoryOrder={appState.shoppingCategoryOrder} spent={appState.currentPlan ? appState.actualSpend[appState.currentPlan.id] : undefined} onToggleChecked={toggleChecked} onTogglePantry={togglePantry} onSetPantryAmount={setPantryAmount} onMoveCategory={moveCategory} onSetSpent={setSpent} />;
    if (tab === "recipes") return <RecipesView libraryTools={<CollectionsView store={appStore} catalogue={catalogue} onLoad={ensureCatalogue} onOpen={(id) => { const personal = ACTIVE_RECIPES.find((item) => item.id === id); const source = catalogue?.recipes.find((item) => catalogueFavoriteId(item) === id); if (source) flow.push(catalogueRecipeScreen(source)); else if (personal) flow.push(recipeScreen(personal)); }} />} onRestoreSavedMeal={(meal, index) => {
      const live = appStore.getSnapshot();
      if (live.savedMeals.some((item) => item.id === meal.id)) return "Ce repas est déjà présent.";
      if (live.savedMeals.length >= 200) return "Libérez une place avant de restaurer ce repas.";
      setAppState((current) => ({ ...current, savedMeals: [...current.savedMeals.slice(0, index), meal, ...current.savedMeals.slice(index)] }));
      return null;
    }} onRenameSavedMeal={(meal, name) => {
      if (!appStore.getSnapshot().savedMeals.some((item) => item.id === meal.id)) return "Ce repas a été supprimé. Fermez cette fenêtre pour actualiser la liste.";
      setAppState((current) => ({ ...current, savedMeals: current.savedMeals.map((item) => item.id === meal.id ? { ...item, name: name.trim().slice(0, 80) || undefined } : item) }));
      return null;
    }} savedMeals={appState.savedMeals} onOpenSavedMeal={(meal) => { const recipe = catalogue?.recipes.find((item) => item.id === meal.recipeIds.main && mealBuilderGroupFor(item) === "main" && mealBuilderEligible(item)); if (recipe) flow.push(mealBuilderScreen(recipe, meal)); }} onDeleteSavedMeal={(meal) => setAppState((current) => ({ ...current, savedMeals: current.savedMeals.filter((item) => item.id !== meal.id) }))} favoriteIds={appState.favoriteRecipeIds} customRecipes={appState.customRecipes} history={appState.history} catalogue={catalogue} catalogueError={catalogueError} onLoadCatalogue={ensureCatalogue} onRetryCatalogue={retryCatalogue} onOpenRecipe={(recipe) => flow.push(recipeScreen(recipe))} onOpenCatalogue={(recipe) => flow.push(catalogueRecipeScreen(recipe))} onOpenHistory={(plan) => flow.push(historyPlanScreen(plan))} onDeleteHistory={(plan) => {
      setAppState((current) => {
        const actualSpend = { ...current.actualSpend };
        delete actualSpend[plan.id];
        return {
          ...current,
          history: current.history.filter((item) => item.id !== plan.id),
          actualSpend,
        };
      });
      setAppNotice("Semaine supprimée de l’historique.");
    }} />;
    if (!appState.onboardingCompleted) return <OnboardingView profile={appState.profile} onOpenProfile={openProfile} onSkip={() => setAppState((current) => ({ ...current, onboardingCompleted: true }))} />;
    return <HomeView onRecipes={() => setTab("recipes")} onInformation={() => flow.push(informationScreen())} profile={appState.profile} plan={appState.currentPlan} archivedWeek={archivedWeek} upcomingPlan={appState.upcomingPlan} onGenerate={openGenerate} onTonight={openTonight} onProfile={openProfile} onOpenMeal={openMeal} onOpenWeek={() => setTab("week")} />;
  }, [tab, appState, activeRecipeSnapshot, archivedWeek, catalogue, catalogueError, ensureCatalogue, retryCatalogue]);

  if (startupError) throw startupError;

  return <div className={`app-shell ${appState.textScale === "large" ? "is-large-text" : ""}`} data-text-scale={appState.textScale}>
    {offline ? <p className="offline-strip" role="status" data-testid="offline-strip">Hors ligne : votre semaine, vos recettes planifiées et vos courses restent disponibles. Le catalogue complet demande une connexion s’il n’a pas été téléchargé.</p> : null}
    {/* A new root tab starts at the top and discards the previous tab's inertia.
        Updates within that tab keep the same scroll container. */}
    <MobileScroll key={tab} className="app-screen"><div className="root-scroll-content">
      {!hydrated ? <div className="app-loading"><ReloadIcon className="spin" /><span>Chargement local…</span></div> : <>
        {storageWarning ? <div className="notice-banner app-status-banner" role="alert"><span>{storageWarning}</span><button type="button" aria-label="Fermer l’avertissement de stockage" onClick={() => setStorageWarning("")}><Cross2Icon /></button></div> : null}
        {appNotice ? <div className="notice-banner app-status-banner" role="status"><span>{appNotice}</span><button type="button" aria-label="Fermer le message" onClick={() => setAppNotice("")}><Cross2Icon /></button></div> : null}
        {updateReady ? <div className="install-banner update-banner" data-testid="update-banner"><span><strong>Nouvelle version disponible</strong><small>Rechargez pour éviter les erreurs d’affichage ; vos données locales sont conservées.</small></span><button type="button" className="primary-button" data-testid="update-reload" onClick={reload}>Recharger</button></div> : null}
        {canInstall ? <div className="install-banner" data-testid="install-banner"><span><strong>Installer Inflamm’Menu</strong><small>Accès plein écran et hors connexion, sans compte ni magasin d’applications.</small></span><button type="button" className="primary-button" data-testid="install-app" onClick={() => void install()}>Installer</button></div> : null}
        {currentView}
      </>}
    </div></MobileScroll>
    <BottomNav active={tab} onChange={setTab} />
  </div>;
}
