import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { and, eq, inArray, sql } from "drizzle-orm";
import { transformSync } from "esbuild";
import ts from "typescript";
import { db, pool } from "./db";
import { organizations, branches, services, tickets, branchAlertState } from "@shared/schema";

// Real PostgreSQL queries/locks, but only synthetic rows in a rolled-back
// transaction. No customer data is modified and no real alerts are sent.
const stripped = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
  .replace(/^import .*$/gm, "").replace(/\bexport /g, "");
const storageText = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
const storageAst = ts.createSourceFile("storage.ts", storageText, ts.ScriptTarget.Latest, true);
const methods: string[] = [];
function visit(node: ts.Node) {
  if (ts.isMethodDeclaration(node) && ["createTicket", "updateTicket", "updateService"].includes(node.name.getText(storageAst))) {
    methods.push(node.getText(storageAst));
  }
  ts.forEachChild(node, visit);
}
visit(storageAst);
const code = transformSync(
  stripped("./queue-idle.ts") + stripped("./queue-auto-end.ts") +
  `\nclass Storage {${methods.join("\n")}}\nglobalThis.operations = new Storage(); globalThis.scan = scanAndEndIdleQueuesOnce;`,
  { loader: "ts" },
).code;

async function fixture(run: (h: any) => Promise<void>) {
  const rollback = new Error("rollback synthetic fixture");
  try {
    await db.transaction(async tx => {
      const now = Date.now();
      let clock = now;
      const old = new Date(now - 40 * 60_000);
      const orgId = randomUUID(), branchId = randomUUID();
      await tx.insert(organizations).values({
        id: orgId, name: "Idle test", email: `${orgId}@example.invalid`, passwordHash: "test-only-unusable",
      });
      await tx.insert(branches).values({
        id: branchId, organizationId: orgId, name: "Test restaurant", queueMode: "dinein", updatedAt: old,
      });
      const alerts: any[] = [], pushes: any[] = [], errors: any[] = [];
      class ClockDate extends Date {
        constructor(value?: any) { super(value === undefined ? clock : value); }
        static now() { return clock; }
      }
      const context: any = {
        and, eq, inArray, sql, branches, services, tickets, branchAlertState,
        Date: ClockDate, Map, Set, setTimeout, setInterval,
        db: {
          // Limit even the candidate scan to this synthetic branch.
          select: (fields: any) => ({
            from: () => ({ innerJoin: () => ({
              where: (condition: any) => tx.select(fields).from(services)
                .innerJoin(branches, eq(branches.id, services.branchId))
                .where(and(condition, eq(branches.id, branchId))),
            }) }),
          }),
          update: tx.update.bind(tx),
          transaction: (fn: any) => fn(tx),
        },
        notifyServiceQueueStatusChange: async (...args: any[]) => pushes.push(args),
        notifyOrgServiceQueueStatusChange: async (...args: any[]) => alerts.push(args),
        console: { log: () => {}, error: (...args: any[]) => errors.push(args) },
      };
      runInNewContext(code, context);
      Object.assign(context.operations, {
        getTicketById: async (id: string) => (await tx.select().from(tickets).where(eq(tickets.id, id)))[0],
        getNextTicketNumber: async () => "TEST001",
        getNextQueuePosition: async () => 1,
        getOrgPrefix: async () => "TEST",
      });
      const h = {
        tx, now, old, branchId, alerts, pushes, errors, operations: context.operations,
        clock: (at: number) => { clock = at; },
        scan: async () => {
          const result = await context.scan();
          assert.equal(errors.length, 0, errors.map(e => String(e.at(-1))).join("\n"));
          return result;
        },
        service: async (mode?: string | null, extra = {}) => {
          const [service] = await tx.insert(services).values({
            branchId, name: "Test service", serviceSettings: mode == null ? {} : { queueMode: mode },
            updatedAt: old, ...extra,
          }).returning();
          return service;
        },
        status: async (id: string) => (await tx.select().from(services).where(eq(services.id, id)))[0].queueStatus,
        anchor: async (id: string, at: Date) => tx.insert(branchAlertState).values({
          branchId, scopeId: id, triggerKind: "queue_idle", lastTriggeredAt: at,
        }),
      };
      await run(h);
      throw rollback;
    });
  } catch (err) {
    if (err !== rollback) throw err;
  }
}

