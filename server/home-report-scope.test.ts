import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createHomeReportCalendar, shiftHomeReportDate, resolveOrganizationTimezone } from "../shared/home-report-calendar";

// Exercise the real report handler with an in-memory database adapter.
// No customer records, notifications or production data are touched.
const source = ts.createSourceFile("reports.ts",
  readFileSync(new URL("./reports.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let handlerSource = "";
let exportSource = "";
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "app.get"
    && node.arguments[0]?.getText(source) === '"/api/reports/:orgId/summary"') {
    handlerSource = node.arguments[1].getText(source);
  }
  if (ts.isCallExpression(node) && node.expression.getText(source) === "app.get"
    && node.arguments[0]?.getText(source) === '"/api/reports/:orgId/export"') {
    exportSource = node.arguments[1].getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(handlerSource);

const table = (name: string) => new Proxy({ tableName: name } as Record<string, string>, {
  get: (target, key: string) => target[key] ?? `${name}.${key}`,
});
type Row = Record<string, any>;
type Condition = (row: Row) => boolean;
const field = (column: string) => column.split(".").at(-1)!;
const eq = (column: string, value: unknown): Condition => row => row[field(column)] === value;
const gte = (column: string, value: any): Condition => row => row[field(column)] >= value;
const lte = (column: string, value: any): Condition => row => row[field(column)] <= value;
const inArray = (column: string, values: unknown[]): Condition => row => values.includes(row[field(column)]);
const and = (...conditions: Condition[]): Condition => row => conditions.every(condition => condition(row));

const ticket = (id: string, overrides: Row = {}): Row => ({
  id, branchId: "branch-a", serviceId: "service-a", deskId: "desk-a",
  servedBy: "user-a", status: "completed", joinedAt: new Date("2026-10-04T06:00:00Z"),
  ...overrides,
});
const fixtures: Record<string, Row[]> = {
  branches: [
    { id: "branch-a", organizationId: "org-test", name: "A", queueMode: "standard" },
    { id: "branch-b", organizationId: "org-test", name: "B", queueMode: "standard" },
  ],
  organizations: [{ id: "org-test", accountType: "organization", timezone: "Asia/Kolkata" }],
  orgUsers: [
    { id: "user-a", name: "Staff A" }, { id: "user-b", name: "Staff B" },
  ],
  tickets: [
    ticket("staff-a"), ticket("staff-b", { servedBy: "user-b", status: "arrived" }),
    ticket("unattributed", { servedBy: null }),
    ticket("other-desk", { deskId: "desk-b", servedBy: "user-b" }),
    ticket("other-service", { serviceId: "service-b" }),
    ticket("other-branch", { branchId: "branch-b" }),
    ticket("early-today", { joinedAt: new Date("2026-10-03T22:30:00Z"), servedBy: "user-b" }),
    ticket("yesterday", { joinedAt: new Date("2026-10-03T18:29:59Z") }),
    ticket("tomorrow", { joinedAt: new Date("2026-10-04T21:00:00Z") }),
  ],
};

async function report(query: Record<string, string>, exporting = false) {
  const db = {
    select: () => {
      let name = "";
      let condition: Condition = () => true;
      let limit = Infinity;
      const builder = {
        from: (selected: Row) => { name = selected.tableName; return builder; },
        where: (selected: Condition) => { condition = selected; return builder; },
        orderBy: () => builder,
        limit: (value: number) => { limit = value; return builder; },
        then: (resolve: any, reject: any) =>
          Promise.resolve((fixtures[name] ?? []).filter(condition).slice(0, limit)).then(resolve, reject),
      };
      return builder;
    },
  };
  const js = ts.transpileModule(`const handler = ${exporting ? exportSource : handlerSource}; handler;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const handler = runInNewContext(js, {
    db, eq, gte, lte, inArray, and,
    tickets: table("tickets"), branches: table("branches"), organizations: table("organizations"),
    orgUsers: table("orgUsers"), reservations: table("reservations"),
    createHomeReportCalendar, shiftHomeReportDate, resolveOrganizationTimezone, console,
    getOrganizationCalendar: async () => createHomeReportCalendar(fixtures.organizations[0].timezone),
    maskPhone: (value: string) => value,
  });
  let body: any;
  let status = 200;
  const response = {
    status: (code: number) => { status = code; return response; },
    json: (value: unknown) => { body = value; return response; },
    setHeader: () => response,
    send: (value: unknown) => { body = value; return response; },
  };
  await handler({ params: { orgId: "org-test" }, query }, response);
  assert.equal(status, 200);
  return body;
}

const homeScope = {
  branchId: "branch-a", serviceId: "service-a",
  startDate: "2026-10-04", endDate: "2026-10-04", homeTimeZone: "Asia/Riyadh",
};

test("Home summary, daily and hourly include every staff member for the selected desk", async () => {
  const data = await report({ ...homeScope, deskId: "desk-a" });
  assert.equal(data.summary.completed, 4);
  assert.equal(data.daily.length, 1);
  assert.equal(data.daily[0].date, "2026-10-04");
  assert.equal(data.daily[0].completed, 4);
  assert.equal(data.timeZone, "Asia/Kolkata", "Device-supplied timezone cannot override the organisation");
  assert.equal(data.hourly.find((bucket: Row) => bucket.hour === 11).completed, 3);
  assert.equal(data.hourly.find((bucket: Row) => bucket.hour === 4).completed, 1);
  assert.equal(data.byWeekday[0].completed, 4, "Dine-In guests count as served on the IST weekday");
  assert.deepEqual(Array.from(data.byStaff, (staff: Row) => staff.staffId).sort(), ["user-a", "user-b"]);
});

test("CSV export uses the same IST day boundaries and labels local timestamps explicitly", async () => {
  const csv = await report({ ...homeScope, deskId: "desk-a" }, true);
  const rows = csv.split("\n");
  assert.equal(rows.length, 5, "Header plus four tickets within the selected IST day");
  assert.match(rows[0], /Joined At \(Asia\/Kolkata\)/);
  assert.match(csv, /2026-10-04 11:30:00/);
  assert.match(csv, /2026-10-04 04:00:00/);
  assert.doesNotMatch(csv, /2026-10-03 23:59:59/);
});

test("All Desks includes other users at each desk but never another branch or service", async () => {
  const allDesks = await report(homeScope);
  assert.equal(allDesks.summary.completed, 5);
  assert.equal(allDesks.daily[0].completed, 5);
  const otherDesk = await report({ ...homeScope, deskId: "desk-b" });
  assert.equal(otherDesk.summary.completed, 1);
  assert.equal(otherDesk.byStaff[0].staffId, "user-b");
});

test("separate Reports keeps its explicit staff filter and uses the organisation calendar too", async () => {
  const data = await report({
    branchId: "branch-a", serviceId: "service-a", staffId: "user-b",
    startDate: "2026-10-03",
  });
  assert.equal(data.summary.completed, 3);
  assert.equal(data.byStaff.length, 1);
  assert.equal(data.byStaff[0].staffId, "user-b");
  assert.equal(data.daily[0].date, "2026-10-04");
  assert.equal(data.daily[0].completed, 3);
  assert.equal(data.hourly.find((bucket: Row) => bucket.hour === 4).completed, 1);
});