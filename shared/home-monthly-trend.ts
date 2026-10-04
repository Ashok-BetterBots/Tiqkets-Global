// Reporting dates are organisation calendar keys, not device-local instants.
export function buildMonthlyServedTrend(
  dailyCompletedByDate: ReadonlyMap<string, number>,
  today: string,
  months: number,
) {
  const [year, month] = today.split("-").map(Number);
  const labelFormat = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
  const detailFormat = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });
  const buckets = Array.from({ length: months }, (_, index) => {
    const date = new Date(Date.UTC(year, month - months + index, 1, 12));
    return {
      key: date.toISOString().slice(0, 7),
      label: labelFormat.format(date),
      fullLabel: detailFormat.format(date),
      value: 0,
    };
  });
  const byMonth = new Map(buckets.map(bucket => [bucket.key, bucket]));
  dailyCompletedByDate.forEach((value, date) => {
    if (date > today) return; // The current month is month-to-date.
    const bucket = byMonth.get(date.slice(0, 7));
    if (bucket) bucket.value += value;
  });
  return buckets;
}