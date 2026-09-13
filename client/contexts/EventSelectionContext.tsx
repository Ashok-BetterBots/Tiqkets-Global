import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";

export interface EventSelectionRow {
  id: string;
  name: string;
  status: string;
  branchId?: string;
  parkingEnabled?: boolean;
}

interface EventSelectionContextValue {
  events: EventSelectionRow[];
  selectedEventId: string | null;
  selectedEvent: EventSelectionRow | null;
  setSelectedEventId: (eventId: string) => void;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetchEvents: () => Promise<unknown>;
}

const EventSelectionContext = createContext<EventSelectionContextValue | null>(null);

export function EventSelectionProvider({ children }: { children: ReactNode }) {
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<{ events: EventSelectionRow[] } | EventSelectionRow[]>({
    queryKey: ["/api/dashboard/events"],
    staleTime: 15000,
  });
  const events = useMemo(() => {
    const raw: any = data;
    return (raw?.events ?? raw ?? []) as EventSelectionRow[];
  }, [data]);
  const [selectedEventId, setSelectedEventIdState] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    setSelectedEventIdState((current) => {
      if (current && events.some((event) => event.id === current)) return current;
      return events.find((event) => event.status === "published" || event.status === "active")?.id
        ?? events[0]?.id
        ?? null;
    });
  }, [events, isLoading]);

  const setSelectedEventId = useCallback((eventId: string) => {
    setSelectedEventIdState(eventId);
  }, []);
  const refetchEvents = useCallback(async () => refetch(), [refetch]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const value = useMemo<EventSelectionContextValue>(() => ({
    events,
    selectedEventId,
    selectedEvent,
    setSelectedEventId,
    isLoading,
    isFetching,
    error: error instanceof Error ? error : error ? new Error(String(error)) : null,
    refetchEvents,
  }), [
    events,
    selectedEventId,
    selectedEvent,
    setSelectedEventId,
    isLoading,
    isFetching,
    error,
    refetchEvents,
  ]);

  return (
    <EventSelectionContext.Provider value={value}>
      {children}
    </EventSelectionContext.Provider>
  );
}

export function useEventSelection(): EventSelectionContextValue {
  const context = useContext(EventSelectionContext);
  if (!context) {
    throw new Error("useEventSelection must be used within EventSelectionProvider");
  }
  return context;
}