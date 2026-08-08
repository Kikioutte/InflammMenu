#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    first = text.find(start)
    if first < 0:
        raise RuntimeError(f"{label}: start marker not found")
    last = text.find(end, first)
    if last < 0:
        raise RuntimeError(f"{label}: end marker not found")
    return text[:first] + replacement.rstrip() + "\n\n" + text[last:]


# ---------------------------------------------------------------------------
# Catalogue: cached searchable text and a real explicit offline download.
# ---------------------------------------------------------------------------
catalogue = read("src/catalog.ts")
catalogue = replace_once(
    catalogue,
    'const catalogueUrl = new URL("./data/recettes-anti-inflammatoires.json", import.meta.url).href;\n',
    'const catalogueUrl = new URL("./data/recettes-anti-inflammatoires.json", import.meta.url).href;\nexport const CATALOGUE_CACHE_NAME = "inflamm-menu-catalogue-v1";\n',
    "catalogue cache name",
)
new_load = r'''function parseCatalogueResponse(response: Response): Promise<CatalogueData> {
  if (!response.ok) throw new Error(`Catalogue indisponible (${response.status})`);
  return response.json().then((value: unknown) => {
    if (!value || typeof value !== "object" || !Array.isArray((value as CatalogueData).recipes)) {
      throw new Error("Catalogue invalide");
    }
    return value as CatalogueData;
  });
}

export function loadCatalogue(): Promise<CatalogueData> {
  cataloguePromise ??= fetch(catalogueUrl, { headers: { Accept: "application/json" } })
    .then(parseCatalogueResponse)
    .catch((error: unknown) => {
      cataloguePromise = null;
      throw error instanceof Error ? error : new Error("Catalogue indisponible");
    });
  return cataloguePromise;
}

/** Downloads and verifies the full catalogue, then stores the exact response in Cache Storage. */
export async function cacheCatalogueForOffline(): Promise<CatalogueData> {
  const response = await fetch(catalogueUrl, {
    cache: "reload",
    headers: { Accept: "application/json" },
  });
  const cacheable = response.clone();
  const data = await parseCatalogueResponse(response);
  if (typeof caches === "undefined") throw new Error("Le cache hors ligne n’est pas disponible sur cet appareil.");
  const cache = await caches.open(CATALOGUE_CACHE_NAME);
  await cache.put(catalogueUrl, cacheable);
  cataloguePromise = Promise.resolve(data);
  return data;
}

export async function catalogueAvailableOffline(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    return Boolean(await caches.match(catalogueUrl));
  } catch {
    return false;
  }
}'''
catalogue = replace_between(catalogue, "export function loadCatalogue", "export function duplicateCatalogueRecipes", new_load, "catalogue loading")
catalogue = replace_once(
    catalogue,
    "export function filterCatalogueRecipes(\n",
    "const SEARCHABLE_CATALOGUE_TEXT = new WeakMap<CatalogueRecipe, string>();\n\nfunction searchableCatalogueText(recipe: CatalogueRecipe): string {\n  const cached = SEARCHABLE_CATALOGUE_TEXT.get(recipe);\n  if (cached) return cached;\n  const value = `${recipe.titre} ${recipe.ingredients.map((item) => item.nom).join(\" \")} ${recipe.tags.join(\" \")}`\n    .normalize(\"NFD\").replace(/[\\u0300-\\u036f]/g, \"\").replace(/œ/g, \"oe\").replace(/æ/g, \"ae\").toLowerCase();\n  SEARCHABLE_CATALOGUE_TEXT.set(recipe, value);\n  return value;\n}\n\nexport function filterCatalogueRecipes(\n",
    "search cache",
)
catalogue = replace_once(
    catalogue,
    "    const searchable = `${recipe.titre} ${recipe.ingredients.map((item) => item.nom).join(\" \")} ${recipe.tags.join(\" \")}`\n      .normalize(\"NFD\").replace(/[\\u0300-\\u036f]/g, \"\").toLowerCase();\n    return searchable.includes(normalizedQuery);",
    "    return searchableCatalogueText(recipe).includes(normalizedQuery);",
    "cached catalogue search",
)
write("src/catalog.ts", catalogue)


