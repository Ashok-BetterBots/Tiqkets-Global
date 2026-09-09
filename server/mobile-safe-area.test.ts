import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("mobile navigation and bottom-pinned surfaces use runtime safe-area insets", () => {
  const app = readFileSync("client/App.tsx", "utf8");
  const mainTabs = readFileSync("client/navigation/MainTabNavigator.tsx", "utf8");
  const orgTabs = readFileSync("client/navigation/OrgTabNavigator.tsx", "utf8");
  const eventTabs = readFileSync("client/navigation/EventTabNavigator.tsx", "utf8");
  const bottomSheet = readFileSync("client/components/BottomSheetModal.tsx", "utf8");
  const manualRegistration = readFileSync("client/components/EventManualRegModal.tsx", "utf8");
  const scanner = readFileSync("client/screens/QRScannerScreen.tsx", "utf8");
  const appConfig = JSON.parse(readFileSync("app.json", "utf8"));

  assert.match(app, /SafeAreaProvider initialMetrics=\{initialWindowMetrics\}/);
  assert.match(mainTabs, /paddingBottom: insets\.bottom \+ TAB_BAR_BOTTOM_GAP/);
  assert.match(orgTabs, /height: 64 \+ insets\.bottom/);
  assert.match(orgTabs, /paddingBottom: insets\.bottom/);
  assert.match(eventTabs, /height: 64 \+ insets\.bottom/);
  assert.match(eventTabs, /paddingBottom: insets\.bottom/);
  assert.match(bottomSheet, /navigationBarTranslucent/);
  assert.match(bottomSheet, /paddingBottom: 20 \+ insets\.bottom/);
  assert.match(manualRegistration, /navigationBarTranslucent/);
  assert.match(manualRegistration, /paddingBottom: 16 \+ insets\.bottom/);
  assert.match(scanner, /paddingBottom: Spacing\["5xl"\] \+ insets\.bottom/);
  assert.equal(
    appConfig.expo.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === "expo-build-properties",
    )?.[1]?.android?.targetSdkVersion,
    36,
  );
});