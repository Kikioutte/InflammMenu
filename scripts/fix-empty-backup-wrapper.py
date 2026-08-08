#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
storage_path = root / "src/storage.ts"
storage = storage_path.read_text(encoding="utf-8")
old = '''    if (!isRecord(parsed.state)) throw new Error("Sauvegarde incomplète : aucune donnée exploitable.");
    candidate = parsed.state;'''
new = '''    if (!isRecord(parsed.state)) throw new Error("Sauvegarde incomplète : aucune donnée exploitable.");
    if (!Object.keys(parsed.state).some((key) => RECOGNIZED_STATE_KEYS.has(key))) {
      throw new Error("Sauvegarde incomplète : aucune donnée Inflamm’Menu reconnue.");
    }
    candidate = parsed.state;'''
if storage.count(old) != 1:
    raise RuntimeError("formatted backup validation marker not found")
storage_path.write_text(storage.replace(old, new, 1), encoding="utf-8")

test_path = root / "tests/storage.test.mjs"
tests = test_path.read_text(encoding="utf-8")
old_test = '''test("restoring rejects foreign or broken files and accepts a raw state dump", async () => {
  const { importAppState } = await import("../src/storage.ts");

  assert.throws(() => importAppState("{pas du json"), /Fichier illisible/);
  assert.throws(() => importAppState("[]"), /Fichier illisible/);
  assert.throws(() => importAppState(JSON.stringify({ format: "autre-app", state: {} })), /ne provient pas/);

  const rawState = importAppState(JSON.stringify(state()));'''
new_test = '''test("restoring rejects foreign or broken files and accepts a raw state dump", async () => {
  const { importAppState, BACKUP_FORMAT } = await import("../src/storage.ts");

  assert.throws(() => importAppState("{pas du json"), /Fichier illisible/);
  assert.throws(() => importAppState("[]"), /Fichier illisible/);
  assert.throws(() => importAppState(JSON.stringify({ format: "autre-app", state: {} })), /ne provient pas/);
  assert.throws(() => importAppState(JSON.stringify({ format: BACKUP_FORMAT, version: APP_STATE_VERSION, state: {} })), /incomplète/);
  assert.throws(() => importAppState(JSON.stringify({ format: BACKUP_FORMAT, version: APP_STATE_VERSION, state: { hello: "world" } })), /incomplète/);

  const rawState = importAppState(JSON.stringify(state()));'''
if tests.count(old_test) != 1:
    raise RuntimeError("storage import regression test marker not found")
test_path.write_text(tests.replace(old_test, new_test, 1), encoding="utf-8")

print("Formatted empty backup wrappers are now rejected.")
