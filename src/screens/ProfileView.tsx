import { type UserProfile, type DayConstraint, type Equipment, type MealType, type DietMode } from "../domain";
import { useKeyboard, MobileScroll, KeyboardInput, Carousel } from "../mobile";
import { useState } from "react";
import { weeklyTargetsOf, MAX_WEEKLY_TARGET } from "../engine";
import { parseNumericInput } from "../numeric-input";
import { unsupportedAllergies, resolveIngredientExclusions } from "../food-restrictions";
import { type AssociationMode } from "../food-associations";
import { MinusIcon, PlusIcon, CheckIcon, Cross2Icon, ChevronRightIcon } from "@radix-ui/react-icons";
import { ingredientNameById, ACTIVE_RECIPES, recipeById } from "../app/recipe-registry";
import { parseList } from "../components/format";
import { DAY_LABELS, MEAL_LABELS, DIET_LABELS, ALLERGEN_OPTIONS, EQUIPMENT_OPTIONS } from "../components/constants";

export function ProfileView({ initial, onSave, onOpenInformation }: { initial: UserProfile; onSave: (profile: UserProfile) => void; onOpenInformation: () => void }) {
  const keyboard = useKeyboard();
  const [profile, setProfile] = useState<UserProfile>({ ...initial });
  const [budget, setBudget] = useState(String(initial.weeklyBudget));
  const [maxPrep, setMaxPrep] = useState(String(initial.maxPrepMinutes));
  const [allergies, setAllergies] = useState(initial.allergies.join(", "));
  const [excluded, setExcluded] = useState(initial.excludedIngredientIds.map((id) => ingredientNameById.get(id) ?? id).join(", "));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [constraintDay, setConstraintDay] = useState<DayConstraint["dayIndex"]>(0);
  const toggleEquipment = (item: Equipment) => setProfile((current) => ({ ...current, equipment: current.equipment.includes(item) ? current.equipment.filter((entry) => entry !== item) : [...current.equipment, item] }));
  const targets = weeklyTargetsOf(profile);
  const setTarget = (key: "legumeMeals" | "fishMeals", delta: number) => setProfile((current) => {
    const currentTargets = weeklyTargetsOf(current);
    return { ...current, weeklyTargets: { ...currentTargets, [key]: Math.min(MAX_WEEKLY_TARGET, Math.max(0, currentTargets[key] + delta)) } };
  });
  const selectedAllergies = new Set(parseList(allergies).map((item) => item.replace(/\s+/g, "-")));
  const toggleAllergy = (id: string) => setAllergies((current) => {
    const values = new Set(parseList(current).map((item) => item.replace(/\s+/g, "-")));
    if (values.has(id)) values.delete(id); else values.add(id);
    return [...values].join(", ");
  });
  const currentConstraint: DayConstraint = profile.dayConstraints.find((item) => item.dayIndex === constraintDay)
    ?? { dayIndex: constraintDay, skippedMealTypes: [] };
  const storeConstraint = (next: DayConstraint) => setProfile((current) => {
    const empty = next.maxPrepMinutes === undefined && next.portions === undefined && !next.mealPortions?.length && next.skippedMealTypes.length === 0;
    const others = current.dayConstraints.filter((item) => item.dayIndex !== next.dayIndex);
    return { ...current, dayConstraints: empty ? others : [...others, next].sort((left, right) => left.dayIndex - right.dayIndex) };
  });
  const activeMealTypes = profile.mealsPerDay === 3
    ? (["breakfast", "lunch", "dinner"] as MealType[])
    : (["lunch", "dinner"] as MealType[]);
  const portionsForConstraintMeal = (mealType: MealType) => currentConstraint.mealPortions?.find((item) => item.mealType === mealType)?.portions
    ?? currentConstraint.portions
    ?? profile.people;
  const setConstraintMealPortions = (mealType: MealType, portions: number | undefined) => {
    const others = (currentConstraint.mealPortions ?? []).filter((item) => item.mealType !== mealType);
    storeConstraint({
      ...currentConstraint,
      mealPortions: portions === undefined ? others : [...others, { mealType, portions }],
    });
  };
  const toggleSkippedSlot = (mealType: MealType) => {
    const skipped = currentConstraint.skippedMealTypes.includes(mealType);
    storeConstraint({
      ...currentConstraint,
      skippedMealTypes: skipped
        ? currentConstraint.skippedMealTypes.filter((item) => item !== mealType)
        : [...currentConstraint.skippedMealTypes, mealType],
    });
  };
  const commit = () => {
    const weeklyBudget = parseNumericInput(budget, { min: 1, max: 10_000, decimals: 2 });
    const maxPrepMinutes = parseNumericInput(maxPrep, { min: 1, max: 1_440, integer: true });
    const knownIngredients = ACTIVE_RECIPES.flatMap((recipe) => recipe.ingredients);
    const allergyTerms = parseList(allergies);
    const unknownAllergies = unsupportedAllergies(allergyTerms, knownIngredients);
    const exclusions = resolveIngredientExclusions(parseList(excluded), knownIngredients);
    const nextErrors: Record<string, string> = {};
    if (weeklyBudget === null) nextErrors["profile-budget"] = "Saisissez un budget entre 1 et 10 000 €, avec au maximum deux décimales.";
    if (maxPrepMinutes === null) nextErrors["profile-time"] = "Saisissez un temps entier entre 1 et 1 440 minutes.";
    if (unknownAllergies.length) nextErrors["profile-allergies"] = `Restriction non reconnue : ${unknownAllergies.join(", ")}. Choisissez un allergène proposé ou le nom exact d’un ingrédient.`;
    if (exclusions.unknown.length) nextErrors["profile-exclusions"] = `Aliment non reconnu : ${exclusions.unknown.join(", ")}. Utilisez le nom exact d’un ingrédient du catalogue.`;
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) { requestAnimationFrame(() => document.getElementById(firstError)?.focus()); return; }
    keyboard.hide();
    onSave({ ...profile, weeklyBudget: weeklyBudget!, maxPrepMinutes: maxPrepMinutes!, allergies: allergyTerms, excludedIngredientIds: exclusions.ids });
  };
  const errorFor = (field: string) => errors[field] ? <small id={`${field}-error`} role="alert">{errors[field]}</small> : null;
  return <MobileScroll className="app-screen"><main className="page-content pushed-page profile-page">
    <div className="page-heading"><span className="eyebrow">Personnalisation</span><h1>Mon profil alimentaire</h1><p>Ces choix guident chaque menu et restent dans le stockage local de cette adresse web, sur cet appareil.</p></div>
    <section className="form-section"><h2>Associations alimentaires</h2><label className="text-field"><span>Règles pour le générateur</span><select aria-label="Règles d’association du générateur" value={profile.associationMode ?? "off"} onChange={(event) => setProfile((current) => ({ ...current, associationMode: event.target.value as AssociationMode }))}><option value="off">Catalogue habituel</option><option value="green-orange">Collection dédiée · vertes et orange signalées</option><option value="green">Collection dédiée · vertes uniquement</option></select></label><p className="inline-help">La collection dédiée utilise votre tableau et exclut gluten, produits laitiers, alcool ajouté et préparations industrielles. Les recettes non classées ne sont pas proposées. Ce réglage ne modifie pas les semaines déjà enregistrées ; régénérez pour l’appliquer.</p></section>
    <section className="form-section"><h2>Votre foyer</h2>
      <label className="text-field"><span>Votre prénom</span><KeyboardInput autoComplete="given-name" maxLength={40} value={profile.firstName} placeholder="Ex. Camille" onChange={(event) => setProfile((current) => ({ ...current, firstName: event.target.value }))} onBlur={keyboard.hide} /><small>Utilisé uniquement pour personnaliser l’accueil.</small></label>
      <div className="setting-row"><span><strong>Nombre de personnes</strong><small>Quantités adaptées, jusqu’à 8</small></span><div className="stepper"><button type="button" onClick={() => setProfile((current) => ({ ...current, people: Math.max(1, current.people - 1) }))} aria-label="Retirer une personne"><MinusIcon /></button><b>{profile.people}</b><button type="button" onClick={() => setProfile((current) => ({ ...current, people: Math.min(8, current.people + 1) }))} aria-label="Ajouter une personne"><PlusIcon /></button></div></div>
      <div className="setting-row setting-row--stack"><span><strong>Repas par jour</strong><small>Ajoutez le petit-déjeuner si vous le souhaitez</small></span><div className="choice-row">{([2, 3] as const).map((value) => <button type="button" className={profile.mealsPerDay === value ? "is-selected" : ""} aria-pressed={profile.mealsPerDay === value} key={value} onClick={() => setProfile((current) => ({ ...current, mealsPerDay: value }))}>{value} repas</button>)}</div></div>
    </section>
    <section className="form-section daily-constraints" data-testid="daily-constraints"><h2>Organisation par jour</h2>
      <p className="inline-help">Adaptez avant la génération le temps disponible, les portions et les repas déjà prévus à l’extérieur.</p>
      <Carousel ariaLabel="Choisir le jour à personnaliser" className="day-carousel" contentClassName="day-carousel__track">
        {DAY_LABELS.map((day, index) => <button type="button" key={day} className={constraintDay === index ? "is-selected" : ""} aria-pressed={constraintDay === index} data-testid={`constraint-day-${index}`} onClick={() => setConstraintDay(index as DayConstraint["dayIndex"])}><span>{day.slice(0, 3)}</span>{profile.dayConstraints.some((item) => item.dayIndex === index) ? <i aria-label="Personnalisé">•</i> : null}</button>)}
      </Carousel>
      <div className="daily-constraint-card">
        <h3>{DAY_LABELS[constraintDay]}</h3>
        <label className="text-field"><span>Temps actif maximum</span><select data-testid="constraint-time" value={currentConstraint.maxPrepMinutes ?? ""} onChange={(event) => storeConstraint({ ...currentConstraint, maxPrepMinutes: event.target.value ? Number(event.target.value) : undefined })}><option value="">Comme le profil ({profile.maxPrepMinutes} min)</option>{[15, 20, 30, 45, 60, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
        <div className="setting-row"><span><strong>Tous les repas du jour</strong><small>{currentConstraint.portions === undefined ? "Comme le foyer" : "Invités ou présence réduite"}</small></span><div className="stepper"><button type="button" aria-label="Retirer une portion pour ce jour" onClick={() => storeConstraint({ ...currentConstraint, portions: Math.max(1, (currentConstraint.portions ?? profile.people) - 1), mealPortions: [] })}><MinusIcon /></button><b data-testid="constraint-portions">{currentConstraint.portions ?? profile.people}</b><button type="button" aria-label="Ajouter une portion pour ce jour" onClick={() => storeConstraint({ ...currentConstraint, portions: Math.min(8, (currentConstraint.portions ?? profile.people) + 1), mealPortions: [] })}><PlusIcon /></button></div></div>
        {currentConstraint.portions !== undefined || currentConstraint.mealPortions?.length ? <button type="button" className="text-button" onClick={() => storeConstraint({ ...currentConstraint, portions: undefined, mealPortions: [] })}>Reprendre {profile.people} portion{profile.people > 1 ? "s" : ""} partout</button> : null}
        <fieldset className="meal-attendance"><legend>Présence par repas</legend><p>Modifiez uniquement le créneau qui accueille un invité ou moins de personnes.</p>{activeMealTypes.map((mealType) => {
          const portions = portionsForConstraintMeal(mealType);
          const overridden = currentConstraint.mealPortions?.some((item) => item.mealType === mealType) ?? false;
          return <div className="setting-row" key={mealType}><span><strong>{MEAL_LABELS[mealType]}</strong><small>{overridden ? "Présence personnalisée" : "Réglage du jour"}</small></span><div className="stepper"><button type="button" aria-label={`Retirer une portion pour ${MEAL_LABELS[mealType].toLocaleLowerCase("fr-FR")}`} onClick={() => setConstraintMealPortions(mealType, Math.max(1, portions - 1))}><MinusIcon /></button><b data-testid={`constraint-portions-${mealType}`}>{portions}</b><button type="button" aria-label={`Ajouter une portion pour ${MEAL_LABELS[mealType].toLocaleLowerCase("fr-FR")}`} onClick={() => setConstraintMealPortions(mealType, Math.min(8, portions + 1))}><PlusIcon /></button></div>{overridden ? <button type="button" className="text-button meal-attendance__reset" onClick={() => setConstraintMealPortions(mealType, undefined)}>Réinitialiser</button> : null}</div>;
        })}</fieldset>
        <fieldset className="outside-slots"><legend>Repas prévus à l’extérieur</legend><div className="choice-row">{(profile.mealsPerDay === 3 ? (["breakfast", "lunch", "dinner"] as MealType[]) : (["lunch", "dinner"] as MealType[])).map((mealType) => <button type="button" key={mealType} className={currentConstraint.skippedMealTypes.includes(mealType) ? "is-selected" : ""} aria-pressed={currentConstraint.skippedMealTypes.includes(mealType)} data-testid={`constraint-skip-${mealType}`} onClick={() => toggleSkippedSlot(mealType)}>{MEAL_LABELS[mealType]}</button>)}</div></fieldset>
      </div>
    </section>
    <section className="form-section"><h2>Mes préférences</h2><div className="choice-grid">{(Object.keys(DIET_LABELS) as DietMode[]).map((item) => <button type="button" className={profile.diet === item ? "is-selected" : ""} aria-pressed={profile.diet === item} key={item} onClick={() => setProfile((current) => ({ ...current, diet: item }))}>{DIET_LABELS[item]}</button>)}</div>
      <label className="text-field"><span>Budget hebdomadaire (€)</span><KeyboardInput id="profile-budget" inputMode="decimal" value={budget} aria-invalid={Boolean(errors["profile-budget"])} aria-describedby={errors["profile-budget"] ? "profile-budget-error" : undefined} onChange={(event) => { setBudget(event.target.value); setErrors((current) => ({ ...current, "profile-budget": "" })); }} onBlur={keyboard.hide} />{errorFor("profile-budget")}</label>
      <label className="text-field"><span>Temps actif maximum en cuisine (min)</span><KeyboardInput id="profile-time" inputMode="numeric" value={maxPrep} aria-invalid={Boolean(errors["profile-time"])} aria-describedby={errors["profile-time"] ? "profile-time-error" : undefined} onChange={(event) => { setMaxPrep(event.target.value); setErrors((current) => ({ ...current, "profile-time": "" })); }} onBlur={keyboard.hide} />{errorFor("profile-time")}</label>
      <fieldset className="allergen-field"><legend>Allergies et intolérances à exclure</legend><div className="allergen-grid">{ALLERGEN_OPTIONS.map((item) => <button type="button" className={selectedAllergies.has(item.id) ? "is-selected" : ""} aria-pressed={selectedAllergies.has(item.id)} key={item.id} onClick={() => toggleAllergy(item.id)}>{selectedAllergies.has(item.id) ? <CheckIcon /> : null}{item.label}</button>)}</div></fieldset>
      <label className="text-field"><span>Autre allergie ou ingrédient à exclure</span><KeyboardInput id="profile-allergies" value={allergies} placeholder="Sélectionnez ci-dessus ou saisissez un terme" aria-invalid={Boolean(errors["profile-allergies"])} aria-describedby={errors["profile-allergies"] ? "profile-allergies-error" : undefined} onChange={(event) => { setAllergies(event.target.value); setErrors((current) => ({ ...current, "profile-allergies": "" })); }} onBlur={keyboard.hide} /><small>Les 14 allergènes sont normalisés ; les autres ingrédients sont reconnus par leur nom exact. Une restriction inconnue doit être corrigée avant l’enregistrement.</small>{errorFor("profile-allergies")}</label>
      <label className="text-field"><span>Aliments refusés</span><KeyboardInput id="profile-exclusions" value={excluded} placeholder="Ex. brocoli, saumon" aria-invalid={Boolean(errors["profile-exclusions"])} aria-describedby={errors["profile-exclusions"] ? "profile-exclusions-error" : undefined} onChange={(event) => { setExcluded(event.target.value); setErrors((current) => ({ ...current, "profile-exclusions": "" })); }} onBlur={keyboard.hide} />{errorFor("profile-exclusions")}</label>
    </section>
    <section className="form-section"><h2>Équipements</h2><div className="choice-grid">{EQUIPMENT_OPTIONS.map((item) => <button type="button" className={profile.equipment.includes(item.id) ? "is-selected" : ""} aria-pressed={profile.equipment.includes(item.id)} key={item.id} onClick={() => toggleEquipment(item.id)}>{profile.equipment.includes(item.id) ? <CheckIcon /> : null}{item.label}</button>)}</div>
      {profile.equipment.length === 0 ? <p className="notice-banner" role="alert" data-testid="no-equipment-warning">Sans aucun équipement, presque aucune recette ne reste réalisable et la génération échouera. Cochez au moins les plaques.</p> : null}
      {profile.equipment.length > 0 && profile.equipment.length <= 1 ? <p className="inline-help" data-testid="few-equipment-warning">Avec un seul équipement, le choix de recettes devient très restreint.</p> : null}
    </section>
    <section className="form-section" data-testid="targets-section"><h2>Objectifs de la semaine</h2>
      <p className="inline-help">Le générateur vise ces fréquences avant d’optimiser le budget, la saison et le réemploi. Repères issus du modèle méditerranéen, pas une prescription.</p>
      <div className="setting-row"><span><strong>Repas avec légumes secs ou soja</strong><small>Lentilles, pois chiches, haricots, fèves, tofu ou tempeh</small></span><div className="stepper"><button type="button" aria-label="Moins de repas avec légumes secs ou soja" onClick={() => setTarget("legumeMeals", -1)}><MinusIcon /></button><b data-testid="target-legume">{targets.legumeMeals}</b><button type="button" aria-label="Plus de repas avec légumes secs ou soja" onClick={() => setTarget("legumeMeals", 1)}><PlusIcon /></button></div></div>
      {profile.diet === "classic" ? <div className="setting-row"><span><strong>Repas avec poisson</strong><small>Dont poissons gras si possible</small></span><div className="stepper"><button type="button" aria-label="Moins de repas avec poisson" onClick={() => setTarget("fishMeals", -1)}><MinusIcon /></button><b data-testid="target-fish">{targets.fishMeals}</b><button type="button" aria-label="Plus de repas avec poisson" onClick={() => setTarget("fishMeals", 1)}><PlusIcon /></button></div></div> : <p className="inline-help">L’objectif poisson ne s’applique pas au régime sélectionné.</p>}
    </section>
    <section className="form-section" data-testid="disliked-section"><h2>Recettes écartées</h2>
      {profile.dislikedRecipeIds.length
        ? <><p className="inline-help">Ces recettes ne sont plus proposées dans vos semaines. Touchez-en une pour la réintégrer.</p>
            <div className="disliked-grid">{profile.dislikedRecipeIds.map((id) => <button type="button" key={id} data-testid={`disliked-${id}`} onClick={() => setProfile((current) => ({ ...current, dislikedRecipeIds: current.dislikedRecipeIds.filter((entry) => entry !== id) }))}>{recipeById.get(id)?.title ?? id}<Cross2Icon /></button>)}</div></>
        : <p className="inline-help">Aucune recette écartée. Depuis l’écran « Remplacer », vous pouvez demander à ne plus voir une recette.</p>}
    </section>
    <button className="information-link" type="button" onClick={onOpenInformation}><span><strong>Informations et confidentialité</strong><small>Données, estimations et avertissement santé</small></span><ChevronRightIcon /></button>
    <p className="privacy-note">La génération repose sur des règles locales. Votre profil et vos menus restent dans le stockage local de cette adresse web, sur cet appareil.</p>
    <button className="primary-button full-button" type="button" onClick={commit}>Enregistrer mon profil</button>
  </main></MobileScroll>;
}
