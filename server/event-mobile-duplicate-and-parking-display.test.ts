import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("duplicate scan response includes ticket journey without changing scan transitions", () => {
  const routes = readFileSync("server/events-routes.ts", "utf8");
  const screen = readFileSync("client/screens/event/EventCheckInScreen.tsx", "utf8");
  const modal = readFileSync("client/components/event/TicketScanResultModal.tsx", "utf8");

  assert.match(routes, /const journey = isDup \? await registrationJourney\(reg\.id\) : undefined/);
  assert.match(routes, /\.\.\.\(journey \? \{ journey \} : \{\}\)/);
  assert.match(screen, /journey: data\.journey/);
  assert.match(modal, /testID="duplicate-ticket-status"/);
  assert.match(modal, /label="Last Entered"/);
  assert.match(modal, /testID="duplicate-ticket-journey"/);
  assert.match(modal, /Last Known Status/);
});

test("parking tab follows the selected event instead of any event", () => {
  const navigator = readFileSync("client/navigation/EventTabNavigator.tsx", "utf8");

  assert.match(navigator, /const \{ selectedEvent \} = useEventSelection\(\)/);
  assert.match(navigator, /selectedEvent\?\.parkingEnabled !== false/);
  assert.doesNotMatch(navigator, /events\.some\(\(event\) => event\.parkingEnabled/);
  assert.match(navigator, /hasPermission\("org\.events\.parking"\) && parkingEnabled/);
});