import { type AppState } from "../storage";
import { useSyncExternalStore } from "react";
import { type AppStateStore } from "./app-state-store";
import { subscribeRecipeRegistry, recipeRegistrySnapshot } from "./recipe-registry";

export function LiveAppState({ store, children }: { store: AppStateStore; children: (state: AppState) => React.ReactNode }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  // Personal recipes are published after the state render. Keep stacked views
  // current when that registry catches up with a restored or edited recipe.
  useSyncExternalStore(subscribeRecipeRegistry, () => recipeRegistrySnapshot, () => recipeRegistrySnapshot);
  return <>{children(state)}</>;
}
