import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { isDineInMode } from "../shared/dineInFields";
import { createHomeReportCalendar } from "../shared/home-report-calendar";

const source = readFileSync(new URL("./branch-alerts.ts", import.meta.url), "utf8");
const aggregateStart = source.indexOf("async function aggregateQueueEndStats(");
const aggregateEnd = source.indexOf("\n/**", aggregateStart);
const notifyStart = source.indexOf("export async function notifyOrgServiceQueueStatusChange(");
const notifyEnd = source.indexOf("export async function evaluateBranchAlerts(", notifyStart);
assert.ok(aggregateStart >= 0 && aggregateEnd > aggregateStart && notifyEnd > notifyStart);
const code = transformSync(
  source.slice(aggregateStart, aggregateEnd) + "\n"
    + source.slice(notifyStart, notifyEnd).replace("export async function", "async function"),
  { loader: "ts" },
).code + "\nglobalThis.aggregate = aggregateQueueEndStats; globalThis.notify = notifyOrgServiceQueueStatusChange;";
const since = new Date("2026-10-05T04:30:00Z");
const endedAt = new Date("2026-10-05T05:30:00Z");
const at = (minutes: number) => new Date(since.getTime() + minutes * 60000);
const ticket = (status: string, extra: Record<string, unknown> = {}) => ({
  branchId: "branch", serviceId: "service", status, joinedAt: at(2), createdAt: at(2),
  formData: { partySize: 2 }, estimatedWaitTime: 120, ...extra,
});
function harness(rows: any[], options: { branchMode?: string; serviceMode?: string; recipients?: boolean; lastValue?: number | null; openedAt?: Date | null } = {}) {
  const sends: any[] = [], updates: any[] = [], events: string[] = [];
  const scope = { branchId: "branchId", serviceId: "serviceId", joinedAt: "joinedAt", createdAt: "createdAt" };
  const context: any = {
    Date,
    tickets: scope,
    db: {
      select: () => ({ from: () => ({
        where: async (predicate: (row: any) => boolean) => rows.filter(predicate),
      }) }),
      update: () => ({ set: (patch: any) => ({
        where: async (predicate: any) => {
          const kind = ["queue_open", "queue_status"].find(triggerKind => predicate({ branchId: "branch", triggerKind, scopeId: "service" }));
          events.push(`update:${kind}`);
          updates.push({ patch, kind });
        },
      }) }),
    },
    eq: (key: string, value: unknown) => (row: any) => row[key] === value,
    gte: (key: string, value: Date) => (row: any) => new Date(row[key]) >= value,
    lte: (key: string, value: Date) => (row: any) => new Date(row[key]) <= value,
    and: (...conditions: Array<(row: any) => boolean>) => (row: any) => conditions.every(condition => condition(row)),
    getBranch: async () => ({ id: "branch", organizationId: "org", name: "Restaurant", queueMode: options.branchMode || "dinein" }),
    getServiceById: async () => ({ serviceSettings: options.serviceMode ? { queueMode: options.serviceMode } : {} }),
    isDineInMode,
    getOrganizationCalendar: async () => createHomeReportCalendar("Asia/Kolkata"),
    getOrCreateState: async (_branch: string, kind: string) => kind === "queue_status"
      ? { lastValue: options.lastValue === undefined ? 1 : options.lastValue }
      : { lastTriggeredAt: options.openedAt === undefined ? since : options.openedAt },
    getRecipientsFor: async () => options.recipients === false ? [] : [{ id: "recipient" }],
    sendAlertToRecipients: async (recipients: any[], payload: any) => {
      events.push("send");
      sends.push({ recipients, payload });
      await new Promise(resolve => setTimeout(resolve, 5));
    },
    branchAlertState: { branchId: "branchId", triggerKind: "triggerKind", scopeId: "scopeId" },
    locationLabelFor: () => "Restaurant, City",
    formatAlertTime: (date: Date) => date.toISOString(),
    formatAlertDate: () => "05 Oct 2026",
    console: { log() {}, error: (...args: unknown[]) => { throw new Error(args.join(" ")); } },
  };
  runInNewContext(code, context);
  return { ...context, sends, updates, events };
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("Dine In closing counts seated bookings, guests and actual outcomes in the selected service session", async () => {
  const rows = [
    ticket("arrived", { calledAt: at(12), arrivedAt: at(15), formData: { partySize: 4 } }),
    ticket("completed", { calledAt: at(22), formData: { guests: 3 } }),
    ticket("cancelled"),
    ticket("no_show"),
    ticket("waiting", { estimatedWaitTime: 900 }),
    ticket("completed", { branchId: "other-branch", formData: { partySize: 20 } }),
    ticket("completed", { serviceId: "other-service", formData: { partySize: 20 } }),
    ticket("arrived", { joinedAt: at(-1), calledAt: at(5) }),
    ticket("arrived", { joinedAt: at(61), calledAt: at(65) }),
  ];
  const h = harness(rows);
  const original = JSON.stringify(rows);
  const stats = await h.aggregate("branch", "service", since, { dineIn: true, endedAt });
  assert.deepEqual(plain(stats), {
    totalEntries: 5, totalVisitors: 13, served: 2, cancelled: 1, noShow: 1,
    walkins: 0, avgWaitMinutes: 15, peakWaitMinutes: 20,
  });
  assert.equal(JSON.stringify(rows), original, "No booking or transaction is modified");
});

test("Dine In samples use queue join time and measured fallbacks, never predictions", async () => {
  const h = harness([
    ticket("arrived", { createdAt: at(-60), calledAt: at(12) }),
    ticket("completed", { actualWaitTime: 0 }),
    ticket("completed", { actualWaitTime: 8, formData: { partySize: 1, isWalkin: true } }),
    ticket("arrived", { arrivedAt: at(8) }),
    ticket("completed", { calledAt: at(-1), estimatedWaitTime: 500 }),
    ticket("arrived"),
    ticket("called", { calledAt: at(52), estimatedWaitTime: 900 }),
  ]);
  const stats = await h.aggregate("branch", "service", since, { dineIn: true, endedAt });
  assert.equal(stats.totalEntries, 7, "Pre-created reservations joined in this session are included");
  assert.equal(stats.served, 6);
  assert.equal(stats.walkins, 1, "Existing explicit Walk In flags are preserved");
  assert.equal(stats.avgWaitMinutes, 6, "Measured values 10, 0, 8 and 6 only");
  assert.equal(stats.peakWaitMinutes, 10);
});

test("empty Dine In sessions and sessions with no measured samples have zero wait statistics", async () => {
  for (const rows of [[], [ticket("arrived"), ticket("waiting"), ticket("cancelled")]]) {
    const stats = await harness(rows).aggregate("branch", "service", since, { dineIn: true, endedAt });
    assert.equal(stats.avgWaitMinutes, 0);
    assert.equal(stats.peakWaitMinutes, 0);
  }
});

test("FIFO and Take Away retain their existing outcome, window and wait calculation", async () => {
  const h = harness([
    ticket("completed", { calledAt: at(12), createdAt: at(5) }),
    ticket("waiting", { estimatedWaitTime: 13 }),
    ticket("arrived", { estimatedWaitTime: 4 }),
    ticket("completed", { createdAt: at(-1) }),
    ticket("completed", { createdAt: at(65), estimatedWaitTime: 0 }),
  ]);
  const expected = {
    totalEntries: 4, totalVisitors: 8, served: 2, cancelled: 0, noShow: 0,
    walkins: 0, avgWaitMinutes: 6, peakWaitMinutes: 13,
  };
  assert.deepEqual(plain(await h.aggregate("branch", "service", since)), expected);
  assert.deepEqual(plain(await h.aggregate("branch", "service", since, { dineIn: false, endedAt })), expected);
});

test("manual and automatic closing share corrected WhatsApp parameters without changing recipients or templates", async () => {
  for (const branchMode of ["dinein", "dine_in", "dine-in"]) {
    const h = harness([ticket("arrived", { calledAt: at(12), formData: { partySize: 4 } })], { branchMode });
    await h.notify("branch", "service", "Dining", "ended", "active");
    assert.equal(h.sends.length, 1);
    const { recipients, payload } = h.sends[0];
    assert.equal(recipients[0].id, "recipient");
    assert.equal(payload.template.name, "org_alert_queue_end");
    assert.equal(payload.template.params.length, 13);
    assert.deepEqual(plain(payload.template.params.slice(5)), [1, 4, 1, 0, 0, 0, 10, 10]);
  }
});

test("an explicit service mode overrides its branch for the closing calculation", async () => {
  const rows = [ticket("arrived", { calledAt: at(12) })];
  for (const [branchMode, serviceMode, served] of [
    ["dinein", "takeaway", 0], ["fifo", "dine_in", 1],
  ] as const) {
    const h = harness(rows, { branchMode, serviceMode });
    await h.notify("branch", "service", "Service", "ended", "active");
    assert.equal(h.sends[0].payload.template.params[7], served);
  }
});

test("opening anchors are saved before delivery, even with no recipients; pauses and resumes do not reset them", async () => {
  for (const recipients of [true, false]) {
    const h = harness([], { recipients, lastValue: 3 });
    await h.notify("branch", "service", "Dining", "active", "ended");
    assert.equal(h.updates[0].kind, "queue_open");
    if (recipients) assert.ok(h.events.indexOf("update:queue_open") < h.events.indexOf("send"));
    assert.equal(h.updates[0].patch.lastTriggeredAt.getTime(), h.updates[1].patch.lastTriggeredAt.getTime());
  }
  for (const [newStatus, previousStatus] of [["paused", "active"], ["active", "paused"], ["ended", "active"]]) {
    const h = harness([]);
    await h.notify("branch", "service", "Dining", newStatus, previousStatus);
    assert.equal(h.updates.some((update: any) => update.kind === "queue_open"), false);
  }
});

test("legacy midnight fallback and queue-session bounds remain organisation-timezone based", async () => {
  const h = harness([], { openedAt: null });
  const now = new Date();
  const calendar = createHomeReportCalendar("Asia/Kolkata");
  await h.notify("branch", "service", "Dining", "ended", "active");
  assert.equal(h.sends[0].payload.template.params[3], calendar.dayStart(calendar.dateKey(now)).toISOString());
  const bounded = harness([
    ticket("arrived", { joinedAt: at(0) }),
    ticket("arrived", { joinedAt: at(60) }),
    ticket("arrived", { joinedAt: at(60.001) }),
  ]);
  assert.equal((await bounded.aggregate("branch", "service", since, { dineIn: true, endedAt })).totalEntries, 2);
});
