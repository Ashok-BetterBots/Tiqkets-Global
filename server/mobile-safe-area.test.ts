import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("mobile navigation and bottom-pinned surfaces use runtime safe-area insets", () => {
  const app = readFileSync("client/App.tsx", "utf8");
  const mainTabs = readFileSync("client/navigation/MainTabNavigator.tsx", "utf8");
  const orgTabs = readFileSync("client/navigation/OrgTabNavigator.tsx", "utf8");
  const eventTabs = readFileSync("client/navigation/EventTabNavigator.tsx", "utf8");
  const bottomSheetModal = readFileSync("client/components/BottomSheetModal.tsx", "utf8");
  const manualRegistration = readFileSync("client/components/EventManualRegModal.tsx", "utf8");
  const scanner = readFileSync("client/screens/QRScannerScreen.tsx", "utf8");
  const bottomSheet = readFileSync("client/components/BottomSheet.tsx", "utf8");
  const snoozeModal = readFileSync("client/components/SnoozeModal.tsx", "utf8");
  const serviceSelection = readFileSync("client/components/ServiceSelectionModal.tsx", "utf8");
  const ticketScanResult = readFileSync("client/components/event/TicketScanResultModal.tsx", "utf8");
  const billingTransaction = readFileSync("client/components/event/BillingTransactionModal.tsx", "utf8");
  const journeyManager = readFileSync("client/components/org/JourneyManager.tsx", "utf8");
  const eventDashboard = readFileSync("client/screens/event/EventDashboardScreen.tsx", "utf8");
  const eventParking = readFileSync("client/screens/event/EventParkingScreen.tsx", "utf8");
  const queueDetails = readFileSync("client/screens/QueueDetailsScreen.tsx", "utf8");
  const appConfig = JSON.parse(readFileSync("app.json", "utf8"));

  assert.match(app, /SafeAreaProvider initialMetrics=\{initialWindowMetrics\}/);
  assert.match(mainTabs, /paddingBottom: insets\.bottom \+ TAB_BAR_BOTTOM_GAP/);
  assert.match(orgTabs, /height: 64 \+ insets\.bottom/);
  assert.match(orgTabs, /paddingBottom: insets\.bottom/);
  assert.match(eventTabs, /height: 64 \+ insets\.bottom/);
  assert.match(eventTabs, /paddingBottom: insets\.bottom/);
  assert.match(bottomSheetModal, /navigationBarTranslucent/);
  assert.match(bottomSheetModal, /paddingBottom: 20 \+ insets\.bottom/);
  assert.match(manualRegistration, /navigationBarTranslucent/);
  assert.match(manualRegistration, /<SafeAreaProvider style=\{styles\.modalSafeAreaProvider\}>/);
  assert.match(manualRegistration, /function ModalSafeAreaFooter/);
  assert.match(manualRegistration, /const modalInsets = useSafeAreaInsets\(\)/);
  assert.match(manualRegistration, /paddingBottom: 16 \+ modalInsets\.bottom/);
  assert.match(manualRegistration, /pointerEvents="box-none"/);
  assert.match(manualRegistration, /<View\s+style=\{\[styles\.card/);
  assert.doesNotMatch(manualRegistration, /<Pressable\s+onPress=\{\(e\) => e\.stopPropagation\(\)\}/);
  assert.match(scanner, /paddingBottom: Spacing\["5xl"\] \+ insets\.bottom/);
  assert.match(bottomSheet, /navigationBarTranslucent/);
  assert.match(bottomSheet, /paddingBottom: insets\.bottom \+ Spacing\.md/);
  assert.match(snoozeModal, /navigationBarTranslucent/);
  assert.match(snoozeModal, /paddingBottom: Spacing\["4xl"\] \+ insets\.bottom/);
  assert.match(serviceSelection, /navigationBarTranslucent/);
  assert.match(serviceSelection, /paddingBottom: 20 \+ insets\.bottom/);
  assert.match(ticketScanResult, /navigationBarTranslucent/);
  assert.match(ticketScanResult, /paddingBottom: insets\.bottom \+ Spacing\.xl/);
  assert.match(billingTransaction, /navigationBarTranslucent/);
  assert.match(billingTransaction, /paddingBottom: insets\.bottom \+ Spacing\.xl/);
  assert.match(journeyManager, /navigationBarTranslucent/);
  assert.match(journeyManager, /paddingBottom: 20 \+ insets\.bottom/);
  assert.match(eventDashboard, /navigationBarTranslucent/);
  assert.match(eventDashboard, /paddingBottom: insets\.bottom \+ Spacing\.lg/);
  assert.match(eventParking, /navigationBarTranslucent/);
  assert.match(eventParking, /paddingBottom: Spacing\.md \+ insets\.bottom/);
  assert.match(queueDetails, /navigationBarTranslucent/);
  assert.match(queueDetails, /paddingBottom: insets\.bottom \+ Spacing\.md/);
  assert.equal(
    appConfig.expo.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === "expo-build-properties",
    )?.[1]?.android?.targetSdkVersion,
    36,
  );
});