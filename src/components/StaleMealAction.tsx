import { MobileScroll } from "../mobile";
import { STALE_MEAL_ACTION } from "../app/meal-actions";

export function StaleMealAction() {
  return <MobileScroll className="app-screen"><main className="page-content pushed-page" data-testid="stale-meal-action">
    <h1>Ce repas a changé</h1><p className="notice-banner" role="alert">{STALE_MEAL_ACTION}</p>
  </main></MobileScroll>;
}
