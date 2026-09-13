const GENERATED_AND_LEGACY_TICKET_ID_PREFIXES = ["TIQ-", "EVT-", "PTK-"] as const;
const FULL_TICKET_ID_PATTERN = /^[A-Z0-9]{2,8}-[A-Z0-9]{2,}$/;

export function normalizeTicketIdSearchInput(input: unknown): string {
  return String(input ?? "").trim().toUpperCase();
}

export function getExactTicketIdCandidates(input: unknown): string[] {
  const normalized = normalizeTicketIdSearchInput(input);
  if (!normalized) return [];
  if (FULL_TICKET_ID_PATTERN.test(normalized)) {
    return [normalized];
  }
  return [
    normalized,
    ...GENERATED_AND_LEGACY_TICKET_ID_PREFIXES.map((prefix) => `${prefix}${normalized}`),
  ];
}

export function getPartialTicketIdPatterns(input: unknown): string[] {
  return getExactTicketIdCandidates(input).map((candidate) => `%${candidate}%`);
}