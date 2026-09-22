import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("dashboard registration list and stats hide incomplete attempts without removing the payment capacity hold", () => {
  const routes = readFileSync("server/events-routes.ts", "utf8");

  const tvStatsStart = routes.indexOf('app.get("/api/event-tv/:eventId/data"');
  const listStart = routes.indexOf('app.get("/api/dashboard/events/:eventId/registrations"');
  const statsStart = routes.indexOf('app.get("/api/dashboard/events/:eventId/stats"');
  const billingStart = routes.indexOf("// ============ BILLING", statsStart);

  assert.ok(tvStatsStart >= 0 && listStart > tvStatsStart && statsStart > listStart && billingStart > statsStart);

  const tvStatsRoute = routes.slice(tvStatsStart, listStart);
  const listRoute = routes.slice(listStart, statsStart);
  const statsRoute = routes.slice(statsStart, billingStart);

  assert.match(
    tvStatsRoute,
    /\.filter\(\(r\) => r\.status !== "registration_started"\)/,
  );
  assert.match(tvStatsRoute, /totalRegistrations: regs\.length/);
  assert.match(listRoute, /ne\(eventRegistrations\.status,\s*"registration_started"\)/);
  assert.match(
    statsRoute,
    /\.filter\(\(r\) => r\.status !== "registration_started"\)/,
  );
  assert.match(statsRoute, /registrations: regs\.length/);
  assert.match(statsRoute, /aggregateRegistrationSourceMetrics\(regs\)/);

  assert.match(
    routes,
    /eventRegistrations\.status\} <> 'registration_started' OR \$\{eventRegistrations\.createdAt\} > NOW\(\) - INTERVAL/,
  );
});