import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { resolveOrganizationTimezone } from "../shared/home-report-calendar";

const html = readFileSync(new URL("./templates/tv-display.html", import.meta.url), "utf8");
const scriptStart = html.indexOf("function tvDisplay()");
const script = html.slice(scriptStart, html.indexOf("</script>", scriptStart));
const source = ts.createSourceFile("announcements.ts", readFileSync(new URL("./announcements.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
let snapshotSource = "";
const functions: Record<string, string> = {};
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions[node.name.text] = node.getText(source).replace(/^export\s+/, "");
  if (ts.isCallExpression(node) && node.expression.getText(source) === "app.get"
    && node.arguments[0]?.getText(source) === '"/api/announcement-player/snapshot"') {
    snapshotSource = node.arguments[1].getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);
function evaluate(code: string, context: Record<string, unknown>) {
  return runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, { Date, ...context });
}
const row = (id: string, extra: Record<string, any> = {}) => ({
  id, ticketNumber: id.toUpperCase(), branchId: "branch-a", serviceId: "service-a",
  queueMode: "dine_in", status: "called", calledAt: "2026-10-04T06:00:00Z",
  joinedAt: "2026-10-04T05:00:00Z", position: 1, tableNumber: "5", deskName: "Desk A", ...extra,
});
const payload = (queue: any[], extra: Record<string, any> = {}) => ({
  queue, branchId: "branch-a", serviceId: "service-a", queueMode: "dine_in", timeZone: "Asia/Kolkata", ...extra,
});
const response = (data: any, status = 200) => ({ ok: status === 200, status, json: async () => JSON.parse(JSON.stringify(data)) });

function display(fetch: any) {
  const sources: any[] = [];
  const timers: { callback: Function; delay: number }[] = [];
  class Source {
    readyState = 1;
    listeners: Record<string, Function> = {};
    onmessage: any;
    onerror: any;
    constructor(public url: string) { sources.push(this); }
    addEventListener(name: string, callback: Function) { this.listeners[name] = callback; }
    close() { this.readyState = 2; }
  }
  const board = runInNewContext(`${script}; tvDisplay();`, {
    Date, Intl, fetch, AbortController, EventSource: Source,
    setTimeout: (callback: Function, delay: number) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
    requestAnimationFrame: (callback: Function) => callback(),
  });
  Object.assign(board, { deviceToken: "fixture-token", branchId: "branch-a", serviceId: "service-a", queueMode: "dine_in", layout: "dinein" });
  return { board, sources, timers };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("snapshot authenticates the device, scopes its service, retains overnight active tickets and excludes private fields", async () => {
  const storage = {
    getAnnouncementDeviceByToken: async () => ({ branchId: "branch-a", serviceId: "service-a", isActive: true }),
    getBranchById: async () => ({ id: "branch-a", organizationId: "org-a", queueMode: "fifo" }),
    getOrganizationById: async () => ({ timezone: "Asia/Kolkata" }),
    getServicesByBranch: async () => [{ id: "service-a", serviceSettings: { queueMode: "dine_in" } }],
    getTicketsByBranch: async (branch: string, statuses: string[]) => {
      assert.equal(branch, "branch-a");
      assert.ok(statuses.includes("called"));
      return [row("overnight", { joinedAt: "2026-10-03T17:00:00Z" }), row("other-service", { serviceId: "service-b" })];
    },
    getTodaysTicketsByBranch: async () => [row("today", {
      tableNumber: "Table 7", customerPhone: "private-phone", customerEmail: "private-email",
      formData: { private: true }, notes: "private-notes", qrToken: "private-qr",
    })],
  };
  const normalizers = `${functions.editDistance}\n${functions.stripLeadingTableWord}`;
  const handler = evaluate(`${normalizers}\nconst handler = ${snapshotSource}; handler;`, { storage, resolveOrganizationTimezone, console });
  let body: any;
  const headers: Record<string, string> = {};
  const res: any = { setHeader: (name: string, value: string) => { headers[name] = value; }, json: (value: any) => { body = value; }, status: () => res };
  await handler({ query: { token: "fixture-token", serviceId: "service-b" } }, res);
  assert.deepEqual(Array.from(body.queue, (ticket: any) => ticket.id).sort(), ["overnight", "today"]);
  assert.equal(body.queue[1].tableNumber, "7");
  assert.ok(body.queue.every((ticket: any) => ticket.queueMode === "dine_in"));
  assert.equal(body.timeZone, "Asia/Kolkata");
  assert.match(headers["Cache-Control"], /no-store/);
  assert.doesNotMatch(JSON.stringify(body), /private-|customerPhone|customerEmail|formData|notes|qrToken/);
});

test("missing, invalid and disabled device tokens cannot read TV queue data", async () => {
  for (const [token, device, expected] of [
    ["", null, 400], ["bad-token", null, 404], ["disabled-token", { isActive: false }, 403],
  ] as const) {
    let status = 200;
    const handler = evaluate(`const handler = ${snapshotSource}; handler;`, {
      storage: { getAnnouncementDeviceByToken: async () => device }, console,
    });
    const res: any = { setHeader: () => {}, status: (value: number) => { status = value; return res; }, json: () => {} };
    await handler({ query: { token } }, res);
    assert.equal(status, expected);
  }
});

test("TV hydrates the called customer, updates the assigned table and clears the hero when seated", async () => {
  let data = payload([row("called")]);
  const { board } = display(async (url: string) => {
    assert.match(url, /\/api\/announcement-player\/snapshot\?token=fixture-token&t=/);
    return response(data);
  });
  await board.refreshSnapshot();
  assert.equal(board.current.id, "called");
  assert.equal(board.dineInDestination(board.current), "Table 5");
  data = payload([row("called", { tableNumber: "9" })]);
  await board.refreshSnapshot();
  assert.equal(board.dineInDestination(board.current), "Table 9");
  data = payload([row("called", { status: "arrived" }), row("next", { status: "waiting", calledAt: null })]);
  await board.refreshSnapshot();
  assert.equal(board.current, null);
  assert.deepEqual(Array.from(board.upcoming, (ticket: any) => ticket.id), ["next"]);
});

test("completed, cancelled, held and no-show customers cannot remain in the current hero", async () => {
  for (const status of ["completed", "cancelled", "hold", "no_show"]) {
    const { board } = display(async () => response(payload([row("done", { status })])));
    board.current = row("done");
    await board.refreshSnapshot();
    assert.equal(board.current, null, status);
  }
});

test("service-scoped TVs reject other services in both snapshot and call events", async () => {
  const { board } = display(async () => response(payload([
    row("ours"), row("other", { serviceId: "service-b", calledAt: "2026-10-04T09:00:00Z" }),
  ])));
  await board.refreshSnapshot();
  assert.equal(board.current.id, "ours");
  board.handleAnnouncement(row("other", { serviceId: "service-b" }));
  assert.equal(board.current.id, "ours");
  assert.equal(board.speakQueue.length, 0);
});

test("takeaway newest-ready selection uses serve time and completed orders leave ready cards", async () => {
  const { board } = display(async () => response(payload([
    row("just-ready", { queueMode: "takeaway", status: "serving", calledAt: null, servedAt: "2026-10-04T09:00:00Z" }),
    row("earlier-ready", { queueMode: "takeaway", status: "serving", servedAt: "2026-10-04T08:00:00Z" }),
    row("collected", { queueMode: "takeaway", status: "completed", servedAt: "2026-10-04T10:00:00Z" }),
    row("preparing", { queueMode: "takeaway", status: "waiting", calledAt: null }),
  ], { queueMode: "takeaway" })));
  await board.refreshSnapshot();
  assert.equal(board.layout, "takeaway");
  assert.equal(board.current.id, "just-ready");
  assert.deepEqual(Array.from(board.ready, (ticket: any) => ticket.id), ["earlier-ready"]);
  assert.deepEqual(Array.from(board.preparing, (ticket: any) => ticket.id), ["preparing"]);
});

test("an older in-flight snapshot cannot overwrite a new live call", async () => {
  let finish!: (value: any) => void;
  const { board } = display(() => new Promise(resolve => { finish = resolve; }));
  const pending = board.refreshSnapshot();
  board.handleAnnouncement(row("new", { calledAt: "2026-10-04T10:00:00Z" }));
  finish(response(payload([row("old")])));
  await pending;
  assert.equal(board.current.id, "new");
});

test("repeated snapshots of the same ticket do not duplicate history, flash or replay audio", async () => {
  const { board } = display(async () => response(payload([row("latest"), row("older", { calledAt: "2026-10-04T05:00:00Z" })])));
  let flashes = 0;
  board.triggerFlash = () => { flashes++; };
  board.handleAnnouncement(row("latest"));
  await board.refreshSnapshot();
  await board.refreshSnapshot();
  assert.equal(flashes, 1);
  assert.equal(board.speakQueue.length, 1);
  assert.deepEqual(Array.from(board.recent, (ticket: any) => ticket.id), ["older"]);
});

test("delayed older announcements cannot displace a newer current customer", () => {
  const { board } = display(async () => response(payload([])));
  board.current = row("new", { calledAt: "2026-10-04T10:00:00Z" });
  board.handleAnnouncement(row("old"));
  assert.equal(board.current.id, "new");
});

test("queue updates reach both TV/player and dashboard subscriptions, not another branch", () => {
  const received = ["", "", ""];
  const clients = ["player", "dashboard", "player"].map((kind, index) => ({
    kind, branchId: index === 2 ? "branch-b" : "branch-a", res: { write: (data: string) => { received[index] += data; } },
  }));
  const broadcast = evaluate(`${functions.broadcastQueueUpdate}; broadcastQueueUpdate;`, { clients, removeClient: () => {} });
  broadcast("branch-a");
  assert.match(received[0], /event: queue_update/);
  assert.match(received[1], /event: queue_update/);
  assert.equal(received[2], "");
});

test("SSE ready preserves device scope, queue updates refresh immediately and old connections cannot overwrite it", async () => {
  let fetches = 0;
  const { board, sources } = display(async () => { fetches++; return response(payload([])); });
  board.connect();
  const first = sources[0];
  first.listeners.ready({ data: JSON.stringify({ branchId: "branch-a", serviceId: "service-a", queueMode: "dine_in" }) });
  await settle();
  assert.equal(board.serviceId, "service-a");
  const before = fetches;
  first.listeners.queue_update();
  await settle();
  assert.equal(fetches, before + 1);
  board.connect();
  first.listeners.ready({ data: JSON.stringify({ branchId: "wrong-branch" }) });
  assert.equal(board.branchId, "branch-a");
});

test("overlapping polls coalesce and unauthorized devices clear displayed customer data", async () => {
  let finish!: (value: any) => void;
  let fetches = 0;
  const { board } = display(() => ++fetches === 1
    ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(response(payload([]))));
  const first = board.refreshSnapshot();
  await board.refreshSnapshot();
  assert.equal(fetches, 1);
  finish(response(payload([row("old")])));
  await first;
  await settle();
  assert.equal(fetches, 2);
  assert.equal(board.current, null);
  const denied = display(async () => response({}, 403)).board;
  denied.current = row("private");
  await denied.refreshSnapshot();
  assert.equal(denied.current, null);
  assert.equal(denied.connectionState, "error");
});

test("TV clock and displayed call timestamps follow the organisation timezone", () => {
  const { board } = display(async () => response(payload([])));
  assert.match(board.formatDisplayTime("2026-10-04T06:00:00Z"), /11:30\s*AM/);
});

test("desk changes update the same customer and a reassigned device reconnects to its new scope", async () => {
  let data = payload([row("called", { queueMode: "fifo", deskName: "Desk A" })], { queueMode: "fifo" });
  const { board, sources } = display(async () => response(data));
  await board.refreshSnapshot();
  assert.equal(board.current.deskName, "Desk A");
  data = payload([row("called", { queueMode: "fifo", deskName: "Desk B" })], { queueMode: "fifo" });
  await board.refreshSnapshot();
  assert.equal(board.current.deskName, "Desk B");
  data = payload([], { serviceId: "service-b" });
  await board.refreshSnapshot();
  assert.equal(board.current, null);
  assert.equal(sources.length, 1);
  sources[0].listeners.ready({ data: JSON.stringify({ branchId: "branch-a", serviceId: "service-b" }) });
  await settle();
  assert.equal(board.serviceId, "service-b");
});

test("every announcement producer includes a stable ticket ID", () => {
  const routes = ts.createSourceFile("routes.ts", readFileSync(new URL("./routes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  let producers = 0;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(routes) === "broadcastAnnouncement") {
      producers++;
      const event = node.arguments[0];
      assert.ok(ts.isObjectLiteralExpression(event) && event.properties.some(property => property.name?.getText(routes) === "id"));
    }
    ts.forEachChild(node, visit);
  }
  visit(routes);
  assert.equal(producers, 3);
});