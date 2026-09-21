import { type RecipeCompatibilityDiagnostic } from "../engine";
import { EQUIPMENT_OPTIONS } from "./constants";

export function CompatibilityHelp({ diagnostic, selectedMinutes, onUseMinutes, onOpenProfile, allCompatibleAlreadyUsed = false }: {
  diagnostic: RecipeCompatibilityDiagnostic;
  selectedMinutes?: number;
  onUseMinutes?: (minutes: number) => void;
  onOpenProfile?: () => void;
  allCompatibleAlreadyUsed?: boolean;
}) {
  const equipmentLabels = diagnostic.missingEquipment.map((id) =>
    EQUIPMENT_OPTIONS.find((item) => item.id === id)?.label ?? id,
  );
  const safetyBlocked = diagnostic.blockedBy.allergies + diagnostic.blockedBy.excludedIngredients;
  return <div className="empty-guidance" data-testid="compatibility-help">
    {diagnostic.unresolvedRestrictions?.length ? <p role="alert"><strong>Restrictions non reconnues</strong><span>{diagnostic.unresolvedRestrictions.join(", ")}. Corrigez ces termes dans le profil avant de poursuivre ; ils ne sont pas ignorés.</span>{onOpenProfile ? <button type="button" onClick={onOpenProfile}>Corriger mon profil</button> : null}</p> : null}
    {allCompatibleAlreadyUsed ? <p><strong>Variété de la semaine</strong><span>Toutes les recettes compatibles sont déjà présentes dans votre menu.</span></p> : null}
    {diagnostic.mealTypeCount === 0 ? <p><strong>Type de repas</strong><span>Le catalogue ne contient aucune recette pour ce créneau.</span></p> : null}
    {diagnostic.minimumCompatibleMinutes !== undefined && selectedMinutes !== undefined && diagnostic.minimumCompatibleMinutes > selectedMinutes ? <p><strong>Temps disponible</strong><span>La recette compatible la plus rapide demande {diagnostic.minimumCompatibleMinutes} minutes actives.</span>{onUseMinutes ? <button type="button" onClick={() => onUseMinutes(diagnostic.minimumCompatibleMinutes!)}>Choisir {diagnostic.minimumCompatibleMinutes} min</button> : null}</p> : null}
    {equipmentLabels.length ? <p><strong>Équipement manquant</strong><span>Des recettes deviendraient disponibles avec : {equipmentLabels.join(" ou ")}.</span>{onOpenProfile ? <button type="button" onClick={onOpenProfile}>Vérifier mes équipements</button> : null}</p> : null}
    {diagnostic.blockedBy.associations ? <p><strong>Associations alimentaires</strong><span>{diagnostic.blockedBy.associations} recettes ne respectent pas le mode choisi ou ne font pas partie de la collection relue. Aucun assouplissement automatique.</span></p> : null}
    {diagnostic.blockedBy.diet ? <p><strong>Régime enregistré</strong><span>{diagnostic.blockedBy.diet} recette{diagnostic.blockedBy.diet > 1 ? "s ne correspondent" : " ne correspond"} pas au régime choisi.</span></p> : null}
    {safetyBlocked ? <p><strong>Allergies et exclusions</strong><span>{safetyBlocked} recette{safetyBlocked > 1 ? "s sont écartées" : " est écartée"}. Ces règles de sécurité n’ont pas été assouplies.</span></p> : null}
    {diagnostic.blockedBy.disliked ? <p><strong>Recettes écartées</strong><span>{diagnostic.blockedBy.disliked} recette{diagnostic.blockedBy.disliked > 1 ? "s restent exclues" : " reste exclue"} selon vos préférences.</span>{onOpenProfile ? <button type="button" onClick={onOpenProfile}>Voir mes recettes écartées</button> : null}</p> : null}
  </div>;
}
