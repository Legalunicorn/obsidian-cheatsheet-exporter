import assert from "node:assert/strict";
import { test } from "node:test";
import { isDarkColor, toGrey } from "../src/color.ts";

test("toGrey keeps brightness and transparency", () => {
  assert.equal(toGrey("rgb(255, 255, 255)"), "rgb(255, 255, 255)");
  assert.equal(toGrey("rgb(0, 0, 0)"), "rgb(0, 0, 0)");
  assert.equal(toGrey("rgb(255, 0, 0)"), "rgb(54, 54, 54)");
  assert.equal(toGrey("rgba(250, 189, 47, 0.4)"), "rgba(192, 192, 192, 0.4)");
  assert.equal(toGrey("rgb(0 0 255 / 50%)"), "rgba(18, 18, 18, 0.5)");
  assert.equal(toGrey("color(srgb 1 1 1 / 0.2)"), "rgba(255, 255, 255, 0.2)");
});

test("toGrey darkens text so coloured headings stay readable", () => {
  // Gruvbox orange: mid grey as a background, dark grey as text.
  assert.equal(toGrey("rgb(214, 93, 14)"), "rgb(113, 113, 113)");
  assert.equal(toGrey("rgb(214, 93, 14)", true), "rgb(62, 62, 62)");
});

test("toGrey leaves colours it can't read alone", () => {
  assert.equal(toGrey("oklch(0.7 0.1 30)"), null);
  assert.equal(toGrey("none"), null);
  assert.equal(toGrey(""), null);
});

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
  assert.equal(isDarkColor("color(srgb 0 0 0)"), true);
  assert.equal(isDarkColor("oklch(0.2 0 0)"), false);
  assert.equal(isDarkColor(""), false);
});
