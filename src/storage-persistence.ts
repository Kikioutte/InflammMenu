type PersistenceManager = Partial<Pick<StorageManager, "persisted" | "persist">>;

/** One best-effort attempt per app session, independent of saving user data. */
export function createStoragePersistenceRequester(
  getManager: () => PersistenceManager | null | undefined = () => typeof navigator === "undefined" ? undefined : navigator.storage,
): (isStillEligible?: () => boolean) => Promise<void> {
  let attempt: Promise<void> | undefined;
  let eligible = () => true;
  const request = (isStillEligible = () => true): Promise<void> => {
    // Concurrent callers have already proved their own saved week; use the
    // newest ticket if it supersedes one whose probe is still pending.
    eligible = isStillEligible;
    if (attempt) return attempt;
    attempt = Promise.resolve().then(async () => {
      try {
        if (!eligible()) { attempt = undefined; return; }
        const manager = getManager();
        if (typeof manager?.persist !== "function") return;
        if (typeof manager.persisted === "function" && await manager.persisted()) return;
        // A reset/import or another generation can occur while the probe waits.
        // Release an abandoned probe immediately, before another caller can
        // receive it. No persist attempt has been consumed at this point.
        if (!eligible()) { attempt = undefined; return; }
        await manager.persist();
      } catch {
        // Unsupported APIs, refusal and errors must never block saving or UI.
      }
    });
    return attempt;
  };
  return request;
}
