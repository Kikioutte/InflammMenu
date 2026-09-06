import type { MealType, Recipe, WeeklyPlan } from "./domain.ts";

/** Minimal iCalendar export of a week, one event per meal. */
export function planToCalendar(plan: WeeklyPlan, recipes: readonly Recipe[]): string {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const times: Record<MealType, string> = { breakfast: "0800", lunch: "1230", dinner: "1930" };
  const labels: Record<MealType, string> = { breakfast: "Petit-déjeuner", lunch: "Déjeuner", dinner: "Dîner" };
  const escape = (value: string): string => value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
  const safeToken = (value: string): string => value.replace(/[\r\n\u0000-\u001f\u007f]/g, "-").slice(0, 220);
  const dayStamp = (dayIndex: number): string => {
    const [year, month, day] = plan.startsOn.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + dayIndex));
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  };
  const generated = new Date(plan.generatedAt);
  const stamp = (Number.isNaN(generated.getTime()) ? new Date(`${plan.startsOn}T00:00:00.000Z`) : generated)
    .toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const events = plan.meals.filter((meal) => !meal.skipped).map((meal) => {
    const recipe = byId.get(meal.recipeId);
    const start = `${dayStamp(meal.dayIndex)}T${times[meal.mealType]}00`;
    return [
      "BEGIN:VEVENT",
      `UID:${safeToken(`${plan.id}-${meal.id}`)}@inflamm-menu`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Paris:${start}`,
      "DURATION:PT45M",
      `SUMMARY:${escape(`${labels[meal.mealType]} — ${recipe?.title ?? "Repas"}`)}`,
      `DESCRIPTION:${escape(`${meal.portions} portions · Inflamm’Menu${meal.leftoverOf ? " · restes" : ""}`)}`,
      "END:VEVENT",
    ].join("\r\n");
  });

  const foldLine = (line: string): string[] => {
    const folded: string[] = [];
    let current = "";
    let currentBytes = 0;
    let limit = 75;
    for (const character of line) {
      const characterBytes = new TextEncoder().encode(character).byteLength;
      if (current && currentBytes + characterBytes > limit) {
        folded.push(folded.length ? ` ${current}` : current);
        current = character;
        currentBytes = characterBytes;
        limit = 74;
      } else {
        current += character;
        currentBytes += characterBytes;
      }
    }
    folded.push(folded.length ? ` ${current}` : current);
    return folded;
  };

  const calendarLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//InflammMenu//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Inflamm’Menu",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Paris",
    "X-LIC-LOCATION:Europe/Paris",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events.flatMap((event) => event.split("\r\n")),
    "END:VCALENDAR",
  ];
  return [...calendarLines.flatMap(foldLine), ""].join("\r\n");
}

