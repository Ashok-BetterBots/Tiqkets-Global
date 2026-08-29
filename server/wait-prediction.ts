// AI wait-time predictor — server-side runtime.
//
// This is the DB-backed layer on top of `shared/wait-prediction.ts`.
// Three responsibilities:
//
//   1. `predictForTicket` — given a ticket about to be saved (or
//      already saved), look up the active-desk count + the learned
//      EMA cell for the current hour-of-week, and return the
//      expected wait (minutes) + the absolute predicted serve time.
//
//   2. `recordCompletion` — when a ticket finishes, fold its actual
//      service duration into the EMA cell for the hour-of-week it
//      was *started* in (servedAt). EMA alpha is small so one slow
//      complaint doesn't shift the curve.
//
//   3. `recomputeBranchPredictions` — refresh the predictions for
//      every still-waiting ticket on a queue after a mutation
//      (call/serve/complete/no_show/cancel/swap). This is what keeps
//      the customer-facing ETA honest — without it, an "estimated 15
//      min" displayed at join would stay 15 min even after 5 people
//      ahead were served.
//
// Every entry point is opt-in via `organizations.aiWaitPredictionEnabled`.
// When the org has turned the feature off we no-op (and the legacy
// `service.averageWaitTime * position` math at the route layer still
// runs as a fallback so the customer never sees a blank ETA).

import { and, eq, inArray, sql } from "drizzle-orm";
import { MIN_SAMPLE_MS as SHARED_MIN_SAMPLE_MS, MAX_SAMPLE_MS as SHARED_MAX_SAMPLE_MS } from "@shared/wait-prediction";
import { db } from "./db";
import {
  branches,
  desks,
  organizations,
  services,
  tickets,
  waitTimeStats,
  type Ticket,
} from "@shared/schema";
import {
  EMA_ALPHA,
  expectedServiceAt,
  hourOfWeek,
  predictWait,
  type PredictResult,
} from "@shared/wait-prediction";

const FALLBACK_TIMEZONE = "UTC";

// ─────────────────────────────────────────────────────────────────────
// Org-level toggle gate
// ─────────────────────────────────────────────────────────────────────

const orgFlagCache = new Map<string, { enabled: boolean; cachedAt: number }>();
const ORG_FLAG_TTL_MS = 30_000;

/**
 * Returns true if the org owning this branch has the AI predictor on.
 * Cached for 30s to keep the join-queue hot path cheap.
 */
export async function isAiPredictionEnabledForBranch(branchId: string): Promise<boolean> {
  const cached = orgFlagCache.get(branchId);
  if (cached && Date.now() - cached.cachedAt < ORG_FLAG_TTL_MS) return cached.enabled;
  const [row] = await db
    .select({ enabled: organizations.aiWaitPredictionEnabled })
    .from(branches)
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .where(eq(branches.id, branchId))
    .limit(1);
  const enabled = row?.enabled ?? true;
  orgFlagCache.set(branchId, { enabled, cachedAt: Date.now() });
  return enabled;
}

/** Bust the cache when an org toggle is flipped. */
export function invalidateAiPredictionCacheForOrg(organizationId: string): void {
  for (const [key] of orgFlagCache) orgFlagCache.delete(key);
  void organizationId;
}

// ─────────────────────────────────────────────────────────────────────
// Active desk count (capacity)
// ─────────────────────────────────────────────────────────────────────

const deskCountCache = new Map<string, { count: number; cachedAt: number }>();
const DESK_CACHE_TTL_MS = 15_000;

async function getActiveDeskCount(branchId: string, serviceId: string | null | undefined): Promise<number> {
  const key = `${branchId}::${serviceId || "_"}`;
  const cached = deskCountCache.get(key);
  if (cached && Date.now() - cached.cachedAt < DESK_CACHE_TTL_MS) return cached.count;
  const conditions = [eq(desks.branchId, branchId), eq(desks.isActive, true), eq(desks.queueStatus, "active")];
  if (serviceId) conditions.push(eq(desks.serviceId, serviceId));
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(desks)
    .where(and(...conditions));
  // If the branch has zero configured desks (common for small shops),
  // assume serial single-desk processing so the math still works.
  const count = Math.max(1, row?.c ?? 0);
  deskCountCache.set(key, { count, cachedAt: Date.now() });
  return count;
}

export function invalidateDeskCacheForBranch(branchId: string): void {
  for (const [key] of deskCountCache) if (key.startsWith(`${branchId}::`)) deskCountCache.delete(key);
}

// ─────────────────────────────────────────────────────────────────────
// EMA lookup with neighbor-hour fallback
// ─────────────────────────────────────────────────────────────────────

