import { useEffect, useRef, useState } from "react";
import { ArchiveIcon, CheckIcon, ChevronRightIcon, ClockIcon, DownloadIcon, ReloadIcon } from "@radix-ui/react-icons";
import { MobileScroll } from "./mobile";
import { inspectActivePlan } from "./engine";
import { RECIPES } from "./recipes";
import { usesSharedGitHubPagesOrigin } from "./privacy.ts";
import { CATALOGUE_SUMMARY, cacheCatalogueForOffline, catalogueAvailableOffline } from "./catalog";
import { exportAppState, importAppStateFile, type AppState } from "./storage";
import { downloadTextFile, isoDate } from "./view-format";

function BackupSection({ state, onRestore }: { state: AppState; onRestore: (restored: AppState) => Promise<void> }) {
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [pendingRestore, setPendingRestore] = useState<AppState | null>(null);
  const [restoreSaving, setRestoreSaving] = useState(false);
  const restoreRequest = useRef(0);
  const inputId = "backup-file-input";
  const download = () => {
    try {
      downloadTextFile(`inflamm-menu-sauvegarde-${isoDate(new Date())}.json`, exportAppState(state));
      setError("");
      setFeedback("Sauvegarde téléchargée.");
    } catch {
      setFeedback("");
      setError("Téléchargement impossible sur cet appareil.");
    }
  };
  const restore = async (file: File | undefined) => {
    if (!file) return;
    const requestId = ++restoreRequest.current;
    setPendingRestore(null);
    setFeedback("");
    setError("");
    try {
      const restored = await importAppStateFile(file);
      if (requestId !== restoreRequest.current) return;
      const restoredRecipes = [...new Map(
        [...RECIPES, ...restored.customRecipes].map((recipe) => [recipe.id, recipe] as const),
      ).values()];
      const currentReport = restored.currentPlan
        ? inspectActivePlan(restored.currentPlan, restoredRecipes, restored.profile)
        : null;
      const upcomingReport = restored.upcomingPlan
        ? inspectActivePlan(restored.upcomingPlan, restoredRecipes, restored.profile)
        : null;
      const activePlansAreCompatible = (!currentReport || currentReport.canActivate)
        && (!upcomingReport || upcomingReport.canActivate);
      if (!activePlansAreCompatible) {
        throw new Error("Sauvegarde refusée : une semaine active est incomplète ou incompatible. Vos données actuelles sont conservées.");
      }
      const restoredWithActiveProfile = {
        ...restored,
        currentPlan: restored.currentPlan
          ? { ...restored.currentPlan, profileSnapshot: { ...restored.profile, mealsPerDay: currentReport?.inferredMealsPerDay ?? restored.profile.mealsPerDay } }
          : null,
        upcomingPlan: restored.upcomingPlan
          ? { ...restored.upcomingPlan, profileSnapshot: { ...restored.profile, mealsPerDay: upcomingReport?.inferredMealsPerDay ?? restored.profile.mealsPerDay } }
          : null,
      };
      setPendingRestore(restoredWithActiveProfile);
      setFeedback(`Sauvegarde vérifiée : ${restored.history.length} semaine(s) archivée(s), ${restored.favoriteRecipeIds.length} favori(s). Confirmez pour remplacer les données de cet appareil.`);
    } catch (importError) {
      if (requestId !== restoreRequest.current) return;
      setError(importError instanceof Error ? importError.message : "Restauration impossible.");
    }
  };
  const confirmRestore = async () => {
    if (!pendingRestore || restoreSaving) return;
    const restored = pendingRestore;
    setRestoreSaving(true);
    setFeedback("Restauration en cours…");
    setError("");
    try {
      await onRestore(restored);
      setPendingRestore(null);
      setFeedback(`Sauvegarde restaurée : ${restored.history.length} semaine(s) archivée(s), ${restored.favoriteRecipeIds.length} favori(s).`);
    } catch (restoreError) {
      setFeedback("");
      setError(restoreError instanceof Error
        ? `${restoreError.message} Vos données actuelles sont conservées.`
        : "Restauration impossible. Vos données actuelles sont conservées.");
    } finally {
      setRestoreSaving(false);
    }
  };
  return (
    <section className="information-card" data-testid="backup-card">
      <h2>Sauvegarder mes données</h2>
      <p>Vos données sont stockées localement par cette adresse web, sur cet appareil : vider les données du site les efface. Exportez un fichier pour les conserver ou les transférer, puis restaurez-le quand vous le souhaitez.</p>
      <div className="backup-actions">
        <button type="button" className="secondary-button" data-testid="backup-export" onClick={download}><DownloadIcon /> Exporter</button>
        <label className="secondary-button backup-import" htmlFor={inputId}><ArchiveIcon /> Restaurer
          <input id={inputId} type="file" accept="application/json,.json" data-testid="backup-import" onChange={(event) => { void restore(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
      </div>
      {pendingRestore ? <div className="backup-confirmation" data-testid="backup-confirmation" role="group" aria-label="Confirmer la restauration">
        <p><strong>Cette action remplacera toutes les données actuellement enregistrées sur cet appareil.</strong></p>
        <div className="backup-actions">
          <button type="button" className="primary-button" data-testid="backup-confirm" disabled={restoreSaving} onClick={() => { void confirmRestore(); }}>{restoreSaving ? "Restauration…" : "Confirmer la restauration"}</button>
          <button type="button" className="secondary-button" data-testid="backup-cancel" onClick={() => {
            setPendingRestore(null);
            setFeedback("Restauration annulée. Vos données actuelles sont conservées.");
          }} disabled={restoreSaving}>Annuler</button>
        </div>
      </div> : null}
      {feedback ? <p className="export-feedback" role="status" aria-live="polite" data-testid="backup-feedback">{feedback}</p> : null}
      {error ? <p className="notice-banner" role="alert" data-testid="backup-error">{error}</p> : null}
      <p className="privacy-note">La restauration remplace le profil, la semaine en cours, l’historique, les favoris et la liste de courses de cet appareil.</p>
    </section>
  );
}

function OfflineCatalogueSection() {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  useEffect(() => {
    let active = true;
    void catalogueAvailableOffline().then((available) => { if (active && available) setStatus("ready"); });
    return () => { active = false; };
  }, []);
  return (
    <section className="information-card" data-testid="offline-catalogue">
      <h2>Catalogue hors ligne</h2>
      <p>La semaine, les recettes planifiées et la liste de courses fonctionnent déjà sans connexion. Le catalogue complet ({CATALOGUE_SUMMARY.nombre_recettes} recettes) peut être conservé explicitement sur cet appareil.</p>
      <button type="button" className="secondary-button full-button" data-testid="offline-catalogue-download" disabled={status === "loading" || status === "ready"} onClick={() => {
        setStatus("loading");
        void cacheCatalogueForOffline().then(() => setStatus("ready")).catch(() => setStatus("error"));
      }}>
        {status === "ready" ? <><CheckIcon /> Catalogue vérifié hors ligne</> : status === "loading" ? <><ReloadIcon className="spin" /> Téléchargement et vérification…</> : <><DownloadIcon /> Télécharger pour le hors-ligne</>}
      </button>
      {status === "error" ? <p className="notice-banner" role="alert">Le catalogue n’a pas pu être enregistré dans le cache de cet appareil. Libérez de l’espace puis réessayez en ligne.</p> : null}
    </section>
  );
}

function ComfortSection({ state, onTextScale, onReminders }: { state: AppState; onTextScale: (scale: "normal" | "large") => void; onReminders: (enabled: boolean) => void }) {
  const [permission, setPermission] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const enableReminders = async () => {
    if (typeof Notification === "undefined") { setPermission("unsupported"); return; }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      onReminders(result === "granted");
    } catch {
      setPermission("default");
      onReminders(false);
    }
  };
  return (
    <section className="information-card" data-testid="comfort-card">
      <h2>Confort de lecture et rappels</h2>
      <p>Taille du texte de l’application. Les repères et avertissements suivent le même réglage.</p>
      <div className="choice-row" role="group" aria-label="Taille du texte">
        {([["normal", "Taille normale"], ["large", "Texte agrandi"]] as const).map(([value, label]) => (
          <button type="button" key={value} className={state.textScale === value ? "is-selected" : ""} aria-pressed={state.textScale === value} data-testid={`text-scale-${value}`} onClick={() => onTextScale(value)}>{label}</button>
        ))}
      </div>
      <p style={{ marginTop: 18 }}>Un rappel peut s’afficher à l’ouverture pour lancer un repos aujourd’hui ou la veille, et pour signaler les restes prévus au menu.</p>
      {state.remindersEnabled && permission === "granted"
        ? <button type="button" className="secondary-button full-button" data-testid="reminders-off" onClick={() => onReminders(false)}><CheckIcon /> Rappels activés — désactiver</button>
        : <button type="button" className="secondary-button full-button" disabled={permission === "denied" || permission === "unsupported"} data-testid="reminders-on" onClick={() => void enableReminders()}><ClockIcon /> Activer les rappels</button>}
      {permission === "denied" ? <p className="inline-help">Les notifications sont bloquées pour ce site dans les réglages de votre navigateur.</p> : null}
      {permission === "unsupported" ? <p className="inline-help">Cet appareil ne propose pas de notifications web.</p> : null}
      <p className="privacy-note">Les rappels sont produits localement pendant que l’application est ouverte : aucun serveur, aucune donnée transmise.</p>
    </section>
  );
}

export default function InformationView({ state, onRestore, onTextScale, onReminders }: { state: AppState; onRestore: (restored: AppState) => Promise<void>; onTextScale: (scale: "normal" | "large") => void; onReminders: (enabled: boolean) => void }) {
  const sharedPagesOrigin = usesSharedGitHubPagesOrigin();
  return <MobileScroll className="app-screen"><main className="page-content pushed-page information-page">
    <div className="page-heading"><span className="eyebrow">En toute transparence</span><h1>À propos de l’application</h1><p>Les repères essentiels sur le fonctionnement de cette V1 locale.</p></div>
    <section className="information-card"><h2>Génération locale</h2><p>Les semaines sont composées directement sur votre appareil à partir de règles déterministes, de filtres et d’une base de recettes intégrée.</p></section>
    <section className="information-card"><h2>Confidentialité</h2><p>Votre prénom, vos préférences, vos menus, vos favoris et votre liste de courses sont enregistrés dans le stockage local de cette adresse web, sur cet appareil. Cette V1 ne crée pas de compte et ne transmet pas ces données à un serveur.</p><p>Le navigateur sépare ce stockage par origine — protocole, domaine et port — et non par dossier. La suppression des données du site dans les réglages du navigateur efface ces informations locales.</p>{sharedPagesOrigin ? <p className="notice-banner" role="note" data-testid="shared-origin-warning">L’adresse kikioutte.github.io est partagée entre les projets GitHub Pages du compte. Un autre projet servi depuis cette même origine peut donc techniquement lire ce stockage. Avant un passage à une adresse dédiée, exportez une copie ; ne supprimez les anciennes données qu’après une restauration vérifiée.</p> : null}</section>
    <BackupSection state={state} onRestore={onRestore} />
    <OfflineCatalogueSection />
    <ComfortSection state={state} onTextScale={onTextScale} onReminders={onReminders} />
    <section className="information-card information-card--warning"><h2>Avertissement santé</h2><p>Inflamm’Menu est un outil d’organisation alimentaire et ne remplace pas l’avis d’un médecin, d’un diététicien ou d’un autre professionnel de santé. En cas d’allergie sévère, de pathologie, de grossesse ou de régime prescrit, demandez un avis professionnel.</p></section>
    <section className="information-card"><h2>{CATALOGUE_SUMMARY.nombre_recettes} recettes comparées et relues</h2><p>{CATALOGUE_SUMMARY.nombre_recettes_visibles} recettes absentes de la base ont été ajoutées; {CATALOGUE_SUMMARY.nombre_doublons_exclus} recettes matériellement équivalentes ont été écartées. Chaque proposition a été contrôlée selon son profil alimentaire global : place des végétaux, fibres, céréales complètes, légumineuses, poissons, graisses insaturées, sucres ajoutés, sodium et graisses saturées.</p><p>Les recettes contenant notamment beaucoup de coco, des préparations concentrées au curcuma, des algues ou davantage de sucre sont conservées avec des repères explicites. L'indice numérique du fichier source reste éditorial et n'est pas présenté comme une mesure médicale.</p></section>
    <section className="information-card"><h2>Inspirations historiques et culturelles</h2><p>Jean Seignalet nourrit la réflexion historique sur les liens entre alimentation et mode de vie; ses hypothèses ne sont pas utilisées comme preuves médicales et n'entraînent aucune exclusion automatique du gluten ou des produits laitiers.</p><p>Yuval Noah Harari inspire une lecture culturelle de l'évolution des pratiques alimentaires et l'ouverture aux cuisines du monde. Ses ouvrages ne servent pas de source nutritionnelle.</p><p>Les données officielles, la sécurité alimentaire et les recommandations actuelles restent toujours prioritaires.</p></section>
    <section className="information-card"><h2>Estimations</h2><p>Les prix, calories, protéines, fibres et quantités sont des estimations indicatives. Ils peuvent varier selon les produits, les marques, les saisons, les magasins et la préparation réelle.</p></section>
    <section className="information-card official-sources"><h2>Sources officielles de référence</h2><p>Ces liens permettent de consulter les repères publics qui orientent le contenu éditorial de l’application.</p>
      <a href="https://ciqual.anses.fr/cms/fr/la-table-ciqual-2025" target="_blank" rel="noreferrer"><span><strong>Table Ciqual 2025 — ANSES</strong><small>Composition nutritionnelle des aliments</small></span><ChevronRightIcon /></a>
      <a href="https://www.santepubliquefrance.fr/nutrition-et-activite-physique/rapportsynthese/recommandations-relatives-a-lalimentation-a-lactivite-physique-et-a-la-sedentarite-pour-les-adultes" target="_blank" rel="noreferrer"><span><strong>Santé publique France</strong><small>Recommandations pour les adultes</small></span><ChevronRightIcon /></a>
      <a href="https://nutritionsource.hsph.harvard.edu/healthy-weight/diet-reviews/anti-inflammatory-diet/" target="_blank" rel="noreferrer"><span><strong>Harvard — The Nutrition Source</strong><small>Alimentation anti-inflammatoire et limites des preuves</small></span><ChevronRightIcon /></a>
      <a href="https://www.heart.org/en/healthy-living/healthy-eating/eat-smart/nutrition-basics/mediterranean-diet" target="_blank" rel="noreferrer"><span><strong>American Heart Association</strong><small>Repères du modèle méditerranéen</small></span><ChevronRightIcon /></a>
      <a href="https://www.anses.fr/fr/content/des-effets-indesirables-lies-la-consommation-de-complements-alimentaires-contenant-du" target="_blank" rel="noreferrer"><span><strong>ANSES — Curcuma</strong><small>Précautions et interactions</small></span><ChevronRightIcon /></a>
      <a href="https://www.anses.fr/fr/content/consommation-dalgues-rester-vigilant-sur-le-risque-dexces-dapport-en-iode" target="_blank" rel="noreferrer"><span><strong>ANSES — Algues et iode</strong><small>Populations à risque et consommation régulière</small></span><ChevronRightIcon /></a>
    </section>
    <p className="information-footer">Catalogue culinaire sous {CATALOGUE_SUMMARY.licence}</p>
  </main></MobileScroll>;
}

