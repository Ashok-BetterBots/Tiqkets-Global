import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
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

interface EventLocation { id: string; name: string; }
interface EventRow { id: string; name: string; status: string; }
interface EventStats {
  event: {
    id: string; name: string; status: string;
    parkingTotalSpaces: number; parkingOccupied: number;
  };
  locations: EventLocation[];
  totals: {
    registrations: number;
    byStatus: Record<string, number>;
    byLocation: Record<string, number>;
    byLocationGuests: Record<string, { guests: number; inside: number; expected: number; arrived: number; exited: number }>;
    insideGuests: number;
    expectedGuests: number;
    arrivedGuests: number;
    exitedGuests: number;
    expectedNextHour: number;
    advanceRevenue: number;
    avgVisitMinutes: number | null;
  };
  feedback: { count: number; avgOverall: number | null } | null;
  redemptions: { count: number; invoiceTotal: number; redeemedTotal: number } | null;
}

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(new URL(path, getApiUrl()), { credentials: "include" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let b: any = null;
    try { b = JSON.parse(t); } catch {}
    throw new Error(b?.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function fmtPaise(p: number | null | undefined): string {
  const v = (p || 0) / 100;
  if (v >= 100000) return `\u20B9${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `\u20B9${(v / 1000).toFixed(1)}K`;
  return `\u20B9${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    published: "#10B981", active: "#10B981",
    paused: "#F59E0B", draft: "#9CA3AF", ended: "#6B7280",
  };
  return (
    <View style={[styles.statusDot, { backgroundColor: colors[status] ?? "#9CA3AF" }]} />
  );
}

function StatCard({ label, value, icon, accent, small }: {
  label: string; value: string | number;
  icon: keyof typeof Feather.glyphMap; accent?: string; small?: boolean;
}) {
  const { theme } = useTheme();
  const color = accent ?? BRAND;
  if (small) {
    return (
      <View style={[styles.revenueCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.revenueIcon, { backgroundColor: color + "18" }]}>
          <Feather name={icon} size={14} color={color} />
        </View>
        <ThemedText style={{ fontSize: 18, fontWeight: "800", color: theme.text }}>{String(value)}</ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", fontSize: 10 }}>{label}</ThemedText>
      </View>
    );
  }
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
  const { hasPermission, currentUser } = useOrganization();

  const isOwner = hasPermission("org.events.manage");
  const assignedServiceIds: string[] | null = (currentUser as any)?.assignedServiceIds ?? null;

  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [locations, setLocations] = useState<EventLocation[]>([]);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedEventIdRef = useRef<string | null>(null);
  const selectedLocationIdRef = useRef<string | null>(null);

  const visibleLocations = useMemo(() => {
    if (isOwner || !assignedServiceIds || assignedServiceIds.length === 0) return locations;
    return locations.filter((l) => assignedServiceIds.includes(l.id));
  }, [locations, isOwner, assignedServiceIds]);

  const loadStats = useCallback(async (eventId: string, locationId: string | null, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const locQ = locationId ? `&locationId=${encodeURIComponent(locationId)}` : "";
      const s: EventStats = await fetchJson(`/api/dashboard/events/${eventId}/stats?t=${Date.now()}${locQ}`);
      setStats(s);
      setLocations(s.locations || []);
      if (!locationId && !quiet) setSelectedLocationId(null);
    } catch (e: any) {
      if (!quiet) setError(e?.message || "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInitial = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const evRes = await fetchJson(`/api/dashboard/events?t=${Date.now()}`);
      const evList: EventRow[] = evRes.events || evRes || [];
      setEvents(evList);
      if (evList.length === 0) { setLoading(false); setRefreshing(false); return; }
      const active = evList.find((e) => e.status === "published" || e.status === "active") ?? evList[0];
      setSelectedEventId((prev) => {
        const useId = prev && evList.find((e) => e.id === prev) ? prev : active.id;
        loadStats(useId, selectedLocationId, quiet);
        return useId;
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load events");
    } finally {
      setRefreshing(false);
      if (quiet) setLoading(false);
    }
  }, [loadStats, selectedLocationId]);

  useEffect(() => { selectedEventIdRef.current = selectedEventId; }, [selectedEventId]);
  useEffect(() => { selectedLocationIdRef.current = selectedLocationId; }, [selectedLocationId]);

  useEffect(() => {
    loadInitial();
    intervalRef.current = setInterval(() => {
      const evId = selectedEventIdRef.current;
      if (evId) {
        loadStats(evId, selectedLocationIdRef.current, true);
      }
    }, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadInitial(true);
  }, [loadInitial]);

  const selectEvent = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
    setSelectedLocationId(null);
    setLoading(true);
    loadStats(eventId, null);
  }, [loadStats]);

  const selectLocation = useCallback((locId: string | null) => {
    setSelectedLocationId(locId);
    if (selectedEventId) loadStats(selectedEventId, locId, true);
  }, [selectedEventId, loadStats]);

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
        <Feather name="alert-circle" size={40} color="#EF4444" />
        <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
          {error}
        </ThemedText>
        <Pressable onPress={() => loadInitial()} style={[styles.retryBtn, { borderColor: BRAND }]}>
          <ThemedText type="body" style={{ color: BRAND, fontWeight: "600" }}>Try Again</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const ev = stats?.event;
  const totals = stats?.totals;
  const checkedIn = totals?.byStatus?.checked_in ?? 0;
  const billingDone = stats?.redemptions?.count ?? 0;
  const exited = (totals?.byStatus?.exited ?? 0) + (totals?.byStatus?.feedback_submitted ?? 0);
  const insideNow = totals?.insideGuests ?? 0;
  const expectedNextHour = totals?.expectedNextHour ?? 0;
  const advanceRevenue = totals?.advanceRevenue ?? 0;
  const billingTotal = stats?.redemptions?.invoiceTotal ?? 0;
  const balanceDue = (stats?.redemptions?.invoiceTotal ?? 0) - (stats?.redemptions?.redeemedTotal ?? 0);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + Spacing.lg, paddingBottom: tabBarHeight + Spacing["2xl"] },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Event picker */}
        {events.length > 1 ? (
          <View style={styles.pickerSection}>
            <ThemedText type="small" style={[styles.pickerLabel, { color: theme.textSecondary }]}>EVENT</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
              {events.map((e) => {
                const active = e.id === selectedEventId;
                return (
                  <Pressable
                    key={e.id}
                    onPress={() => selectEvent(e.id)}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: active ? BRAND : theme.surface,
                        borderColor: active ? BRAND : theme.border,
                      },
                    ]}
                    testID={`pill-event-${e.id}`}
                  >
                    <StatusDot status={e.status} />
                    <ThemedText
                      type="small"
                      style={{ color: active ? "#fff" : theme.text, fontWeight: "600" }}
                      numberOfLines={1}
                    >
                      {e.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Location picker */}
        {visibleLocations.length > 0 ? (
          <View style={styles.pickerSection}>
            <ThemedText type="small" style={[styles.pickerLabel, { color: theme.textSecondary }]}>LOCATION</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
              {isOwner ? (
                <Pressable
                  onPress={() => selectLocation(null)}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: selectedLocationId === null ? BRAND : theme.surface,
                      borderColor: selectedLocationId === null ? BRAND : theme.border,
                    },
                  ]}
                  testID="pill-location-all"
                >
                  <ThemedText
                    type="small"
                    style={{ color: selectedLocationId === null ? "#fff" : theme.text, fontWeight: "600" }}
                  >
                    All Locations
                  </ThemedText>
                </Pressable>
              ) : null}
              {visibleLocations.map((loc) => {
                const active = loc.id === selectedLocationId;
                return (
                  <Pressable
                    key={loc.id}
                    onPress={() => selectLocation(loc.id)}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: active ? BRAND : theme.surface,
                        borderColor: active ? BRAND : theme.border,
                      },
                    ]}
                    testID={`pill-location-${loc.id}`}
                  >
                    <ThemedText
                      type="small"
                      style={{ color: active ? "#fff" : theme.text, fontWeight: "600" }}
                      numberOfLines={1}
                    >
                      {loc.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Event name + manage */}
        {ev ? (
          <>
            <View style={styles.eventHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText type="h3" numberOfLines={2}>{ev.name}</ThemedText>
                {selectedLocationId ? (
                  <ThemedText type="small" style={{ color: BRAND, marginTop: 2, fontWeight: "600" }}>
                    {visibleLocations.find((l) => l.id === selectedLocationId)?.name ?? ""}
                  </ThemedText>
                ) : null}
              </View>
              {isOwner ? (
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

            {/* Main stats grid */}
            <View style={styles.grid}>
              <StatCard
                label="Total Registered"
                value={totals?.registrations ?? 0}
                icon="clipboard"
                accent={BRAND}
              />
              <StatCard
                label="Checked In"
                value={checkedIn}
                icon="log-in"
                accent="#10B981"
              />
              <StatCard
                label="Inside Now"
                value={insideNow}
                icon="users"
                accent="#8B5CF6"
              />
              <StatCard
                label="Billing Done"
                value={billingDone}
                icon="credit-card"
                accent="#EC4899"
              />
              <StatCard
                label="Exited"
                value={exited}
                icon="log-out"
                accent="#6B7280"
              />
              <StatCard
                label="Expected in 1h"
                value={expectedNextHour}
                icon="clock"
                accent="#F59E0B"
              />
            </View>

            {/* Revenue row (owner only) */}
            {isOwner ? (
              <View style={styles.revenueSection}>
                <View style={styles.revenueSectionHeader}>
                  <Feather name="trending-up" size={14} color={BRAND} />
                  <ThemedText type="small" style={{ color: BRAND, fontWeight: "700", marginLeft: Spacing.xs }}>
                    REVENUE
                  </ThemedText>
                </View>
                <View style={styles.revenueRow}>
                  <StatCard
                    label="Advance"
                    value={fmtPaise(advanceRevenue)}
                    icon="dollar-sign"
                    accent="#10B981"
                    small
                  />
                  <StatCard
                    label="Billed"
                    value={fmtPaise(billingTotal)}
                    icon="file-text"
                    accent="#3B82F6"
                    small
                  />
                  <StatCard
                    label="Balance Due"
                    value={fmtPaise(balanceDue)}
                    icon="alert-circle"
                    accent={balanceDue > 0 ? "#EF4444" : "#10B981"}
                    small
                  />
                </View>
              </View>
            ) : null}

            {/* Parking summary */}
            {ev.parkingTotalSpaces > 0 ? (
              <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.sectionHeader}>
                  <Feather name="map-pin" size={16} color={BRAND} />
                  <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.sm }}>Parking</ThemedText>
                  <View style={{ flex: 1 }} />
                  <ThemedText type="small" style={{ color: theme.textSecondary, fontWeight: "600" }}>
                    {ev.parkingOccupied} / {ev.parkingTotalSpaces}
                  </ThemedText>
                </View>
                <View style={[styles.parkingBar, { backgroundColor: theme.border }]}>
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
                <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "right" }}>
                  {Math.max(0, ev.parkingTotalSpaces - ev.parkingOccupied)} available
                </ThemedText>
              </View>
            ) : null}

            {/* Feedback */}
            {stats?.feedback?.count ? (
              <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.sectionHeader}>
                  <Feather name="star" size={16} color="#F59E0B" />
                  <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.sm }}>Feedback</ThemedText>
                  <View style={{ flex: 1 }} />
                  <ThemedText type="small" style={{ color: "#F59E0B", fontWeight: "700" }}>
                    {stats.feedback.count} responses
                  </ThemedText>
                </View>
                {stats.feedback.avgOverall ? (
                  <View style={styles.feedbackRating}>
                    {[1, 2, 3, 4, 5].map((s) => {
                      const avg = parseFloat(String(stats.feedback!.avgOverall));
                      return (
                        <Feather
                          key={s}
                          name="star"
                          size={18}
                          color={s <= Math.round(avg) ? "#F59E0B" : theme.border}
                        />
                      );
                    })}
                    <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.sm }}>
                      {parseFloat(String(stats.feedback.avgOverall)).toFixed(1)} / 5
                    </ThemedText>
                  </View>
                ) : null}
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
  pickerSection: { marginBottom: Spacing.md },
  pickerLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: Spacing.xs },
  pillsRow: { gap: Spacing.sm, paddingRight: Spacing.xs },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    maxWidth: 180,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  eventHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: Spacing.xl,
    marginTop: Spacing.sm,
    gap: Spacing.md,
  },
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
  revenueSection: {
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BRAND + "30",
    backgroundColor: BRAND + "08",
    overflow: "hidden",
  },
  revenueSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  revenueRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  revenueCard: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  revenueIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  section: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  parkingBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  parkingFill: { height: "100%", borderRadius: 3 },
  feedbackRating: { flexDirection: "row", alignItems: "center", gap: 2 },
  retryBtn: {
    marginTop: Spacing.lg,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
});