# ---------------------------------------------------------------------------
# Prototype: state revisions, tab sync, rollover, safety notices and batching.
# ---------------------------------------------------------------------------
prototype = read("src/Prototype.tsx")
prototype = replace_once(
    prototype,
    'import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type SyntheticEvent } from "react";',
    'import { Component, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ErrorInfo, type ReactNode, type SyntheticEvent } from "react";',
    "React imports",
)
prototype = replace_once(
    prototype,
    "  loadCatalogue,\n  plannerAvailabilityFor,",
    "  loadCatalogue,\n  cacheCatalogueForOffline,\n  catalogueAvailableOffline,\n  plannerAvailabilityFor,",
    "catalogue cache imports",
)
prototype = replace_once(
    prototype,
    "  saveAppState,\n  watchForAppUpdate,",
    "  saveAppState,\n  watchForAppUpdate,\n  watchForStoredState,",
    "storage sync import",
)
prototype = prototype.replace('@fontsource/cormorant-garamond/600.css', '@fontsource/cormorant-garamond/latin-600.css')
prototype = prototype.replace('@fontsource/cormorant-garamond/700.css', '@fontsource/cormorant-garamond/latin-700.css')
prototype = prototype.replace('@fontsource/dm-sans/400.css', '@fontsource/dm-sans/latin-400.css')
prototype = prototype.replace('@fontsource/dm-sans/500.css', '@fontsource/dm-sans/latin-500.css')
prototype = prototype.replace('@fontsource/dm-sans/600.css', '@fontsource/dm-sans/latin-600.css')

new_store = r'''type AppStateStore = {
  getSnapshot: () => AppState;
  subscribe: (listener: () => void) => () => void;
  setState: (update: AppStateUpdate) => void;
  replaceState: (state: AppState) => void;
};

function createAppStateStore(initial: AppState): AppStateStore {
  let state = initial;
  const listeners = new Set<() => void>();
  const publish = (next: AppState) => {
    if (Object.is(next, state)) return;
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState: (update) => {
      const candidate = typeof update === "function" ? update(state) : update;
      if (Object.is(candidate, state)) return;
      publish({
        ...candidate,
        stateRevision: Math.max(state.stateRevision + 1, Date.now()),
      });
    },
    replaceState: (next) => {
      if (next.stateRevision <= state.stateRevision) return;
      publish(next);
    },
  };
}'''
prototype = replace_between(prototype, "type AppStateStore = {", "function LiveAppState", new_store, "app state store")

# Profile input bounds now match persistence.
prototype = replace_once(prototype, "people: Math.min(6, current.people + 1)", "people: Math.min(12, current.people + 1)", "profile people max")
prototype = replace_once(
    prototype,
    "onSave({ ...profile, weeklyBudget: Math.max(20, Number(budget) || DEFAULT_PROFILE.weeklyBudget), maxPrepMinutes: Math.max(5, Number(maxPrep) || DEFAULT_PROFILE.maxPrepMinutes), allergies: parseList(allergies), excludedIngredientIds: resolveExcludedIngredients(excluded) });",
    "onSave({ ...profile, weeklyBudget: Math.min(10_000, Math.max(1, Number(budget) || DEFAULT_PROFILE.weeklyBudget)), maxPrepMinutes: Math.min(1_440, Math.max(1, Number(maxPrep) || DEFAULT_PROFILE.maxPrepMinutes)), allergies: parseList(allergies), excludedIngredientIds: resolveExcludedIngredients(excluded) });",
    "profile numeric bounds",
)

# Generation timer is cancelled on unmount and cannot be double-started.
prototype = replace_once(
    prototype,
    "  const [target, setTarget] = useState<\"current\" | \"upcoming\">(\"current\");\n  const start = () => {\n    setPhase(\"loading\");\n    window.setTimeout(() => {\n      try { const plan = onCreate(target); setResult(plan); setPhase(\"success\"); }\n      catch (error) { setMessage(error instanceof Error ? error.message : \"Impossible de créer cette semaine.\"); setPhase(\"error\"); }\n    }, 650);\n  };",
    "  const [target, setTarget] = useState<\"current\" | \"upcoming\">(\"current\");\n  const generationTimer = useRef<number | null>(null);\n  useEffect(() => () => { if (generationTimer.current !== null) window.clearTimeout(generationTimer.current); }, []);\n  const start = () => {\n    if (phase === \"loading\") return;\n    setPhase(\"loading\");\n    generationTimer.current = window.setTimeout(() => {\n      generationTimer.current = null;\n      try { const plan = onCreate(target); setResult(plan); setPhase(\"success\"); }\n      catch (error) { setMessage(error instanceof Error ? error.message : \"Impossible de créer cette semaine.\"); setPhase(\"error\"); }\n    }, 650);\n  };",
    "generation timer",
)

