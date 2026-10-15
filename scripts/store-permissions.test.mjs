import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("generated iOS privacy descriptions survive all Expo config plugins", () => {
  const result = spawnSync(
    process.execPath,
    [resolve("node_modules/expo/bin/cli"), "config", "--type", "introspect", "--json"],
    { encoding: "utf8", env: { ...process.env, EXPO_NO_TELEMETRY: "1" } },
  );
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  const plist = config._internal.modResults.ios.infoPlist;
  const declared = JSON.parse(readFileSync("app.json", "utf8")).expo.ios.infoPlist;
  for (const key of [
    "NSCameraUsageDescription",
    "NSLocationWhenInUseUsageDescription",
    "NSMotionUsageDescription",
    "NSPhotoLibraryUsageDescription",
    "NSPhotoLibraryAddUsageDescription",
  ]) {
    assert.equal(typeof plist[key], "string", `${key} is required by the linked iOS libraries`);
    assert.ok(plist[key].trim().length > 20, `${key} needs a meaningful explanation`);
    assert.equal(plist[key], declared[key], `${key} was changed by a config plugin`);
  }
  assert.ok(!plist.NSMicrophoneUsageDescription, "Do not introduce microphone access");
  assert.ok(!(plist.UIBackgroundModes || []).includes("location"), "Keep location foreground-only");
});
