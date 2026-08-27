import assert from "node:assert/strict";
import test from "node:test";

import { isSharedStorageOrigin } from "../src/privacy.ts";

test("the historical GitHub Pages hostname activates the shared-origin warning", () => {
  assert.equal(isSharedStorageOrigin("kikioutte.github.io"), true);
  assert.equal(isSharedStorageOrigin("KIKIOUTTE.GITHUB.IO"), true);
  assert.equal(isSharedStorageOrigin("inflammenu.example"), false);
  assert.equal(isSharedStorageOrigin("other.kikioutte.github.io"), false);
  assert.equal(isSharedStorageOrigin(""), false);
});
