import { type CatalogueRecipe, plannerAvailabilityFor, type CatalogueData, catalogueFavoriteId } from "../catalog";
import { useState, useSyncExternalStore } from "react";
import { cleanLabel, shoppingConflict, type RecipeCollection } from "../personal-library";
import { KeyboardInput, useKeyboard } from "../mobile";
import { type AppStateStore } from "../app/app-state-store";
import { normalizeText } from "../components/format";
import { type Recipe } from "../domain";
import { shoppingIdentityFor } from "../shopping";
import { recipesForState, ACTIVE_RECIPES } from "../app/recipe-registry";
import { WebSheet } from "../components/WebSheet";
import { matchesRecipeSearch } from "../recipe-search";
import { Cross2Icon } from "@radix-ui/react-icons";

export function availabilityForShopping(recipe: CatalogueRecipe): boolean {
  const availability = plannerAvailabilityFor(recipe);
  return availability.plannable || availability.kind === "side-dish";
}

function CollectionNameForm({ initial = "", onSave }: { initial?: string; onSave: (name: string) => string | null }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState("");
  return <form className="personal-form" onSubmit={(event) => { event.preventDefault(); setError(onSave(cleanLabel(name)) ?? ""); }}><label className="text-field"><span>Nom de la collection</span><KeyboardInput value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Par exemple : À essayer" /></label>{error ? <p role="alert">{error}</p> : null}<button className="primary-button" type="submit" disabled={!name.trim()}>Enregistrer la collection</button></form>;
}

function saveCollection(store: AppStateStore, name: string, id?: string, recipeId?: string): string | null {
  const live = store.getSnapshot();
  if (!name) return "Donnez un nom à la collection.";
  if (live.recipeCollections.some((item) => item.id !== id && normalizeText(item.name) === normalizeText(name))) return "Une collection porte déjà ce nom.";
  if (id && !live.recipeCollections.some((item) => item.id === id)) return "Cette collection a été supprimée.";
  if (!id && live.recipeCollections.length >= 100) return "Vous avez atteint la limite de 100 collections.";
  store.setState((current) => ({ ...current, recipeCollections: id ? current.recipeCollections.map((item) => item.id === id ? { ...item, name } : item) : [...current.recipeCollections, { id: `collection-${crypto.randomUUID()}`, name, recipeIds: recipeId ? [recipeId] : [] }] }));
  return null;
}

export function RecipeTools({ store, recipeId, recipe, portions, shoppingAllowed = true }: { store: AppStateStore; recipeId: string; recipe?: Recipe; portions: number; shoppingAllowed?: boolean }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const keyboard = useKeyboard();
  const existing = state.shoppingRecipes.find((entry) => entry.recipe.id === recipeId);
  const add = () => {
    const live = store.getSnapshot();
    if (!recipe || !shoppingAllowed) { setMessage("Cette recette ne peut pas être ajoutée automatiquement aux courses."); return; }
    if (shoppingConflict(recipe, live.profile, recipesForState(live).flatMap((item) => item.ingredients))) { setMessage("Cette recette contient un ingrédient exclu ou ne correspond pas au régime de votre profil. Vérifiez votre profil."); return; }
    if (!existing && live.shoppingRecipes.length >= 100) { setMessage("Retirez une recette des courses avant d’en ajouter une autre."); return; }
    const ids = new Set(recipe.ingredients.map((item) => shoppingIdentityFor(item.id).shoppingId));
    store.setState((current) => ({ ...current, shoppingRecipes: [...current.shoppingRecipes.filter((item) => item.recipe.id !== recipeId), { recipe, portions }], extraShoppingCheckedIds: current.extraShoppingCheckedIds.filter((id) => !ids.has(shoppingIdentityFor(id).shoppingId)), checkedShoppingItemIds: current.checkedShoppingItemIds.filter((id) => !ids.has(shoppingIdentityFor(id).shoppingId)) }));
    setMessage(`Courses mises à jour pour ${portions} personne${portions > 1 ? "s" : ""}. Votre semaine est conservée.`);
  };
  return <section className="personal-recipe-tools"><div className="recipe-actions"><button className="secondary-button" type="button" onClick={() => { keyboard.hide(); setOpen(true); }}>Classer dans une collection</button>{recipe && shoppingAllowed ? <button className="secondary-button" type="button" onClick={add}>{existing ? "Mettre à jour les courses" : "Ajouter aux courses"}</button> : null}</div>{message ? <p role="status">{message}</p> : null}
    <WebSheet open={open} onOpenChange={setOpen} title="Classer cette recette"><div className="personal-form">{state.recipeCollections.length ? state.recipeCollections.map((collection) => <label className="collection-choice" key={collection.id}><input type="checkbox" checked={collection.recipeIds.includes(recipeId)} onChange={(event) => { const checked = event.target.checked; store.setState((current) => ({ ...current, recipeCollections: current.recipeCollections.map((item) => item.id === collection.id ? { ...item, recipeIds: checked ? [...new Set([...item.recipeIds, recipeId])] : item.recipeIds.filter((id) => id !== recipeId) } : item) })); }} />{collection.name}</label>) : <p>Aucune collection. Créez la première ci-dessous.</p>}<CollectionNameForm onSave={(name) => { const error = saveCollection(store, name, undefined, recipeId); if (!error) { setOpen(false); setMessage("Recette classée dans votre nouvelle collection."); } return error; }} /><button className="secondary-button" type="button" onClick={() => setOpen(false)}>Terminer</button></div></WebSheet>
  </section>;
}