# Planned recipes retain their reviewed caution without needing the 5 MB catalogue.
prototype = replace_once(
    prototype,
    "  const catalogueReview = catalogueRecipe ? reviewFor(catalogueRecipe) : undefined;\n  const durationItems = catalogueRecipe ? catalogueDurationItems(catalogueRecipe) : [];",
    "  const catalogueReview = catalogueRecipe ? reviewFor(catalogueRecipe) : undefined;\n  const displayedCaution = recipe.caution ?? catalogueReview?.caution;\n  const durationItems = catalogueRecipe ? catalogueDurationItems(catalogueRecipe) : [];",
    "recipe caution variable",
)
prototype = replace_once(
    prototype,
    "    {catalogueReview?.caution ? <aside className=\"catalogue-caution\"><strong>Repère important</strong><p>{catalogueReview.caution}</p></aside> : null}",
    "    {displayedCaution ? <aside className=\"catalogue-caution\"><strong>Repère important</strong><p>{displayedCaution}</p></aside> : null}",
    "recipe caution display",
)

# Leftovers cannot be marked as newly cooked or skipped at the source while dependants exist.
prototype = replace_once(prototype, "disabled={skipped} onClick={() => run(() => onToggleCompleted(planned))}", "disabled={skipped || isLeftover} onClick={() => run(() => onToggleCompleted(planned))}", "completed leftover button")
prototype = replace_once(prototype, "<button type=\"button\" data-testid=\"action-skip\" onClick", "<button type=\"button\" data-testid=\"action-skip\" disabled={hasLeftover} onClick", "skip source button")
prototype = replace_once(prototype, "{skipped ? null : <button type=\"button\" className={`meal-card__done", "{skipped || isLeftover ? null : <button type=\"button\" className={`meal-card__done", "leftover done card")
prototype = replace_once(prototype, "swapPlannedMeals(live, planned.id, targetSlotId)", "swapPlannedMeals(live, planned.id, targetSlotId, ACTIVE_RECIPES)", "swap cost UI")

# The explicit offline button verifies Cache Storage, not only a successful HTTP fetch.
new_offline_section = r'''function OfflineCatalogueSection() {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  useEffect(() => {
    let active = true;
    void catalogueAvailableOffline().then((available) => { if (active && available) setStatus("ready"); });
    return () => { active = false; };
  }, []);
  return (
    <section className="information-card" data-testid="offline-catalogue">
      <h2>Catalogue hors ligne</h2>
      <p>La semaine, les recettes planifiées et la liste de courses fonctionnent déjà sans connexion. Le catalogue complet (550 recettes) peut être conservé explicitement sur cet appareil.</p>
      <button type="button" className="secondary-button full-button" data-testid="offline-catalogue-download" disabled={status === "loading" || status === "ready"} onClick={() => {
        setStatus("loading");
        void cacheCatalogueForOffline().then(() => setStatus("ready")).catch(() => setStatus("error"));
      }}>
        {status === "ready" ? <><CheckIcon /> Catalogue vérifié hors ligne</> : status === "loading" ? <><ReloadIcon className="spin" /> Téléchargement et vérification…</> : <><DownloadIcon /> Télécharger pour le hors-ligne</>}
      </button>
      {status === "error" ? <p className="notice-banner" role="alert">Le catalogue n’a pas pu être enregistré dans le cache de cet appareil. Libérez de l’espace puis réessayez en ligne.</p> : null}
    </section>
  );
}'''
prototype = replace_between(prototype, "function OfflineCatalogueSection()", "function ComfortSection", new_offline_section, "offline catalogue UI")

# Catalogue rendering is deferred and progressively revealed in accessible batches.
prototype = replace_once(
    prototype,
    "  const [filtersOpen, setFiltersOpen] = useState(false);\n  const normalizedQuery = normalizeText(query);",
    "  const [filtersOpen, setFiltersOpen] = useState(false);\n  const [visibleCatalogueCount, setVisibleCatalogueCount] = useState(60);\n  const deferredQuery = useDeferredValue(query);\n  const normalizedQuery = normalizeText(deferredQuery);",
    "catalogue deferred query",
)
prototype = replace_once(
    prototype,
    "  const activeFilterCount = [",
    "  const renderedCatalogueRecipes = catalogueRecipes.slice(0, visibleCatalogueCount);\n  useEffect(() => { setVisibleCatalogueCount(60); }, [mode, normalizedQuery, category, filters]);\n  const activeFilterCount = [",
    "catalogue render batch",
)
prototype = replace_once(prototype, "<div className=\"catalogue-list\">{catalogueRecipes.map((recipe)", "<div className=\"catalogue-list\">{renderedCatalogueRecipes.map((recipe)", "catalogue rendered slice")
prototype = replace_once(
    prototype,
    "</button>; })}</div>\n      </section> : <div className=\"history-list\">",
    "</button>; })}</div>\n        {renderedCatalogueRecipes.length < catalogueRecipes.length ? <button type=\"button\" className=\"secondary-button full-button catalogue-more\" data-testid=\"catalogue-more\" onClick={() => setVisibleCatalogueCount((count) => Math.min(catalogueRecipes.length, count + 60))}>Afficher 60 recettes de plus</button> : null}\n      </section> : <div className=\"history-list\">",
    "catalogue load more",
)

