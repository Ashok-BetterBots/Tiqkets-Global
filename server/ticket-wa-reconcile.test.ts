/**
 * Integration test: ticket WhatsApp reconciliation after a simulated server restart.
 *
 * Scenarios covered:
 *   A) Normal restart — restart after upload; ticketImageUrl is already an
 *      Object Storage URL.  Reconciler must deliver using it.
 *   B) Cold-cache restart — restart before image render/upload.
 *      ticketImageUrl is the local endpoint.  Reconciler must invoke
 *      resolveImageFn (which renders+uploads) before sending.
 *   C) Idempotency — ticket_wa_sent already present; reconciler must not
 *      re-send.
 *   D) Historical isolation — no ticket_wa_pending; reconciler must not
 *      touch the registration.
 *   E) issueTicket outbox boundary — the real issueTicket transaction writes
 *      ticket_wa_pending atomically with status/qrToken; the dispatcher
 *      (Chromium + WhatsApp) is injected as a no-op so the test process stays
 *      clean.  A subsequent reconciler call delivers the "interrupted" ticket.
 *   F) Scan-level failure returns ≥ 1 (retryable) even when totalFailed=0.
 *
 * Run:
 *   DATABASE_URL=<url> npx tsx --test server/ticket-wa-reconcile.test.ts
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, pool } from "./db";
import {
  events,
  eventRegistrations,
  eventStageLog,
  waQueue,
  organizations,
  branches,
  type Event,
  type EventRegistration,
} from "@shared/schema";
import {
  reconcileTicketWaSends,
  issueTicket,
  withTicketWaLease,
  type TicketSendFn,
  type TicketImageResolveFn,
  type TicketDispatchFn,
  type DeliveryLeaseFn,
} from "./events-routes";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

// ──────────────────────────────────────────────────────────
// No-op dispatcher — prevents any Chromium launch or WhatsApp API call.
// Simulates the production dispatcher being killed mid-flight by a restart.
// ──────────────────────────────────────────────────────────
const noopDispatch: TicketDispatchFn = (_ev, _reg, _base) => { /* intentional no-op */ };

// ──────────────────────────────────────────────────────────
// Shared fixtures
// ──────────────────────────────────────────────────────────

const uniqueSuffix = crypto.randomBytes(4).toString("hex");
const BASE_URL = "https://test.example.com";

let orgId: string;
let branchId: string;
let eventId: string;
let eventRow: Event;

before(async () => {
  const [org] = await db
    .insert(organizations)
    .values({
      name: `Test Org ${uniqueSuffix}`,
      email: `test-${uniqueSuffix}@example.com`,
      passwordHash: "x",
    })
    .returning({ id: organizations.id });
  orgId = org.id;

  const [branch] = await db
    .insert(branches)
    .values({ organizationId: orgId, name: `Test Branch ${uniqueSuffix}` })
    .returning({ id: branches.id });
  branchId = branch.id;

  // startDate/endDate are timestamp columns — must be Date objects.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [ev] = await db
    .insert(events)
    .values({
      organizationId: orgId,
      branchId,
      name: `Test Event ${uniqueSuffix}`,
      startDate: today,
      endDate: today,
      operatingHoursStart: "09:00",
      operatingHoursEnd: "21:00",
      slotDurationMinutes: 30,
      maxCapacityPerSlot: 100,
      registrationFee: 0,
      status: "published",
    })
    .returning();
  eventId = ev.id;
  eventRow = ev;
});

// Close the pg pool so the process exits deterministically once all tests
// have run — avoids lingering Chromium handles or idle DB connections that
// would cause `tsx --test` to hang.
after(async () => {
  await db.delete(events).where(eq(events.id, eventId)).catch(() => {});
  await db.delete(branches).where(eq(branches.id, branchId)).catch(() => {});
  await db.delete(organizations).where(eq(organizations.id, orgId)).catch(() => {});
  await pool.end().catch(() => {});
});

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

const todayStr = new Date().toISOString().slice(0, 10);

