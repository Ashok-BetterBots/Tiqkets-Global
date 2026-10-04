import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createHomeReportCalendar, shiftHomeReportDate } from "../shared/home-report-calendar";

// Exercise the real report handler with an in-memory database adapter.
// No customer records, notifications or production data are touched.
const source = ts.createSourceFile("reports.ts",
  readFileSync(new URL("./reports.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let handlerSource = "";
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "app.get"
    && node.arguments[0]?.getText(source) === '"/api/reports/:orgId/summary"') {
    handlerSource = node.arguments[1].getText(source);
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
  organizations: [{ id: "org-test", accountType: "organization" }],
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
    ticket("yesterday", { joinedAt: new Date("2026-10-03T20:59:59Z") }),
    ticket("tomorrow", { joinedAt: new Date("2026-10-04T21:00:00Z") }),
  ],
};

async function report(query: Record<string, string>) {
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
  const js = ts.transpileModule(`const handler = ${handlerSource}; handler;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const handler = runInNewContext(js, {
    db, eq, gte, lte, inArray, and,
    tickets: table("tickets"), branches: table("branches"), organizations: table("organizations"),
    orgUsers: table("orgUsers"), reservations: table("reservations"),
    createHomeReportCalendar, shiftHomeReportDate, console,
  });
  let body: any;
  let status = 200;
  const response = {
    status: (code: number) => { status = code; return response; },
    json: (value: unknown) => { body = value; return response; },
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
  assert.equal(data.hourly.find((bucket: Row) => bucket.hour === 9).completed, 3);
  assert.equal(data.hourly.find((bucket: Row) => bucket.hour === 1).completed, 1);
  assert.deepEqual(Array.from(data.byStaff, (staff: Row) => staff.staffId).sort(), ["user-a", "user-b"]);
});

test("All Desks includes other users at each desk but never another branch or service", async () => {
  const allDesks = await report(homeScope);
  assert.equal(allDesks.summary.completed, 5);
  assert.equal(allDesks.daily[0].completed, 5);
  const otherDesk = await report({ ...homeScope, deskId: "desk-b" });
  assert.equal(otherDesk.summary.completed, 1);
  assert.equal(otherDesk.byStaff[0].staffId, "user-b");
});

test("separate Reports keeps its explicit staff filter and existing UTC daily buckets", async () => {
  const data = await report({
    branchId: "branch-a", serviceId: "service-a", staffId: "user-b",
    startDate: "2026-10-03",
  });
  assert.equal(data.summary.completed, 3);
  assert.equal(data.byStaff.length, 1);
  assert.equal(data.byStaff[0].staffId, "user-b");
  assert.equal(data.daily[0].date, "2026-10-03");
  assert.equal(data.daily[0].completed, 1);
  assert.equal(data.hourly.find((bucket: Row) => bucket.hour === 22).completed, 1);
});