# Add state synchronisation, save diagnostics and date rollover to AppShell.
prototype = replace_once(
    prototype,
    "  const setAppState = appStore.setState;\n  const [hydrated, setHydrated] = useState(false);",
    "  const setAppState = appStore.setState;\n  const replaceAppState = appStore.replaceState;\n  const [hydrated, setHydrated] = useState(false);",
    "replace state alias",
)
prototype = replace_once(
    prototype,
    "  const [archivedWeek, setArchivedWeek] = useState<WeeklyPlan | null>(null);\n  const { offline, canInstall, install, updateReady, reload } = useInstallAndConnectivity();",
    "  const [archivedWeek, setArchivedWeek] = useState<WeeklyPlan | null>(null);\n  const [appNotice, setAppNotice] = useState(\"\");\n  const [storageWarning, setStorageWarning] = useState(\"\");\n  const { offline, canInstall, install, updateReady, reload } = useInstallAndConnectivity();",
    "app notices",
)
prototype = replace_once(
    prototype,
    "        const promoted = stored.upcomingPlan && !isPlanExpired(stored.upcomingPlan, today) ? stored.upcomingPlan : null;",
    "        const promoted = stored.upcomingPlan && !isPlanExpired(stored.upcomingPlan, today) && planDayOffset(stored.upcomingPlan, today) >= 0 ? stored.upcomingPlan : null;",
    "future week promotion",
)
prototype = replace_once(
    prototype,
    "          upcomingPlan: null,\n          history: [expired,",
    "          upcomingPlan: promoted ? null : stored.upcomingPlan,\n          history: [expired,",
    "keep future upcoming plan",
)
prototype = replace_once(
    prototype,
    "  useEffect(() => { if (hydrated) void saveAppState(appState); }, [appState, hydrated]);",
    "  useEffect(() => watchForStoredState((incoming) => {\n    const current = appStore.getSnapshot();\n    if (incoming.stateRevision > current.stateRevision) replaceAppState(incoming);\n  }), [appStore, replaceAppState]);\n\n  useEffect(() => {\n    if (!hydrated) return;\n    let active = true;\n    void saveAppState(appState).then((result) => {\n      if (!active) return;\n      setStorageWarning(result.localSaved && result.indexedSaved ? \"\" : \"Vos données sont enregistrées dans un seul stockage local. Exportez une sauvegarde par précaution.\");\n    }).catch(() => {\n      if (active) setStorageWarning(\"Impossible d’enregistrer vos changements sur cet appareil. Exportez vos données avant de fermer la page.\");\n    });\n    return () => { active = false; };\n  }, [appState, hydrated]);\n\n  useEffect(() => {\n    if (!hydrated) return;\n    const rollPlans = () => {\n      const today = isoDate(new Date());\n      setAppState((current) => {\n        const currentExpired = isPlanExpired(current.currentPlan, today);\n        const upcomingExpired = isPlanExpired(current.upcomingPlan, today);\n        const upcomingReady = Boolean(current.upcomingPlan && !upcomingExpired && planDayOffset(current.upcomingPlan, today) >= 0);\n        if (!currentExpired && current.currentPlan) return current;\n        if (!current.currentPlan && !upcomingReady && !upcomingExpired) return current;\n\n        const archived = [current.currentPlan && currentExpired ? current.currentPlan : null, current.upcomingPlan && upcomingExpired ? current.upcomingPlan : null]\n          .filter((plan): plan is WeeklyPlan => Boolean(plan));\n        if (archived[0]) setArchivedWeek(archived[0]);\n        const promoted = upcomingReady ? current.upcomingPlan : null;\n        const archivedIds = new Set(archived.map((plan) => plan.id));\n        return {\n          ...current,\n          currentPlan: promoted,\n          upcomingPlan: promoted || upcomingExpired ? null : current.upcomingPlan,\n          history: [...archived, ...current.history.filter((plan) => !archivedIds.has(plan.id))].slice(0, HISTORY_LIMIT),\n          checkedShoppingItemIds: promoted || archived.length ? [] : current.checkedShoppingItemIds,\n        };\n      });\n    };\n    rollPlans();\n    const interval = window.setInterval(rollPlans, 60_000);\n    const onVisible = () => { if (document.visibilityState === \"visible\") rollPlans(); };\n    document.addEventListener(\"visibilitychange\", onVisible);\n    return () => { window.clearInterval(interval); document.removeEventListener(\"visibilitychange\", onVisible); };\n  }, [hydrated, setAppState]);",
    "storage sync and rollover",
)