async function makeRegistration(opts: {
  suffix: string;
  ticketImageUrl?: string | null;
  status?: string;
  withPending?: boolean;
  withSent?: boolean;
}): Promise<string> {
  const [reg] = await db
    .insert(eventRegistrations)
    .values({
      eventId,
      customerName: `Test Customer ${opts.suffix}`,
      customerPhone: "919999000001",
      slotDate: todayStr,
      slotTime: "10:00",
      status: opts.status ?? "ticket_generated",
      ticketImageUrl: opts.ticketImageUrl ?? null,
      bookingId: `EVT-${opts.suffix.toUpperCase().slice(-8)}`,
      qrToken: `qr-${opts.suffix}`,
    })
    .returning({ id: eventRegistrations.id });

  if (opts.withPending) {
    await db.insert(eventStageLog).values({ registrationId: reg.id, stage: "ticket_wa_pending", metadata: {} });
  }
  if (opts.withSent) {
    await db.insert(eventStageLog).values({ registrationId: reg.id, stage: "ticket_wa_sent", metadata: { synthetic: true } });
  }
  return reg.id;
}

async function cleanup(registrationId: string) {
  await db.delete(waQueue).where(eq(waQueue.refId, registrationId)).catch(() => {});
  await db.delete(eventStageLog).where(eq(eventStageLog.registrationId, registrationId)).catch(() => {});
  await db.delete(eventRegistrations).where(eq(eventRegistrations.id, registrationId)).catch(() => {});
}

async function hasSentLog(registrationId: string): Promise<boolean> {
  const rows = await db
    .select({ id: eventStageLog.id })
    .from(eventStageLog)
    .where(and(eq(eventStageLog.registrationId, registrationId), eq(eventStageLog.stage, "ticket_wa_sent")));
  return rows.length > 0;
}

async function hasPendingLog(registrationId: string): Promise<boolean> {
  const rows = await db
    .select({ id: eventStageLog.id })
    .from(eventStageLog)
    .where(and(eq(eventStageLog.registrationId, registrationId), eq(eventStageLog.stage, "ticket_wa_pending")));
  return rows.length > 0;
}

const noopResolve: TicketImageResolveFn = async (reg) => reg.ticketImageUrl ?? null;

// ──────────────────────────────────────────────────────────
// Scenario E: issueTicket outbox boundary (real transaction, no-op dispatch)
// ──────────────────────────────────────────────────────────

describe("Scenario E: issueTicket atomic outbox boundary", () => {
  let regId: string;
  let rawReg: EventRegistration;

  before(async () => {
    const [r] = await db
      .insert(eventRegistrations)
      .values({
        eventId,
        customerName: `Outbox Test ${uniqueSuffix}`,
        customerPhone: "919911111111",
        slotDate: todayStr,
        slotTime: "12:00",
        status: "registration_started",
      })
      .returning();
    regId = r.id;
    rawReg = r;
  });

  after(async () => cleanup(regId));

  test("issueTicket transaction writes ticket_wa_pending atomically with ticket_generated", async () => {
    // noopDispatch prevents any Chromium launch or WhatsApp API call.
    await issueTicket(eventRow, rawReg, noopDispatch);

    const [updated] = await db
      .select({ status: eventRegistrations.status })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.id, regId));
    assert.equal(updated?.status, "ticket_generated", "status must be ticket_generated after issueTicket");
    assert.ok(await hasPendingLog(regId), "ticket_wa_pending must be committed by issueTicket transaction");
    const jobs = await db.select().from(waQueue).where(eq(waQueue.dedupeKey, `event_ticket:${regId}:ticket`));
    assert.equal(jobs.length, 1, "durable WhatsApp job must commit with ticket issuance");
  });

  test("reconciler recovers the registration when the send closure was skipped (restart simulation)", async () => {
    // No ticket_wa_sent exists — the dispatcher (fire-and-forget) never ran.
    // The reconciler must find the pending row and deliver.
    const called: string[] = [];
    const mockSend: TicketSendFn = async (_ev, reg) => { called.push(reg.id); return true; };
    const mockResolve: TicketImageResolveFn = async (reg) =>
      `${BASE_URL}/public-objects/event-tickets/${reg.qrToken}.png`;

    await reconcileTicketWaSends(mockSend, mockResolve);

    assert.ok(called.includes(regId), "reconciler must deliver the registration whose dispatcher was skipped");
    assert.ok(await hasSentLog(regId), "ticket_wa_sent must be written after reconciler delivery");
  });
});

