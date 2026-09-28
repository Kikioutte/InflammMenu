import assert from "node:assert/strict";
import test from "node:test";
import { createStoragePersistenceRequester } from "../src/storage-persistence.ts";

test("la demande est paresseuse et les appels concurrents partagent une seule tentative", async () => {
  let getCount = 0; let checked = 0; let requested = 0; let resolvePersisted;
  const manager = {
    persisted() { assert.equal(this, manager); checked += 1; return new Promise((resolve) => { resolvePersisted = resolve; }); },
    async persist() { assert.equal(this, manager); requested += 1; return true; },
  };
  const request = createStoragePersistenceRequester(() => { getCount += 1; return manager; });
  assert.equal(getCount, 0);
  const first = request();
  const second = request();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(getCount, 1);
  assert.equal(checked, 1);
  assert.equal(requested, 0);
  resolvePersisted(false);
  await first;
  await request();
  assert.equal(requested, 1);
  assert.equal(checked, 1);
});

test("une origine déjà persistante ne redemande pas de permission", async () => {
  let requested = 0;
  const request = createStoragePersistenceRequester(() => ({ persisted: async () => true, persist: async () => { requested += 1; return true; } }));
  await request(); await request();
  assert.equal(requested, 0);
});

test("les API absentes sont sans effet et persist fonctionne sans persisted", async () => {
  for (const manager of [null, undefined, {}, { persisted: async () => false }]) {
    await assert.doesNotReject(createStoragePersistenceRequester(() => manager)());
  }
  let requested = 0;
  const request = createStoragePersistenceRequester(() => ({ persist: async () => { requested += 1; return false; } }));
  await request(); await request();
  assert.equal(requested, 1);
});

test("un refus ou une erreur de persist ne se répète pas dans la session", async () => {
  for (const outcome of ["denied", "throw", "reject"]) {
    let checked = 0; let requested = 0;
    const request = createStoragePersistenceRequester(() => ({
      persisted: async () => { checked += 1; return false; },
      persist: () => { requested += 1; if (outcome === "throw") throw new Error("refus synchrone"); return outcome === "reject" ? Promise.reject(new Error("refus asynchrone")) : Promise.resolve(false); },
    }));
    await assert.doesNotReject(request());
    await assert.doesNotReject(request());
    assert.equal(checked, 1, outcome);
    assert.equal(requested, 1, outcome);
  }
});

test("les getters et les vérifications persisted défaillants restent non bloquants", async () => {
  let requested = 0;
  const persist = async () => { requested += 1; return true; };
  const getters = [
    () => { throw new Error("storage inaccessible"); },
    () => ({ get persisted() { throw new Error("getter persisted inaccessible"); }, persist }),
    () => ({ persisted: () => { throw new Error("vérification impossible"); }, persist }),
    () => ({ persisted: () => Promise.reject(new Error("vérification rejetée")), persist }),
    () => ({ get persist() { throw new Error("getter persist inaccessible"); } }),
  ];
  for (const getter of getters) {
    const request = createStoragePersistenceRequester(getter);
    await assert.doesNotReject(request());
    await assert.doesNotReject(request());
  }
  assert.equal(requested, 0);
});

test("une API qui ne répond jamais ne crée pas de tentatives supplémentaires", async () => {
  for (const stuckAt of ["persisted", "persist"]) {
    let checked = 0; let requested = 0;
    const request = createStoragePersistenceRequester(() => ({
      persisted: () => { checked += 1; return stuckAt === "persisted" ? new Promise(() => {}) : Promise.resolve(false); },
      persist: () => { requested += 1; return new Promise(() => {}); },
    }));
    const first = request();
    let settled = false;
    void first.then(() => { settled = true; });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    for (let index = 0; index < 20; index += 1) assert.equal(request(), first);
    assert.equal(settled, false);
    assert.equal(checked, 1);
    assert.equal(requested, stuckAt === "persist" ? 1 : 0);
  }
});

test("deux factories indépendantes représentent deux sessions indépendantes", async () => {
  let requested = 0;
  const manager = { persist: async () => { requested += 1; return false; } };
  await createStoragePersistenceRequester(() => manager)();
  await createStoragePersistenceRequester(() => manager)();
  assert.equal(requested, 2);
});

test("une intention devenue périmée pendant persisted ne déclenche pas persist", async () => {
  let resolvePersisted; let eligible = true; let requested = 0; let checked = 0;
  const request = createStoragePersistenceRequester(() => ({
    persisted: () => { checked += 1; return checked === 1 ? new Promise((resolve) => { resolvePersisted = resolve; }) : Promise.resolve(false); },
    persist: async () => { requested += 1; return true; },
  }));
  const pending = request(() => eligible);
  await Promise.resolve();
  eligible = false;
  resolvePersisted(false);
  await pending;
  assert.equal(requested, 0);
  await request(() => true);
  assert.equal(checked, 2);
  assert.equal(requested, 1, "une nouvelle semaine autorisée conserve sa vraie tentative");
});

test("une nouvelle intention autorisée pendant la sonde remplace celle devenue périmée", async () => {
  let resolvePersisted; let oldEligible = true; let requested = 0; let checked = 0;
  const request = createStoragePersistenceRequester(() => ({
    persisted: () => { checked += 1; return new Promise((resolve) => { resolvePersisted = resolve; }); },
    persist: async () => { requested += 1; return true; },
  }));
  const pending = request(() => oldEligible);
  await Promise.resolve();
  oldEligible = false;
  assert.equal(request(() => true), pending);
  resolvePersisted(false);
  await pending;
  assert.equal(checked, 1);
  assert.equal(requested, 1);
});

test("une nouvelle intention au créneau annulation-finalisation obtient sa propre sonde", async () => {
  let resolvePersisted; let oldEligible = true; let requested = 0; let checked = 0; let second;
  const request = createStoragePersistenceRequester(() => ({
    persisted: () => { checked += 1; return checked === 1 ? new Promise((resolve) => { resolvePersisted = resolve; }) : Promise.resolve(false); },
    persist: async () => { requested += 1; return true; },
  }));
  const first = request(() => oldEligible);
  await Promise.resolve();
  oldEligible = false;
  resolvePersisted(false);
  queueMicrotask(() => { second = request(() => true); });
  await first;
  await second;
  assert.notEqual(second, first);
  assert.equal(checked, 2);
  assert.equal(requested, 1);
});

test("une intention déjà périmée ou une vérification défaillante ne sollicite aucune API", async () => {
  for (const eligible of [() => false, () => { throw new Error("intention supprimée"); }]) {
    let accessed = 0;
    const request = createStoragePersistenceRequester(() => { accessed += 1; return { persist: async () => true }; });
    await assert.doesNotReject(request(eligible));
    assert.equal(accessed, 0);
  }
});
