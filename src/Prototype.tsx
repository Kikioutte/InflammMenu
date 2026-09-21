import { useMemo } from "react";
import { DEFAULT_APP_STATE } from "./storage";
import { type FlowScreen, FlowStack } from "./mobile";
import { createAppStateStore } from "./app/app-state-store";
import { AppShell } from "./app/AppShell";
import { PrototypeErrorBoundary } from "./components/PrototypeErrorBoundary";
import "@fontsource/cormorant-garamond/latin-600.css";
import "@fontsource/cormorant-garamond/latin-700.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
export { formatRecipeDuration } from "./components/format";
export type { CataloguePassiveDurationLabel } from "./components/format";
export { cataloguePassiveDurationLabel } from "./components/format";
export { formatCatalogueCardDuration } from "./components/format";
export { catalogueDurationItems } from "./components/format";
export type { RecipeRating } from "./app/types";
export { PrototypeErrorBoundary } from "./components/PrototypeErrorBoundary";

export default function Prototype() {
  const appStore = useMemo(() => createAppStateStore(DEFAULT_APP_STATE), []);
  const initial = useMemo<FlowScreen>(() => ({ id: "root", render: (flow) => <AppShell flow={flow} appStore={appStore} /> }), [appStore]);
  return <PrototypeErrorBoundary><FlowStack initial={initial} /></PrototypeErrorBoundary>;
}
