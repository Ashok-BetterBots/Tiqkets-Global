// ══════════════════════════════════════════════════════════════════════════════
// WhatsApp Job Queue — database-backed, reliable message delivery.
//
// All WhatsApp ticket confirmation sends flow through this queue rather than
// fire-and-forget async closures.  This provides three guarantees that the old
// approach could not:
//
//   1. Durability   — job rows survive a server restart (written to DB before
//                     the HTTP response goes out).
//   2. Retry        — failed sends are retried up to maxAttempts times with
//                     exponential backoff (60 s → 5 m → 30 m → 2 h → 6 h).
//   3. Deduplication — the unique dedupe_key column prevents the same logical
//                     send from being queued twice regardless of how many times
//                     issueTicket or the queue-join handler is called.
//
// Job types:
//   event_ticket    — renders the event boarding-pass image with Playwright,
//                     uploads it to Object Storage (permanent URL), then sends
//                     the approved WhatsApp template.  On success writes
//                     ticket_wa_sent to eventStageLog so the legacy reconciler
//                     does not duplicate the send.
//   queue_ticket    — delegates to sendWhatsAppQueueTicket, which handles the
//                     dine-in approved-template vs free-form image/text path.
//   takeaway_ticket — delegates to sendWhatsAppTakeawayConfirmedNotification.
//
// Startup:
//   Call startWaQueueWorker() once at boot.  It ensures the wa_queue table
//   exists (idempotent DDL), pre-warms Chromium, then starts a 30-second
//   polling loop plus an immediate-trigger mechanism so jobs queued during
//   high traffic are processed without waiting for the next tick.
// ══════════════════════════════════════════════════════════════════════════════

import { db } from "./db";
import {
  waQueue,
  eventRegistrations,
  events,
  eventStageLog,
} from "@shared/schema";
import { eq, and, lte, lt, sql as dsql } from "drizzle-orm";
import { getPublicBaseUrl } from "./mailer";

type WaQueueRow = typeof waQueue.$inferSelect;

// ── Retry schedule ────────────────────────────────────────────────────────────
// Delay (seconds) before the Nth retry.  5 attempts total:
//   1st failure → 60 s, 2nd → 5 m, 3rd → 30 m, 4th → 2 h, 5th → 6 h (final)
const RETRY_DELAYS_S = [60, 300, 1800, 7200, 21600];
const BATCH = 5; // jobs claimed per polling cycle

// ── Enqueue ───────────────────────────────────────────────────────────────────

export async function enqueueWaJob(opts: {
  phone?: string;
  orgId?: string;
  jobType: "event_ticket" | "queue_ticket" | "takeaway_ticket";
  refId: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}): Promise<void> {
  const key = opts.dedupeKey ?? `${opts.jobType}:${opts.refId}`;
  await db
    .insert(waQueue)
    .values({
      phone: opts.phone ?? null,
      orgId: opts.orgId ?? null,
      jobType: opts.jobType,
      refId: opts.refId,
      metadata: opts.metadata ?? null,
      dedupeKey: key,
    })
    .onConflictDoNothing(); // unique dedupeKey — ignore if already queued

  console.log(`[wa-queue] enqueued ${opts.jobType} refId=${opts.refId} key=${key}`);

  // Trigger an immediate processing pass so the job does not have to wait
  // for the next 30-second polling interval.
  triggerImmediate();
}

// ── Worker core ───────────────────────────────────────────────────────────────

let _processing = false;

function triggerImmediate(): void {
  if (_processing) return;
  setImmediate(() =>
    processWaQueue().catch((err) =>
      console.error("[wa-queue] immediate trigger error:", err),
    ),
  );
}

export function wakeWaQueueWorker(): void {
  triggerImmediate();
}

export async function processWaQueue(): Promise<void> {
  if (_processing) return;
  _processing = true;
  try {
    const now = new Date();
    const batch = await db
      .select()
      .from(waQueue)
      .where(
        and(
          eq(waQueue.status, "pending"),
          lte(waQueue.scheduledAt, now),
          lt(waQueue.attempts, waQueue.maxAttempts),
        ),
      )
      .orderBy(waQueue.scheduledAt)
      .limit(BATCH);

    if (batch.length === 0) return;
    console.log(`[wa-queue] processing ${batch.length} job(s)`);

    for (const job of batch) {
      await processJob(job);
    }
  } finally {
    _processing = false;
  }
}

