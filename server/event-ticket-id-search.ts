const TICKET_ID_PREFIXES = ["EVT-", "PTK-"] as const;

export function normalizeTicketIdSearchInput(input: unknown): string {
  return String(input ?? "").trim().toUpperCase();
}

export function getExactTicketIdCandidates(input: unknown): string[] {
  const normalized = normalizeTicketIdSearchInput(input);
  if (!normalized) return [];
  if (TICKET_ID_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return [normalized];
  }
  return [normalized, ...TICKET_ID_PREFIXES.map((prefix) => `${prefix}${normalized}`)];
}

export function getPartialTicketIdPatterns(input: unknown): string[] {
  return getExactTicketIdCandidates(input).map((candidate) => `%${candidate}%`);
}