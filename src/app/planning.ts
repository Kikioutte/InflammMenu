import { type UserProfile, type PlannedMeal, type WeeklyPlan } from "../domain";
import { generateWeeklyPlan, seasonForIsoDate } from "../engine";
import { dateAt, mondayOf, isoDate } from "../components/format";
import { ACTIVE_RECIPES } from "./recipe-registry";

export function makePlan(profile: UserProfile, lockedMeals: readonly PlannedMeal[] = [], favoriteRecipeIds: readonly string[] = [], seed: string | number = Date.now(), startsOn?: string): WeeklyPlan {
  const monday = startsOn ? dateAt(startsOn, 0) : mondayOf();
  return generateWeeklyPlan(ACTIVE_RECIPES, profile, {
    seed,
    startsOn: startsOn ?? isoDate(monday),
    generatedAt: new Date().toISOString(),
    season: seasonForIsoDate(isoDate(monday)),
    lockedMeals,
    favoriteRecipeIds,
  });
}
