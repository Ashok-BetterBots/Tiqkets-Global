import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

// Execute the real status handlers with isolated storage and sender doubles.
// Importing the full server would start unrelated jobs; this harness cannot
// access the database, Meta, or the network.
const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = source.indexOf("  const QUEUE_STATUS_VALUES =");
const end = source.indexOf("  // DELETE /api/dashboard/desks/:id", start);
assert.ok(start !== -1 && end > start, "queue-status handlers must exist");
const code = transformSync(source.slice(start, end), { loader: "ts" }).code;

type Row = {
  id: string;
  name: string;
  queueStatus: string;
  branchId?: string;
  serviceId?: string;
};

function harness() {
  const branch: Row = { id: "branch", name: "Branch", queueStatus: "ended" };
  const services = new Map<string, Row>([
    ["service", { id: "service", branchId: "branch", name: "Service", queueStatus: "ended" }],
  ]);
  const desk: Row = {
    id: "desk", branchId: "branch", serviceId: "service",
    name: "Desk", queueStatus: "ended",
  };
  const calls: unknown[][] = [];
  const errors: unknown[][] = [];
  const permissions: string[] = [];
  const routes = new Map<string, (req: any, res: any) => Promise<void>>();
  let authorized = true;
  let send: (...args: unknown[]) => Promise<void> = async (...args) => {
    calls.push(args);
  };
  const storage = {
    async updateBranch(id: string, patch: Partial<Row>) {
      if (id !== branch.id) return undefined;
      Object.assign(branch, patch);
      return { ...branch };
    },
    async getBranchById(id: string) {
      return id === branch.id ? { ...branch } : undefined;
    },
    async getServicesByBranch(id: string) {
      return [...services.values()].filter(s => s.branchId === id).map(s => ({ ...s }));
    },
    async getServiceById(id: string) {
      const row = services.get(id);
      return row ? { ...row } : undefined;
    },
    async updateService(id: string, patch: Partial<Row>) {
      const row = services.get(id);
      if (!row) return undefined;
      Object.assign(row, patch);
      return { ...row };
    },
    async updateDesk(id: string, patch: Partial<Row>) {
      if (id !== desk.id) return undefined;
      Object.assign(desk, patch);
      return { ...desk };
    },
  };
  const ownership = async (_req: any, res: any) => {
    if (!authorized) res.status(403).json({ error: "Forbidden" });
    return authorized;
  };
  runInNewContext(code, {
    app: { put: (path: string, _permission: unknown, handler: any) => routes.set(path, handler) },
    requirePermission: (permission: string) => permissions.push(permission),
    assertBranchOwnership: ownership,
    assertServiceOwnership: ownership,
    assertDeskOwnership: ownership,
    storage,
    writeAudit: async () => {},
    notifyOrgServiceQueueStatusChange: (...args: unknown[]) => send(...args),
    console: { error: (...args: unknown[]) => errors.push(args) },
  });
  return {
    branch, services, desk, calls, errors, permissions,
    deny() { authorized = false; },
    setSender(sender: typeof send) { send = sender; },
    async request(scope: "branches" | "services" | "desks", status: string, id?: string) {
      const res = {
        statusCode: 200, body: undefined as any,
        status(value: number) { this.statusCode = value; return this; },
        json(body: any) { this.body = body; return this; },
      };
      const handler = routes.get(`/api/dashboard/${scope}/:id/queue-status`)!;
      await handler({
        params: { id: id ?? (scope === "branches" ? "branch" : scope === "services" ? "service" : "desk") },
        body: { queueStatus: status },
      }, res);
      return res;
    },
  };
}

test("service open and close dispatch the organization notifier with correct scope", async () => {
  const h = harness();
  assert.equal((await h.request("services", "active")).statusCode, 200);
  assert.equal(h.branch.queueStatus, "active");
  assert.deepEqual(h.calls, [["branch", "service", "Service", "active", "ended"]]);
  assert.equal((await h.request("services", "ended")).statusCode, 200);
  assert.deepEqual(h.calls[1], ["branch", "service", "Service", "ended", "active"]);
});

