function parseClockTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = String(timeStr || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 24 || minutes < 0 || minutes > 59) {
    return null;
  }
  return { hours, minutes };
}

export function formatEventTime(timeStr: string): string {
  const parsed = parseClockTime(timeStr);
  if (!parsed) return timeStr;
  const hour = parsed.hours % 24;
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(parsed.minutes).padStart(2, "0")} ${ampm}`;
}

export function formatEventSlotRange(timeStr: string, durationMinutes: number): string {
  const parsed = parseClockTime(timeStr);
  if (!parsed) return formatEventTime(timeStr);

  const duration = Number.isFinite(durationMinutes) ? Math.max(0, durationMinutes) : 0;
  const endTotalMinutes = parsed.hours * 60 + parsed.minutes + duration;
  const endHours = Math.floor(endTotalMinutes / 60) % 24;
  const endMinutes = endTotalMinutes % 60;
  const endTime = `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
  return `${formatEventTime(timeStr)} to ${formatEventTime(endTime)}`;
}