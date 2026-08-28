import { useCallback, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { EVENT_LIVE_REFRESH_INTERVAL_MS } from "@/lib/event-live-refresh";

export type EventRefreshReason = "focus" | "foreground" | "interval" | "signal";

export function useEventLiveRefresh(
  refresh: (
    reason: EventRefreshReason,
    isCurrent: () => boolean,
  ) => Promise<void> | void,
): (reason?: EventRefreshReason) => Promise<void> {
  const refreshRef = useRef(refresh);
  const focusedRef = useRef(false);
  const inFlightRef = useRef(false);
  const pendingReasonRef = useRef<EventRefreshReason | null>(null);
  const lifecycleGenerationRef = useRef(0);
  refreshRef.current = refresh;

  const runRefresh = useCallback(async (reason: EventRefreshReason = "signal") => {
    if (!focusedRef.current || AppState.currentState !== "active") return;
    if (inFlightRef.current) {
      pendingReasonRef.current = reason;
      return;
    }

    inFlightRef.current = true;
    const lifecycleGeneration = lifecycleGenerationRef.current;
    const isCurrent = () => (
      lifecycleGenerationRef.current === lifecycleGeneration
      && focusedRef.current
      && AppState.currentState === "active"
    );
    try {
      let nextReason: EventRefreshReason | null = reason;
      while (nextReason && isCurrent()) {
        pendingReasonRef.current = null;
        await refreshRef.current(nextReason, isCurrent);
        nextReason = pendingReasonRef.current;
      }
    } finally {
      inFlightRef.current = false;
      const queuedReason = pendingReasonRef.current;
      if (
        queuedReason
        && focusedRef.current
        && AppState.currentState === "active"
      ) {
        pendingReasonRef.current = null;
        void runRefresh(queuedReason);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void runRefresh("focus");

    let interval: ReturnType<typeof setInterval> | null = null;
    const startInterval = () => {
      if (interval) clearInterval(interval);
      interval = setInterval(
        () => void runRefresh("interval"),
        EVENT_LIVE_REFRESH_INTERVAL_MS,
      );
    };
    const stopInterval = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };

    if (AppState.currentState === "active") startInterval();
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void runRefresh("foreground");
        startInterval();
      } else {
        lifecycleGenerationRef.current += 1;
        pendingReasonRef.current = null;
        stopInterval();
      }
    });

    return () => {
      lifecycleGenerationRef.current += 1;
      focusedRef.current = false;
      pendingReasonRef.current = null;
      stopInterval();
      appStateSubscription.remove();
    };
  }, [runRefresh]));

  return useCallback(
    (reason: EventRefreshReason = "signal") => runRefresh(reason),
    [runRefresh],
  );
}