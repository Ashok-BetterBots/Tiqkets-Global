import React, { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ProfileModal } from "@/components/ProfileModal";
import { EventManualRegModal } from "@/components/EventManualRegModal";
import { getRoleLabel } from "@/types/organization";
import { getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { OrgStackParamList } from "@/navigation/OrgStackNavigator";
import {
  notifyEventDataChanged,
  subscribeToEventDataChanges,
} from "@/lib/event-live-refresh";
import { useEventLiveRefresh } from "@/hooks/useEventLiveRefresh";

const BRAND = BrandColors.primary;

type NavigationProp = NativeStackNavigationProp<OrgStackParamList>;

interface EventLocation { id: string; name: string; }
interface EventRow { id: string; name: string; status: string; branchId?: string; }
interface EventStats {
  event: {
    id: string; name: string; status: string;
    parkingEnabled?: boolean; parkingTotalSpaces: number; parkingOccupied: number;
  };
  locations: EventLocation[];
  totals: {
    registrations: number;
    storeRegistrations: number;
    customerRegistrations: number;
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
  redemptions: { count: number; invoiceTotal: number; redeemedTotal: number; customerPaid: number } | null;
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

function getInitials(name?: string | null): string {
  if (!name) return "OR";
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
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

function StatCard({ label, value, icon, accent }: {
  label: string; value: string | number;
  icon: keyof typeof Feather.glyphMap; accent?: string;
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

function RevenueCard({ label, value, icon, accent }: {
  label: string; value: string;
  icon: keyof typeof Feather.glyphMap; accent?: string;
}) {
  const { theme } = useTheme();
  const color = accent ?? BRAND;
  return (
    <View style={[styles.revenueCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.revenueIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={14} color={color} />
      </View>
      <ThemedText style={{ fontSize: 22, fontWeight: "800", color: theme.text }}>{value}</ThemedText>
      <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", fontSize: 10 }}>{label}</ThemedText>
    </View>
  );
}

function PickerModal<T extends { id: string; name: string; status?: string }>({
  visible,
  onClose,
  title,
  items,
  selectedId,
  onSelect,
  allLabel,
  onSelectAll,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  allLabel?: string;
  onSelectAll?: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.modalSheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />
        <View style={styles.modalHeader}>
          <ThemedText type="h4" style={{ fontWeight: "700" }}>{title}</ThemedText>
          <Pressable onPress={onClose} style={styles.modalClose} testID="button-modal-close">
            <Feather name="x" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={
            allLabel && onSelectAll ? (
              <Pressable
                onPress={() => { onSelectAll(); onClose(); }}
                style={[
                  styles.modalItem,
                  { borderBottomColor: theme.border },
                  selectedId === null && { backgroundColor: BRAND + "10" },
                ]}
                testID="modal-item-all"
              >
                <View style={[styles.modalItemIcon, { backgroundColor: BRAND + "15" }]}>
                  <Feather name="layers" size={16} color={BRAND} />
                </View>
                <ThemedText type="body" style={{ flex: 1, fontWeight: selectedId === null ? "700" : "400" }}>
                  {allLabel}
                </ThemedText>
                {selectedId === null && <Feather name="check" size={18} color={BRAND} />}
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => {
            const selected = item.id === selectedId;
            return (
              <Pressable
                onPress={() => { onSelect(item.id); onClose(); }}
                style={[
                  styles.modalItem,
                  { borderBottomColor: theme.border },
                  selected && { backgroundColor: BRAND + "10" },
                ]}
                testID={`modal-item-${item.id}`}
              >
                {item.status != null && <StatusDot status={item.status} />}
                {item.status == null && (
                  <View style={[styles.modalItemIcon, { backgroundColor: BRAND + "15" }]}>
                    <Feather name="map-pin" size={16} color={BRAND} />
                  </View>
                )}
                <ThemedText type="body" style={{ flex: 1, fontWeight: selected ? "700" : "400" }}>
                  {item.name}
                </ThemedText>
                {selected && <Feather name="check" size={18} color={BRAND} />}
              </Pressable>
            );
          }}
          scrollEnabled={items.length > 6}
          style={{ maxHeight: 360 }}
        />
      </View>
    </Modal>
  );
}

export default function EventDashboardScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { hasPermission, currentUser, organization, updateCurrentUser, changePassword, logoutOrganization } = useOrganization();
  const [showProfileModal, setShowProfileModal] = useState(false);

  const animScrollY = useRef(new Animated.Value(0)).current;
  const avatarSize = useMemo(
    () => animScrollY.interpolate({ inputRange: [0, 60], outputRange: [46, 34], extrapolate: "clamp" }),
    [],
  );
  const avatarRadius = useMemo(
    () => animScrollY.interpolate({ inputRange: [0, 60], outputRange: [23, 17], extrapolate: "clamp" }),
    [],
  );
  const titleFontSize = useMemo(
    () => animScrollY.interpolate({ inputRange: [0, 60], outputRange: [20, 14], extrapolate: "clamp" }),
    [],
  );
  const subtitleFontSize = useMemo(
    () => animScrollY.interpolate({ inputRange: [0, 60], outputRange: [14, 10], extrapolate: "clamp" }),
    [],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitleAlign: "left",
      headerLeft: () =>
        currentUser ? (
          <Pressable onPress={() => setShowProfileModal(true)} style={{ marginLeft: 16, marginRight: 10 }}>
            <Animated.View style={{ width: avatarSize, height: avatarSize, borderRadius: avatarRadius, backgroundColor: BRAND + "18", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {currentUser.profilePictureUrl ? (
                <Animated.Image source={{ uri: currentUser.profilePictureUrl }} style={{ width: avatarSize, height: avatarSize, borderRadius: avatarRadius }} />
              ) : (
                <ThemedText style={{ color: BRAND, fontWeight: "700", fontSize: 13, lineHeight: 16 }}>
                  {getInitials(currentUser.name || organization?.name)}
                </ThemedText>
              )}
            </Animated.View>
          </Pressable>
        ) : null,
      headerTitle: () => (
        <Pressable onPress={() => setShowProfileModal(true)} style={{ alignItems: "flex-start" }}>
          <Animated.Text
            numberOfLines={1}
            style={{ fontFamily: "Nunito_800ExtraBold", fontSize: titleFontSize, color: theme.text, letterSpacing: -0.4 }}
          >
            {organization?.name || "Dashboard"}
          </Animated.Text>
          {currentUser ? (
            <Animated.Text
              numberOfLines={1}
              style={{ fontFamily: "Nunito_600SemiBold", fontSize: subtitleFontSize, color: BRAND, marginTop: 1 }}
            >
              {getRoleLabel(currentUser.role)}
            </Animated.Text>
          ) : null}
        </Pressable>
      ),
      headerRight: () => null,
    });
  }, [navigation, currentUser, organization, theme]);

  const isOwner = hasPermission("org.events.manage");
  const canRegisterAttendees = isOwner || hasPermission("org.events.billing");
  const assignedServiceIds: string[] | null = (currentUser as any)?.assignedServiceIds ?? null;

  const {
    data: eventsData,
    isLoading: eventsLoading,
    isFetching: eventsFetching,
    error: eventsQueryError,
    refetch: refetchEvents,
  } = useQuery<{ events: EventRow[] } | EventRow[]>({
    queryKey: ["/api/dashboard/events"],
    staleTime: 15000,
  });
  const events: EventRow[] = useMemo(() => {
    const raw: any = eventsData;
    return (raw?.events ?? raw ?? []) as EventRow[];
  }, [eventsData]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [locations, setLocations] = useState<EventLocation[]>([]);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const selectedEventIdRef = useRef<string | null>(null);
  const selectedLocationIdRef = useRef<string | null>(null);
  const statsRequestSeqRef = useRef(0);

  const visibleLocations = useMemo(() => {
    if (isOwner || !assignedServiceIds || assignedServiceIds.length === 0) return locations;
    return locations.filter((l) => assignedServiceIds.includes(l.id));
  }, [locations, isOwner, assignedServiceIds]);

  const selectedEvent = useMemo(() => events.find((e) => e.id === selectedEventId) ?? null, [events, selectedEventId]);
  const selectedLocation = useMemo(() => visibleLocations.find((l) => l.id === selectedLocationId) ?? null, [visibleLocations, selectedLocationId]);

  const loadStats = useCallback(async (eventId: string, locationId: string | null, quiet = false) => {
    const requestSeq = ++statsRequestSeqRef.current;
    if (!quiet) setLoading(true);
    try {
      const locQ = locationId ? `&locationId=${encodeURIComponent(locationId)}` : "";
      const s: EventStats = await fetchJson(`/api/dashboard/events/${eventId}/stats?t=${Date.now()}${locQ}`);
      if (requestSeq === statsRequestSeqRef.current) {
        setStats(s);
        setLocations(s.locations || []);
      }
    } catch (e: any) {
      if (requestSeq === statsRequestSeqRef.current && !quiet) setError(e?.message || "Failed to load stats");
    } finally {
      if (requestSeq === statsRequestSeqRef.current) setLoading(false);
    }
  }, []);

  // Whenever the shared events cache resolves/changes, pick an active event
  // (preserving the current selection when still valid) and load its stats.
  // This reacts to data fetched by ANY screen sharing this query key (e.g. a
  // prefetch during login hydration), so the Dashboard no longer needs its
  // own independent, possibly-racy fetch on mount.
  useEffect(() => {
    if (eventsLoading) return;
    if (eventsQueryError) {
      setError((eventsQueryError as any)?.message || "Failed to load events");
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    if (events.length === 0) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const active = events.find((e) => e.status === "published" || e.status === "active") ?? events[0];
    setSelectedEventId((prev) => {
      const useId = prev && events.find((e) => e.id === prev) ? prev : active.id;
      loadStats(useId, selectedLocationIdRef.current, false);
      return useId;
    });
  }, [events, eventsLoading, eventsQueryError, loadStats]);

  useEffect(() => { selectedEventIdRef.current = selectedEventId; }, [selectedEventId]);
  useEffect(() => { selectedLocationIdRef.current = selectedLocationId; }, [selectedLocationId]);

  const refreshSelectedStats = useCallback(() => {
    const evId = selectedEventIdRef.current;
    if (evId) return loadStats(evId, selectedLocationIdRef.current, true);
    return Promise.resolve();
  }, [loadStats]);

  const triggerStatsRefresh = useEventLiveRefresh(() => refreshSelectedStats());

  useEffect(() => subscribeToEventDataChanges((changedEventId) => {
    const selectedId = selectedEventIdRef.current;
    if (selectedId && (!changedEventId || changedEventId === selectedId)) {
      void triggerStatsRefresh();
    }
  }), [triggerStatsRefresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchEvents();
    if (selectedEventIdRef.current) {
      await loadStats(selectedEventIdRef.current, selectedLocationIdRef.current, true);
    }
    setRefreshing(false);
  }, [refetchEvents, loadStats]);

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
        <Pressable onPress={() => refetchEvents()} style={[styles.retryBtn, { borderColor: BRAND }]}>
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
  const billedAmount = stats?.redemptions?.invoiceTotal ?? 0;
  const customerPaid = stats?.redemptions?.customerPaid ?? 0;

  return (
    <ThemedView style={styles.container}>
      <Animated.ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + Spacing.sm, paddingBottom: tabBarHeight + Spacing["2xl"] },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: animScrollY } } }], { useNativeDriver: false })}
      >
        {/* Filter section card */}
        <View style={[styles.filterCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* Event selector row */}
          <View style={styles.filterRow}>
            <View style={styles.filterLabelCol}>
              <ThemedText style={[styles.filterLabel, { color: theme.textSecondary }]}>EVENT</ThemedText>
              <Pressable
                onPress={() => events.length > 1 ? setEventModalOpen(true) : undefined}
                style={[styles.selectorBtn, { borderColor: theme.border, backgroundColor: theme.backgroundRoot }]}
                testID="button-event-selector"
              >
                {selectedEvent ? <StatusDot status={selectedEvent.status} /> : null}
                <ThemedText
                  type="body"
                  style={{ flex: 1, fontWeight: "600", color: theme.text }}
                  numberOfLines={1}
                >
                  {selectedEvent?.name ?? "No event"}
                </ThemedText>
                {events.length > 1 ? <Feather name="chevron-down" size={16} color={theme.textSecondary} /> : null}
              </Pressable>
            </View>

            {canRegisterAttendees && selectedEvent?.status !== "paused" ? (
              <View style={{ flexDirection: "row", gap: Spacing.xs }}>
                <Pressable
                  onPress={() => setAddCustomerOpen(true)}
                  style={[styles.manageBtn, { backgroundColor: BRAND, borderColor: BRAND }]}
                  testID="button-add-customer"
                >
                  <Feather name="user-plus" size={14} color="#FFF" />
                  <ThemedText type="small" style={{ color: "#FFF", fontWeight: "700" }}>Add</ThemedText>
                </Pressable>

                {isOwner ? <Pressable
                  onPress={() => navigation.navigate("OrgEventManage")}
                  style={[styles.manageBtn, styles.manageBtnIconOnly, { backgroundColor: BRAND + "15", borderColor: BRAND + "40" }]}
                  testID="button-event-manage"
                >
                  <Feather name="settings" size={16} color={BRAND} />
                </Pressable> : null}
              </View>
            ) : null}
          </View>

          {/* Location selector row */}
          {visibleLocations.length > 0 ? (
            <View style={[styles.filterRow, { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <View style={styles.filterLabelCol}>
                <ThemedText style={[styles.filterLabel, { color: theme.textSecondary }]}>LOCATION</ThemedText>
                <Pressable
                  onPress={() => setLocationModalOpen(true)}
                  style={[styles.selectorBtn, { borderColor: theme.border, backgroundColor: theme.backgroundRoot }]}
                  testID="button-location-selector"
                >
                  <Feather name="map-pin" size={14} color={BRAND} />
                  <ThemedText
                    type="body"
                    style={{ flex: 1, fontWeight: "600", color: theme.text }}
                    numberOfLines={1}
                  >
                    {selectedLocation?.name ?? (isOwner ? "All Locations" : visibleLocations[0]?.name ?? "Location")}
                  </ThemedText>
                  <Feather name="chevron-down" size={16} color={theme.textSecondary} />
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        {ev ? (
          <>
            {/* Main stats grid */}
            <View style={styles.grid}>
              <StatCard
                label="Total Registered"
                value={totals?.registrations ?? 0}
                icon="clipboard"
                accent={BRAND}
              />
              <StatCard
                label="Store Registrations"
                value={totals?.storeRegistrations ?? 0}
                icon="shopping-bag"
                accent="#0EA5E9"
              />
              <StatCard
                label="Customer Registrations"
                value={totals?.customerRegistrations ?? 0}
                icon="smartphone"
                accent="#F97316"
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
                  <RevenueCard
                    label="Advance Paid"
                    value={fmtPaise(advanceRevenue)}
                    icon="dollar-sign"
                    accent="#10B981"
                  />
                  <RevenueCard
                    label="Billed Amount"
                    value={fmtPaise(billedAmount)}
                    icon="file-text"
                    accent="#3B82F6"
                  />
                  <RevenueCard
                    label="Customer Paid"
                    value={fmtPaise(customerPaid)}
                    icon="check-circle"
                    accent="#8B5CF6"
                  />
                </View>
              </View>
            ) : null}

            {/* Parking summary */}
            {ev.parkingEnabled !== false && ev.parkingTotalSpaces > 0 ? (
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

          </>
        ) : (
          <View style={styles.center}>
            <Feather name="calendar" size={48} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
              No active event found
            </ThemedText>
          </View>
        )}
      </Animated.ScrollView>

      {/* Profile modal */}
      {currentUser ? (
        <ProfileModal
          visible={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          user={currentUser}
          onUpdateUser={updateCurrentUser}
          onChangePassword={changePassword}
          onLogout={logoutOrganization}
        />
      ) : null}

      {/* Event picker modal */}
      <PickerModal
        visible={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        title="Select Event"
        items={events}
        selectedId={selectedEventId}
        onSelect={selectEvent}
      />

      {/* Location picker modal */}
      <PickerModal
        visible={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        title="Select Location"
        items={visibleLocations}
        selectedId={selectedLocationId}
        onSelect={(id) => selectLocation(id)}
        allLabel={isOwner ? "All Locations" : undefined}
        onSelectAll={isOwner ? () => selectLocation(null) : undefined}
      />

      {/* Add Customer (manual registration) modal */}
      <EventManualRegModal
        visible={addCustomerOpen}
        onClose={() => setAddCustomerOpen(false)}
        branchId={selectedEvent?.branchId ?? null}
        eventId={selectedEventId}
        eventName={selectedEvent?.name}
        onSuccess={() => {
          if (selectedEventId) {
            notifyEventDataChanged(selectedEventId);
          }
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  scroll: { paddingHorizontal: Spacing.lg },

  filterCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
  },
  filterLabelCol: {
    flex: 1,
    gap: 4,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  selectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    minHeight: 44,
  },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignSelf: "flex-end",
    minHeight: 44,
  },
  manageBtnIconOnly: {
    paddingHorizontal: 0,
    width: 44,
  },

  statusDot: { width: 7, height: 7, borderRadius: 3.5 },


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
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  parkingBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: Spacing.xs,
  },
  parkingFill: {
    height: "100%",
    borderRadius: 4,
  },
  retryBtn: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.sm,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  modalClose: {
    padding: Spacing.xs,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
