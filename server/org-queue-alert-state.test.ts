import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

// Exercise the real notifier with no database or sender imports.
const source = readFileSync(new URL("./branch-alerts.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function notifyOrgServiceQueueStatusChange(");
const end = source.indexOf("export async function evaluateBranchAlerts(", start);
assert.ok(start !== -1 && end > start);
const code = transformSync(
  source.slice(start, end).replace("export async function", "async function"),
  { loader: "ts" },
).code + "\nglobalThis.notify = notifyOrgServiceQueueStatusChange;";

function harness(lastValue: number | null) {
  const sends: any[] = [];
  const updates: any[] = [];
  const logs: string[] = [];
  const stats = {
    totalEntries: 10, totalVisitors: 12, served: 8, cancelled: 1,
    noShow: 1, walkins: 3, avgWaitMinutes: 4, peakWaitMinutes: 7,
  };
  const context: any = {
    getBranch: async () => ({ id: "branch", name: "Branch" }),
    getServiceById: async () => undefined,
    isDineInMode: () => false,
    getOrganizationCalendar: async () => ({
      timeZone: "Asia/Kolkata",
      dateKey: () => "2026-09-28",
      dayStart: () => new Date("2026-09-27T18:30:00Z"),
    }),
    getOrCreateState: async (_branch: string, kind: string) =>
      kind === "queue_status"
        ? { lastValue }
        : { lastTriggeredAt: new Date("2026-09-28T04:30:00Z") },
    getRecipientsFor: async () => [{ id: "recipient" }],
    sendAlertToRecipients: async (_recipients: any[], payload: any) => sends.push(payload),
    aggregateQueueEndStats: async () => stats,
    locationLabelFor: () => "Location",
    formatAlertTime: () => "10:00 AM",
    formatAlertDate: () => "28 Sep 2026",
    db: {
      update: () => ({
        set: (patch: any) => ({
          where: async (scope: any) => updates.push({ patch, scope }),
        }),
      }),
    },
    branchAlertState: { branchId: "branchId", triggerKind: "triggerKind", scopeId: "scopeId" },
    eq: (field: string, value: string) => [field, value],
    and: (...conditions: any[]) => conditions,
    console: {
      log: (...args: unknown[]) => logs.push(args.join(" ")),
      error: (...args: unknown[]) => logs.push(args.join(" ")),
    },
  };
  runInNewContext(code, context);
  return { notify: context.notify, sends, updates, logs };
}

test("a real close transition is not skipped by stale closed alert history", async () => {
  const h = harness(3); // observed production case: service active, alert state ended
  await h.notify("branch", "service", "Service", "ended", "active");
  assert.equal(h.sends.length, 1);
  assert.equal(h.sends[0].template.name, "org_alert_queue_end");
  assert.equal(h.sends[0].template.params.length, 13, "sender prepends recipient name");
  assert.equal(h.updates[0].patch.lastValue, 3);
});

test("a real reopen stamps a fresh anchor even if alert history still says open", async () => {
  const h = harness(1);
  await h.notify("branch", "service", "Service", "active", "ended");
  assert.equal(h.sends.length, 1);
  assert.equal(h.sends[0].template.name, "org_alert_queue_start");
  assert.equal(h.sends[0].template.params.length, 3);
  assert.equal(h.updates.length, 2, "status and fresh open-session anchor are updated");
});

test("legacy callers and unchanged transitions retain status deduplication", async () => {
  for (const previousStatus of [undefined, "active"]) {
    const h = harness(1);
    await h.notify("branch", "service", "Service", "active", previousStatus);
    assert.equal(h.sends.length, 0);
    assert.equal(h.updates.length, 0);
    assert.match(h.logs.join("\n"), /reason=status_unchanged/);
  }
});

test("resuming a paused queue does not reset its open-session anchor", async () => {
  const h = harness(3); // missed pause must not turn a resume into a new session
  await h.notify("branch", "service", "Service", "active", "paused");
  assert.equal(h.sends.length, 1);
  assert.equal(h.updates.length, 1);
});