test("only effective Dine In modes auto-close; service overrides win over branch mode", async () => {
  await fixture(async h => {
    const dining = [];
    for (const mode of [null, "dine_in", "Dine In", "dine-in"]) dining.push(await h.service(mode));
    const other = [];
    for (const mode of ["fifo", "selective", "checkin", "multi_stage", "takeaway", "events"]) other.push(await h.service(mode));
    assert.equal((await h.scan()).ended, dining.length);
    for (const svc of dining) assert.equal(await h.status(svc.id), "ended");
    for (const svc of other) assert.equal(await h.status(svc.id), "active");
    assert.equal(h.alerts.length, dining.length);
    for (const alert of h.alerts) assert.deepEqual(alert.slice(3), ["ended", "active"]);
    assert.equal((await h.scan()).ended, 0, "Already closed queues do not notify again");
    assert.equal(h.alerts.length, dining.length);
    await h.tx.update(branches).set({ queueMode: "fifo" }).where(eq(branches.id, h.branchId));
    const inherited = await h.service(null);
    const override = await h.service("dine_in");
    assert.equal((await h.scan()).ended, 1);
    assert.equal(await h.status(inherited.id), "active");
    assert.equal(await h.status(override.id), "ended");
  });
});

test("30 continuous minutes required; unrelated seated-ticket updates do not reset the window", async () => {
  await fixture(async h => {
    const svc = await h.service();
    await h.anchor(svc.id, new Date(h.now - 29 * 60_000));
    const [seated] = await h.tx.insert(tickets).values({
      branchId: h.branchId, serviceId: svc.id, ticketNumber: "SEATED", status: "arrived", updatedAt: new Date(h.now),
    }).returning();
    assert.equal((await h.scan()).ended, 0);
    await h.operations.updateTicket(seated.id, { notes: "Still seated" });
    h.clock(h.now + 60_000);
    assert.equal((await h.scan()).ended, 1);
    const [unchanged] = await h.tx.select().from(tickets).where(eq(tickets.id, seated.id));
    assert.equal(unchanged.status, "arrived", "Closing booking never changes existing customers");
    assert.equal(h.pushes.length, 1);
  });
});

test("a waiting ticket blocks closing and leaving waiting restarts the full 30-minute timer", async () => {
  await fixture(async h => {
    const svc = await h.service();
    await h.anchor(svc.id, h.old);
    const ticket = await h.operations.createTicket({ branchId: h.branchId, serviceId: svc.id });
    h.clock(h.now + 40 * 60_000);
    assert.equal((await h.scan()).ended, 0);
    await h.operations.updateTicket(ticket.id, { status: "arrived", arrivedAt: new Date(h.now + 40 * 60_000) });
    h.clock(h.now + 69 * 60_000);
    assert.equal((await h.scan()).ended, 0);
    h.clock(h.now + 70 * 60_000);
    assert.equal((await h.scan()).ended, 1);
  });
});

test("a ticket resumed and called between scans resets idle; recalling an already called ticket does not", async () => {
  await fixture(async h => {
    const svc = await h.service();
    await h.anchor(svc.id, h.old);
    const [ticket] = await h.tx.insert(tickets).values({
      branchId: h.branchId, serviceId: svc.id, ticketNumber: "HELD", status: "hold",
    }).returning();
    await h.operations.updateTicket(ticket.id, { status: "waiting" });
    h.clock(h.now + 60_000);
    await h.operations.updateTicket(ticket.id, { status: "called" });
    h.clock(h.now + 29 * 60_000);
    await h.operations.updateTicket(ticket.id, { status: "called", callCount: 2 });
    assert.equal((await h.scan()).ended, 0);
    h.clock(h.now + 31 * 60_000);
    assert.equal((await h.scan()).ended, 1);
  });
});

test("manual reopen/resume gets a fresh timer; paused/closed/inactive scopes never auto-close", async () => {
  await fixture(async h => {
    const svc = await h.service(null, { queueStatus: "ended" });
    await h.anchor(svc.id, h.old);
    await h.operations.updateService(svc.id, { queueStatus: "active" });
    assert.equal((await h.scan()).ended, 0);
    h.clock(h.now + 30 * 60_000);
    assert.equal((await h.scan()).ended, 1);
    const paused = await h.service(null, { queueStatus: "paused" });
    const disabled = await h.service(null, { isActive: false });
    assert.equal((await h.scan()).ended, 0);
    assert.equal(await h.status(paused.id), "paused");
    assert.equal(await h.status(disabled.id), "active");
    const active = await h.service();
    await h.tx.update(branches).set({ queueStatus: "paused" }).where(eq(branches.id, h.branchId));
    assert.equal((await h.scan()).ended, 0);
    assert.equal(await h.status(active.id), "active");
  });
});

test("other modes never create idle anchors when tickets are created, changed or bookings reopened", async () => {
  await fixture(async h => {
    const svc = await h.service("takeaway", { queueStatus: "ended" });
    await h.operations.updateService(svc.id, { queueStatus: "active" });
    const ticket = await h.operations.createTicket({ branchId: h.branchId, serviceId: svc.id });
    await h.operations.updateTicket(ticket.id, { status: "called" });
    const rows = await h.tx.select().from(branchAlertState).where(eq(branchAlertState.scopeId, svc.id));
    assert.equal(rows.length, 0);
    assert.equal((await h.scan()).ended, 0);
    assert.equal(h.alerts.length, 0);
  });
});

test.after(async () => { await pool.end(); });
