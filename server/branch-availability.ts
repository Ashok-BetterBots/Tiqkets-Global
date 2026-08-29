// ============================================================================
// Branch availability — computes whether a branch is currently accepting
// customers based on its OPERATING HOURS, BREAK TIMES, and HOLIDAYS, all
// evaluated in the branch's configured IANA timezone.
//
// This is the single source of truth used by:
//   - GET  /api/join/:branchId       (customer landing page payload)
//   - POST /api/join/:branchId       (gate ticket creation)
//   - GET  /api/discover             (isOpen flag in branch listings)
//   - GET  /api/dashboard/branches/* (admin override status)
//
// Decision rules:
//   1. If branch.scheduleOverride === true → schedule is ignored, manual
//      branch.queueStatus + per-service queueStatus alone decide accept/reject.
//   2. If today is a holiday              → state="closed_holiday",
//                                            canJoin=false, collectDetails=false
//   3. If today is closed (isOpen=false
//      or no operating_hours row)         → state="closed_outside_hours"
//   4. Before openTime / after closeTime  → state="closed_outside_hours",
//                                            collectDetails=false, canJoin=false
//   5. Inside a break window              → state="on_break",
//                                            collectDetails=true,  canJoin=true
//                                            (customer is queued but warned
//                                             that staff will resume at breakEndsAt)
//   6. Otherwise                          → state="open"
//
// Service-level paused/ended is handled separately at call sites (it short-
// circuits the form rather than the entire branch).
// ============================================================================

import { storage } from "./storage";

export type BranchAvailabilityState =
  | "open"
  | "on_break"
  | "closed_outside_hours"
  | "closed_holiday"
  | "closed_inactive"; // branch.isActive === false

export interface BranchAvailability {
  state: BranchAvailabilityState;
  // Customer-facing one-liner explaining what's happening right now.
  message: string;
  // True if the customer is allowed to submit the join form. False blocks
  // the POST /api/join entirely (and removes the Join button on the UI).
  canJoin: boolean;
  // True if the form (name/phone/etc) should be rendered. False means the
  // customer should only see the explanatory message — no fields, no button.
  // canJoin=false implies collectDetails=false; on_break has both true.
  collectDetails: boolean;
  // The schedule-derived queue status, mapped to the same vocabulary the
  // existing `branchQueueStatus` field uses so older clients keep working:
  //   "active" → open or on_break
  //   "paused" → on_break (also surfaced via state for newer clients)
  //   "ended"  → closed_outside_hours / closed_holiday / closed_inactive
  effectiveQueueStatus: "active" | "paused" | "ended";
  // True iff the admin's scheduleOverride toggle is forcing the branch to
  // ignore its own schedule. Useful for the dashboard to badge the branch.
  overrideActive: boolean;
  // Today's working window in branch-local "HH:MM" strings, when defined.
  todayHours: { openTime: string; closeTime: string } | null;
  // Currently active break, if state === "on_break".
  currentBreak: {
    name: string;
    startTime: string;     // HH:MM, branch-local
    endTime: string;       // HH:MM, branch-local
    resumesAtIso: string;  // full ISO timestamp (UTC)
  } | null;
  // Active holiday today, if state === "closed_holiday".
  holiday: { name: string; isRecurring: boolean } | null;
  // ISO timestamp of when the branch will next be open enough to accept
  // tickets (i.e. transition into state="open"). Null if it's already open.
  // For on_break this equals the current break's resume time. For closed
  // states this scans forward up to 14 days for the next open weekday that
  // isn't a holiday.
  nextOpenAtIso: string | null;
  // The branch's IANA timezone — surfaced so the client can format times
  // consistently with the server.
  timezone: string;
}

// ----------------------------------------------------------------------------
// Time helpers — all working entirely with strings + Intl so we never have
// to pull in a date library or worry about server timezone drift.
// ----------------------------------------------------------------------------

