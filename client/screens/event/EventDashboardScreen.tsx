import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { OrgStackParamList } from "@/navigation/OrgStackNavigator";

const BRAND = BrandColors.primary;

type NavigationProp = NativeStackNavigationProp<OrgStackParamList>;

interface EventStats {
  event: {
    id: string;
    name: string;
    status: string;
    parkingTotalSpaces: number;
    parkingOccupied: number;
  };
  totals: {
    registrations: number;
    byStatus: Record<string, number>;
    insideGuests: number;
    expectedGuests: number;
    arrivedGuests: number;
    exitedGuests: number;
    advanceRevenue: number;
    avgVisitMinutes: number | null;
    invalidScans: number;
    duplicateAttempts: number;
  };
  feedback: { count: number; avgOverall: number | null } | null;
  redemptions: { count: number; invoiceTotal: number; redeemedTotal: number } | null;
}

interface EventRow {
  id: string;
  name: string;
  status: string;
}

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(new URL(path, getApiUrl()), { credentials: "include" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let b: any = null;
    try { b = JSON.parse(t); } catch {}
    const err: any = new Error(b?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function fmtPaise(p: number | null | undefined): string {
  const v = (p || 0) / 100;
  return `\u20B9${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function StatusBadge({ status }: { status: string }) {
  const { theme } = useTheme();
  const colors: Record<string, string> = {
    published: "#10B981",
    active: "#10B981",
    paused: "#F59E0B",
    draft: theme.textSecondary,
    ended: theme.textSecondary,
  };
  const color = colors[status] ?? theme.textSecondary;
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <ThemedText type="small" style={{ color, fontWeight: "700" }}>{label}</ThemedText>
    </View>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Feather.glyphMap;
  accent?: string;
}) {
  const { theme } = useTheme();
  const color = accent ?? BRAND;
  return (
    <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <ThemedText type="h3" style={[styles.statValue, { color: theme.text }]}>{String(value)}</ThemedText>
      <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>{label}</ThemedText>
    </View>
  );
}

export default function EventDashboardScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { hasPermission, organization } = useOrganization();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const evRes = await fetchJson(`/api/dashboard/events?t=${Date.now()}`);
      const evList: EventRow[] = evRes.events || evRes || [];
      setEvents(evList);
      const active = evList.find((e) => e.status === "published" || e.status === "active") ?? evList[0];
      if (active) {
        setSelectedEventId(active.id);
        const s = await fetchJson(`/api/dashboard/events/${active.id}/stats?t=${Date.now()}`);
        setStats(s);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load event data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(() => loadData(true), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  const isAdmin = hasPermission("org.events.manage");
  const canManage = isAdmin;

  if (loading && !stats) {
    return (
      <ThemedView style={[styles.center, { paddingTop: insets.top + 60 }]}>
        <ActivityIndicator size="large" color={BRAND} />
      </ThemedView>
    );
  }

  if (error && !stats) {
    return (
      <ThemedView style={[styles.center, { paddingTop: insets.top + 60 }]}>
        <Feather name="alert-circle" size={40} color={theme.error ?? "#EF4444"} />
        <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
          {error}
        </ThemedText>
        <Pressable onPress={() => loadData()} style={[styles.retryBtn, { borderColor: BRAND }]}>
          <ThemedText type="body" style={{ color: BRAND, fontWeight: "600" }}>Try Again</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const ev = stats?.event;
  const totals = stats?.totals;
  const checkedIn = totals?.byStatus?.checked_in ?? 0;
  const arrived = totals?.byStatus?.arrived ?? 0;
  const exited = (totals?.byStatus?.exited ?? 0) + (totals?.byStatus?.feedback_submitted ?? 0);
  const insideNow = totals?.insideGuests ?? (checkedIn + arrived);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + Spacing.lg, paddingBottom: tabBarHeight + Spacing["2xl"] },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />
        }
        showsVerticalScrollIndicator={false}
      >
        {ev ? (
          <>
            <View style={styles.eventHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText type="h3" numberOfLines={2}>{ev.name}</ThemedText>
                <View style={{ marginTop: Spacing.xs }}>
                  <StatusBadge status={ev.status} />
                </View>
              </View>
              {canManage ? (
                <Pressable
                  onPress={() => navigation.navigate("OrgEventManage")}
                  style={[styles.manageBtn, { backgroundColor: BRAND + "15", borderColor: BRAND + "40" }]}
                  testID="button-event-manage"
                >
                  <Feather name="settings" size={16} color={BRAND} />
                  <ThemedText type="small" style={{ color: BRAND, fontWeight: "600" }}>Manage</ThemedText>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.grid}>
              <StatCard label="Inside Now" value={insideNow} icon="users" accent="#8B5CF6" />
              <StatCard label="Total Registered" value={totals?.registrations ?? 0} icon="clipboard" />
              <StatCard label="Checked In" value={checkedIn} icon="log-in" accent="#10B981" />
              <StatCard label="Exited" value={exited} icon="log-out" accent="#6B7280" />
              <StatCard label="Advance Revenue" value={fmtPaise(totals?.advanceRevenue)} icon="dollar-sign" accent="#F59E0B" />
              {stats?.redemptions ? (
                <StatCard
                  label="Billing Done"
                  value={stats.redemptions.count}
                  icon="credit-card"
                  accent="#EC4899"
                />
              ) : null}
            </View>

            {stats?.feedback?.count ? (
              <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.sectionHeader}>
                  <Feather name="star" size={16} color="#F59E0B" />
                  <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.sm }}>Feedback</ThemedText>
                </View>
                <View style={styles.row}>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>Responses</ThemedText>
                  <ThemedText type="body" style={{ fontWeight: "600" }}>{stats.feedback.count}</ThemedText>
                </View>
                {stats.feedback.avgOverall ? (
                  <View style={styles.row}>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>Avg Rating</ThemedText>
                    <ThemedText type="body" style={{ fontWeight: "600", color: "#F59E0B" }}>
                      {stats.feedback.avgOverall.toFixed(1)} / 5
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            ) : null}

            {ev.parkingTotalSpaces > 0 ? (
              <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.sectionHeader}>
                  <Feather name="map-pin" size={16} color={BRAND} />
                  <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.sm }}>Parking</ThemedText>
                </View>
                <View style={styles.row}>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>Occupied / Total</ThemedText>
                  <ThemedText type="body" style={{ fontWeight: "600" }}>
                    {ev.parkingOccupied} / {ev.parkingTotalSpaces}
                  </ThemedText>
                </View>
                <View style={styles.parkingBar}>
                  <View
                    style={[
                      styles.parkingFill,
                      {
                        backgroundColor: BRAND,
                        width: `${Math.min(100, (ev.parkingOccupied / ev.parkingTotalSpaces) * 100)}%` as any,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.center}>
            <Feather name="calendar" size={48} color={theme.textSecondary} />
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
  eventHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: Spacing["2xl"],
    gap: Spacing.md,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    gap: 5,
    marginTop: 4,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    width: "47.5%",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.xs,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  statValue: { fontWeight: "800" },
  section: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: Spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  parkingBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
    marginTop: Spacing.xs,
  },
  parkingFill: { height: "100%", borderRadius: 3 },
  retryBtn: {
    marginTop: Spacing.lg,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
});
