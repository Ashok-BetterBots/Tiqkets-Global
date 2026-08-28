export const EVENT_LIVE_REFRESH_INTERVAL_MS = 10_000;

type EventRefreshListener = (eventId?: string) => void;

const listeners = new Set<EventRefreshListener>();

export function notifyEventDataChanged(eventId?: string): void {
  for (const listener of listeners) listener(eventId);
}

export function subscribeToEventDataChanges(listener: EventRefreshListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}