function parseHHMM(s: string | null | undefined): number | null {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

// Returns { day: 0-6 (Sun=0), minutes: 0-1439, ymd: "YYYY-MM-DD",
// month: 1-12, dayOfMonth: 1-31 } for `now` projected into `tz`.
// Uses Intl.DateTimeFormat which is bundled with Node and handles DST.
function nowInTimezone(now: Date, tz: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    }).formatToParts(now);
  } catch {
    // Bad timezone string → fall back to UTC silently.
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    }).formatToParts(now);
  }
  const get = (t: string) => parts.find(p => p.type === t)?.value || "";
  const year = parseInt(get("year"), 10);
  const month = parseInt(get("month"), 10);
  const dayOfMonth = parseInt(get("day"), 10);
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // Intl can return "24" at midnight on some locales
  const minute = parseInt(get("minute"), 10);
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const day = weekdayMap[get("weekday")] ?? 0;
  return {
    day,
    minutes: hour * 60 + minute,
    ymd: `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`,
    month,
    dayOfMonth,
    year,
  };
}

// Returns the offset in milliseconds between `tz` and UTC at `date`.
// Positive when `tz` is ahead of UTC (e.g. Asia/Kolkata → +19_800_000).
// Uses the standard "format the instant as if UTC, subtract" trick which
// is DST-correct and works across month/year boundaries.
function getTzOffsetMs(date: Date, tz: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date);
  } catch {
    return 0; // Bad timezone string → treat as UTC.
  }
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  let h = parseInt(map.hour, 10);
  if (h === 24) h = 0; // Intl quirk: midnight may render as "24"
  const asUtc = Date.UTC(
    parseInt(map.year, 10),
    parseInt(map.month, 10) - 1,
    parseInt(map.day, 10),
    h,
    parseInt(map.minute, 10),
    parseInt(map.second, 10),
  );
  return asUtc - date.getTime();
}

// Build a UTC Date corresponding to a wall-clock time in `tz`. DST-correct
// across DST/month/year boundaries (uses tz offset at the target instant
// rather than relying on iterative correction).
function dateInTimezone(year: number, month: number, day: number, hh: number, mm: number, tz: string): Date {
  // First guess: treat the wall-clock as UTC, then subtract the tz offset
  // computed at that instant. One pass is sufficient because tz offset
  // changes only at DST boundaries (mostly hour-aligned), and the offset
  // computed at the guess matches the actual tz offset at the result for
  // all but a 1-hour DST-spring-forward window — for which we're close
  // enough for "Reopens at HH:MM" copy.
  const guess = new Date(Date.UTC(year, month - 1, day, hh, mm, 0));
  const offset = getTzOffsetMs(guess, tz);
  return new Date(guess.getTime() - offset);
}

// Returns true if `now` (in branch-local minutes) falls inside [start, end),
// correctly handling intervals that cross midnight (start > end ⇒ overnight,
// e.g. 22:00–02:00). For overnight intervals "inside" means the union of
// [start, 24:00) and [0, end).
function isInsideInterval(nowMin: number, startMin: number, endMin: number): boolean {
  if (startMin === endMin) return false; // zero-length window
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Overnight: e.g. 22:00–02:00 → minutes 1320–1560 maps to [1320..1440) ∪ [0..120)
  return nowMin >= startMin || nowMin < endMin;
}

// ----------------------------------------------------------------------------
// Public: compute availability for a branch right now.
// ----------------------------------------------------------------------------

// Resolve the EFFECTIVE operating hours (with embedded breaks) and holidays
// for a branch, optionally layering a service's per-service overrides on top.
// Overrides live inside the service's `serviceSettings` jsonb: when a service
// has an `operatingHours` / `holidays` array it wins outright, otherwise the
// branch-level (normalized table) values are used. Branch operating-hour rows
// carry their breaks in a separate table, so we embed them here to give both
// the override path and the table path the same shape.
type OHWithBreaks = {
  id?: string;
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  breaks: { name: string; startTime: string; endTime: string; isActive: boolean }[];
};

