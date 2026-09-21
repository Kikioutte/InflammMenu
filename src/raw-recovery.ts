import { openDatabase, LOCAL_STORAGE_KEY, LOCAL_RESET_MARKER_KEY, STORE_NAME, STATE_KEY, RESET_MARKER_KEY } from "./storage.ts";

/** Evidence only: no migration, validation, save, or storage upgrade is performed. */
export async function exportRawRecovery(): Promise<string> {
  const replicas: Record<string, unknown> = {};
  let hasData = false;
  try {
    const rawState = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    const resetMarker = window.localStorage.getItem(LOCAL_RESET_MARKER_KEY);
    hasData = rawState !== null || resetMarker !== null;
    replicas.localStorage = { rawState, resetMarker };
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
  if (!hasData) throw new Error("Aucune donnée locale n’a pu être lue pour la récupération.");
  // Corruption in IndexedDB can include values JSON cannot represent. Tag those
  // values instead of failing the entire export (or silently dropping them).
  const ancestors = new WeakMap<object, string>();
  const recoverableValue = (value: unknown, path = "$"): unknown => {
    if (typeof value === "bigint") return { $recoveryType: "bigint", value: String(value) };
    if (typeof value === "number" && !Number.isFinite(value)) return { $recoveryType: "number", value: String(value) };
    if (typeof value !== "object" || value === null) return value;
    const previous = ancestors.get(value);
    if (previous !== undefined) return { $recoveryReference: previous };
    ancestors.set(value, path);
    try {
      if (value instanceof Date) return { $recoveryType: "Date", value: String(value) };
      if (value instanceof Map) return { $recoveryType: "Map", entries: recoverableValue([...value.entries()], `${path}["entries"]`) };
      if (value instanceof Set) return { $recoveryType: "Set", values: recoverableValue([...value], `${path}["values"]`) };
      if (value instanceof ArrayBuffer) return { $recoveryType: "ArrayBuffer", bytes: [...new Uint8Array(value)] };
      if (ArrayBuffer.isView(value)) return { $recoveryType: value.constructor.name, bytes: [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)] };
      if (Array.isArray(value)) return value.map((item, index) => recoverableValue(item, `${path}[${index}]`));
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, recoverableValue(item, `${path}[${JSON.stringify(key)}]`)]));
    } finally {
      // Normal state graphs share profile/plan arrays. Duplicate those values
      // in JSON; only genuine ancestor cycles need a recovery reference.
      ancestors.delete(value);
    }
  };
  return `${JSON.stringify(recoverableValue({ format: "inflamm-menu-raw-recovery", exportedAt: new Date().toISOString(), replicas }), null, 2)}\n`;
}