# Custom recipe cap and safe deletion of recipes referenced by plans.
prototype = replace_once(
    prototype,
    "          onDuplicate={() => route.push(customRecipeScreen(customRecipeFrom(recipe)))}",
    "          onDuplicate={() => {\n            const current = appStore.getSnapshot();\n            if (!recipe.id.startsWith(\"perso-\") && current.customRecipes.length >= 200) {\n              setAppNotice(\"La limite de 200 recettes personnelles est atteinte. Supprimez une recette inutilisée avant d’en créer une autre.\");\n              return;\n            }\n            route.push(customRecipeScreen(customRecipeFrom(recipe)));\n          }}",
    "custom recipe cap",
)
prototype = replace_once(
    prototype,
    "onDelete={existing ? () => { deleteCustomRecipe(draft.id); route.pop(); } : undefined}",
    "onDelete={existing ? () => {\n      const current = appStore.getSnapshot();\n      const plans = [current.currentPlan, current.upcomingPlan, ...current.history].filter((plan): plan is WeeklyPlan => Boolean(plan));\n      if (plans.some((plan) => plan.meals.some((meal) => meal.recipeId === draft.id))) {\n        setAppNotice(\"Cette recette est encore utilisée dans une semaine. Remplacez-la dans le menu avant de la supprimer.\");\n        return;\n      }\n      deleteCustomRecipe(draft.id);\n      route.pop();\n    } : undefined}",
    "custom recipe deletion",
)

# Profile route reads the live state after a nested backup import and invalidates unsafe plans.
old_profile = '  const openProfile = () => flow.push({ id: "profile", title: "Profil alimentaire", headerHeight: 56, header: (route) => <Header title="Mon profil" onBack={route.pop} />, render: (route) => <ProfileView initial={appState.profile} onOpenInformation={() => route.push(informationScreen())} onSave={(profile) => { setAppState((current) => ({ ...current, profile, onboardingCompleted: true })); route.pop(); }} /> });'
new_profile = '''  const openProfile = () => flow.push({ id: "profile", title: "Profil alimentaire", headerHeight: 56, header: (route) => <Header title="Mon profil" onBack={route.pop} />, render: (route) => <LiveAppState store={appStore}>{(live) => <ProfileView key={`profile-${live.stateRevision}`} initial={live.profile} onOpenInformation={() => route.push(informationScreen())} onSave={(profile) => {
    const snapshot = appStore.getSnapshot();
    const currentCompatible = !snapshot.currentPlan || inspectPlanReplay(snapshot.currentPlan, ACTIVE_RECIPES, profile).canReplay;
    const upcomingCompatible = !snapshot.upcomingPlan || inspectPlanReplay(snapshot.upcomingPlan, ACTIVE_RECIPES, profile).canReplay;
    if (!currentCompatible || !upcomingCompatible) setAppNotice("Une semaine incompatible avec votre nouveau profil a été déplacée dans l’historique. Générez un nouveau menu pour appliquer vos critères en toute sécurité.");
    setAppState((current) => {
      const removed = [!currentCompatible ? current.currentPlan : null, !upcomingCompatible ? current.upcomingPlan : null].filter((plan): plan is WeeklyPlan => Boolean(plan));
      const removedIds = new Set(removed.map((plan) => plan.id));
      return {
        ...current,
        profile,
        onboardingCompleted: true,
        currentPlan: currentCompatible && current.currentPlan ? { ...current.currentPlan, profileSnapshot: profile } : null,
        upcomingPlan: upcomingCompatible && current.upcomingPlan ? { ...current.upcomingPlan, profileSnapshot: profile } : null,
        history: [...removed, ...current.history.filter((plan) => !removedIds.has(plan.id))].slice(0, HISTORY_LIMIT),
        checkedShoppingItemIds: currentCompatible ? current.checkedShoppingItemIds : [],
      };
    });
    route.pop();
  }} />}</LiveAppState> });'''
prototype = replace_once(prototype, old_profile, new_profile, "live profile route")

# Root status messages are visible, dismissible and announced.
prototype = replace_once(
    prototype,
    "      {!hydrated ? <div className=\"app-loading\"><ReloadIcon className=\"spin\" /><span>Chargement local…</span></div> : <>",
    "      {!hydrated ? <div className=\"app-loading\"><ReloadIcon className=\"spin\" /><span>Chargement local…</span></div> : <>\n        {storageWarning ? <div className=\"notice-banner app-status-banner\" role=\"alert\"><span>{storageWarning}</span><button type=\"button\" aria-label=\"Fermer l’avertissement de stockage\" onClick={() => setStorageWarning(\"\")}><Cross2Icon /></button></div> : null}\n        {appNotice ? <div className=\"notice-banner app-status-banner\" role=\"status\"><span>{appNotice}</span><button type=\"button\" aria-label=\"Fermer le message\" onClick={() => setAppNotice(\"\")}><Cross2Icon /></button></div> : null}",
    "root status messages",
)