async function resolveAvailabilityData(
  branchId: string,
  serviceId?: string,
): Promise<{ operatingHours: OHWithBreaks[]; holidays: { date: Date | string; name: string; isRecurring: boolean }[] }> {
  let ss: any = null;
  if (serviceId) {
    try {
      const svc = await storage.getServiceById(serviceId);
      // Only honour overrides for a service that belongs to this branch.
      if (svc && (svc as any).branchId === branchId) {
        ss = (svc as any).serviceSettings || null;
      }
    } catch {
      ss = null;
    }
  }

  let operatingHours: OHWithBreaks[];
  if (ss && Array.isArray(ss.operatingHours)) {
    operatingHours = ss.operatingHours.map((o: any) => ({
      ...o,
      breaks: Array.isArray(o.breaks) ? o.breaks : [],
    }));
  } else {
    const rows = await storage.getOperatingHours(branchId);
    operatingHours = await Promise.all(
      rows.map(async (o: any) => ({ ...o, breaks: await storage.getBreakTimes(o.id) })),
    );
  }

  const holidays = ss && Array.isArray(ss.holidays)
    ? ss.holidays
    : await storage.getHolidays(branchId);

  return { operatingHours, holidays };
}

export async function getBranchAvailability(
  branchId: string,
  now: Date = new Date(),
  serviceId?: string,
): Promise<BranchAvailability> {
  const branch = await storage.getBranchById(branchId);
  if (!branch) {
    // Caller should normally have already 404'd, but be defensive.
    return {
      state: "closed_inactive",
      message: "Branch not found.",
      canJoin: false,
      collectDetails: false,
      effectiveQueueStatus: "ended",
      overrideActive: false,
      todayHours: null,
      currentBreak: null,
      holiday: null,
      nextOpenAtIso: null,
      timezone: "UTC",
    };
  }

  const tz = (branch as any).timezone || "Asia/Kolkata";
  const overrideActive = (branch as any).scheduleOverride === true;
  const branchQueueStatus = (branch.queueStatus as string) || "active";

  // Branch deactivated entirely → nothing else matters.
  if (branch.isActive === false) {
    return {
      state: "closed_inactive",
      message: "This branch is currently unavailable.",
      canJoin: false,
      collectDetails: false,
      effectiveQueueStatus: "ended",
      overrideActive,
      todayHours: null,
      currentBreak: null,
      holiday: null,
      nextOpenAtIso: null,
      timezone: tz,
    };
  }

  // Manual override: skip schedule entirely. Honour the manually set
  // branchQueueStatus so admins still control accept/pause/end.
  if (overrideActive) {
    if (branchQueueStatus === "ended") {
      return mkClosed("closed_outside_hours", "Queue closed for the day.", tz, overrideActive, "ended");
    }
    if (branchQueueStatus === "paused") {
      return {
        state: "on_break",
        message: "Queue temporarily paused. Please try again shortly.",
        canJoin: false,
        collectDetails: false,
        effectiveQueueStatus: "paused",
        overrideActive,
        todayHours: null,
        currentBreak: null,
        holiday: null,
        nextOpenAtIso: null,
        timezone: tz,
      };
    }
    return {
      state: "open",
      message: "Open and accepting customers.",
      canJoin: true,
      collectDetails: true,
      effectiveQueueStatus: "active",
      overrideActive,
      todayHours: null,
      currentBreak: null,
      holiday: null,
      nextOpenAtIso: null,
      timezone: tz,
    };
  }

  // Pull schedule data — resolved against the service's per-service overrides
  // when a serviceId is supplied, else the branch-level values.
  const { operatingHours, holidays } = await resolveAvailabilityData(branchId, serviceId);

  const local = nowInTimezone(now, tz);

  // ---- 1. Holiday check ----
  const holidayToday = holidays.find(h => {
    const d = new Date(h.date);
    if (h.isRecurring) {
      // Recurring → match month + day-of-month, ignore year.
      const projected = nowInTimezone(d, "UTC"); // holiday.date stored as midnight UTC
      return projected.month === local.month && projected.dayOfMonth === local.dayOfMonth;
    }
    // Non-recurring → exact YMD match.
    const dProjected = nowInTimezone(d, "UTC");
    return dProjected.ymd === local.ymd;
  });
  if (holidayToday) {
    const nextOpen = await findNextOpenAt(branchId, operatingHours, holidays, now, tz);
    return {
      state: "closed_holiday",
      message: `Closed today — ${holidayToday.name}.${nextOpen.label ? ` Reopens ${nextOpen.label}.` : ""}`,
      canJoin: false,
      collectDetails: false,
      effectiveQueueStatus: "ended",
      overrideActive,
      todayHours: null,
      currentBreak: null,
      holiday: { name: holidayToday.name, isRecurring: holidayToday.isRecurring },
      nextOpenAtIso: nextOpen.iso,
      timezone: tz,
    };
  }

  // ---- 2. Today's operating hours ----
  const todayOH = operatingHours.find(o => o.dayOfWeek === local.day);
  if (!todayOH || !todayOH.isOpen) {
    const nextOpen = await findNextOpenAt(branchId, operatingHours, holidays, now, tz);
    return {
      state: "closed_outside_hours",
      message: `Closed today.${nextOpen.label ? ` Reopens ${nextOpen.label}.` : ""}`,
      canJoin: false,
      collectDetails: false,
      effectiveQueueStatus: "ended",
      overrideActive,
      todayHours: null,
      currentBreak: null,
      holiday: null,
      nextOpenAtIso: nextOpen.iso,
      timezone: tz,
    };
  }

  const openMin = parseHHMM(todayOH.openTime);
  const closeMin = parseHHMM(todayOH.closeTime);
  if (openMin === null || closeMin === null) {
    // Misconfigured — fail OPEN so we don't accidentally lock everyone out.
    return mkOpen(tz, overrideActive, todayOH.openTime, todayOH.closeTime);
  }

  // Schedule may cross midnight (e.g. a bar with 18:00–02:00 hours). The
  // helper handles both same-day and overnight windows uniformly.
  const insideHours = isInsideInterval(local.minutes, openMin, closeMin);
  if (!insideHours) {
    // Choose a sensible "next open" time: if we're before today's open
    // window (and same-day schedule), use today's open. Otherwise scan
    // forward to the next open day.
    let nextIso: string | null = null;
    let nextLabel = "";
    if (openMin < closeMin && local.minutes < openMin) {
      nextIso = dateInTimezone(local.year, local.month, local.dayOfMonth,
        Math.floor(openMin / 60), openMin % 60, tz).toISOString();
      nextLabel = `today at ${todayOH.openTime}`;
    } else {
      const nextOpen = await findNextOpenAt(branchId, operatingHours, holidays, now, tz);
      nextIso = nextOpen.iso;
      nextLabel = nextOpen.label;
    }
    return {
      state: "closed_outside_hours",
      message: `Working hours: ${todayOH.openTime}–${todayOH.closeTime}.${nextLabel ? ` Reopens ${nextLabel}.` : ""}`,
      canJoin: false,
      collectDetails: false,
      effectiveQueueStatus: "ended",
      overrideActive,
      todayHours: { openTime: todayOH.openTime, closeTime: todayOH.closeTime },
      currentBreak: null,
      holiday: null,
      nextOpenAtIso: nextIso,
      timezone: tz,
    };
  }

  // ---- 3. Inside hours — break check ----
  // Breaks can also wrap past midnight (rare, but supported for symmetry).
  // Breaks are already embedded by resolveAvailabilityData (table path fetches
  // them per operating-hour row; the service-override path carries them inline).
  const breaks = (todayOH as any).breaks || [];
  const activeBreak = breaks.find((b: any) => {
    if (!b.isActive) return false;
    const s = parseHHMM(b.startTime);
    const e = parseHHMM(b.endTime);
    if (s === null || e === null) return false;
    return isInsideInterval(local.minutes, s, e);
  });
  if (activeBreak) {
    const sMin = parseHHMM(activeBreak.startTime)!;
    const eMin = parseHHMM(activeBreak.endTime)!;
    // For overnight breaks where we're past midnight already (start > end
    // and current minute < endMin), the resume time is today's endTime.
    // For overnight breaks where we're still before midnight (start > end
    // and current minute >= startMin), resume is tomorrow's endTime.
    const resumeIsTomorrow = sMin > eMin && local.minutes >= sMin;
    const resumeBase = resumeIsTomorrow
      ? new Date(now.getTime() + 24 * 60 * 60_000)
      : now;
    const resumeLocal = nowInTimezone(resumeBase, tz);
    const resumesAtIso = dateInTimezone(resumeLocal.year, resumeLocal.month, resumeLocal.dayOfMonth,
      Math.floor(eMin / 60), eMin % 60, tz).toISOString();
    return {
      state: "on_break",
      message: `On a ${activeBreak.name.toLowerCase()} break — staff resume at ${activeBreak.endTime}. You can still join the queue and we'll call you when service resumes.`,
      canJoin: true,
      collectDetails: true,
      effectiveQueueStatus: "paused",
      overrideActive,
      todayHours: { openTime: todayOH.openTime, closeTime: todayOH.closeTime },
      currentBreak: {
        name: activeBreak.name,
        startTime: activeBreak.startTime,
        endTime: activeBreak.endTime,
        resumesAtIso,
      },
      holiday: null,
      nextOpenAtIso: resumesAtIso,
      timezone: tz,
    };
  }

  // ---- 4. Open ----
  return mkOpen(tz, overrideActive, todayOH.openTime, todayOH.closeTime);
}

