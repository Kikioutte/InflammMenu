import { openDatabase, LOCAL_STORAGE_KEY, LOCAL_RESET_MARKER_KEY, STORE_NAME, STATE_KEY, RESET_MARKER_KEY } from "./storage.ts";

/** An evidence copy, deliberately distinct from an importable, validated backup. */
export async function exportRawRecovery(): Promise<string> {
  const replicas: Record<string, unknown> = {};
  let hasData = false;
  try {
    const rawState = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    const resetMarker = window.localStorage.getItem(LOCAL_RESET_MARKER_KEY);
    hasData = rawState !== null || resetMarker !== null;
    replicas.localStorage = {
      rawState,
      resetMarker,
    };
  } catch { replicas.localStorage = { unavailable: true }; }
  try {
    const database = await openDatabase(true);
    try {
      replicas.IndexedDB = await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const state = store.get(STATE_KEY);
        const marker = store.get(RESET_MARKER_KEY);
        transaction.oncomplete = () => {
          hasData ||= state.result !== undefined || marker.result !== undefined;
          resolve({ rawState: state.result ?? null, resetMarker: marker.result ?? null });
        };
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
    } finally { database.close(); }
  } catch { replicas.IndexedDB = { unavailable: true }; }
  if (!hasData) throw new Error("No stored data could be read for recovery");
  return `${JSON.stringify({ format: "inflamm-menu-raw-recovery", exportedAt: new Date().toISOString(), replicas }, null, 2)}\n`;
}

