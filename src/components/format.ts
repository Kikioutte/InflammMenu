import { type CatalogueRecipe } from "../catalog";
import { ALLERGEN_LABELS } from "./constants";
import { type AdvancePrep } from "../engine";

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function mondayOf(date = new Date()): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

export function dateAt(startsOn: string, dayIndex: number): Date {
  const [year, month, day] = startsOn.split("-").map(Number);
  const result = new Date(year, month - 1, day);
  result.setDate(result.getDate() + dayIndex);
  return result;
}

export function formatWeekRange(startsOn: string): string {
  const start = dateAt(startsOn, 0);
  const end = dateAt(startsOn, 6);
  const startMonth = start.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
  const endMonth = end.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${endMonth}`
    : `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}`;
}

/**
 * Format a duration for people rather than machines.
 * Long catalogue durations can include soaking, chilling or fermentation;
 * displaying them as raw minutes (e.g. 10 110 min) is difficult to scan.
 */
export function formatRecipeDuration(minutes: number): string {
  const value = Math.max(0, Math.round(minutes));
  if (value < 60) return `${value} min`;

  const days = Math.floor(value / 1_440);
  const remainderAfterDays = value % 1_440;
  const hours = Math.floor(remainderAfterDays / 60);
  const remainderMinutes = remainderAfterDays % 60;

  if (days > 0) {
    return `${days} j${hours ? ` ${hours} h` : ""}${remainderMinutes ? ` ${remainderMinutes} min` : ""}`;
  }
  return `${hours} h${remainderMinutes ? ` ${remainderMinutes} min` : ""}`;
}

export type CataloguePassiveDurationLabel = "Congélation" | "Fermentation" | "Infusion" | "Marinade" | "Repos";

function positiveDuration(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Selects the most useful name for a catalogue recipe's passive time. */
export function cataloguePassiveDurationLabel(recipe: CatalogueRecipe): CataloguePassiveDurationLabel {
  const context = normalizeText(`${recipe.titre} ${recipe.tags.join(" ")} ${recipe.etapes.join(" ")}`);
  if (context.includes("congel")) return "Congélation";
  if (context.includes("ferment")) return "Fermentation";
  if (context.includes("infus")) return "Infusion";
  if (context.includes("marin")) return "Marinade";
  return "Repos";
}

function cataloguePreparationMinutes(recipe: CatalogueRecipe): number | null {
  return positiveDuration(recipe.temps.preparation) ?? positiveDuration(recipe.app.planner.active_minutes);
}

export function formatCatalogueCardDuration(recipe: CatalogueRecipe): string {
  const preparation = cataloguePreparationMinutes(recipe);
  const cooking = positiveDuration(recipe.temps.cuisson);
  const passive = positiveDuration(recipe.temps.repos);
  const total = positiveDuration(recipe.temps.total);
  const parts: string[] = [];

  if (preparation) parts.push(`${formatRecipeDuration(preparation)} de préparation`);
  else if (cooking) parts.push(`${formatRecipeDuration(cooking)} de cuisson`);

  if (passive) {
    const label = cataloguePassiveDurationLabel(recipe).toLocaleLowerCase("fr-FR");
    const preposition = label === "infusion" ? "d’" : "de ";
    parts.push(`${formatRecipeDuration(passive)} ${preposition}${label}`);
  }

  return parts.join(" · ") || (total ? `${formatRecipeDuration(total)} au total` : "Durée non renseignée");
}

export function catalogueDurationItems(recipe: CatalogueRecipe): Array<{ label: string; minutes: number }> {
  const items: Array<{ label: string; minutes: number }> = [];
  const preparation = cataloguePreparationMinutes(recipe);
  const cooking = positiveDuration(recipe.temps.cuisson);
  const passive = positiveDuration(recipe.temps.repos);
  const total = positiveDuration(recipe.temps.total);

  if (preparation) items.push({ label: "Préparation", minutes: preparation });
  if (cooking) items.push({ label: "Cuisson", minutes: cooking });
  if (passive) items.push({ label: cataloguePassiveDurationLabel(recipe), minutes: passive });
  if (total) items.push({ label: "Total", minutes: total });
  return items;
}

export function currentDayIndex(startsOn: string): number {
  const start = dateAt(startsOn, 0).getTime();
  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(0, Math.min(6, Math.round((localToday - start) / 86_400_000)));
}

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae").trim().toLowerCase();
}

export function parseList(value: string): string[] {
  return [...new Set(value.split(/[,;\n]/).map((item) => normalizeText(item)).filter(Boolean))];
}

export function formatEuros(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

export function allergenLabel(allergen: string): string {
  return ALLERGEN_LABELS[allergen] ?? allergen.replaceAll("-", " ");
}

export function advanceHeadline(prep: AdvancePrep): string {
  return prep.level === "day-before" ? "À lancer la veille" : "Repos à prévoir";
}
