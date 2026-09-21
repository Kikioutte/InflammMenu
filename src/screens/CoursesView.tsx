import { type PantryAmount, type ShoppingItem, type WeeklyPlan, type UserProfile, type IngredientCategory } from "../domain";
import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { parseNumericInput } from "../numeric-input";
import { formatIngredientUnit } from "../presentation";
import { KeyboardInput } from "../mobile";
import { type ManualShoppingItem, shoppingContext, cleanLabel, shoppingConflict } from "../personal-library";
import { shoppingIdentityFor, storedShoppingItemMatches } from "../shopping";
import { buildShoppingList, formatShoppingListText } from "../engine";
import { ArrowLeftIcon, ChevronRightIcon, CheckIcon, ArchiveIcon, Share2Icon, CopyIcon, DownloadIcon, Cross2Icon } from "@radix-ui/react-icons";
import { type AppStateStore } from "../app/app-state-store";
import { ACTIVE_RECIPES, recipeById } from "../app/recipe-registry";
import { formatWeekRange } from "../components/format";
import { CATEGORY_LABELS } from "../components/constants";
import { copyTextToClipboard, downloadTextFile } from "../components/browser-files";

function PantryAmountInput({ ingredientId, ingredientName, unit, value, onChange }: {
  ingredientId: string;
  ingredientName: string;
  unit: PantryAmount["unit"];
  value: number;
  onChange: (ingredientId: string, unit: PantryAmount["unit"], quantity: number | null) => void;
}) {
  const formattedValue = value > 0 ? String(value) : "";
  const [draft, setDraft] = useState(formattedValue);
  const [error, setError] = useState("");
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(formattedValue);
  }, [formattedValue]);

  const parsedQuantity = (raw: string): number | null => {
    return parseNumericInput(raw, { min: 0, max: 1_000_000 });
  };
  const commit = (raw: string) => {
    const quantity = parsedQuantity(raw);
    if (quantity !== null) onChange(ingredientId, unit, quantity || null);
  };
  const finishEditing = () => {
    editing.current = false;
    const quantity = parsedQuantity(draft.trim().replace(/[.,]$/, ""));
    if (quantity !== null) {
      setDraft(quantity ? String(quantity) : "");
      setError("");
      onChange(ingredientId, unit, quantity || null);
      return;
    }
    if (!draft.trim()) {
      setDraft("");
      setError("");
      onChange(ingredientId, unit, null);
      return;
    }
    setError("Saisissez une quantité entre 0 et 1 000 000. Le stock précédent est conservé.");
  };
  const unitLabel = formatIngredientUnit(unit, 2);

  return <label className="pantry-amount">
    <span className="sr-only">Quantité déjà en stock pour {ingredientName}, en {unitLabel}</span>
    <KeyboardInput
      inputMode="decimal"
      pattern="[0-9]*[.,]?[0-9]*"
      placeholder="0"
      data-testid={`pantry-amount-${ingredientId}-${unit}`}
      value={draft}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `pantry-error-${ingredientId}-${unit}` : undefined}
      onFocus={() => { editing.current = true; }}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        setError("");
        commit(raw);
      }}
      onBlur={finishEditing}
    />
    <small>{formatIngredientUnit(unit, parsedQuantity(draft) ?? 1)}</small>
    {error ? <small id={`pantry-error-${ingredientId}-${unit}`} role="alert">{error}</small> : null}
  </label>;
}

function PantryAmountFields({ item, units, valueFor, onChange }: {
  item: ShoppingItem;
  units: readonly PantryAmount["unit"][];
  valueFor: (ingredientId: string, unit: PantryAmount["unit"]) => number;
  onChange: (ingredientId: string, unit: PantryAmount["unit"], quantity: number | null) => void;
}) {
  return <div className="pantry-amounts">{units.map((unit) => <PantryAmountInput
    ingredientId={item.ingredientId}
    ingredientName={item.name}
    key={unit}
    unit={unit}
    value={valueFor(item.ingredientId, unit)}
    onChange={onChange}
  />)}</div>;
}