async function processJob(job: WaQueueRow): Promise<void> {
  const nextAttempt = job.attempts + 1;
  const retryDelaySec =
    RETRY_DELAYS_S[Math.min(nextAttempt - 1, RETRY_DELAYS_S.length - 1)];

  // Claim the job: increment attempts and push scheduledAt forward so a
  // concurrent poll cycle can't pick it up while we're working on it.
  // On success we overwrite status → 'sent'.  On failure the scheduledAt
  // value becomes the actual next-retry time.
  await db
    .update(waQueue)
    .set({
      attempts: nextAttempt,
      scheduledAt: new Date(Date.now() + retryDelaySec * 1000),
    })
    .where(eq(waQueue.id, job.id));

  try {
    if (job.jobType === "event_ticket") {
      await processEventTicketJob(job);
    } else if (job.jobType === "queue_ticket") {
      await processQueueTicketJob(job);
    } else if (job.jobType === "takeaway_ticket") {
      await processTakeawayTicketJob(job);
    } else {
      throw new Error(`Unknown jobType: "${job.jobType}"`);
    }

    // Mark delivered.
    await db
      .update(waQueue)
      .set({ status: "sent", sentAt: new Date(), lastError: null })
      .where(eq(waQueue.id, job.id));

    console.log(
      `[wa-queue] ✓ job ${job.id} (${job.jobType} refId=${job.refId}) delivered`,
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isFinal = nextAttempt >= job.maxAttempts;

    console.error(
      `[wa-queue] ✗ job ${job.id} attempt ${nextAttempt}/${job.maxAttempts} failed: ${errMsg}`,
    );

    await db
      .update(waQueue)
      .set({ status: isFinal ? "failed" : "pending", lastError: errMsg })
      .where(eq(waQueue.id, job.id));

    if (isFinal) {
      console.error(
        `[wa-queue] ✗✗ job ${job.id} (${job.jobType} refId=${job.refId}) PERMANENTLY FAILED — ${errMsg}`,
      );
    }
  }
}

// ── Event ticket job ──────────────────────────────────────────────────────────

export type EventTicketImageRenderer = (qrToken: string) => Promise<Buffer>;
export type EventTicketSendTrigger = (
  ev: typeof events.$inferSelect,
  reg: typeof eventRegistrations.$inferSelect,
  trigger: string,
  imageUrl?: string,
) => Promise<boolean>;

export type EventTicketJobDependencies = {
  renderTicketImage?: EventTicketImageRenderer;
  sendEventTrigger?: EventTicketSendTrigger;
};

export async function processEventTicketJob(
  job: WaQueueRow,
  dependencies: EventTicketJobDependencies = {},
): Promise<void> {
  if (!job.refId) throw new Error("event_ticket job missing refId");

  const [reg] = await db
    .select()
    .from(eventRegistrations)
    .where(eq(eventRegistrations.id, job.refId))
    .limit(1);
  if (!reg) throw new Error(`Registration ${job.refId} not found`);

  const [ev] = await db
    .select()
    .from(events)
    .where(eq(events.id, reg.eventId))
    .limit(1);
  if (!ev) throw new Error(`Event ${reg.eventId} not found`);

  // Idempotency check — if the legacy reconciler already sent this, skip.
  const [existing] = await db
    .select({ id: eventStageLog.id })
    .from(eventStageLog)
    .where(
      and(
        eq(eventStageLog.registrationId, reg.id),
        eq(eventStageLog.stage, "ticket_wa_sent"),
      ),
    )
    .limit(1);
  if (existing) {
    console.log(
      `[wa-queue] event_ticket: ticket_wa_sent already exists for reg ${reg.id} — skipping`,
    );
    return; // count as success; job will be marked 'sent'
  }

  // Render + upload the boarding-pass image.  If rendering fails we fall
  // back to the dynamic /event-ticket-image/ endpoint — Meta will fetch
  // it on-demand.  The job is still considered deliverable (not an error)
  // because the template can still succeed with a dynamic URL.
  const imageUrl = await resolveEventTicketImage(
    reg,
    dependencies.renderTicketImage,
  );

  // Send via the approved WhatsApp template (falls back to image / text).
  const sendTrigger =
    dependencies.sendEventTrigger ??
    (await import("./events-routes")).sendEventTrigger;
  const sent = await sendTrigger(ev, reg, "ticket", imageUrl ?? undefined);
  if (!sent) throw new Error("sendEventTrigger returned false — will retry");

  // Write the audit receipt so the reconciler does not double-send.
  await db
    .insert(eventStageLog)
    .values({
      registrationId: reg.id,
      stage: "ticket_wa_sent",
      metadata: { url: imageUrl, via: "wa_queue" },
    })
    .catch((e) =>
      console.error("[wa-queue] ticket_wa_sent insert failed (non-fatal):", e),
    );
}

export async function resolveEventTicketImage(
  reg: typeof eventRegistrations.$inferSelect,
  renderImage?: EventTicketImageRenderer,
): Promise<string | null> {
  // Already in Object Storage — durable URL, no render needed.
  if (reg.ticketImageUrl?.includes("/public-objects/")) {
    return reg.ticketImageUrl;
  }
  if (!reg.qrToken) return null;

  try {
    const { setEventTicketImageCache } = await import("./ticket-image");
    const { ObjectStorageService } = await import("./objectStorage");
    const base = getPublicBaseUrl();

    const png = await (renderImage
      ? renderImage(reg.qrToken)
      : (await import("./ticket-image")).renderTicketImage(reg.qrToken));
    setEventTicketImageCache(reg.qrToken, png);

    const oss = new ObjectStorageService();
    const relativePath = await oss.uploadPublicObject(
      png,
      `${reg.qrToken}.png`,
      "image/png",
      "event-tickets",
    );
    const persistentUrl = `${base}${relativePath}`;

    await db
      .update(eventRegistrations)
      .set({ ticketImageUrl: persistentUrl, updatedAt: new Date() })
      .where(eq(eventRegistrations.id, reg.id));

    console.log(
      `[wa-queue] ticket image uploaded to Object Storage: ${persistentUrl}`,
    );
    return persistentUrl;
  } catch (err) {
    // Image render/upload failed — log and fall back to the dynamic endpoint.
    // Meta will attempt to fetch the image from the endpoint at send time;
    // if that also fails, sendEventTrigger will try a text/image fallback.
    console.warn(
      `[wa-queue] image render/upload failed for reg ${reg.id} — using dynamic URL:`,
      err instanceof Error ? err.message : err,
    );
    const base = getPublicBaseUrl();
    return `${base}/event-ticket-image/${reg.qrToken}.png`;
  }
}

// ── Queue ticket job ──────────────────────────────────────────────────────────

async function processQueueTicketJob(job: WaQueueRow): Promise<void> {
  if (!job.refId) throw new Error("queue_ticket job missing refId");
  const { sendWhatsAppQueueTicket } = await import("./whatsapp");
  const sent = await sendWhatsAppQueueTicket(job.refId);
  if (!sent)
    throw new Error("sendWhatsAppQueueTicket returned false — will retry");
}

// ── Takeaway ticket job ───────────────────────────────────────────────────────

async function processTakeawayTicketJob(job: WaQueueRow): Promise<void> {
  if (!job.refId) throw new Error("takeaway_ticket job missing refId");
  const meta = job.metadata as Record<string, unknown> | null;
  const branchName = (meta?.branchName as string | undefined) ?? "Queue";
  const { sendWhatsAppTakeawayConfirmedNotification } = await import(
    "./whatsapp"
  );
  await sendWhatsAppTakeawayConfirmedNotification(job.refId, branchName);
}

// ── Startup ───────────────────────────────────────────────────────────────────

export async function ensureWaQueueTable(): Promise<void> {
  await db.execute(dsql`
    CREATE TABLE IF NOT EXISTS wa_queue (
      id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      created_at    TIMESTAMP   NOT NULL DEFAULT now(),
      scheduled_at  TIMESTAMP   NOT NULL DEFAULT now(),
      attempts      INTEGER     NOT NULL DEFAULT 0,
      max_attempts  INTEGER     NOT NULL DEFAULT 5,
      status        TEXT        NOT NULL DEFAULT 'pending',
      sent_at       TIMESTAMP,
      last_error    TEXT,
      phone         TEXT,
      org_id        VARCHAR(36),
      job_type      TEXT        NOT NULL,
      ref_id        VARCHAR(36),
      metadata      JSONB,
      dedupe_key    TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS wa_queue_dedupe_key_idx
      ON wa_queue (dedupe_key);
    CREATE INDEX IF NOT EXISTS wa_queue_pending_scheduled_idx
      ON wa_queue (status, scheduled_at);
  `);
  console.log("[wa-queue] table ready");
}

export function startWaQueueWorker(
  opts: {
    initialDelayMs?: number;
    pollIntervalMs?: number;
  } = {},
): void {
  const {
    initialDelayMs = 12_000, // allow Chromium to pre-warm first
    pollIntervalMs = 30_000, // poll every 30 s
  } = opts;

  console.log(
    `[wa-queue] worker starting — initial delay ${initialDelayMs}ms, poll every ${pollIntervalMs}ms`,
  );

  const run = (): void => {
    processWaQueue().catch((err) =>
      console.error("[wa-queue] poll error:", err),
    );
  };

  const startTimer = setTimeout(() => {
    run();
    const interval = setInterval(run, pollIntervalMs);
    (interval as unknown as { unref?: () => void }).unref?.();
  }, initialDelayMs);
  (startTimer as unknown as { unref?: () => void }).unref?.();
}
