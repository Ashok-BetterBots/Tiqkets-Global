import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const { PNG } = require("pngjs");

const root = new URL("../../", import.meta.url);
const readImage = (path: string) => PNG.sync.read(readFileSync(new URL(path, root)));
const config = JSON.parse(readFileSync(new URL("app.json", root), "utf8")).expo;
const splash = config.plugins.find((entry: any) => Array.isArray(entry) && entry[0] === "expo-splash-screen")[1];

test("splash alone uses a separate white asset with unchanged backgrounds and sizing", () => {
  assert.equal(splash.image, "./assets/images/splash-icon-white.png");
  assert.equal(splash.imageWidth, 200);
  assert.equal(splash.resizeMode, "contain");
  assert.equal(splash.backgroundColor, "#8c1867");
  assert.equal(splash.dark.backgroundColor, "#6a1250");
  assert.equal(config.icon, "./assets/images/icon.png");
  assert.equal(config.android.icon, "./assets/images/android-launcher.png");
  assert.equal(config.android.adaptiveIcon.foregroundImage, "./assets/images/android-launcher-foreground.png");
});

test("white splash preserves every alpha pixel, original proportions and artwork resolution", () => {
  const original = readImage("assets/images/splash-icon.png");
  const white = readImage("assets/images/splash-icon-white.png");
  assert.equal(white.width, original.width);
  assert.equal(white.height, original.height);
  assert.ok(white.width >= 1000 && white.height >= 1000);
  let visible = 0;
  for (let i = 0; i < original.data.length; i += 4) {
    assert.equal(white.data[i + 3], original.data[i + 3], `Alpha changed at ${i / 4}`);
    if (!original.data[i + 3]) continue;
    visible++;
    assert.equal(white.data[i], 255);
    assert.equal(white.data[i + 1], 255);
    assert.equal(white.data[i + 2], 255);
    // Original artwork is still raspberry, not overwritten.
    assert.equal(original.data[i], 140);
    assert.equal(original.data[i + 1], 24);
    assert.equal(original.data[i + 2], 103);
  }
  assert.ok(visible > 0);
});

test("visible artwork fits Android 12's circular safe area on Expo's 288dp canvas", () => {
  const white = readImage("assets/images/splash-icon-white.png");
  // Android's icon-without-background safe circle is 192dp inside 288dp.
  const safeRadius = 96;
  for (let y = 0; y < white.height; y++) {
    for (let x = 0; x < white.width; x++) {
      if (!white.data[(y * white.width + x) * 4 + 3]) continue;
      const dx = ((x + 0.5) / white.width - 0.5) * splash.imageWidth;
      const dy = ((y + 0.5) / white.height - 0.5) * splash.imageWidth;
      assert.ok(dx * dx + dy * dy <= safeRadius * safeRadius, "Artwork crosses the safe circle");
    }
  }
});
