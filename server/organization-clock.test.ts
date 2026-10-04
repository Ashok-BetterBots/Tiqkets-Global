import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createHomeReportCalendar } from "../shared/home-report-calendar";

function declaration(path: string, name: string) {
  const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  let result = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(source);
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === name) result = `({ ${node.getText(source)} }).${name}`;
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) result = node.initializer!.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(result, name);
  return result;
}
function evaluate(code: string, context: Record<string, unknown> = {}) {
  return runInNewContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { Date, ...context });
}

test("queue open/close template times and dates are IST, independent of server timezone", () => {
  const formatTime = evaluate(`${declaration("./branch-alerts.ts", "formatAlertTime")}; formatAlertTime;`);
  const formatDate = evaluate(`${declaration("./branch-alerts.ts", "formatAlertDate")}; formatAlertDate;`);
  const date = new Date("2026-10-04T18:30:00.000Z");
  assert.match(formatTime(date, "Asia/Kolkata"), /12:00\s*AM/);
  assert.equal(formatDate(date, "Asia/Kolkata"), "05 Oct 2026");
  assert.match(formatTime(new Date("2026-10-04T06:00:00Z"), "Asia/Kolkata"), /11:30\s*AM/);
});

test("missing queue-open history starts the summary at organisation midnight, not server midnight", () => {
  const calendar = createHomeReportCalendar("Asia/Kolkata");
  const now = new Date("2026-10-04T20:00:00Z");
  const startedAt = evaluate(`const result = ${declaration("./branch-alerts.ts", "startedAt")}; result;`, {
    calendar, now, openedState: { lastTriggeredAt: null },
  });
  assert.equal(startedAt.toISOString(), "2026-10-04T18:30:00.000Z");
  const existingAnchor = new Date("2026-10-04T05:05:00Z");
  const preserved = evaluate(`const result = ${declaration("./branch-alerts.ts", "startedAt")}; result;`, {
    calendar, now, openedState: { lastTriggeredAt: existingAnchor },
  });
  assert.equal(preserved.getTime(), existingAnchor.getTime(), "Real queue-session anchor is unchanged");
});

test("customer Dine-In template timestamps use the organisation timezone without changing wall-clock slots", () => {
  const format = evaluate(`${declaration("./whatsapp.ts", "formatReservationTime")}; formatReservationTime;`);
  assert.match(format(new Date("2026-10-04T06:00:00Z"), {}, "Asia/Kolkata"), /11:30/);
  assert.equal(format(null, { reservationTime: "10:15 AM" }, "Asia/Kolkata"), "10:15 AM");
});

test("web report presets use organisation dates, even across UTC midnight/month/year", () => {
  const html = readFileSync(new URL("./templates/dashboard.html", import.meta.url), "utf8");
  const start = html.indexOf("        get organizationTimeZone() {");
  const end = html.indexOf("        getTicketTimeline(", start);
  assert.ok(start >= 0 && end > start);
  class FixedDate extends Date {
    constructor(value?: string | number | Date) {
      super(value === undefined ? "2026-12-31T20:00:00Z" : value instanceof Date ? value.getTime() : value);
    }
  }
  const methods = evaluate(`const result = ({ ${html.slice(start, end)} }); result;`, { Date: FixedDate });
  let loads = 0;
  methods.org = { timezone: "Asia/Kolkata" };
  methods.reportFilters = {};
  methods.loadReportData = () => { loads++; };
  assert.equal(methods.organizationDateKey(), "2027-01-01");
  methods.setReportRange(7);
  assert.equal(methods.reportFilters.startDate, "2026-12-25");
  assert.equal(methods.reportFilters.endDate, "2027-01-01");
  methods.setReportRange("month");
  assert.equal(methods.reportFilters.startDate, "2027-01-01");
  methods.setReportRange("year");
  assert.equal(methods.reportFilters.startDate, "2027-01-01");
  assert.match(methods.formatTime("2026-10-04T06:00:00Z"), /11:30/);
  assert.equal(loads, 3);
});

test("live queue stats and today's ticket list use exactly the IST day, including midnight", async () => {
  class FixedDate extends Date {
    constructor(value?: string | number | Date) {
      super(value === undefined ? "2026-10-04T20:00:00Z" : value instanceof Date ? value.getTime() : value);
    }
  }
  const rows = [
    { branchId: "a", status: "completed", joinedAt: new Date("2026-10-04T18:30:00Z") },
    { branchId: "a", status: "waiting", joinedAt: new Date("2026-10-04T19:00:00Z") },
    { branchId: "a", status: "completed", joinedAt: new Date("2026-10-04T18:29:59.999Z") },
    { branchId: "a", status: "completed", joinedAt: new Date("2026-10-05T18:30:00Z") },
  ];
  const and = (...conditions: Function[]) => (row: any) => conditions.every(condition => condition(row));
  const compare = (operator: string) => (key: string, value: any) => (row: any) =>
    operator === "eq" ? row[key] === value : operator === "gte" ? row[key] >= value : row[key] < value;
  const db = { select: () => ({ from: () => ({
    where: (condition: any) => {
      const result = rows.filter(condition);
      return Object.assign(Promise.resolve(result), { orderBy: () => Promise.resolve(result) });
    },
  }) }) };
  const context = {
    Date: FixedDate, db, and, eq: compare("eq"), gte: compare("gte"), lt: compare("lt"),
    asc: (value: unknown) => value,
    tickets: { branchId: "branchId", joinedAt: "joinedAt" },
    getBranchOrganizationCalendar: async () => createHomeReportCalendar("Asia/Kolkata"),
    shiftHomeReportDate: (key: string, days: number) => {
      const date = new Date(key + "T12:00:00Z");
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    },
  };
  const stats = evaluate(`const method = ${declaration("./storage.ts", "getQueueStats")}; method;`, context);
  assert.equal((await stats("a")).todayServed, 1);
  assert.equal((await stats("a")).todayWaiting, 1);
  const today = evaluate(`const method = ${declaration("./storage.ts", "getTodaysTicketsByBranch")}; method;`, context);
  assert.equal((await today("a")).length, 2);
});