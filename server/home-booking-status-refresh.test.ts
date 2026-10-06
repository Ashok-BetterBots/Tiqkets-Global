import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { liveBookingStatus, patchLiveBookingStatus, type LiveBranchMeta } from "../client/utils/queueBookingStatus";

const branch: LiveBranchMeta = {
  queueStatus: "active", settings: { queueMode: "dinein" }, journeys: [],
  services: [
    { id: "other", queueStatus: "active", desks: [{ id: "other-desk", queueStatus: "active" }] },
    { id: "selected", queueStatus: "ended", desks: [{ id: "desk", queueStatus: "paused" }] },
  ],
};
test("live status respects the selected branch/service/desk and handles older server metadata", () => {
  assert.equal(liveBookingStatus(branch, "selected", "all"), "ended");
  assert.equal(liveBookingStatus(branch, "selected", "desk"), "paused");
  assert.equal(liveBookingStatus(branch, null, "all"), "active");
  assert.equal(liveBookingStatus(branch, "missing", "all"), undefined);
  assert.equal(liveBookingStatus({ ...branch, services: [{ id: "selected" }] }, "selected", "desk"), undefined);
  assert.equal(liveBookingStatus(undefined, "selected", "all"), undefined);
});

test("confirmed mutations update live status immediately without changing scope, mode, or unrelated services", () => {
  const original = JSON.stringify(branch);
  const service = patchLiveBookingStatus({ branch }, { type: "service", id: "selected" }, "active");
  assert.equal(liveBookingStatus(service.branch, "selected", "all"), "active");
  assert.equal(service.branch.services[0], branch.services[0]);
  assert.equal(service.branch.settings, branch.settings);
  const desk = patchLiveBookingStatus({ branch }, { type: "desk", id: "desk" }, "ended");
  assert.equal(liveBookingStatus(desk.branch, "selected", "desk"), "ended");
  assert.equal(liveBookingStatus(desk.branch, "selected", "all"), "ended");
  const ended = patchLiveBookingStatus({ branch }, { type: "branch", id: "branch" }, "ended");
  assert.equal(ended.branch.queueStatus, "ended");
  const reopened = patchLiveBookingStatus(ended, { type: "desk", id: "desk" }, "active");
  assert.equal(reopened.branch.queueStatus, "active");
  assert.equal(liveBookingStatus(reopened.branch, "selected", "all"), "active");
  assert.equal(JSON.stringify(branch), original);
});

const dashboardText = readFileSync(new URL("../client/screens/org/OrgDashboardScreen.tsx", import.meta.url), "utf8");
const contextText = readFileSync(new URL("../client/contexts/OrganizationContext.tsx", import.meta.url), "utf8");
function expression(text: string, name: string) {
  const ast = ts.createSourceFile("test.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) found = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found);
  return found;
}
function evaluate(source: string, context: Record<string, unknown>) {
  return runInNewContext(ts.transpileModule(`(${source})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
}
test("the Home toggle uses live selected-scope data rather than its stale snapshot", () => {
  const context: Record<string, any> = {
    useCallback: (fn: unknown) => fn, liveBookingStatus,
    activeBranch: { id: "second", queueStatus: "active" },
    selectedServiceId: "selected", selectedService: { id: "selected", queueStatus: "active" },
    selectedDeskId: "all", availableDesks: [{ id: "desk", queueStatus: "active" }],
    liveBranchMeta: { first: { ...branch, queueStatus: "paused" }, second: branch },
  };
  const getStatus = () => evaluate(expression(dashboardText, "getCurrentQueueStatus"), context)();
  assert.equal(getStatus(), "ended");
  context.selectedDeskId = "desk";
  assert.equal(getStatus(), "paused");
  context.liveBranchMeta = {};
  assert.equal(getStatus(), "active");
});

test("manual refresh requests the selected branch and always clears the spinner", async () => {
  for (const fail of [false, true]) {
    const calls: string[] = [];
    const states: boolean[] = [];
    await evaluate(expression(dashboardText, "onRefresh"), {
      activeBranch: { id: "second" }, setRefreshing: (state: boolean) => states.push(state),
      refreshStats: async () => {}, refreshHomeAnalytics: async () => {},
      refreshQueueForBranch: async (id: string) => { calls.push(id); if (fail) throw new Error("Offline"); },
      logHandledError: () => {},
    })();
    assert.deepEqual(calls, ["second"]);
    assert.deepEqual(states, [true, false]);
  }
});

test("Home refreshes status on focus, every eight seconds, and app return; listeners stop on blur", () => {
  const ast = ts.createSourceFile("dashboard.tsx", dashboardText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let hook = "";
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useFocusEffect"
      && node.getText(ast).includes("refreshBookingStatus")) hook = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(hook);
  assert.equal(expression(dashboardText, "pollBranchId"), "activeBranch?.id");
  const requests: string[] = [];
  let tick = () => {};
  let resume = (_state: string) => {};
  let listenerRemoved = false;
  let intervalRemoved = false;
  const cleanup = evaluate(hook, {
    useCallback: (fn: unknown) => fn, pollBranchId: "second",
    refreshStats: () => {}, refreshQueueForBranch: (id: string) => requests.push(id),
    AppState: { addEventListener: (_event: string, fn: typeof resume) => { resume = fn; return { remove: () => { listenerRemoved = true; } }; } },
    setInterval: (fn: typeof tick, ms: number) => { assert.equal(ms, 8000); tick = fn; return 1; },
    clearInterval: () => { intervalRemoved = true; },
  })();
  tick();
  resume("background");
  resume("active");
  assert.deepEqual(requests, ["second", "second", "second"]);
  cleanup();
  assert.ok(listenerRemoved && intervalRemoved);
});

test("a queue response started before a local status change cannot overwrite confirmed live status", async () => {
  const statusEpoch = { current: 0 };
  let live = { branch };
  let release!: (response: unknown) => void;
  const responseData = new Promise(resolve => { release = resolve; });
  let requested = false;
  const refresh = evaluate(expression(contextText, "refreshQueueForBranch"), {
    useCallback: (fn: unknown) => fn, bookingStatusEpochRef: statusEpoch,
    apiRequest: async (_method: string, url: string) => {
      assert.match(url, /\/api\/branches\/branch\/queue\?t=\d+/);
      requested = true;
      return { json: () => responseData };
    },
    setQueue: () => {}, setLiveBranchMeta: (fn: (old: typeof live) => typeof live) => { live = fn(live); },
    logHandledError: () => {},
  });
  const pending = refresh("branch");
  await Promise.resolve();
  statusEpoch.current += 1;
  live = patchLiveBookingStatus(live, { type: "service", id: "selected" }, "active") as typeof live;
  release({ queue: [], branchMeta: branch });
  await pending;
  assert.ok(requested);
  assert.equal(liveBookingStatus(live.branch, "selected", "all"), "active");
});

test("the server includes desk status in lightweight live metadata without altering other queue data", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /rawDesks = branch \? await storage\.getDesksByBranch\(branchId\)/);
  assert.match(routes, /desks: rawDesks\.filter\(d => d\.serviceId === s\.id\)\.map/);
});
