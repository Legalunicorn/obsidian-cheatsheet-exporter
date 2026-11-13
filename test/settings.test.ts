import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, withDefaults } from "../src/settings.ts";

test("withDefaults uses the defaults when nothing is saved", () => {
  assert.deepEqual(withDefaults(null), DEFAULT_SETTINGS);
});

test("withDefaults keeps saved choices", () => {
  const saved = { columns: 2, compact: false, printBackground: true };
  assert.deepEqual(withDefaults(saved), { ...DEFAULT_SETTINGS, ...saved });
});

test("withDefaults turns compact spacing on for settings saved before 0.1.4", () => {
  const saved = { columns: 3, compact: false };
  assert.deepEqual(withDefaults(saved), { ...DEFAULT_SETTINGS, columns: 3, compact: true });
  assert.equal(saved.compact, false, "the saved object itself is left alone");
});
