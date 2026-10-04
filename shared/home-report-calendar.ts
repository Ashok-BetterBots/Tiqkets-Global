// Organisations without an explicit timezone use IST. Never use the device
// or server's timezone to interpret organisation reporting days.
export const DEFAULT_ORGANIZATION_TIMEZONE = "Asia/Kolkata";
export function resolveOrganizationTimezone(timeZone: unknown): string {
  return typeof timeZone === "string" && timeZone.trim()
    ? timeZone : DEFAULT_ORGANIZATION_TIMEZONE;
}

export function createHomeReportCalendar(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = (date: Date) => {
    const values = formatter.formatToParts(date);
    const get = (type: string) => values.find(value => value.type === type)!.value;
    return {
      year: get("year"), month: get("month"), day: get("day"),
      hour: get("hour"), minute: get("minute"), second: get("second"),
    };
  };
  return {
    timeZone,
    dateKey(date: Date) {
      const p = parts(date);
      return `${p.year}-${p.month}-${p.day}`;
    },
    hour(date: Date) {
      return Number(parts(date).hour);
    },
    weekday(date: Date) {
      const p = parts(date);
      return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), 12)).getUTCDay();
    },
    timestamp(date: Date) {
      const p = parts(date);
      return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
    },
    dayStart(dateKey: string) {
      const wallClock = Date.parse(`${dateKey}T00:00:00.000Z`);
      let instant = wallClock;
      // Re-estimate the offset at local midnight, including DST transitions.
      for (let pass = 0; pass < 3; pass++) {
        const p = parts(new Date(instant));
        const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day),
          Number(p.hour), Number(p.minute), Number(p.second));
        instant += wallClock - represented;
      }
      return new Date(instant);
    },
  };
}

// Date-only arithmetic must not go through the device's local midnight -> UTC.
export function shiftHomeReportDate(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}