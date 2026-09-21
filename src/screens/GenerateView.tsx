import { type UserProfile, type WeeklyPlan } from "../domain";
import { useState, useRef, useEffect } from "react";
import { type RecipeCompatibilityDiagnostic, weeklyTargetsOf, RecipeCompatibilityError } from "../engine";
import { MobileScroll } from "../mobile";
import { CalendarIcon, PersonIcon, ClockIcon, ArchiveIcon, CheckIcon, LockClosedIcon, ReloadIcon, CheckCircledIcon, Cross2Icon } from "@radix-ui/react-icons";
import { formatWeekRange } from "../components/format";
import { CompatibilityHelp } from "../components/CompatibilityHelp";

export function GenerateView({ profile, lockedCount = 0, canPrepareNext = false, onCreate, onComplete, onOpenProfile }: { profile: UserProfile; lockedCount?: number; canPrepareNext?: boolean; onCreate: (target: "current" | "upcoming") => WeeklyPlan; onComplete: (target: "current" | "upcoming") => void; onOpenProfile: () => void }) {
  const [phase, setPhase] = useState<"ready" | "loading" | "success" | "error">("ready");
  const [result, setResult] = useState<WeeklyPlan | null>(null);
  const [message, setMessage] = useState("");
  const [diagnostic, setDiagnostic] = useState<RecipeCompatibilityDiagnostic | null>(null);
  const [diagnosticMinutes, setDiagnosticMinutes] = useState<number | undefined>();
  const [target, setTarget] = useState<"current" | "upcoming">("current");
  const targets = weeklyTargetsOf(profile);
  const generationTimer = useRef<number | null>(null);
  useEffect(() => () => { if (generationTimer.current !== null) window.clearTimeout(generationTimer.current); }, []);
  const start = () => {
    if (phase === "loading") return;
    setDiagnostic(null);
    setPhase("loading");
    generationTimer.current = window.setTimeout(() => {
      generationTimer.current = null;
      try { const plan = onCreate(target); setResult(plan); setPhase("success"); }
      catch (error) {
        setMessage(error instanceof Error ? error.message : "Impossible de créer cette semaine.");
        if (error instanceof RecipeCompatibilityError) {
          setDiagnostic(error.diagnostic);
          setDiagnosticMinutes(error.dayIndex === undefined ? profile.maxPrepMinutes : profile.dayConstraints.find((item) => item.dayIndex === error.dayIndex)?.maxPrepMinutes ?? profile.maxPrepMinutes);
        }
        setPhase("error");
      }
    }, 50);
  };
  return <MobileScroll className="app-screen"><main className="page-content pushed-page generate-page"><div className="generate-mark"><CalendarIcon /></div>
    {phase === "ready" ? <><div className="page-heading page-heading--center"><span className="eyebrow">Votre prochaine semaine</span><h1>Prête en quelques secondes</h1><p>Le moteur vérifie vos préférences, la variété, le budget et la saison.</p></div><section className="generation-summary"><div><PersonIcon /><span><small>Pour</small><strong>{profile.people} personne{profile.people > 1 ? "s" : ""}</strong></span></div><div><ClockIcon /><span><small>Temps actif</small><strong>{profile.maxPrepMinutes} min max.</strong></span></div><div><ArchiveIcon /><span><small>Budget cible</small><strong>{profile.weeklyBudget} € visés</strong></span></div></section>{canPrepareNext ? <div className="segmented-control target-switch" role="group" aria-label="Semaine à générer"><button type="button" className={target === "current" ? "is-selected" : ""} aria-pressed={target === "current"} data-testid="target-current" onClick={() => setTarget("current")}>Cette semaine</button><button type="button" className={target === "upcoming" ? "is-selected" : ""} aria-pressed={target === "upcoming"} data-testid="target-upcoming" onClick={() => setTarget("upcoming")}>La semaine prochaine</button></div> : null}
    {target === "upcoming" ? <p className="inline-help" data-testid="upcoming-help">La semaine en cours, ses repères et sa liste de courses ne bougent pas. Le nouveau menu prendra le relais lundi prochain.</p> : null}
    <div className="rule-list"><p><CheckIcon /> {profile.mealsPerDay} repas par jour</p><p><CheckIcon /> {targets.legumeMeals} repas avec légumes secs ou soja visés</p>{profile.diet === "classic" ? <p><CheckIcon /> {targets.fishMeals} repas avec poisson visés</p> : null}<p><CheckIcon /> Priorité à la saison et au réemploi</p>{lockedCount ? <p data-testid="generate-locked"><LockClosedIcon /> {lockedCount} repas conservé{lockedCount > 1 ? "s" : ""} à l’identique</p> : null}</div><p className="privacy-note">Génération locale, sans compte. Vos données restent dans le stockage local de cette adresse web, sur cet appareil.</p><button type="button" className="primary-button full-button" onClick={start}>Créer ma semaine</button></> : phase === "loading" ? <div className="generation-state" aria-live="polite"><ReloadIcon className="spin" /><h1>Nous composons votre semaine</h1><p>Budget, variété, saison et temps actif sont vérifiés.</p><div className="loading-line"><span /></div></div> : phase === "success" && result ? <div className="generation-state success-state" aria-live="polite"><CheckCircledIcon /><h1>{target === "upcoming" ? "Semaine prochaine prête" : "Votre semaine est prête"}</h1><p>{result.meals.filter((meal) => !meal.skipped).length} repas uniques pour votre foyer, estimés à {result.estimatedCost.toFixed(0)} € · {formatWeekRange(result.startsOn)}. Les présences particulières sont appliquées repas par repas.</p><button type="button" className="primary-button full-button" onClick={() => onComplete(target)}>{target === "upcoming" ? "Revenir à l’accueil" : "Voir ma semaine"}</button></div> : <div className="generation-state error-state" role="alert"><Cross2Icon /><h1>Vos critères sont trop serrés</h1><p>{message}</p>{diagnostic ? <CompatibilityHelp diagnostic={diagnostic} selectedMinutes={diagnosticMinutes} onOpenProfile={onOpenProfile} /> : null}<button type="button" className="secondary-button full-button" onClick={onOpenProfile}>Modifier mon profil</button><button type="button" className="text-button" onClick={() => setPhase("ready")}>Réessayer sans modifier</button></div>}
  </main></MobileScroll>;
}
