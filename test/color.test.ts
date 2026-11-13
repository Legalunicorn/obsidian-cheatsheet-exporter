import assert from "node:assert/strict";
import { test } from "node:test";
import { isDarkColor } from "../src/color.ts";

test("isDarkColor flags the light-mode backgrounds of dark-only themes", () => {
  assert.equal(isDarkColor("rgb(40, 42, 54)"), true); // Dracula
  assert.equal(isDarkColor("rgb(9, 15, 35)"), true); // Rosé Pine Moon
});

test("isDarkColor passes tinted light backgrounds", () => {
  assert.equal(isDarkColor("rgb(249, 245, 215)"), false); // Gruvbox cream
  assert.equal(isDarkColor("rgb(213, 214, 219)"), false); // Tokyo Night light
  assert.equal(isDarkColor("rgb(255, 255, 255)"), false);
});

test("isDarkColor treats transparent and unknown colours as light", () => {
  assert.equal(isDarkColor("rgba(0, 0, 0, 0)"), false);
  assert.equal(isDarkColor("rgb(0 0 0 / 20%)"), false);
  assert.equal(isDarkColor("rgb(0 0 0 / 80%)"), true);
  assert.equal(isDarkColor("color(srgb 0 0 0)"), false);
  assert.equal(isDarkColor(""), false);
});