function SpendAmountInput({ value, onChange }: { value?: number; onChange: (value: number | null) => void }) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const [error, setError] = useState("");
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(value === undefined ? "" : String(value));
  }, [value]);
  const parse = (raw: string) => parseNumericInput(raw, { min: 0, max: 100_000, decimals: 2 });
  return <label className="text-field"><span className="sr-only">Montant réellement dépensé</span>
    <KeyboardInput inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" placeholder="Montant réel" data-testid="spend-input" value={draft}
      aria-invalid={Boolean(error)} aria-describedby={error ? "spend-input-error" : undefined}
      onFocus={() => { editing.current = true; }}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        setError("");
        const amount = parse(raw);
        if (amount !== null) onChange(amount);
      }}
      onBlur={() => {
        editing.current = false;
        if (!draft.trim()) { onChange(null); setError(""); return; }
        const amount = parse(draft.trim().replace(/[.,]$/, ""));
        if (amount === null) { setError("Saisissez un montant de 0 à 100 000 €, avec au maximum deux décimales. Le montant précédent est conservé."); return; }
        onChange(amount);
        setDraft(String(amount).replace(".", ","));
        setError("");
      }} />
    {error ? <small id="spend-input-error" role="alert">{error}</small> : null}
  </label>;
}

export function CoursesView({ store, onRecipes, plan, profile, checkedIds, pantryIds, pantryAmounts, categoryOrder, spent, onToggleChecked, onTogglePantry, onSetPantryAmount, onMoveCategory, onSetSpent }: {
  store: AppStateStore;
  onRecipes: () => void;
  plan: WeeklyPlan | null;
  profile: UserProfile;
  checkedIds: string[];
  pantryIds: string[];
  pantryAmounts: Record<string, PantryAmount>;
  categoryOrder: IngredientCategory[];
  spent?: number;
  onToggleChecked: (id: string) => void;
  onTogglePantry: (id: string) => void;
  onSetPantryAmount: (id: string, unit: PantryAmount["unit"], quantity: number | null) => void;
  onMoveCategory: (category: IngredientCategory, direction: -1 | 1) => void;
  onSetSpent: (amount: number | null) => void;
}) {
  const extras = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [newItem, setNewItem] = useState("");
  const [removedItem, setRemovedItem] = useState<ManualShoppingItem | null>(null);
  const [cartMessage, setCartMessage] = useState("");
  const context = shoppingContext(plan, ACTIVE_RECIPES, extras.shoppingRecipes, profile);
  const combinedChecked = [...new Set([...checkedIds, ...extras.extraShoppingCheckedIds])];
  const toggleItem = (id: string) => {
    if (id.startsWith("article-")) store.setState((current) => ({ ...current, shoppingItems: current.shoppingItems.map((item) => item.id === id ? { ...item, checked: !item.checked } : item) }));
    else onToggleChecked(id);
  };
  const changeExtra = (id: string, portions: number | null) => {
    store.setState((current) => {
      const affected = new Set(current.shoppingRecipes.find((entry) => entry.recipe.id === id)?.recipe.ingredients.map((item) => shoppingIdentityFor(item.id).shoppingId) ?? []);
      return { ...current, shoppingRecipes: portions === null ? current.shoppingRecipes.filter((entry) => entry.recipe.id !== id) : current.shoppingRecipes.map((entry) => entry.recipe.id === id ? { ...entry, portions } : entry), extraShoppingCheckedIds: current.extraShoppingCheckedIds.filter((key) => !affected.has(shoppingIdentityFor(key).shoppingId)), checkedShoppingItemIds: current.checkedShoppingItemIds.filter((key) => !affected.has(shoppingIdentityFor(key).shoppingId)) };
    });
  };
  const [pantryMode, setPantryMode] = useState(false);
  const [storeMode, setStoreMode] = useState(false);
  const [storeCategoryIndex, setStoreCategoryIndex] = useState(0);
  const [exportFeedback, setExportFeedback] = useState("");
  const feedbackTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);
  const requiredItems = buildShoppingList(context.plan, context.recipes, {
    checkedShoppingItemIds: combinedChecked,
    pantryIngredientIds: pantryIds,
  });
  const shoppingItems = buildShoppingList(context.plan, context.recipes, {
    checkedShoppingItemIds: combinedChecked,
    pantryIngredientIds: pantryIds,
    pantryAmounts,
  });
  const shoppingById = new Map(shoppingItems.map((item) => [item.ingredientId, item]));
  const requiredById = new Map(requiredItems.map((item) => [item.ingredientId, item]));
  const recipeItems = pantryMode
    ? requiredItems.map((required) => {
      const remaining = shoppingById.get(required.ingredientId);
      return {
        ...(remaining ?? required),
        amounts: remaining?.amounts ?? [],
        purchaseSuggestion: remaining?.purchaseSuggestion ?? "Tout est déjà en stock",
        stockUnits: required.amounts.map(({ unit }) => unit),
        fullyCovered: !remaining,
      };
    })
    : shoppingItems.map((item) => ({
      ...item,
      stockUnits: (requiredById.get(item.ingredientId) ?? item).amounts.map(({ unit }) => unit),
      fullyCovered: false,
    }));
  const items = [...recipeItems, ...extras.shoppingItems.map((item) => ({ ingredientId: item.id, name: item.name, category: "grocery" as const, amounts: [], purchaseSuggestion: "Ajout libre", checked: item.checked, inPantry: false, stockUnits: [], fullyCovered: false }))];
  const pantryAmountFor = (ingredientId: string, unit: PantryAmount["unit"]): number => Object.entries(pantryAmounts)
    .filter(([storedId, amount]) => storedShoppingItemMatches(storedId, ingredientId) && amount.unit === unit)
    .reduce((total, [, amount]) => total + amount.quantity, 0);
  const listText = formatShoppingListText(shoppingItems, {
    week: plan ? formatWeekRange(plan.startsOn) : undefined,
    people: profile.people,
    categoryLabels: CATEGORY_LABELS,
  }) + (extras.shoppingItems.length ? "\n\nAJOUTS LIBRES\n" + extras.shoppingItems.filter((item) => !item.checked).map((item) => `- ${item.name}`).join("\n") : "");
  const listFileName = `liste-courses-${plan?.startsOn ?? "libres"}.txt`;
  const announce = (message: string) => {
    setExportFeedback(message);
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setExportFeedback(""), 4000);
  };
  const share = async () => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: "Liste de courses", text: listText });
        return;
      }
      await copy();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      announce("Partage indisponible sur cet appareil.");
    }
  };
  const copy = async () => {
    if (await copyTextToClipboard(listText)) announce("Liste copiée dans le presse-papiers.");
    else announce("Copie impossible : utilisez le téléchargement.");
  };
  const download = () => {
    try {
      downloadTextFile(listFileName, listText);
      announce("Liste téléchargée.");
    } catch {
      announce("Téléchargement impossible sur cet appareil.");
    }
  };
  const groups = categoryOrder
    .map((category) => ({ category, label: CATEGORY_LABELS[category], items: items.filter((item) => item.category === category) }))
    .filter((group) => group.items.length);
  const checkedCount = items.filter((item) => item.checked || item.inPantry || item.fullyCovered).length;
  const safeStoreIndex = Math.min(Math.max(0, storeCategoryIndex), Math.max(0, groups.length - 1));
  const storeGroup = groups[safeStoreIndex];
  if (storeMode && storeGroup) {
    const aisleChecked = storeGroup.items.filter((item) => item.checked || item.inPantry).length;
    return (
      <main className="page-content courses-page store-mode" data-testid="store-mode">
        <div className="store-mode__top"><span className="eyebrow">Mode magasin</span><button type="button" className="text-button" data-testid="exit-store-mode" onClick={() => setStoreMode(false)}>Quitter</button></div>
        <div className="store-mode__progress"><strong>Rayon {safeStoreIndex + 1} sur {groups.length}</strong><span>{checkedCount} / {items.length} article{items.length > 1 ? "s" : ""} fait{items.length > 1 ? "s" : ""}</span></div>
        <header className="store-mode__heading"><small>Rayon actuel</small><h1>{storeGroup.label}</h1><p>{aisleChecked} sur {storeGroup.items.length} article{storeGroup.items.length > 1 ? "s" : ""} coché{storeGroup.items.length > 1 ? "s" : ""}</p></header>
        <nav className="store-mode__nav" aria-label="Changer de rayon">
          <button type="button" className="secondary-button" disabled={safeStoreIndex === 0} data-testid="store-previous-aisle" onClick={() => setStoreCategoryIndex((value) => Math.max(0, value - 1))}><ArrowLeftIcon /> Précédent</button>
          <button type="button" className="primary-button" disabled={safeStoreIndex === groups.length - 1} data-testid="store-next-aisle" onClick={() => setStoreCategoryIndex((value) => Math.min(groups.length - 1, value + 1))}>{safeStoreIndex === groups.length - 1 ? "Dernier rayon" : "Rayon suivant"} <ChevronRightIcon /></button>
        </nav>
        <div className="store-mode__items">{storeGroup.items.map((item) => {
          const isRemoved = item.checked || item.inPantry || item.fullyCovered;
          return <button key={item.ingredientId} type="button" className={`store-item ${isRemoved ? "is-checked" : ""}`} aria-pressed={isRemoved} aria-label={item.inPantry ? `${item.name}, en réserve` : `${item.checked ? "Décocher" : "Cocher"} ${item.name}`} disabled={item.inPantry} data-testid={`store-item-${item.ingredientId}`} onClick={() => toggleItem(item.ingredientId)}><span className="store-item__check" aria-hidden="true">{isRemoved ? <CheckIcon /> : null}</span><span><strong>{item.name}</strong><small>{item.inPantry ? "En réserve" : item.purchaseSuggestion}</small></span></button>;
        })}</div>
      </main>
    );
  }
  return (
    <main className="page-content courses-page" data-testid="courses-view">
      <div className="page-heading"><span className="eyebrow">{plan ? `Semaine du ${formatWeekRange(plan.startsOn)}` : "À votre rythme"}</span><h1>Liste de courses</h1><p>{checkedCount} sur {items.length} article{items.length > 1 ? "s" : ""} retiré{items.length > 1 ? "s" : ""} ou coché{items.length > 1 ? "s" : ""}</p></div>
      <section className="personal-shopping" aria-label="Compléter les courses">
        <form className="personal-form" onSubmit={(event) => { event.preventDefault(); const name = cleanLabel(newItem, 160); if (!name) return; if (store.getSnapshot().shoppingItems.length >= 200) { setCartMessage("Retirez un article avant d’en ajouter un autre."); return; } store.setState((current) => ({ ...current, shoppingItems: [...current.shoppingItems, { id: `article-${crypto.randomUUID()}`, name, checked: false }] })); setNewItem(""); setCartMessage("Article ajouté."); }}>
          <label className="text-field"><span>Ajouter un article</span><KeyboardInput placeholder="Par exemple : papier cuisson" maxLength={160} value={newItem} onChange={(event) => setNewItem(event.target.value)} /></label><button className="secondary-button" type="submit" disabled={!newItem.trim()}>Ajouter l’article</button>
        </form><button type="button" className="secondary-button" onClick={onRecipes}>Choisir une recette pour les courses</button>
        {!plan && !items.length ? <p>Votre liste est vide. Ajoutez un article ou ouvrez une recette et choisissez « Ajouter aux courses ».</p> : null}
        {extras.shoppingRecipes.length ? <details><summary>Recettes ajoutées aux courses · {extras.shoppingRecipes.length}</summary><p>Ces achats s’ajoutent à ceux de la semaine. Ils ne composent pas un repas et ne valident pas d’associations entre recettes.</p>{extras.shoppingRecipes.map((entry) => <div className="shopping-extra" key={entry.recipe.id}><strong>{entry.recipe.title}</strong><label>Personnes pour {entry.recipe.title}<select aria-label={`Personnes pour les courses de ${entry.recipe.title}`} value={entry.portions} onChange={(event) => changeExtra(entry.recipe.id, Number(event.target.value))}>{[1,2,3,4,5,6,7,8].map((value) => <option key={value}>{value}</option>)}</select></label><button type="button" className="text-button" onClick={() => changeExtra(entry.recipe.id, null)}>Retirer cette recette des courses</button>{shoppingConflict(entry.recipe, profile, ACTIVE_RECIPES.flatMap((item) => item.ingredients)) ? <p role="alert">Cette recette ajoutée ne correspond plus au régime ou aux exclusions de votre profil.</p> : null}</div>)}</details> : null}
        {cartMessage ? <p role="status">{cartMessage}</p> : null}
        {removedItem ? <p role="status">Article supprimé. <button className="text-button" type="button" onClick={() => { if (store.getSnapshot().shoppingItems.length >= 200) { setCartMessage("Retirez un article pour libérer une place."); return; } store.setState((current) => ({ ...current, shoppingItems: current.shoppingItems.some((item) => item.id === removedItem.id) ? current.shoppingItems : [...current.shoppingItems, removedItem] })); setRemovedItem(null); }}>Annuler la suppression de l’article</button></p> : null}
      </section>
      <div className="shopping-progress"><span style={{ width: `${items.length ? (checkedCount / items.length) * 100 : 0}%` }} /></div>
      <button className="primary-button full-button store-mode-entry" type="button" data-testid="enter-store-mode" disabled={!items.length} onClick={() => { setStoreCategoryIndex(0); setPantryMode(false); setStoreMode(true); }}><ArchiveIcon /> Mode magasin simplifié</button>
      <div className="courses-actions">
        <button className="secondary-button" type="button" data-testid="share-list" onClick={() => void share()}><Share2Icon /> Partager</button>
        <button className="secondary-button" type="button" data-testid="copy-list" onClick={() => void copy()}><CopyIcon /> Copier</button>
        <button className="secondary-button" type="button" data-testid="download-list" onClick={download}><DownloadIcon /> Fichier</button>
        <button className="secondary-button" type="button" data-testid="print-list" onClick={() => window.print()}><CopyIcon /> Imprimer</button>
      </div>
      <p className="export-feedback" role="status" aria-live="polite" data-testid="export-feedback">{exportFeedback}</p>
      <button className={`secondary-button pantry-button ${pantryMode ? "is-active" : ""}`} type="button" onClick={() => setPantryMode((value) => !value)}><CheckIcon /> {pantryMode ? "Terminer l’inventaire" : "Retirer ce que j’ai déjà"}</button>
      {pantryMode ? <p className="inline-help">Touchez « J’ai déjà » pour retirer un ingrédient, ou saisissez la quantité en stock pour ne racheter que le complément. Les flèches réordonnent les rayons selon votre magasin.</p> : null}
      {plan ? <section className="spend-tracker" data-testid="spend-tracker">
        <div><strong>Budget de la semaine</strong><small>{plan.estimatedCost.toFixed(0)} € estimés{typeof spent === "number" ? ` · ${spent.toFixed(2).replace(".", ",")} € dépensés` : ""}</small></div>
        <SpendAmountInput key={plan.id} value={spent} onChange={onSetSpent} />
        {plan.meals.some((meal) => !meal.skipped && recipeById.get(meal.recipeId)?.costRecalculated === false) ? <p className="inline-help">Estimation partielle : le coût de certaines recettes modifiées n’a pas pu être recalculé. Le montant réellement dépensé reste indépendant.</p> : null}
        {typeof spent === "number" ? <p className={`spend-delta ${spent > plan.estimatedCost ? "is-over" : "is-under"}`}>{spent > plan.estimatedCost ? `${(spent - plan.estimatedCost).toFixed(2).replace(".", ",")} € au-dessus de l’estimation` : `${(plan.estimatedCost - spent).toFixed(2).replace(".", ",")} € sous l’estimation`}</p> : null}
        <p className="catalogue-disclaimer">Les prix affichés restent des estimations ; ce montant vous permet de mesurer l’écart réel.</p>
      </section> : null}
      <div className="shopping-groups">{groups.map((group, groupIndex) => <section key={group.category} className="shopping-group"><h2>{group.label}<span>{group.items.length}</span>{pantryMode ? <span className="aisle-order"><button type="button" aria-label={`Monter le rayon ${group.label}`} disabled={groupIndex === 0} data-testid={`aisle-up-${group.category}`} onClick={() => onMoveCategory(group.category, -1)}>↑</button><button type="button" aria-label={`Descendre le rayon ${group.label}`} disabled={groupIndex === groups.length - 1} data-testid={`aisle-down-${group.category}`} onClick={() => onMoveCategory(group.category, 1)}>↓</button></span> : null}</h2>{group.items.map((item) => {
        const isRemoved = item.checked || item.inPantry || item.fullyCovered;
        return <div key={item.ingredientId} className={`shopping-item ${isRemoved ? "is-checked" : ""}`}><button className="shopping-toggle" type="button" aria-label={`${item.checked ? "Décocher" : "Cocher"} ${item.name}`} onClick={() => toggleItem(item.ingredientId)}><span className="shopping-check" aria-hidden="true">{isRemoved ? <CheckIcon /> : null}</span><span><strong>{item.name}</strong><small>{item.purchaseSuggestion}</small></span></button>{item.ingredientId.startsWith("article-") ? <button type="button" className="text-button" aria-label={`Supprimer ${item.name}`} onClick={() => { setRemovedItem(extras.shoppingItems.find((entry) => entry.id === item.ingredientId) ?? null); store.setState((current) => ({ ...current, shoppingItems: current.shoppingItems.filter((entry) => entry.id !== item.ingredientId) })); }}><Cross2Icon /></button> : null}{pantryMode && !item.ingredientId.startsWith("article-") ? <div className="pantry-controls"><button type="button" className={`pantry-chip ${item.inPantry ? "is-selected" : ""}`} onClick={() => onTogglePantry(item.ingredientId)}>{item.inPantry ? "Retiré" : "J’ai déjà"}</button><PantryAmountFields item={item} units={item.stockUnits} valueFor={pantryAmountFor} onChange={onSetPantryAmount} /></div> : null}</div>;
      })}</section>)}</div>
    </main>
  );
}
