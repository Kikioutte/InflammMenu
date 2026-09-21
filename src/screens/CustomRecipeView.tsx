import { type Recipe } from "../domain";
import { useKeyboard, MobileScroll, KeyboardInput, KeyboardTextarea } from "../mobile";
import { useState, useRef, useEffect } from "react";
import { parseNumericInput } from "../numeric-input";
import { normalizeCustomRecipe } from "../storage";
import { recalculateRecipeEstimates } from "../recipe-nutrition";
import { formatIngredientQuantity as displayQuantity } from "../presentation";
import { MinusIcon, PlusIcon } from "@radix-ui/react-icons";
import { ConfirmActionDialog } from "../components/ConfirmActionDialog";

export function CustomRecipeView({ draft, signal, onSave, onDelete }: { draft: Recipe; signal: AbortSignal; onSave: (recipe: Recipe) => Promise<void>; onDelete?: () => void }) {
  const keyboard = useKeyboard();
  const [title, setTitle] = useState(draft.title);
  const [prepMinutes, setPrepMinutes] = useState(String(draft.prepMinutes));
  const [steps, setSteps] = useState(draft.steps.join("\n"));
  const [ingredients, setIngredients] = useState(draft.ingredients.map((item) => ({ ...item })));
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState("");
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const setQuantity = (index: number, delta: number) => setIngredients((current) => current.map((item, position) => (position === index
    ? { ...item, quantity: Math.max(0, Math.round((item.quantity + delta) * 100) / 100) }
    : item)));
  const commit = async () => {
    if (saving) return;
    const cleanedSteps = steps.split("\n").map((step) => step.trim()).filter(Boolean);
    const minutes = parseNumericInput(prepMinutes, { min: 1, max: 600, integer: true });
    const chosenIngredients = ingredients.filter((item) => item.quantity > 0);
    const field = !title.trim() ? "custom-title" : minutes === null ? "custom-time" : !cleanedSteps.length ? "custom-steps" : "";
    if (field || !chosenIngredients.length) {
      setInvalidField(field);
      setError(field === "custom-title" ? "Donnez un titre à votre recette." : field === "custom-time" ? "Saisissez un temps entier entre 1 et 600 minutes." : field === "custom-steps" ? "Conservez au moins une étape de préparation." : "Conservez au moins un ingrédient avec une quantité positive. Votre recette précédente est conservée.");
      if (field) requestAnimationFrame(() => document.getElementById(field)?.focus());
      return;
    }
    const candidate = normalizeCustomRecipe({
      ...draft,
      title: title.trim().slice(0, 90),
      prepMinutes: minutes,
      ingredients: chosenIngredients,
      steps: cleanedSteps,
    });
    if (!candidate) { setError("Cette recette contient une valeur invalide. Vérifiez les quantités et les champs ; la version précédente est conservée."); return; }
    keyboard.hide();
    setError("");
    setInvalidField("");
    setSaving(true);
    try {
      const estimates = await recalculateRecipeEstimates(draft, chosenIngredients);
      if (signal.aborted || !mounted.current || !editorRef.current?.closest('[data-flow-current="true"]')) return;
      await onSave({ ...candidate, ...estimates });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Impossible d’enregistrer cette recette. La version précédente est conservée.");
    } finally { if (mounted.current) setSaving(false); }
  };
  return <MobileScroll className="app-screen"><main ref={editorRef} className="page-content pushed-page" data-testid="custom-recipe-view">
    <div className="page-heading"><span className="eyebrow">Ma version</span><h1>Adapter la recette</h1><p>Ajustez le titre, le temps actif, les quantités et les étapes. Les ingrédients gardent leurs identifiants pour rester justes dans la liste de courses.</p></div>
    {error ? <p className="notice-banner" role="alert" id="custom-error">{error}</p> : null}
    <section className="form-section"><h2>Intitulé</h2>
      <label className="text-field"><span>Titre</span><KeyboardInput disabled={saving} value={title} maxLength={90} id="custom-title" data-testid="custom-title" aria-invalid={invalidField === "custom-title"} aria-describedby={error ? "custom-error" : undefined} onChange={(event) => setTitle(event.target.value)} onBlur={keyboard.hide} /></label>
      <label className="text-field"><span>Temps actif (min)</span><KeyboardInput disabled={saving} inputMode="numeric" value={prepMinutes} id="custom-time" data-testid="custom-time" aria-invalid={invalidField === "custom-time"} aria-describedby={error ? "custom-error" : undefined} onChange={(event) => setPrepMinutes(event.target.value)} onBlur={keyboard.hide} /></label>
    </section>
    <section className="form-section"><h2>Ingrédients</h2>
      <p className="inline-help">Mettez une quantité à zéro pour retirer un ingrédient.</p>
      {ingredients.map((item, index) => <div className="setting-row" key={`${item.id}-${index}`}>
        <span><strong>{item.name}</strong><small>{displayQuantity(item.quantity, item.unit)} par portion</small></span>
        <div className="stepper"><button type="button" disabled={saving} aria-label={`Réduire ${item.name}`} onClick={() => setQuantity(index, item.unit === "piece" ? -0.5 : -5)}><MinusIcon /></button><b>{item.quantity}</b><button type="button" disabled={saving} aria-label={`Augmenter ${item.name}`} onClick={() => setQuantity(index, item.unit === "piece" ? 0.5 : 5)}><PlusIcon /></button></div>
      </div>)}
    </section>
    <section className="form-section"><h2>Préparation</h2>
      <label className="text-field"><span>Une étape par ligne</span><KeyboardTextarea disabled={saving} value={steps} rows={8} id="custom-steps" data-testid="custom-steps" aria-invalid={invalidField === "custom-steps"} aria-describedby={error ? "custom-error" : undefined} onChange={(event) => setSteps(event.target.value)} /></label>
    </section>
    <button type="button" className="primary-button full-button" data-testid="custom-save" disabled={saving} onClick={() => void commit()}>{saving ? "Enregistrement…" : "Enregistrer ma version"}</button>
    {onDelete ? <ConfirmActionDialog
      title="Supprimer cette recette ?"
      description="La recette personnelle, son favori, sa note et ses préférences seront retirés de cet appareil. Une recette encore utilisée dans une semaine ne pourra pas être supprimée."
      confirmLabel="Supprimer la recette"
      testId="custom-delete-dialog"
      onConfirm={onDelete}
      trigger={<button type="button" className="secondary-button full-button" data-testid="custom-delete" disabled={saving}>Supprimer cette recette</button>}
    /> : null}
    <p className="privacy-note">Vos recettes personnelles restent dans le stockage local de cette adresse web, sur cet appareil, et entrent dans vos semaines comme les autres, filtres de sécurité compris.</p>
  </main></MobileScroll>;
}
