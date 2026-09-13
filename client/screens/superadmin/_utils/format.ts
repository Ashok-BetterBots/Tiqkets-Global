const SYMBOL: Record<string, string> = {
  INR: "\u20B9",
  USD: "$",
  EUR: "\u20AC",
  GBP: "\u00A3",
  AED: "AED ",
  SGD: "S$",
};

// Razorpay/Stripe store amounts in the smallest currency unit (paise/cents).
// We always divide by 100 to get the major unit.
export function formatMoney(amountMinor: number, currency: string = "INR"): string {
  const major = (amountMinor || 0) / 100;
  const symbol = SYMBOL[currency?.toUpperCase()] || `${currency} `;
  const formatted = major.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

export function formatCompactMoney(amountMinor: number, currency: string = "INR"): string {
  const major = (amountMinor || 0) / 100;
  const symbol = SYMBOL[currency?.toUpperCase()] || `${currency} `;
  const formatted = major.toLocaleString(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return `${symbol}${formatted}`;
}

export function formatWaitSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

export function formatPercent(n: number, decimals: number = 1): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

export function pctChange(curr: number, prev: number): number {
  if (!prev) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}