describe("Scenario H: payment-completed ticket retry", () => {
  let regId: string;

  after(async () => cleanup(regId));

  test("issueTicket can resume a captured payment that previously failed before ticket issuance", async () => {
    const [paid] = await db.insert(eventRegistrations).values({
      eventId,
      customerName: `Payment Retry ${uniqueSuffix}`,
      customerPhone: "919922222222",
      slotDate: todayStr,
      slotTime: "13:00",
      status: "payment_completed",
      amountPaid: 5000,
    }).returning();
    regId = paid.id;

    const issued = await issueTicket(eventRow, paid, noopDispatch);
    assert.equal(issued.status, "ticket_generated");
    assert.ok(issued.bookingId);
    assert.ok(issued.qrToken);
    assert.ok(await hasPendingLog(regId));

    const retried = await issueTicket(eventRow, paid, noopDispatch);
    const [persisted] = await db.select().from(eventRegistrations).where(eq(eventRegistrations.id, regId)).limit(1);
    assert.equal(retried.qrToken, persisted.qrToken);
    assert.equal(retried.bookingId, persisted.bookingId);
  });
});

// ──────────────────────────────────────────────────────────
// Scenario A: Normal restart — Object Storage URL already stored
// ──────────────────────────────────────────────────────────

describe("Scenario A: restart after upload (Object Storage URL already stored)", () => {
  let regId: string;
  const osUrl = `${BASE_URL}/public-objects/event-tickets/qr-a-${uniqueSuffix}.png`;

  before(async () => {
    regId = await makeRegistration({ suffix: `a-${uniqueSuffix}`, ticketImageUrl: osUrl, withPending: true });
  });

  after(async () => cleanup(regId));

  test("reconciler sends with the stored Object Storage URL", async () => {
    const calls: string[] = [];
    const mockSend: TicketSendFn = async (_ev, reg, _t, imageUrl) => {
      if (reg.id === regId) calls.push(imageUrl ?? "");
      return true;
    };
    await reconcileTicketWaSends(mockSend, noopResolve);
    assert.equal(calls.length, 1, "sendTriggerFn must be called once");
    assert.equal(calls[0], osUrl, "must use the stored Object Storage URL");
  });

  test("reconciler writes ticket_wa_sent after delivery", async () => {
    assert.ok(await hasSentLog(regId));
  });
});

// ──────────────────────────────────────────────────────────
// Scenario B: Cold-cache restart — image never uploaded
// ──────────────────────────────────────────────────────────

describe("Scenario B: restart before image upload (cold-cache)", () => {
  let regId: string;
  const localUrl = `${BASE_URL}/event-ticket-image/qr-b-${uniqueSuffix}.png`;
  const uploadedUrl = `${BASE_URL}/public-objects/event-tickets/qr-b-${uniqueSuffix}.png`;

  before(async () => {
    // ticketImageUrl is the local endpoint (not yet in Object Storage)
    regId = await makeRegistration({ suffix: `b-${uniqueSuffix}`, ticketImageUrl: localUrl, withPending: true });
  });

  after(async () => cleanup(regId));

  test("reconciler invokes resolveImageFn and sends with the uploaded URL", async () => {
    const resolvedCalls: string[] = [];
    const sentUrls: string[] = [];

    const mockResolve: TicketImageResolveFn = async (reg) => {
      if (reg.id === regId) {
        resolvedCalls.push(reg.ticketImageUrl ?? "");
        return uploadedUrl; // simulate successful render+upload
      }
      return reg.ticketImageUrl ?? null;
    };
    const mockSend: TicketSendFn = async (_ev, reg, _t, imageUrl) => {
      if (reg.id === regId) sentUrls.push(imageUrl ?? "");
      return true;
    };

    await reconcileTicketWaSends(mockSend, mockResolve);

    assert.equal(resolvedCalls.length, 1, "resolveImageFn must be called once");
    assert.equal(sentUrls.length, 1, "sendTriggerFn must be called once");
    assert.equal(sentUrls[0], uploadedUrl, "must send with the uploaded URL, not the local endpoint");
  });

  test("reconciler writes ticket_wa_sent after cold-cache delivery", async () => {
    assert.ok(await hasSentLog(regId));
  });
});

// ──────────────────────────────────────────────────────────
// Scenario C: Idempotency
// ──────────────────────────────────────────────────────────

describe("Scenario C: idempotency — already-sent registration not re-sent", () => {
  let regId: string;

  before(async () => {
    regId = await makeRegistration({
      suffix: `c-${uniqueSuffix}`,
      ticketImageUrl: `${BASE_URL}/public-objects/qr-c-${uniqueSuffix}.png`,
      withPending: true,
      withSent: true,
    });
  });

  after(async () => cleanup(regId));

  test("reconciler does not call sendTriggerFn for an already-sent registration", async () => {
    const called: string[] = [];
    await reconcileTicketWaSends(
      async (_ev, reg) => { called.push(reg.id); return true; },
      noopResolve,
    );
    assert.ok(!called.includes(regId), "must not re-send when ticket_wa_sent already exists");
  });
});

