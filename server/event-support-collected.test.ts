import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("support collection is restricted to timely exited tickets and persists independently", () => {
  const routes = readFileSync("server/events-routes.ts", "utf8");
  const schema = readFileSync("shared/schema.ts", "utf8");
  const screen = readFileSync("client/screens/event/EventSupportScreen.tsx", "utf8");
  const migration = readFileSync("migrations/0024_event_registration_collected.sql", "utf8");

  assert.match(schema, /collectedAt: timestamp\("collected_at"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "collected_at" timestamp/);
  assert.match(routes, /support\/mark-collected", requirePermission\("org\.events\.support"\)/);
  assert.match(routes, /status !== "exited" \|\| !scoped\.reg\.checkoutAlertSnapshot/);
  assert.match(routes, /isNotNull\(eventRegistrations\.checkoutAlertSnapshot\)/);
  assert.match(routes, /isNull\(eventRegistrations\.collectedAt\)/);
  assert.match(routes, /stage: "collected"/);
  assert.match(screen, /selected\.checkoutAlertSnapshot/);
  assert.match(screen, /selected\.status === "exited"/);
  assert.match(screen, />Mark as Done</);
  assert.match(screen, /name="check-circle"[\s\S]*>Collected</);
});