# App-level render recovery boundary.
new_bottom = r'''class PrototypeErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Inflamm’Menu render error", error, info.componentStack);
  }

  private downloadRecovery = () => {
    try {
      const raw = window.localStorage.getItem("inflamm-menu:app-state");
      if (raw) downloadTextFile(`inflamm-menu-recuperation-${isoDate(new Date())}.json`, raw, "application/json;charset=utf-8");
    } catch {
      // The reload and reset actions remain available.
    }
  };

  private reset = async () => {
    try { window.localStorage.removeItem("inflamm-menu:app-state"); } catch { /* ignored */ }
    if (typeof indexedDB !== "undefined") {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase("inflamm-menu");
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="fatal-error" role="alert">
      <Cross2Icon />
      <h1>Inflamm’Menu a rencontré une erreur</h1>
      <p>Vos données locales n’ont pas été volontairement supprimées. Téléchargez une copie de récupération avant de réinitialiser.</p>
      <button type="button" className="primary-button" onClick={() => window.location.reload()}>Recharger l’application</button>
      <button type="button" className="secondary-button" onClick={this.downloadRecovery}>Télécharger mes données brutes</button>
      <button type="button" className="secondary-button" onClick={() => void this.reset()}>Réinitialiser les données locales</button>
    </main>;
  }
}

export default function Prototype() {
  const appStore = useMemo(() => createAppStateStore(DEFAULT_APP_STATE), []);
  const initial = useMemo<FlowScreen>(() => ({ id: "root", render: (flow) => <AppShell flow={flow} appStore={appStore} /> }), [appStore]);
  return <PrototypeErrorBoundary><FlowStack initial={initial} /></PrototypeErrorBoundary>;
}'''
prototype = replace_between(prototype, "export default function Prototype()", "", new_bottom, "Prototype error boundary") if False else prototype
# replace_between cannot use an empty end marker; replace the exact tail instead.
tail_start = prototype.rfind("export default function Prototype()")
if tail_start < 0:
    raise RuntimeError("Prototype tail not found")
prototype = prototype[:tail_start] + new_bottom + "\n"
write("src/Prototype.tsx", prototype)


# ---------------------------------------------------------------------------
# Service worker: required atomic shell, catalogue cache and bounded images.
# ---------------------------------------------------------------------------
sw = r'''const SHELL_CACHE_PREFIX = "inflamm-menu-shell-";
const SHELL_CACHE = `${SHELL_CACHE_PREFIX}__SHELL_VERSION__`;
const RUNTIME_CACHE_PREFIX = "inflamm-menu-runtime-";
const RUNTIME_CACHE = `${RUNTIME_CACHE_PREFIX}v2`;
const CATALOGUE_CACHE_PREFIX = "inflamm-menu-catalogue-";
const CATALOGUE_CACHE = `${CATALOGUE_CACHE_PREFIX}v1`;
const MAX_RUNTIME_IMAGES = 120;
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest"
];

async function fetchRequired(request) {
  const response = await fetch(request, { cache: "reload" });
  if (!response.ok || response.type !== "basic") throw new Error(`Unable to precache ${request}: ${response.status}`);
  return response;
}

async function trimCache(cache, maximum) {
  const keys = await cache.keys();
  const excess = keys.length - maximum;
  if (excess > 0) await Promise.all(keys.slice(0, excess).map((request) => cache.delete(request)));
}

async function putSafely(cache, request, response, maximum) {
  try {
    await cache.put(request, response.clone());
  } catch {
    if (maximum) {
      await trimCache(cache, Math.max(1, Math.floor(maximum / 2)));
      try { await cache.put(request, response.clone()); } catch { return; }
    }
  }
  if (maximum) await trimCache(cache, maximum);
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  const responses = await Promise.all(APP_SHELL.map((path) => fetchRequired(path)));
  await Promise.all(APP_SHELL.map((path, index) => cache.put(path, responses[index].clone())));

  const indexResponse = await cache.match("/index.html") || await cache.match("/");
  if (!indexResponse) throw new Error("Application shell index missing");
  const html = await indexResponse.text();
  const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => `${url.pathname}${url.search}`);
  const uniqueAssets = [...new Set(assetPaths)];
  const assetResponses = await Promise.all(uniqueAssets.map((path) => fetchRequired(path)));
  await Promise.all(uniqueAssets.map((path, index) => cache.put(path, assetResponses[index].clone())));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) =>
          (key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE) ||
          (key.startsWith(RUNTIME_CACHE_PREFIX) && key !== RUNTIME_CACHE) ||
          (key.startsWith(CATALOGUE_CACHE_PREFIX) && key !== CATALOGUE_CACHE))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName, maximum) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") await putSafely(cache, request, response, maximum);
  return response;
}

async function navigationResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await putSafely(cache, "/index.html", response);
    return response;
  } catch {
    const fallback = await cache.match("/index.html") || await cache.match("/");
    if (fallback) return fallback;
    return new Response(
      "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Inflamm’Menu</title><body><p>Inflamm’Menu est momentanément indisponible hors connexion.</p></body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }
  if (url.pathname.endsWith("recettes-anti-inflammatoires.json")) {
    event.respondWith(cacheFirst(request, CATALOGUE_CACHE));
    return;
  }
  if (["script", "style", "font"].includes(request.destination)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
  if (request.destination === "image") {
    const belongsToShell = APP_SHELL.includes(url.pathname);
    event.respondWith(cacheFirst(request, belongsToShell ? SHELL_CACHE : RUNTIME_CACHE, belongsToShell ? undefined : MAX_RUNTIME_IMAGES));
  }
});
'''
write("public/sw.js", sw)


