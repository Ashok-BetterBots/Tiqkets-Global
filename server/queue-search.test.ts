import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { matchesQueueSearch } from "../shared/queue-search";

const mobileText = readFileSync(new URL("../client/screens/org/OrgQueueScreen.tsx", import.meta.url), "utf8");
const mobile = ts.createSourceFile("queue.tsx", mobileText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const html = readFileSync(new URL("./templates/dashboard.html", import.meta.url), "utf8");
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .find(match => match[1].includes("searchQueueEntries(entries)"))?.[1];
assert.ok(script);
const web = ts.createSourceFile("dashboard.js", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const methods: Record<string, string> = {};
const declarations: Record<string, string> = {};
let fifoCall = "", fifoPosition = "";
function visitWeb(node: ts.Node) {
  if (ts.isMethodDeclaration(node)) methods[node.name.getText(web)] = node.getText(web);
  ts.forEachChild(node, visitWeb);
}
function visitMobile(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer) declarations[node.name.getText(mobile)] = node.initializer.getText(mobile);
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(mobile) === "FifoCard"
    && node.getText(mobile).includes("queueSearch.trim()")) {
    for (const prop of node.attributes.properties) {
      if (ts.isJsxAttribute(prop) && prop.initializer && ts.isJsxExpression(prop.initializer)) {
        if (prop.name.getText(mobile) === "onCallNow") fifoCall = prop.initializer.expression!.getText(mobile);
        if (prop.name.getText(mobile) === "displayPosition") fifoPosition = prop.initializer.expression!.getText(mobile);
      }
    }
  }
  ts.forEachChild(node, visitMobile);
}
visitWeb(web); visitMobile(mobile);
function evaluate(expression: string, context: Record<string, unknown> = {}) {
  return runInNewContext(ts.transpileModule(`const result = (${expression}); result;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { ...context });
}
function webState(query = "") {
  const state = evaluate(`({${["searchQueueEntries", "getQueueListFiltered", "getQueueTabCount", "getDineInFiltered"].map(name => methods[name]).join(",")}})`);
  return Object.assign(state, {
    queueSearch: query, queueTickets: [], queueListTab: "active", currentQueueMode: "fifo",
    selectedServiceId: "service", selectedStageFilter: "", isServiceAccessible: () => true,
  });
}
const row = (id: string, status = "waiting", extra = {}) => ({
  id, serviceId: "service", status, customerName: "Alice Smith", customerPhone: "+91 (98765) 43210",
  ticketNumber: `H-${id}`, ...extra,
});

test("mobile and web matching agree for name, booking identifiers and formatted phone numbers", () => {
  const entry = row("booking-abc", "waiting", { confirmationCode: "RES123", whatsappPhone: "+966 512 345 678" });
  const state = webState();
  for (const [query, expected] of [
    ["", true], ["   ", true], ["  ALICE  ", true], ["smith", true],
    ["h-booking-abc", true], ["booking-abc", true], ["res123", true],
    ["9876543210", true], ["+91 98765 43210", true], ["43210", true], ["966512345678", true],
    ["unknown", false], ["H43210", false], ["+()-", false],
  ] as const) {
    state.queueSearch = query;
    assert.equal(matchesQueueSearch(entry, query), expected, query);
    assert.equal(state.searchQueueEntries([entry]).length === 1, expected, `web ${query}`);
  }
  assert.equal(matchesQueueSearch({}, "alice"), false);
  assert.equal(matchesQueueSearch({ bookingId: "BOOK123" }, "book123"), true);
});

test("web FIFO/multi-stage search stays in the active tab and selected service/stage without changing badges", () => {
  const state = webState("alice");
  const waiting = row("waiting"), held = row("held", "hold"), completed = row("completed", "completed");
  const otherService = row("other", "waiting", { serviceId: "other-service" });
  const nonmatch = row("bob", "waiting", { customerName: "Bob" });
  state.queueTickets = [waiting, held, completed, otherService, nonmatch];
  assert.deepEqual(Array.from(state.getQueueListFiltered()), [waiting]);
  assert.equal(state.getQueueTabCount("active"), 2, "Search never changes queue-total badges");
  state.queueListTab = "hold";
  assert.deepEqual(Array.from(state.getQueueListFiltered()), [held]);
  state.queueListTab = "completed";
  assert.deepEqual(Array.from(state.getQueueListFiltered()), [completed]);
  state.queueSearch = "bob";
  assert.equal(state.getQueueListFiltered().length, 0, "Never fetch a match from another tab");
  state.queueSearch = "";
  state.queueListTab = "active";
  assert.deepEqual(Array.from(state.getQueueListFiltered()), [waiting, nonmatch]);
  state.currentQueueMode = "multi_stage";
  state.selectedStageFilter = "stage-a";
  waiting.currentStageId = "stage-a";
  nonmatch.currentStageId = "stage-b";
  assert.deepEqual(Array.from(state.getQueueListFiltered()), [waiting]);
});

test("web Dine In search respects Waiting, Assigned, Hold and Arrived tabs", () => {
  const state = webState("alice");
  state.queueTickets = ["waiting", "called", "hold", "arrived", "completed", "no_show"].map(status => row(status, status));
  for (const [tab, expected] of [
    ["waiting", ["waiting"]], ["called", ["called"]], ["hold", ["hold"]],
    ["completed", ["arrived", "completed", "no_show"]],
  ] as const) {
    state.dineInTab = tab;
    assert.deepEqual(Array.from(state.getDineInFiltered(), (entry: any) => entry.id), [...expected]);
  }
  state.queueSearch = "missing";
  assert.equal(state.getDineInFiltered().length, 0);
});

test("web Check-In, Take Away and reservation templates filter only their tab's original entries", () => {
  const expressions = [...html.matchAll(/x-for="(?:ticket|res) in (searchQueueEntries\([^"]+\))"/g)].map(match => match[1]);
  assert.equal(expressions.length, 8, "All specialized queue lists, including reservation lists, support search");
  const state = webState("Alice");
  const entries = ["waiting", "called", "serving", "completed", "no_show", "confirmed", "checked_in"].map(status => row(status, status));
  const snapshot = JSON.stringify(entries);
  for (const expression of expressions) {
    const result = evaluate(expression, {
      queueTickets: entries, dineInReservations: entries,
      searchQueueEntries: state.searchQueueEntries.bind(state),
    });
    assert.ok(result.length > 0);
    for (const entry of result) assert.equal(entries.find(original => original.id === entry.id), entry, "Actions retain the real entry object/ID");
    state.queueSearch = "missing";
    assert.equal(evaluate(expression, { queueTickets: entries, dineInReservations: entries, searchQueueEntries: state.searchQueueEntries.bind(state) }).length, 0);
    state.queueSearch = "alice";
  }
  assert.equal(JSON.stringify(entries), snapshot, "Searching never changes transaction data");
});

test("mobile Check-In and Multi-stage search is applied after current-tab selection", () => {
  const waiting = row("waiting"), terminal = row("terminal", "completed");
  const matchesSearch = (entry: any) => matchesQueueSearch(entry, "waiting");
  for (const [variable, context, tabs] of [
    ["ciTabList", { ciWaiting: [waiting], ciCheckedIn: [terminal], ciNoShow: [] }, { waiting: 1, checkedin: 0, noshow: 0 }],
    ["msCurList", { msWaiting: [waiting], msCompleted: [terminal] }, { waiting: 1, completed: 0 }],
  ] as const) {
    for (const [tab, count] of Object.entries(tabs)) {
      const result = evaluate(declarations[variable], { ...context, checkInTab: tab, msTab: tab, matchesSearch });
      assert.equal(result.length, count);
      if (count) assert.equal(result[0], waiting);
    }
  }
});

test("mobile Dine In and Take Away search keeps counts and actions attached to original entries", () => {
  const waiting = row("waiting"), assigned = row("assigned", "called"), held = row("held", "hold"), done = row("done", "arrived");
  const getCurrentTabCustomers = declarations.getCurrentTabCustomers;
  for (const tab of ["waiting", "assigned", "hold", "done"]) {
    const context = {
      dineInTab: tab, waitingCustomers: [waiting], calledCustomers: [assigned], holdCustomers: [held], arrivedCustomers: [done],
      matchesSearch: (entry: any) => matchesQueueSearch(entry, "waiting"),
    };
    assert.equal(evaluate(getCurrentTabCustomers, context)().length, tab === "waiting" ? 1 : 0);
  }
  for (const list of ["preparingOrders", "readyOrders", "deliveredOrders"]) {
    assert.ok(mobileText.includes(`${list}.filter(matchesSearch).map((order)`));
    assert.ok(mobileText.includes(`count: ${list}.length`), "Count badges remain unfiltered");
  }
  assert.equal((mobileText.match(/\{renderQueueSearch\(\)\}/g) || []).length, 5, "Every queue mode layout has the Search button");
});

test("mobile filtered FIFO actions call the displayed booking, never an unrelated next customer", () => {
  assert.ok(fifoCall && fifoPosition);
  const first = row("first"), selected = row("second");
  const calls: string[] = [];
  const context = {
    customer: selected, fifoList: [first, selected], queueSearch: "second", isSelectiveMode: false,
    handleCall: (id: string) => calls.push(id),
    handleCallNext: () => calls.push("NEXT"),
    handleCallAgain: (id: string) => calls.push(`again:${id}`),
  };
  evaluate(fifoCall, context)();
  assert.deepEqual(calls, ["second"]);
  assert.equal(evaluate(fifoPosition, context), 2, "Search preserves the real queue position");
  calls.length = 0;
  evaluate(fifoCall, { ...context, queueSearch: "" })();
  assert.deepEqual(calls, ["NEXT"], "Normal FIFO ordering is unchanged outside search");
  calls.length = 0;
  evaluate(fifoCall, { ...context, customer: { ...selected, status: "called" } })();
  assert.deepEqual(calls, ["again:second"]);
});

test("search controls offer clear/close without changing permissions or action handlers", () => {
  assert.equal((html.match(/x-model="queueSearch"/g) || []).length, 1);
  assert.ok(html.includes('data-testid="queue-search-button"'));
  assert.ok(html.includes('data-testid="queue-search-input"'));
  assert.ok(html.includes("Searches the current tab only."));
  assert.ok(html.includes('@input="selectedTicket = null"'), "Do not leave a mismatched old ticket in the action panel");
  assert.ok(mobileText.includes(".filter(matchesSearch)}"), "FlatList receives only searched current-tab entries");
});