test("repeating an unchanged service status does not dispatch again", async () => {
  const h = harness();
  await h.request("services", "active");
  await h.request("services", "active");
  assert.equal(h.calls.length, 1);
});

test("branch opening notifies only services changed by its existing cascade", async () => {
  const h = harness();
  h.services.set("paused", {
    id: "paused", branchId: "branch", name: "Paused service", queueStatus: "paused",
  });
  h.services.set("active", {
    id: "active", branchId: "branch", name: "Active service", queueStatus: "active",
  });
  assert.equal((await h.request("branches", "active")).statusCode, 200);
  assert.deepEqual(h.calls, [["branch", "service", "Service", "active", "ended"]]);
  assert.equal(h.services.get("paused")!.queueStatus, "paused");
  await h.request("services", "active"); // dashboard follows the branch call
  assert.equal(h.calls.length, 1, "dashboard's follow-up must not duplicate an alert");
});

test("branch close followed by the existing client service cascade notifies once", async () => {
  const h = harness();
  h.branch.queueStatus = "active";
  h.services.get("service")!.queueStatus = "active";
  await h.request("branches", "ended");
  assert.equal(h.services.get("service")!.queueStatus, "active", "do not add a new close cascade");
  await h.request("services", "ended");
  await h.request("desks", "ended");
  assert.deepEqual(h.calls, [["branch", "service", "Service", "ended", "active"]]);
});

test("desk opening an ended parent service dispatches its service alert", async () => {
  const h = harness();
  assert.equal((await h.request("desks", "active")).statusCode, 200);
  assert.equal(h.branch.queueStatus, "active");
  assert.equal(h.services.get("service")!.queueStatus, "active");
  assert.deepEqual(h.calls, [["branch", "service", "Service", "active", "ended"]]);
  await h.request("desks", "active");
  assert.equal(h.calls.length, 1);
});

test("desk-only closure leaves the service and service alert scope unchanged", async () => {
  const h = harness();
  h.services.get("service")!.queueStatus = "active";
  await h.request("desks", "ended");
  assert.equal(h.services.get("service")!.queueStatus, "active");
  assert.equal(h.calls.length, 0);
});

test("notification failure cannot fail or roll back any status endpoint", async () => {
  for (const scope of ["services", "branches", "desks"] as const) {
    const h = harness();
    h.setSender(async () => { throw new Error("mock notification failure"); });
    const res = await h.request(scope, "active");
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(res.statusCode, 200);
    assert.equal(h.services.get("service")!.queueStatus, "active");
    assert.equal(h.errors.length, 1);
  }
});

test("a pending sender does not delay the queue response", async () => {
  for (const scope of ["services", "branches", "desks"] as const) {
    const h = harness();
    h.setSender(() => new Promise(() => {}));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const res = await Promise.race([
        h.request(scope, "active"),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("queue waited for notification")), 1000);
        }),
      ]);
      assert.equal(res.statusCode, 200);
    } finally {
      clearTimeout(timer);
    }
  }
});

test("invalid, nonexistent, or unauthorized targets never dispatch", async () => {
  for (const scope of ["services", "branches", "desks"] as const) {
    const h = harness();
    assert.equal((await h.request(scope, "invalid")).statusCode, 400);
    assert.equal((await h.request(scope, "active", "missing")).statusCode, 404);
    h.deny();
    assert.equal((await h.request(scope, "active")).statusCode, 403);
    assert.equal(h.calls.length, 0);
    assert.equal(h.services.get("service")!.queueStatus, "ended");
  }
});

test("queue mode-change permission is preserved on all three endpoints", () => {
  assert.deepEqual(harness().permissions, [
    "org.queue.mode_change", "org.queue.mode_change", "org.queue.mode_change",
  ]);
});