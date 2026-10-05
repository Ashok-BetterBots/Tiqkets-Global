export interface SearchableQueueEntry {
  id?: string | null;
  ticketNumber?: string | null;
  bookingId?: string | null;
  confirmationCode?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  whatsappPhone?: string | null;
}

/** Apply only after the caller has scoped entries to its branch/service/tab. */
export function matchesQueueSearch(entry: SearchableQueueEntry, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  const textFields = [entry.customerName, entry.ticketNumber, entry.bookingId, entry.confirmationCode, entry.id];
  if (textFields.some(value => String(value || "").toLowerCase().includes(term))) return true;
  const phones = [entry.customerPhone, entry.whatsappPhone];
  if (phones.some(value => String(value || "").toLowerCase().includes(term))) return true;
  const digits = /^[+\d\s().-]+$/.test(term) ? term.replace(/\D/g, "") : "";
  return !!digits && phones.some(value => String(value || "").replace(/\D/g, "").includes(digits));
}