# ---------------------------------------------------------------------------
# Precache generated CSS font URLs even when Vite leaves url(...) unquoted.
# ---------------------------------------------------------------------------
precache = read("scripts/generate-precache.mjs")
old_loop = '''for (const file of filesIn(output).filter((candidate) => /\\.(?:css|html|js)$/i.test(candidate))) {
  const contents = readFileSync(file, "utf8");
  for (const match of contents.matchAll(/["'`](\\/[^"'`\\s)]+\\.(?:jpg|png|svg|woff2?))["'`]/gi)) {
    const publicPath = toPublicPath(match[1]);
    if (publicPath) references.add(publicPath);
  }
}'''
new_loop = '''for (const file of filesIn(output).filter((candidate) => /\\.(?:css|html|js)$/i.test(candidate))) {
  const contents = readFileSync(file, "utf8");
  const discovered = [
    ...contents.matchAll(/["'`](\\/[^"'`\\s)]+\\.(?:jpg|png|svg|woff2?))["'`]/gi),
    ...contents.matchAll(/url\\(\\s*["']?([^"')\\s]+\\.(?:jpg|png|svg|woff2?))["']?\\s*\\)/gi),
  ];
  for (const match of discovered) {
    const publicPath = toPublicPath(match[1]);
    if (publicPath) references.add(publicPath);
  }
}'''
precache = replace_once(precache, old_loop, new_loop, "precache font URLs")
write("scripts/generate-precache.mjs", precache)


# Remove test-only device chrome from the published Pages artifact, not from source fixtures.
pages = read("scripts/prepare-github-pages.mjs")
cleanup_marker = "Remove test-only mobile chrome from the public Pages artifact"
if cleanup_marker not in pages:
    pages += '''\n\n// Remove test-only mobile chrome from the public Pages artifact.\nconst { rm } = await import("node:fs/promises");\nfor (const relative of ["assets/iphone", "assets/android", "assets/status", "qa"]) {\n  await rm(new URL(`../dist/pages/${relative}`, import.meta.url), { recursive: true, force: true });\n}\n'''
write("scripts/prepare-github-pages.mjs", pages)


# ---------------------------------------------------------------------------
# CSS containment, messages and fatal recovery.
# ---------------------------------------------------------------------------
css = read("src/prototype.css")
css += '''\n\n/* Audit remediation: bounded catalogue rendering and recoverable status UI. */\n.catalogue-card { content-visibility: auto; contain-intrinsic-size: 360px; }\n.catalogue-more { margin-bottom: 28px; }\n.app-status-banner { margin: 10px 14px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }\n.app-status-banner button { flex: 0 0 36px; width: 36px; height: 36px; border: 0; border-radius: 999px; background: rgba(255,255,255,.55); color: inherit; display: grid; place-items: center; }\n.fatal-error { min-height: 100dvh; padding: 48px 24px; background: var(--ivory); color: var(--ink); font-family: var(--sans); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; }\n.fatal-error > svg { width: 42px; height: 42px; color: var(--terracotta); }\n.fatal-error h1 { margin: 0; font-family: var(--serif); font-size: clamp(32px, 7vw, 48px); }\n.fatal-error p { max-width: 560px; color: var(--muted); line-height: 1.6; }\n.fatal-error button { width: min(100%, 420px); padding: 0 20px; }\n'''
write("src/prototype.css", css)


