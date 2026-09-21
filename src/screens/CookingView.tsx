import { useState, useEffect } from "react";
import { type Recipe, type PlannedMeal } from "../domain";
import { ingredientsForPlannedMeal } from "../engine";
import { MobileScroll } from "../mobile";
import { isAssociationRecipe } from "../food-associations";
import { scaleAssociationStep } from "../composed-meal";
import { CheckIcon, ArrowLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { formatIngredientQuantity as displayQuantity } from "../presentation";

interface WakeLock { release: () => Promise<void>; addEventListener: (type: string, handler: () => void) => void }

/**
 * Keeps the screen awake while cooking, when the browser allows it. Failure is
 * silent and never blocks the mode: the steps stay readable either way.
 */
function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLock> } }).wakeLock;
    if (!active || !api) { setHeld(false); return; }

    let released = false;
    let lock: WakeLock | null = null;
    const request = () => {
      void api.request("screen").then((sentinel) => {
        if (released) { void sentinel.release(); return; }
        lock = sentinel;
        setHeld(true);
        sentinel.addEventListener("release", () => setHeld(false));
      }).catch(() => setHeld(false));
    };
    // Browsers drop the lock when the tab goes to the background.
    const onVisible = () => { if (document.visibilityState === "visible" && !released) request(); };

    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      setHeld(false);
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);

  return held;
}

export function CookingView({ recipe, portions, planned }: { recipe: Recipe; portions: number; planned?: PlannedMeal }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<number[]>([]);
  const screenHeld = useWakeLock(true);
  const ingredients = ingredientsForPlannedMeal(recipe, planned, portions);
  const total = recipe.steps.length;
  const isDone = done.includes(step);
  return <MobileScroll className="app-screen"><main className="cooking-page" data-testid="cooking-view">
    <div className="cooking-head">
      <span className="eyebrow">Étape {step + 1} sur {total}</span>
      <h1>{recipe.title}</h1>
      <p className="cooking-screen-state" data-testid="cooking-wake-lock">{screenHeld ? "Écran maintenu allumé pendant la préparation." : "Votre appareil peut mettre l’écran en veille : gardez-le à portée."}</p>
    </div>
    <ol className="cooking-progress" aria-label="Progression des étapes">
      {recipe.steps.map((item, index) => <li key={item}><button type="button" className={`${index === step ? "is-current" : ""} ${done.includes(index) ? "is-done" : ""}`} aria-current={index === step ? "step" : undefined} aria-label={`Étape ${index + 1}`} onClick={() => setStep(index)} /></li>)}
    </ol>
    <p className="cooking-step" data-testid="cooking-step">{(isAssociationRecipe(recipe.id) || recipe.composition) ? scaleAssociationStep(recipe.steps[step], portions / 2) : recipe.steps[step]}</p>
    <button type="button" className={`cooking-done ${isDone ? "is-active" : ""}`} aria-pressed={isDone} data-testid="cooking-done" onClick={() => setDone((current) => (current.includes(step) ? current.filter((entry) => entry !== step) : [...current, step]))}>
      <CheckIcon /> {isDone ? "Étape faite" : "Marquer cette étape"}
    </button>
    <div className="cooking-nav">
      <button type="button" className="secondary-button" disabled={step === 0} data-testid="cooking-previous" onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeftIcon /> Précédente</button>
      <button type="button" className="primary-button" disabled={step >= total - 1} data-testid="cooking-next" onClick={() => setStep((value) => Math.min(total - 1, value + 1))}>Suivante <ChevronRightIcon /></button>
    </div>
    <section className="cooking-ingredients"><h2>Ingrédients pour {portions} portion{portions > 1 ? "s" : ""}</h2>
      <ul>{ingredients.map((item, index) => <li key={`${item.id}-${item.unit}-${index}`}><span><strong>{displayQuantity(item.quantity, item.unit)}</strong> {item.name}{item.optional ? <small>Facultatif · non ajouté aux courses</small> : null}</span></li>)}</ul>
    </section>
  </main></MobileScroll>;
}
