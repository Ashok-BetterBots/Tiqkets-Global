import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";

interface ParkingInfo {
  eventId: string;
  eventName: string;
  totalSpaces: number;
  occupied: number;
  available: number;
}

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(new URL(path, getApiUrl()), { credentials: "include" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let b: any = null;
    try { b = JSON.parse(t); } catch {}
    const err: any = new Error(b?.error || `Request failed (${res.status})`);
    throw err;
  }
  return res.json();
}

export default function EventParkingScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [info, setInfo] = useState<ParkingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<"increment" | "decrement" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadParking = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const evRes = await fetchJson(`/api/dashboard/events?t=${Date.now()}`);
      const evList = evRes.events || evRes || [];
      const active = evList.find((e: any) => e.status === "published" || e.status === "active") ?? evList[0];
      if (!active) {
        setInfo(null);
        return;
      }
      const stats = await fetchJson(`/api/dashboard/events/${active.id}/stats?t=${Date.now()}`);
      setInfo({
        eventId: active.id,
        eventName: stats.event?.name || active.name,
        totalSpaces: stats.event?.parkingTotalSpaces ?? 0,
        occupied: stats.event?.parkingOccupied ?? 0,
        available: (stats.event?.parkingTotalSpaces ?? 0) - (stats.event?.parkingOccupied ?? 0),
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load parking data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadParking();
    intervalRef.current = setInterval(() => loadParking(true), 15000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadParking]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadParking(true);
  }, [loadParking]);

  const handleAction = useCallback(
    async (action: "increment" | "decrement") => {
      if (!info?.eventId || actionLoading) return;
      setActionLoading(action);
      setError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const res = await apiRequest("POST", `/api/dashboard/events/${info.eventId}/parking`, {
          action,
          value: 1,
        });
        const data = await res.json();
        setInfo((prev) =>
          prev
            ? { ...prev, occupied: data.occupied ?? prev.occupied, available: data.available ?? prev.available }
            : prev,
        );
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (e: any) {
        setError(e?.message || "Update failed");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setActionLoading(null);
      }
    },
    [info?.eventId, actionLoading],
  );

  if (loading && !info) {
    return (
      <ThemedView style={[styles.center, { paddingTop: insets.top + 80 }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  const fillPct = info && info.totalSpaces > 0 ? info.occupied / info.totalSpaces : 0;
  const isFull = info ? info.occupied >= info.totalSpaces : false;
  const isEmpty = info ? info.occupied <= 0 : true;
  const barColor = fillPct > 0.9 ? "#EF4444" : fillPct > 0.7 ? "#F59E0B" : "#10B981";

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + Spacing.lg, paddingBottom: tabBarHeight + Spacing["2xl"] },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: "#EF444418", borderColor: "#EF444433" }]}>
            <Feather name="alert-circle" size={15} color="#EF4444" />
            <ThemedText type="small" style={{ color: "#EF4444", flex: 1 }}>{error}</ThemedText>
          </View>
        ) : null}

        {info ? (
          <>
            <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.xs }}>
              {info.eventName}
            </ThemedText>

            {/* Main occupancy display */}
            <View style={[styles.mainCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.xs }}>
                Current Occupancy
              </ThemedText>
              <View style={styles.occupancyRow}>
                <ThemedText style={{ fontSize: 72, fontWeight: "800", color: theme.text, lineHeight: 80 }}>
                  {info.occupied}
                </ThemedText>
                <View style={styles.totalWrap}>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>of</ThemedText>
                  <ThemedText style={{ fontSize: 28, fontWeight: "700", color: theme.textSecondary }}>
                    {info.totalSpaces}
                  </ThemedText>
                </View>
              </View>

              {/* Progress bar */}
              {info.totalSpaces > 0 ? (
                <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { backgroundColor: barColor, width: `${Math.min(100, fillPct * 100)}%` as any },
                    ]}
                  />
                </View>
              ) : null}

              <View style={styles.statsRow}>
                <View style={styles.statChip}>
                  <View style={[styles.dot, { backgroundColor: "#10B981" }]} />
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    Available: <ThemedText type="small" style={{ fontWeight: "700", color: theme.text }}>{info.available}</ThemedText>
                  </ThemedText>
                </View>
                {isFull ? (
                  <View style={[styles.fullBadge, { backgroundColor: "#EF444418", borderColor: "#EF444440" }]}>
                    <ThemedText type="small" style={{ color: "#EF4444", fontWeight: "700" }}>FULL</ThemedText>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Counter controls */}
            <View style={styles.controlsRow}>
              <Pressable
                onPress={() => handleAction("decrement")}
                disabled={isEmpty || !!actionLoading}
                style={({ pressed }) => [
                  styles.counterBtn,
                  {
                    backgroundColor: isEmpty ? theme.border : "#EF444418",
                    borderColor: isEmpty ? theme.border : "#EF444444",
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
                testID="button-parking-decrement"
              >
                {actionLoading === "decrement" ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Feather name="minus" size={32} color={isEmpty ? theme.textSecondary : "#EF4444"} />
                )}
              </Pressable>

              <View style={[styles.vehicleIcon, { backgroundColor: theme.primary + "15" }]}>
                <Feather name="truck" size={28} color={theme.primary} />
              </View>

              <Pressable
                onPress={() => handleAction("increment")}
                disabled={(isFull && info.totalSpaces > 0) || !!actionLoading}
                style={({ pressed }) => [
                  styles.counterBtn,
                  {
                    backgroundColor: isFull && info.totalSpaces > 0 ? theme.border : "#10B98118",
                    borderColor: isFull && info.totalSpaces > 0 ? theme.border : "#10B98144",
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
                testID="button-parking-increment"
              >
                {actionLoading === "increment" ? (
                  <ActivityIndicator size="small" color="#10B981" />
                ) : (
                  <Feather name="plus" size={32} color={isFull && info.totalSpaces > 0 ? theme.textSecondary : "#10B981"} />
                )}
              </Pressable>
            </View>

            <ThemedText type="small" style={{ textAlign: "center", color: theme.textSecondary, marginTop: Spacing.sm }}>
              Tap + when a vehicle enters, - when it exits
            </ThemedText>
          </>
        ) : (
          <View style={styles.center}>
            <Feather name="map-pin" size={48} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
              No active event found
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  scroll: { paddingHorizontal: Spacing.lg },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  mainCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  occupancyRow: { flexDirection: "row", alignItems: "flex-end", gap: Spacing.md, marginBottom: Spacing.lg },
  totalWrap: { alignItems: "flex-start", paddingBottom: 10 },
  progressBar: { height: 10, borderRadius: 5, overflow: "hidden", marginBottom: Spacing.md },
  progressFill: { height: "100%", borderRadius: 5 },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statChip: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  fullBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  counterBtn: {
    flex: 1,
    height: 80,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