# ---------------------------------------------------------------------------
# Package scripts, patched PostCSS and CI validation on pull requests.
# ---------------------------------------------------------------------------
package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
scripts = package["scripts"]
scripts["test:app"] = "playwright test tests/app-v1.spec.ts"
scripts["test:runtime"] = "playwright test tests/mobile-runtime.spec.ts"
scripts["test:browser"] = "playwright test tests/app-v1.spec.ts tests/mobile-runtime.spec.ts"
scripts["test:sw"] = "node --test tests/service-worker.test.mjs"
if "npm run test:sw" not in scripts["test:preview"]:
    scripts["test:preview"] += " && npm run test:sw"
package["overrides"] = { **package.get("overrides", {}), "postcss": "8.5.18" }
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

checkout = "3d3c42e5aac5ba805825da76410c181273ba90b1"
setup_node = "820762786026740c76f36085b0efc47a31fe5020"
configure_pages = "45bfe0192ca1faeb007ade9deae92b16b8254a0d"
upload_pages = "fc324d3547104276b827a68afc52ff2a11cc49c9"
deploy_pages = "cd2ce8fcbc39b97be8ca5fce6e763baed58fa128"
write(".github/workflows/deploy-pages.yml", f'''name: Deploy GitHub Pages\n\non:\n  push:\n    branches: [main]\n  workflow_dispatch:\n\npermissions:\n  contents: read\n  pages: write\n  id-token: write\n\nconcurrency:\n  group: pages\n  cancel-in-progress: true\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Check out repository\n        uses: actions/checkout@{checkout}\n        with:\n          persist-credentials: false\n\n      - name: Set up Node.js\n        uses: actions/setup-node@{setup_node}\n        with:\n          node-version: 22\n          cache: npm\n\n      - name: Install dependencies\n        run: npm ci\n\n      - name: Validate recipes, prompts, images and menu engine\n        run: npm run test:preview\n\n      - name: Build for GitHub Pages\n        run: npm run build:pages\n\n      - name: Configure GitHub Pages\n        uses: actions/configure-pages@{configure_pages}\n\n      - name: Upload site artifact\n        uses: actions/upload-pages-artifact@{upload_pages}\n        with:\n          path: dist/pages\n\n  deploy:\n    environment:\n      name: github-pages\n      url: ${{{{ steps.deployment.outputs.page_url }}}}\n    runs-on: ubuntu-latest\n    needs: build\n    steps:\n      - name: Deploy to GitHub Pages\n        id: deployment\n        uses: actions/deploy-pages@{deploy_pages}\n''')

write(".github/workflows/validate-pr.yml", f'''name: Validate pull requests\n\non:\n  pull_request:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: validate-${{{{ github.ref }}}}\n  cancel-in-progress: true\n\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    timeout-minutes: 45\n    steps:\n      - name: Check out repository\n        uses: actions/checkout@{checkout}\n        with:\n          persist-credentials: false\n\n      - name: Set up Node.js\n        uses: actions/setup-node@{setup_node}\n        with:\n          node-version: 22\n          cache: npm\n\n      - name: Install dependencies\n        run: npm ci\n\n      - name: Validate data and unit tests\n        run: npm run test:preview\n\n      - name: Install Chromium for Playwright\n        run: npx playwright install --with-deps chromium\n\n      - name: Test application journeys\n        run: npm run test:app\n\n      - name: Test mobile runtime\n        run: npm run test:runtime\n\n      - name: Build GitHub Pages artifact\n        run: npm run build:pages\n\n      - name: Build alternative worker and test it\n        run: |\n          npm run build\n          npm run test:sites\n''')


# Static service-worker regression tests.
write("tests/service-worker.test.mjs", r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const precache = await readFile(new URL("../scripts/generate-precache.mjs", import.meta.url), "utf8");

test("service worker requires a complete shell before skipWaiting", () => {
  assert.match(worker, /Promise\.all\(APP_SHELL/);
  assert.doesNotMatch(worker, /Promise\.allSettled\(APP_SHELL/);
  assert.match(worker, /precacheShell\(\)\.then\(\(\) => self\.skipWaiting\(\)\)/);
});

test("service worker caches catalogue requests and bounds runtime images", () => {
  assert.match(worker, /recettes-anti-inflammatoires\.json/);
  assert.match(worker, /CATALOGUE_CACHE/);
  assert.match(worker, /MAX_RUNTIME_IMAGES = 120/);
  assert.match(worker, /trimCache/);
});

test("precache discovers unquoted CSS url references", () => {
  assert.match(precache, /url\\\\\(/);
  assert.match(precache, /woff2/);
});
''')

print("UI, PWA and CI remediation applied successfully.")