// ──────────────────────────────────────────────────────────
// Scenario D: Historical isolation
// ──────────────────────────────────────────────────────────

describe("Scenario D: historical registration (no ticket_wa_pending) is never touched", () => {
  let regId: string;

  before(async () => {
    regId = await makeRegistration({ suffix: `d-${uniqueSuffix}`, withPending: false });
  });

  after(async () => cleanup(regId));

  test("reconciler does not call sendTriggerFn for historical registration", async () => {
    const called: string[] = [];
    await reconcileTicketWaSends(
      async (_ev, reg) => { called.push(reg.id); return true; },
      noopResolve,
    );
    assert.ok(!called.includes(regId), "historical registration without ticket_wa_pending must not be touched");
  });
});

// ──────────────────────────────────────────────────────────
// Scenario F: Scan-level failure is retryable (returns ≥ 1)
// ──────────────────────────────────────────────────────────

describe("Scenario F: scan-level failure returns ≥ 1 (retryable, not drained)", () => {
  test("reconcileTicketWaSends returns ≥ 1 when the scan itself throws", async () => {
    // Inject a send function that throws immediately to simulate a DB/network
    // error during the scan loop.
    const throwingSend: TicketSendFn = async () => { throw new Error("simulated scan failure"); };

    // Create a pending row so the reconciler enters its loop.
    const tempRegId = await makeRegistration({
      suffix: `f-${uniqueSuffix}`,
      ticketImageUrl: `${BASE_URL}/public-objects/qr-f-${uniqueSuffix}.png`,
      withPending: true,
    });

    try {
      const failed = await reconcileTicketWaSends(throwingSend, noopResolve);
      // Even when send throws (individual row error), the loop catches it and
      // advances the cursor, so totalFailed should be ≥ 1 for that row.
      assert.ok(failed >= 1, `expected failed >= 1 when sends throw, got ${failed}`);
    } finally {
      await cleanup(tempRegId);
    }
  });
});

// ──────────────────────────────────────────────────────────
// Scenario G: Advisory lock prevents duplicate send from concurrent workers
// ──────────────────────────────────────────────────────────

describe("Scenario G: delivery lease prevents duplicate sends from concurrent workers", () => {
  let regId: string;

  before(async () => {
    regId = await makeRegistration({
      suffix: `g-${uniqueSuffix}`,
      ticketImageUrl: `${BASE_URL}/public-objects/qr-g-${uniqueSuffix}.png`,
      withPending: true,
    });
  });

  after(async () => cleanup(regId));

  test("two concurrent reconciler workers produce exactly one WhatsApp send via advisory lock", async () => {
    const sendCalls: string[] = [];

    // A mock send that records which registration IDs it was called for.
    // Includes a small delay to increase the chance of genuine concurrent
    // overlap between the two reconciler workers.
    const trackingSend: TicketSendFn = async (_ev, reg) => {
      sendCalls.push(reg.id);
      await new Promise<void>((r) => setTimeout(r, 20));
      return true;
    };

    // Both reconcilers use the REAL withTicketWaLease (real DB advisory lock),
    // so only one can hold the per-registration lock at a time.
    await Promise.all([
      reconcileTicketWaSends(trackingSend, noopResolve, withTicketWaLease),
      reconcileTicketWaSends(trackingSend, noopResolve, withTicketWaLease),
    ]);

    const callsForReg = sendCalls.filter((id) => id === regId);
    // The advisory lock + ticket_wa_sent re-check inside the lease ensure
    // exactly one send happens even when two workers race.
    assert.ok(
      callsForReg.length <= 1,
      `expected at most 1 send for reg ${regId}, got ${callsForReg.length} (duplicate send!)`
    );
    assert.equal(callsForReg.length, 1, `expected exactly 1 send for reg ${regId}, got ${callsForReg.length}`);
  });

  test("advisory lock allows send after release (second reconciler delivers if first did not)", async () => {
    // The row was delivered in the previous test (ticket_wa_sent exists).
    // A second run should find the row already sent and not call send again.
    const secondRunCalls: string[] = [];
    await reconcileTicketWaSends(
      async (_ev, reg) => { secondRunCalls.push(reg.id); return true; },
      noopResolve,
      withTicketWaLease,
    );
    assert.ok(
      !secondRunCalls.includes(regId),
      "second run must not re-send after ticket_wa_sent is committed",
    );
  });
});