/**
 * Returns the EMA service-duration in ms for (branch, service, hour),
 * falling back to ±1 hour, then ±2 hours, before giving up. This
 * prevents brand-new cells from forcing the predictor onto the
 * static service.averageWaitTime fallback for their entire first day.
 */
async function loadEmaServiceMs(
  branchId: string,
  serviceId: string,
  hour: number,
): Promise<number | null> {
  const wanted = [hour, (hour + 1) % 168, (hour + 167) % 168, (hour + 2) % 168, (hour + 166) % 168];
  const rows = await db
    .select({ hour: waitTimeStats.hourOfWeek, ms: waitTimeStats.avgServiceMs })
    .from(waitTimeStats)
    .where(
      and(
        eq(waitTimeStats.branchId, branchId),
        eq(waitTimeStats.serviceId, serviceId),
        inArray(waitTimeStats.hourOfWeek, wanted),
      ),
    );
  if (rows.length === 0) return null;
  // Prefer exact hour; otherwise the nearest neighbor we found.
  const byHour = new Map(rows.map((r) => [r.hour, r.ms]));
  for (const candidate of wanted) {
    const hit = byHour.get(candidate);
    if (hit && hit > 0) return hit;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Predict for a single ticket
// ─────────────────────────────────────────────────────────────────────

export interface TicketPrediction extends PredictResult {
  /** Absolute wall-clock Date the customer is expected to be served. */
  predictedServiceAt: Date;
}

/**
 * Compute the prediction for a ticket *as of now* given its current
 * position. Caller is responsible for already having an up-to-date
 * `position` on the ticket (i.e. recalculatePositions has run if
 * upstream tickets just changed).
 *
 * Returns null if the org has disabled the predictor — caller should
 * use the legacy fallback in that case.
 */
export async function predictForTicket(
  ticket: Pick<Ticket, "branchId" | "serviceId" | "position">,
  options?: { now?: Date; serviceFallbackMinutes?: number; branchTimezone?: string },
): Promise<TicketPrediction | null> {
  if (!ticket.serviceId) return null;
  const enabled = await isAiPredictionEnabledForBranch(ticket.branchId);
  if (!enabled) return null;

  const now = options?.now ?? new Date();

  // Pull branch tz + service avg in one round trip if not supplied.
  let timezone = options?.branchTimezone;
  let fallbackMinutes = options?.serviceFallbackMinutes;
  if (timezone == null || fallbackMinutes == null) {
    const [row] = await db
      .select({ tz: branches.timezone, avg: services.averageWaitTime, est: services.estimatedDuration })
      .from(branches)
      .innerJoin(services, eq(services.id, ticket.serviceId))
      .where(eq(branches.id, ticket.branchId))
      .limit(1);
    timezone = timezone ?? row?.tz ?? FALLBACK_TIMEZONE;
    // Prefer estimatedDuration (per-customer service time) over
    // averageWaitTime (overall queue wait) as a fallback service ms.
    fallbackMinutes = fallbackMinutes ?? row?.est ?? row?.avg ?? 15;
  }

  const hour = hourOfWeek(now, timezone);
  const [emaServiceMs, activeDesks] = await Promise.all([
    loadEmaServiceMs(ticket.branchId, ticket.serviceId, hour),
    getActiveDeskCount(ticket.branchId, ticket.serviceId),
  ]);

  const result = predictWait({
    position: ticket.position,
    activeDesks,
    emaServiceMs,
    fallbackServiceMinutes: fallbackMinutes,
  });

  return {
    ...result,
    predictedServiceAt: expectedServiceAt(now, result.waitMinutes),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Learning loop — fold a completed ticket into the EMA
// ─────────────────────────────────────────────────────────────────────

/**
 * Called from the ticket-complete handler. Computes the per-customer
 * service duration (completedAt − servedAt) and folds it into the EMA
 * for the hour-of-week the ticket *started service* in.
 *
 * No-ops silently when the org has the predictor disabled, when
 * required timestamps are missing, or when the sample is degenerate.
 */
export async function recordCompletion(ticket: Ticket): Promise<void> {
  try {
    if (!ticket.serviceId || !ticket.servedAt || !ticket.completedAt) return;
    const enabled = await isAiPredictionEnabledForBranch(ticket.branchId);
    if (!enabled) return;

    const servedAt = new Date(ticket.servedAt);
    const completedAt = new Date(ticket.completedAt);
    const sampleMs = completedAt.getTime() - servedAt.getTime();
    if (!Number.isFinite(sampleMs) || sampleMs <= 0) return;

    const joinedAt = ticket.joinedAt ? new Date(ticket.joinedAt) : servedAt;
    const waitMs = Math.max(0, servedAt.getTime() - joinedAt.getTime());

    const [branch] = await db
      .select({ tz: branches.timezone })
      .from(branches)
      .where(eq(branches.id, ticket.branchId))
      .limit(1);
    const tz = branch?.tz ?? FALLBACK_TIMEZONE;
    const hour = hourOfWeek(servedAt, tz);

    // Clamp the new sample inline (mirror of `updateEma`'s guards)
    // so the SQL never sees a degenerate value. The blending math
    // itself runs in the database via ON CONFLICT DO UPDATE — that
    // way two completions in the same (branch, service, hour) cell
    // racing against each other can't lose updates the way a
    // read-then-update pair did. Each row update is applied against
    // the *committed* avg_service_ms in the same statement.
    const clampedService = Math.max(SHARED_MIN_SAMPLE_MS, Math.min(SHARED_MAX_SAMPLE_MS, Math.round(sampleMs)));
    const clampedWait = Math.max(0, Math.round(waitMs));
    const oneMinusAlpha = 1 - EMA_ALPHA;

    await db
      .insert(waitTimeStats)
      .values({
        branchId: ticket.branchId,
        serviceId: ticket.serviceId,
        hourOfWeek: hour,
        avgServiceMs: clampedService,
        avgWaitMs: clampedWait,
        sampleCount: 1,
      })
      .onConflictDoUpdate({
        target: [waitTimeStats.branchId, waitTimeStats.serviceId, waitTimeStats.hourOfWeek],
        set: {
          // EMA blend computed atomically against the row's
          // currently-committed value. `excluded.*` is the row we
          // tried to insert (i.e. the clamped fresh sample).
          avgServiceMs: sql`round(${waitTimeStats.avgServiceMs}::numeric * ${oneMinusAlpha} + excluded.avg_service_ms::numeric * ${EMA_ALPHA})::int`,
          avgWaitMs: sql`round(coalesce(${waitTimeStats.avgWaitMs}, excluded.avg_wait_ms)::numeric * ${oneMinusAlpha} + excluded.avg_wait_ms::numeric * ${EMA_ALPHA})::int`,
          sampleCount: sql`${waitTimeStats.sampleCount} + 1`,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    // The predictor is best-effort; we never want a bad sample to
    // surface as a 500 on the staff-side complete button.
    // eslint-disable-next-line no-console
    console.error("[wait-prediction] recordCompletion failed:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Re-predict all waiting tickets on a queue
// ─────────────────────────────────────────────────────────────────────

/**
 * Re-run the predictor for every still-waiting ticket on a branch
 * (optionally filtered to one service) and persist the refreshed
 * `estimatedWaitTime` + `predictedServiceAt`. Called by the route
 * layer right after `recalculatePositions` so customer apps that
 * poll/SSE see consistent positions + ETAs.
 *
 * Cheap by design — at most ~maxQueueSize tickets, one query for
 * the list, then sequential updates. Errors are swallowed so we
 * don't fail the upstream queue mutation.
 */
export async function recomputeBranchPredictions(branchId: string, serviceId?: string | null): Promise<void> {
  try {
    const enabled = await isAiPredictionEnabledForBranch(branchId);
    if (!enabled) return;

    const conditions = [eq(tickets.branchId, branchId), eq(tickets.status, "waiting")];
    if (serviceId) conditions.push(eq(tickets.serviceId, serviceId));
    const waiting = await db.select().from(tickets).where(and(...conditions));
    if (waiting.length === 0) return;

    // Group by serviceId so we only fetch the branch timezone +
    // service fallback once per service, not once per ticket.
    const byService = new Map<string, Ticket[]>();
    for (const t of waiting) {
      if (!t.serviceId) continue;
      const list = byService.get(t.serviceId) ?? [];
      list.push(t);
      byService.set(t.serviceId, list);
    }

    const [branch] = await db
      .select({ tz: branches.timezone })
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1);
    const tz = branch?.tz ?? FALLBACK_TIMEZONE;

    for (const [svcId, group] of byService) {
      const [svc] = await db
        .select({ avg: services.averageWaitTime, est: services.estimatedDuration })
        .from(services)
        .where(eq(services.id, svcId))
        .limit(1);
      const fallbackMinutes = svc?.est ?? svc?.avg ?? 15;
      for (const t of group) {
        const prediction = await predictForTicket(t, {
          serviceFallbackMinutes: fallbackMinutes,
          branchTimezone: tz,
        });
        if (!prediction) continue;
        await db
          .update(tickets)
          .set({
            estimatedWaitTime: prediction.waitMinutes,
            predictedServiceAt: prediction.predictedServiceAt,
            updatedAt: new Date(),
          })
          .where(eq(tickets.id, t.id));
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[wait-prediction] recomputeBranchPredictions failed:", err);
  }
}