function mkOpen(tz: string, overrideActive: boolean, openTime: string, closeTime: string): BranchAvailability {
  return {
    state: "open",
    message: `Open and accepting customers — working hours ${openTime}–${closeTime}.`,
    canJoin: true,
    collectDetails: true,
    effectiveQueueStatus: "active",
    overrideActive,
    todayHours: { openTime, closeTime },
    currentBreak: null,
    holiday: null,
    nextOpenAtIso: null,
    timezone: tz,
  };
}

function mkClosed(state: BranchAvailabilityState, message: string, tz: string, overrideActive: boolean, eqs: "ended"): BranchAvailability {
  return {
    state,
    message,
    canJoin: false,
    collectDetails: false,
    effectiveQueueStatus: eqs,
    overrideActive,
    todayHours: null,
    currentBreak: null,
    holiday: null,
    nextOpenAtIso: null,
    timezone: tz,
  };
}

// Look up to 14 days into the future for the next moment the branch will be
// open. Used to populate the "Reopens at …" copy on the closed banners.
async function findNextOpenAt(
  _branchId: string,
  operatingHours: { dayOfWeek: number; openTime: string; isOpen: boolean }[],
  holidays: { date: Date | string; isRecurring: boolean }[],
  now: Date,
  tz: string,
): Promise<{ iso: string | null; label: string }> {
  for (let offset = 1; offset <= 14; offset++) {
    const future = new Date(now.getTime() + offset * 24 * 60 * 60_000);
    const local = nowInTimezone(future, tz);
    const oh = operatingHours.find(o => o.dayOfWeek === local.day);
    if (!oh || !oh.isOpen) continue;
    const isHoliday = holidays.some(h => {
      const d = new Date(h.date);
      const dProjected = nowInTimezone(d, "UTC");
      if (h.isRecurring) {
        return dProjected.month === local.month && dProjected.dayOfMonth === local.dayOfMonth;
      }
      return dProjected.ymd === local.ymd;
    });
    if (isHoliday) continue;
    const m = parseHHMM(oh.openTime);
    if (m === null) continue;
    const iso = dateInTimezone(local.year, local.month, local.dayOfMonth,
      Math.floor(m / 60), m % 60, tz).toISOString();
    const dayLabel = offset === 1 ? "tomorrow"
      : new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz }).format(future);
    return { iso, label: `${dayLabel} at ${oh.openTime}` };
  }
  return { iso: null, label: "" };
}
