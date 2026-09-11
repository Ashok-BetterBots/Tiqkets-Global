export type TicketTimingStatus =
  | { kind: "within-window"; direction: "early" | "late" | "on-time"; diffMinutes: number; diffDays: 0 }
  | { kind: "same-day-offset"; direction: "early" | "late"; diffMinutes: number; diffDays: 0 }
  | { kind: "different-day"; direction: "early" | "late"; diffMinutes: number; diffDays: number };

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTicketTimingStatus(
  slotDate?: string | null,
  slotTime?: string | null,
  nowMs = Date.now(),
): TicketTimingStatus | null {
  if (!slotDate || !slotTime) return null;
  const slot = new Date(`${slotDate}T${slotTime}`);
  const now = new Date(nowMs);
  if (Number.isNaN(slot.getTime()) || Number.isNaN(now.getTime())) return null;

  const diffMinutes = Math.round(Math.abs(slot.getTime() - now.getTime()) / 60000);
  const direction = slot.getTime() > now.getTime() ? "early" : slot.getTime() < now.getTime() ? "late" : "on-time";
  if (localDateKey(slot) !== localDateKey(now)) {
    const slotDay = new Date(slot.getFullYear(), slot.getMonth(), slot.getDate()).getTime();
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diffDays = Math.max(1, Math.round(Math.abs(slotDay - nowDay) / 86400000));
    return { kind: "different-day", direction: direction === "on-time" ? "late" : direction, diffMinutes, diffDays };
  }
  if (diffMinutes > 30) {
    return { kind: "same-day-offset", direction: direction === "on-time" ? "late" : direction, diffMinutes, diffDays: 0 };
  }
  return { kind: "within-window", direction, diffMinutes, diffDays: 0 };
}