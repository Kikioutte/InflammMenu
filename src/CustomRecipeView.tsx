import { useEffect, useRef, useState } from "react";
import { MinusIcon, PlusIcon } from "@radix-ui/react-icons";
import { KeyboardInput, KeyboardTextarea, MobileScroll, useKeyboard } from "./mobile";
import type { IngredientUnit, Recipe } from "./domain";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { displayQuantity, formatDecimal, parseDecimal } from "./view-format";

const quantityStep: Record<IngredientUnit, number> = { g: 5, ml: 5, piece: 0.25, c_soupe: 0.25, c_cafe: 0.25 };

export default function CustomRecipeView({ draft, onSave, onDelete }: { draft: Recipe; onSave: (recipe: Recipe) => void; onDelete?: () => void }) {
  const keyboard = useKeyboard();
  const [title, setTitle] = useState(draft.title);
  const [prepMinutes, setPrepMinutes] = useState(String(draft.prepMinutes));
  const [cost, setCost] = useState(String(draft.costPerPortion).replace(".", ","));
  const [steps, setSteps] = useState(draft.steps.join("\n"));
  const [ingredients, setIngredients] = useState(draft.ingredients.map((item) => ({ ...item })));
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savePending = useRef(false);
  const editorActive = useRef(true);
  useEffect(() => { editorActive.current = true; return () => { editorActive.current = false; }; }, []);
  const setQuantity = (index: number, delta: number) => setIngredients((current) => current.map((item, position) => (position === index
    ? { ...item, quantity: Math.max(0, Math.round((item.quantity + delta) * 100) / 100) }
    : item)));
  const commit = async () => {
    if (savePending.current) return;
    keyboard.hide();
    setInvalidField(null);
    const minutes = parseDecimal(prepMinutes, 1, 1_440);
    const costPerPortion = parseDecimal(cost, 0, 10_000);
    if (!title.trim() || minutes === null || !Number.isInteger(minutes) || costPerPortion === null) {
      const field = !title.trim() ? "custom-title" : (minutes === null || !Number.isInteger(minutes) ? "custom-time" : "custom-cost");
      setInvalidField(field);
      setError(field === "custom-title" ? "Donnez un titre à votre recette." : field === "custom-time" ? "Saisissez un temps actif entier entre 1 et 1 440 minutes. La recette précédente est conservée." : "Saisissez un coût par portion entre 0 et 10 000 €, par exemple 2,50. La recette précédente est conservée.");
      document.getElementById(field)?.focus();
      return;
    }
    const cleanedSteps = steps.split("\n").map((step) => step.trim()).filter(Boolean);
    if (!ingredients.some((item) => item.quantity > 0)) {
      setError("Gardez au moins un ingrédient avec une quantité positive. Votre recette précédente est conservée.");
      return;
    }
    if (cleanedSteps.length > 100) {
      setError("Limitez la préparation à 100 étapes. Votre recette précédente est conservée.");
      return;
    }
    savePending.current = true;
    setSaving(true);
    const savedIngredients = ingredients.filter((item) => item.quantity > 0);
    try {
      let nutrition: Recipe["nutrition"] | null = null;
      try {
        const { recalculateCustomNutrition } = await import("./recipe-nutrition.ts");
        nutrition = recalculateCustomNutrition(draft.id, savedIngredients);
      } catch {
        // An unavailable optional data chunk must not prevent saving a recipe.
        // The detail view explicitly identifies values that were not recalculated.
      }
      if (!editorActive.current) return;
      onSave({
      ...draft,
      title: title.trim().slice(0, 90),
      prepMinutes: minutes,
      costPerPortion,
      ingredients: savedIngredients,
      nutrition: nutrition ?? draft.nutrition,
      nutritionRecalculated: nutrition !== null,
      steps: cleanedSteps.length ? cleanedSteps : draft.steps,
    }); } catch {
      if (editorActive.current) setError("Cette recette ne peut pas être enregistrée. Vérifiez ses ingrédients et ses étapes ; la version précédente est conservée.");
    } finally {
      savePending.current = false;
      if (editorActive.current) setSaving(false);
    }
  };
  return <MobileScroll className="app-screen"><main className="page-content pushed-page" data-testid="custom-recipe-view">
    <div className="page-heading"><span className="eyebrow">Ma version</span><h1>Adapter la recette</h1><p>Ajustez le titre, le temps actif, les quantités et les étapes. Votre liste de courses suivra les quantités choisies.</p></div>
    <section className="form-section"><h2>Votre version</h2>
      <label className="text-field"><span>Titre</span><KeyboardInput disabled={saving} id="custom-title" aria-invalid={invalidField === "custom-title"} aria-describedby={invalidField === "custom-title" ? "custom-save-error" : undefined} value={title} maxLength={90} data-testid="custom-title" onChange={(event) => { setTitle(event.target.value); setInvalidField(null); setError(""); }} onBlur={keyboard.hide} /></label>
      <label className="text-field"><span>Temps actif (min)</span><KeyboardInput disabled={saving} id="custom-time" aria-invalid={invalidField === "custom-time"} aria-describedby={invalidField === "custom-time" ? "custom-save-error" : undefined} inputMode="numeric" value={prepMinutes} data-testid="custom-time" onChange={(event) => { setPrepMinutes(event.target.value); setInvalidField(null); setError(""); }} onBlur={keyboard.hide} /></label>
      <label className="text-field"><span>Coût estimé par portion (€)</span><KeyboardInput disabled={saving} id="custom-cost" aria-invalid={invalidField === "custom-cost"} aria-describedby={invalidField === "custom-cost" ? "custom-save-error custom-cost-help" : "custom-cost-help"} inputMode="decimal" value={cost} data-testid="custom-cost" onChange={(event) => { setCost(event.target.value); setInvalidField(null); setError(""); }} onBlur={keyboard.hide} /><small id="custom-cost-help">Le coût n’est pas recalculé : ajustez-le selon vos achats.</small></label>
    </section>
    <section className="form-section"><h2>Ingrédients</h2>
      <p className="inline-help">Mettez une quantité à zéro pour retirer un ingrédient. Gardez au moins un ingrédient. Les repères nutritionnels sont recalculés lorsque les données sont disponibles.</p>
      {ingredients.map((item, index) => <div className="setting-row" key={`${item.id}-${index}`}>
        <span><strong>{item.name}</strong><small>{displayQuantity(item.quantity, item.unit)} par portion</small></span>
        <div className="stepper"><button type="button" aria-label={`Réduire ${item.name}`} disabled={saving || item.quantity === 0} onClick={() => setQuantity(index, -quantityStep[item.unit])}><MinusIcon /></button><b>{formatDecimal(item.quantity)}</b><button type="button" disabled={saving} aria-label={`Augmenter ${item.name}`} onClick={() => setQuantity(index, quantityStep[item.unit])}><PlusIcon /></button></div>
      </div>)}
    </section>
    <section className="form-section"><h2>Préparation</h2>
      <label className="text-field"><span>Une étape par ligne</span><KeyboardTextarea disabled={saving} value={steps} rows={8} data-testid="custom-steps" onChange={(event) => setSteps(event.target.value)} /></label>
    </section>
    {error ? <p id="custom-save-error" className="notice-banner" role="alert" data-testid="custom-save-error">{error}</p> : null}
    <button type="button" className="primary-button full-button" data-testid="custom-save" disabled={saving} aria-busy={saving} onClick={() => void commit()}>{saving ? "Enregistrement…" : "Enregistrer ma version"}</button>
    {onDelete ? <ConfirmActionDialog
      title="Supprimer cette recette ?"
      description="La recette personnelle, son favori, sa note et ses préférences seront retirés de cet appareil. Une recette encore utilisée dans une semaine ne pourra pas être supprimée."
      confirmLabel="Supprimer la recette"
      testId="custom-delete-dialog"
      onConfirm={onDelete}
      trigger={<button type="button" disabled={saving} className="secondary-button full-button" data-testid="custom-delete">Supprimer cette recette</button>}
    /> : null}
    <p className="privacy-note">Vos recettes personnelles restent dans le stockage local de cette adresse web, sur cet appareil, et entrent dans vos semaines comme les autres, filtres de sécurité compris.</p>
  </main></MobileScroll>;
}

