// AI wait-time predictor — pure helpers shared by client + server.
//
// The runtime predictor lives in `server/wait-prediction.ts` (it owns
// the DB-backed learning store + per-ticket recompute). This module
// is the dependency-free arithmetic so the same formula can be unit
// tested and reused in any tier (client display, server scheduler,
// future analytics dashboard) without dragging Drizzle in.
//
// Algorithm in one paragraph:
//   For each (branchId, serviceId, hourOfWeek) cell we keep an
//   exponentially-weighted moving average (EMA) of the actual service
//   duration sampled from completed tickets. On join we look up the
//   cell for the current hour-of-week, divide remaining queue work by
//   the number of active desks for that service, and return both a
//   wait duration (minutes) and an absolute "expected service at"
//   timestamp. New samples are blended in with alpha=0.1 so one bad
//   outlier can't wreck the EMA but persistent drift is followed
//   within ~30 completions.

/** Smoothing factor for the EMA. Lower = slower to react, more stable. */
export const EMA_ALPHA = 0.1;

/** Hard floor (1 second) so a degenerate "0 ms" sample can't poison the EMA. */
export const MIN_SAMPLE_MS = 1_000;

/** Hard ceiling (4 hours) so a forgotten-completed ticket can't poison the EMA. */
export const MAX_SAMPLE_MS = 4 * 60 * 60 * 1_000;

/**
 * Bucket a Date into a 0..167 slot where 0 = Sunday 00:00 in the
 * caller-supplied IANA timezone (defaults to UTC). The branch's
 * timezone is the right input so "Friday lunch rush" lines up with
 * the customer's wall-clock, not the server's UTC clock.
 */
export function hourOfWeek(date: Date, timezone?: string): number {
  // Intl gives us localised weekday + hour without pulling moment-tz.
  // weekday "short" returns Sun/Mon/.. — we map to 0..6.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "UTC",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekdayPart = parts.find((p) => p.type === "weekday")?.value || "Sun";
  const hourPart = parts.find((p) => p.type === "hour")?.value || "0";
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[weekdayPart] ?? 0;
  // Intl can emit "24" at midnight in some locales — clamp.
  let hour = parseInt(hourPart, 10);
  if (!Number.isFinite(hour)) hour = 0;
  if (hour >= 24) hour = 0;
  return day * 24 + hour;
}

/** Blend a fresh sample into the prior EMA. Returns the new EMA. */
export function updateEma(prevMs: number | null | undefined, sampleMs: number, alpha = EMA_ALPHA): number {
  const s = Math.max(MIN_SAMPLE_MS, Math.min(MAX_SAMPLE_MS, Math.round(sampleMs)));
  if (prevMs == null || prevMs <= 0) return s;
  return Math.round(alpha * s + (1 - alpha) * prevMs);
}

export interface PredictInput {
  /** 1-based position in queue. Position 1 = next to be called. */
  position: number;
  /** Active (running) desks for this service. Min 1 so we never divide by 0. */
  activeDesks: number;
  /** EMA of service duration from the learning store, in ms. Null if no data. */
  emaServiceMs: number | null;
  /** Service.estimatedDuration in MINUTES — fallback when EMA is null. */
  fallbackServiceMinutes: number;
}

export interface PredictResult {
  /** Predicted minutes the customer still has to wait. */
  waitMinutes: number;
  /** Per-customer service duration the prediction assumed (ms). */
  serviceMsUsed: number;
  /** Whether the prediction came from learned data (true) or fallback (false). */
  usedLearnedData: boolean;
}

/**
 * Compute the predicted remaining wait for a ticket at a given queue position.
 *
 * Formula: (position - 1) * perCustomerServiceMs / activeDesks
 *
 * Position 1 = currently next, so they wait ~0 (they're the head of line).
 * The customer being served right now would be position 0 conceptually,
 * but they don't have a "wait" anymore — caller should not invoke this
 * for tickets in status "serving"/"called".
 */
export function predictWait(input: PredictInput): PredictResult {
  const desks = Math.max(1, Math.floor(input.activeDesks || 1));
  const usedLearnedData = input.emaServiceMs != null && input.emaServiceMs > 0;
  const serviceMs = usedLearnedData
    ? (input.emaServiceMs as number)
    : Math.max(1, input.fallbackServiceMinutes) * 60_000;
  const ahead = Math.max(0, input.position - 1);
  const waitMs = (ahead * serviceMs) / desks;
  return {
    waitMinutes: Math.max(0, Math.round(waitMs / 60_000)),
    serviceMsUsed: serviceMs,
    usedLearnedData,
  };
}

/**
 * Convenience: given a join timestamp + the predict result, return the
 * absolute Date at which the customer is expected to start being served.
 */
export function expectedServiceAt(from: Date, waitMinutes: number): Date {
  return new Date(from.getTime() + waitMinutes * 60_000);
}