export function CollectionsView({ store, catalogue, onLoad, onOpen }: { store: AppStateStore; catalogue: CatalogueData | null; onLoad: () => void; onOpen: (id: string) => void }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [removed, setRemoved] = useState<RecipeCollection | null>(null);
  const [notice, setNotice] = useState("");
  const keyboard = useKeyboard();
  const collection = state.recipeCollections.find((item) => item.id === selected);
  const resolve = (id: string) => catalogue?.recipes.find((item) => catalogueFavoriteId(item) === id)?.titre ?? ACTIVE_RECIPES.find((item) => item.id === id)?.title;
  return <details className="personal-collections"><summary>Mes collections · {state.recipeCollections.length}</summary><div className="personal-form"><button className="secondary-button" type="button" onClick={() => { keyboard.hide(); setEditing(""); }}>Nouvelle collection</button>
    {state.recipeCollections.length ? <label className="text-field"><span>Choisir une collection</span><select aria-label="Choisir une collection" value={selected} onChange={(event) => { setSelected(event.target.value); setQuery(""); onLoad(); }}><option value="">Choisir…</option>{state.recipeCollections.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.recipeIds.length})</option>)}</select></label> : <p>Rangez vos recettes par envie : « À essayer », « Rapides »…</p>}
    {collection ? <section><h2>{collection.name}</h2><div className="recipe-actions"><button className="text-button" type="button" onClick={() => { keyboard.hide(); setEditing(collection.id); }}>Renommer la collection</button><button className="text-button" type="button" onClick={() => { setRemoved(collection); store.setState((current) => ({ ...current, recipeCollections: current.recipeCollections.filter((item) => item.id !== collection.id) })); setSelected(""); }}>Supprimer la collection</button></div>
    <label className="text-field"><span>Rechercher dans cette collection</span><KeyboardInput value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    {!collection.recipeIds.length ? <p>Ouvrez une recette puis choisissez « Classer dans une collection ».</p> : null}
    {collection.recipeIds.filter((id) => !query || matchesRecipeSearch(resolve(id) ?? "", query)).map((id) => <div className="collection-recipe-row" key={id}><button className="text-button" type="button" disabled={!resolve(id)} onClick={() => onOpen(id)}>{resolve(id) ?? "Recette à charger ou indisponible"}</button><button className="text-button" type="button" aria-label={`Retirer ${resolve(id) ?? "la recette"} de la collection`} onClick={() => store.setState((current) => ({ ...current, recipeCollections: current.recipeCollections.map((item) => item.id === collection.id ? { ...item, recipeIds: item.recipeIds.filter((entry) => entry !== id) } : item) }))}><Cross2Icon /></button></div>)}
    {query && !collection.recipeIds.some((id) => matchesRecipeSearch(resolve(id) ?? "", query)) ? <p>Aucune recette ne correspond à votre recherche.</p> : null}
    {!catalogue && collection.recipeIds.some((id) => !resolve(id)) ? <button className="secondary-button" type="button" onClick={onLoad}>Charger les recettes de la collection</button> : null}</section> : null}
    {removed ? <div role="status">Collection supprimée. Les recettes sont conservées. <button className="text-button" type="button" onClick={() => { const live = store.getSnapshot(); if (live.recipeCollections.length >= 100) { setNotice("Libérez une place pour restaurer cette collection."); return; } store.setState((current) => ({ ...current, recipeCollections: current.recipeCollections.some((item) => item.id === removed.id) ? current.recipeCollections : [...current.recipeCollections, removed] })); setSelected(removed.id); setRemoved(null); }}>Annuler la suppression de la collection</button></div> : null}{notice ? <p role="status">{notice}</p> : null}
    </div><WebSheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} title={editing ? "Renommer la collection" : "Nouvelle collection"}><CollectionNameForm key={editing} initial={state.recipeCollections.find((item) => item.id === editing)?.name} onSave={(name) => { const error = saveCollection(store, name, editing || undefined); if (!error) setEditing(null); return error; }} /></WebSheet></details>;
}
