import { type AppState, stampAppStateChanges, replaceAppStateData, saveAppState, mergeAppStateReplicas } from "../storage";

type AppStateUpdate = AppState | ((current: AppState) => AppState);

export type AppStateStore = {
  getSnapshot: () => AppState;
  subscribe: (listener: () => void) => () => void;
  setState: (update: AppStateUpdate) => void;
  replaceState: (state: AppState) => Promise<void>;
  hydrateState: (state: AppState) => void;
  mergeState: (state: AppState) => boolean;
};

export function createAppStateStore(initial: AppState): AppStateStore {
  let state = initial;
  const tabRevisionNonce = Math.floor(Math.random() * 1_000);
  const listeners = new Set<() => void>();
  const publish = (next: AppState) => {
    if (Object.is(next, state)) return;
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState: (update) => {
      const candidate = typeof update === "function" ? update(state) : update;
      if (Object.is(candidate, state)) return;
      publish(stampAppStateChanges(state, candidate, Date.now() * 1_000 + tabRevisionNonce));
    },
    replaceState: async (replacement) => {
      const candidate = replaceAppStateData(state, replacement);
      const result = await saveAppState(candidate);
      if (result.state.storageGeneration !== candidate.storageGeneration) {
        throw new Error("Une modification locale plus récente a empêché la restauration.");
      }
      publish(result.state);
    },
    hydrateState: publish,
    mergeState: (incoming) => {
      const merged = mergeAppStateReplicas(state, incoming);
      if (Object.is(merged, state)) return false;
      publish(merged);
      return true;
    },
  };
}
