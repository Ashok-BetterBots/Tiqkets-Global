import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";
import { OrgStackParamList } from "@/navigation/OrgStackNavigator";

type NavigationProp = NativeStackNavigationProp<OrgStackParamList, "OrgEvents">;

interface EventRow {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  registrationFee: number;
  parkingTotalSpaces: number;
  parkingOccupied: number;
}

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
    byLocation?: Record<string, number>;
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

function fmtPaise(paise: number | null | undefined): string {
  const v = (paise || 0) / 100;
  return `\u20B9${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

async function getJson(path: string): Promise<any> {
  const res = await fetch(new URL(path, getApiUrl()), { credentials: "include" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {}
    const err: any = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

export default function OrgEventsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme, isDark } = useTheme();
  const { getAccessibleBranches, hasPermission } = useOrganization();
  const branches = getAccessibleBranches();

  const canManage = hasPermission("org.events.manage");
  const canSecurity = hasPermission("org.events.security");
  const canBilling = hasPermission("org.events.billing");
  const canParking = hasPermission("org.events.parking");
  const canSupport = hasPermission("org.events.support");

  const [branchId, setBranchId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!branchId && branches.length > 0) setBranchId(branches[0].id);
  }, [branches, branchId]);

  // Shared queryKey (matches OrgEventManageScreen) so this screen paints
  // instantly from cache when the branch's events were already prefetched
  // during login hydration or fetched by another screen.
  const {
    data: eventsData,
    isLoading: eventsListLoading,
    error: eventsListError,
    refetch: refetchEventsList,
  } = useQuery<{ events: EventRow[] } | EventRow[]>({
    queryKey: ["/api/dashboard/events/branch", branchId],
    enabled: !!branchId,
    staleTime: 15000,
  });

  const eventsList: EventRow[] = useMemo(() => {
    const raw: any = eventsData;
    return (raw?.events ?? raw ?? []) as EventRow[];
  }, [eventsData]);

  const loading = eventsListLoading;
  const error = eventsListError ? ((eventsListError as any)?.message || "Failed to load events") : null;

  useEffect(() => {
    setEventId((prev) => {
      if (prev && eventsList.some((r) => r.id === prev)) return prev;
      const active = eventsList.find((r) => r.status === "published") || eventsList[0];
      return active ? active.id : null;
    });
  }, [eventsList]);

  const loadStats = useCallback(async (eid: string, locId: string | null) => {
    try {
      const locQs = locId ? `&locationId=${encodeURIComponent(locId)}` : "";
      const data = await getJson(`/api/dashboard/events/${eid}/stats?t=${Date.now()}${locQs}`);
      setStats(data);
    } catch {
      // keep last-known stats on transient errors
    }
  }, []);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!eventId) {
      setStats(null);
      return;
    }
    loadStats(eventId, locationId);
    pollRef.current = setInterval(() => loadStats(eventId, locationId), 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [eventId, locationId, loadStats]);

  // Reset the location filter whenever the branch changes so a stale location
  // id from another branch never leaks into the stats query.
  useEffect(() => {
    setLocationId(null);
  }, [branchId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchEventsList();
    if (eventId) await loadStats(eventId, locationId);
    setRefreshing(false);
  }, [refetchEventsList, eventId, locationId, loadStats]);

  const selectedEvent = useMemo(
    () => eventsList.find((e) => e.id === eventId) || null,
    [eventsList, eventId],
  );

  // Locations (services) on the currently-selected branch drive the location
  // filter chips. Only active locations are offered.
  const branchLocations = useMemo(() => {
    const b = branches.find((x) => x.id === branchId);
    return (b?.services || []).filter((s) => s.isActive);
  }, [branches, branchId]);

  const cardBg = isDark ? theme.backgroundDefault : "#FFFFFF";

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing["3xl"] },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        {branches.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {branches.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => setBranchId(b.id)}
                style={[
                  styles.chip,
                  branchId === b.id
                    ? { backgroundColor: theme.primary }
                    : { backgroundColor: cardBg, borderWidth: 1, borderColor: theme.border },
                ]}
                testID={`chip-events-branch-${b.id}`}
              >
                <ThemedText
                  type="small"
                  style={{ color: branchId === b.id ? "#FFFFFF" : theme.text, fontWeight: "600" }}
                >
                  {b.name}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : error ? (
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <ThemedText type="body" style={{ color: theme.error }}>
              {error}
            </ThemedText>
          </View>
        ) : eventsList.length === 0 ? (
          <View style={[styles.card, styles.emptyCard, { backgroundColor: cardBg }]}>
            <Feather name="calendar" size={36} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
              No events for this branch yet.
              {canManage ? " Create one from the web dashboard." : ""}
            </ThemedText>
          </View>
        ) : (
          <>
            {eventsList.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {eventsList.map((ev) => (
                  <Pressable
                    key={ev.id}
                    onPress={() => setEventId(ev.id)}
                    style={[
                      styles.chip,
                      eventId === ev.id
                        ? { backgroundColor: theme.primary }
                        : { backgroundColor: cardBg, borderWidth: 1, borderColor: theme.border },
                    ]}
                    testID={`chip-events-event-${ev.id}`}
                  >
                    <ThemedText
                      type="small"
                      style={{
                        color: eventId === ev.id ? "#FFFFFF" : theme.text,
                        fontWeight: "600",
                      }}
                    >
                      {ev.name}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {branchLocations.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                <Pressable
                  onPress={() => setLocationId(null)}
                  style={[
                    styles.chip,
                    locationId === null
                      ? { backgroundColor: theme.primary }
                      : { backgroundColor: cardBg, borderWidth: 1, borderColor: theme.border },
                  ]}
                  testID="chip-events-location-all"
                >
                  <ThemedText
                    type="small"
                    style={{ color: locationId === null ? "#FFFFFF" : theme.text, fontWeight: "600" }}
                  >
                    All locations
                  </ThemedText>
                </Pressable>
                {branchLocations.map((loc) => (
                  <Pressable
                    key={loc.id}
                    onPress={() => setLocationId(loc.id)}
                    style={[
                      styles.chip,
                      locationId === loc.id
                        ? { backgroundColor: theme.primary }
                        : { backgroundColor: cardBg, borderWidth: 1, borderColor: theme.border },
                    ]}
                    testID={`chip-events-location-${loc.id}`}
                  >
                    <ThemedText
                      type="small"
                      style={{ color: locationId === loc.id ? "#FFFFFF" : theme.text, fontWeight: "600" }}
                    >
                      {loc.name}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {selectedEvent ? (
              <View style={[styles.card, { backgroundColor: cardBg }]}>
                <View style={styles.eventHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="h4" testID="text-event-name">
                      {selectedEvent.name}
                    </ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {new Date(selectedEvent.startDate).toLocaleDateString()} –{" "}
                      {new Date(selectedEvent.endDate).toLocaleDateString()}
                    </ThemedText>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor:
                          selectedEvent.status === "published"
                            ? theme.success + "22"
                            : selectedEvent.status === "paused"
                              ? theme.warning + "22"
                              : theme.textSecondary + "22",
                      },
                    ]}
                  >
                    <ThemedText
                      type="small"
                      style={{
                        color:
                          selectedEvent.status === "published"
                            ? theme.success
                            : selectedEvent.status === "paused"
                              ? theme.warning
                              : theme.textSecondary,
                        fontWeight: "700",
                        textTransform: "capitalize",
                      }}
                      testID="text-event-status"
                    >
                      {selectedEvent.status}
                    </ThemedText>
                  </View>
                </View>
              </View>
            ) : null}

            {stats ? (
              <View style={styles.kpiGrid}>
                <KpiCard bg={cardBg} label="Inside now" value={String(stats.totals.insideGuests)} icon="users" color={theme.primary} testID="kpi-inside" />
                <KpiCard bg={cardBg} label="Expected" value={String(stats.totals.expectedGuests)} icon="clock" color={theme.textSecondary} testID="kpi-expected" />
                <KpiCard bg={cardBg} label="Arrived (gate)" value={String(stats.totals.arrivedGuests)} icon="map-pin" color={theme.warning || theme.primary} testID="kpi-arrived" />
                <KpiCard bg={cardBg} label="Exited" value={String(stats.totals.exitedGuests)} icon="log-out" color={theme.textSecondary} testID="kpi-exited" />
                <KpiCard bg={cardBg} label="Registrations" value={String(stats.totals.registrations)} icon="file-text" color={theme.primary} testID="kpi-registrations" />
                <KpiCard bg={cardBg} label="Advance revenue" value={fmtPaise(stats.totals.advanceRevenue)} icon="credit-card" color={theme.success} testID="kpi-revenue" />
              </View>
            ) : null}

            {canSecurity && selectedEvent ? (
              <Section title="Security — Scan Tickets" bg={cardBg}>
                <View style={styles.scanBtnRow}>
                  <ScanButton
                    label="Check-in"
                    icon="log-in"
                    color={theme.success}
                    onPress={() => navigation.navigate("EventScanner", { action: "checkin" })}
                    testID="button-scan-checkin"
                  />
                  <ScanButton
                    label="Exit"
                    icon="log-out"
                    color={theme.error}
                    onPress={() => navigation.navigate("EventScanner", { action: "exit" })}
                    testID="button-scan-exit"
                  />
                </View>
              </Section>
            ) : null}

            {canBilling && selectedEvent ? <BillingSection bg={cardBg} /> : null}

            {canParking && selectedEvent && stats ? (
              <ParkingSection
                bg={cardBg}
                eventId={selectedEvent.id}
                total={stats.event.parkingTotalSpaces}
                occupied={stats.event.parkingOccupied}
                onChanged={() => loadStats(selectedEvent.id, locationId)}
              />
            ) : null}

            {canSupport && selectedEvent ? <SupportSection bg={cardBg} /> : null}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function KpiCard({
  bg,
  label,
  value,
  icon,
  color,
  testID,
}: {
  bg: string;
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  testID: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.kpiCard, { backgroundColor: bg }]}>
      <View style={styles.kpiTop}>
        <Feather name={icon} size={16} color={color} />
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {label}
        </ThemedText>
      </View>
      <ThemedText type="h3" testID={testID}>
        {value}
      </ThemedText>
    </View>
  );
}

function Section({ title, bg, children }: { title: string; bg: string; children: React.ReactNode }) {
  return (
    <View style={[styles.card, { backgroundColor: bg }]}>
      <ThemedText type="body" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

function ScanButton({
  label,
  icon,
  color,
  onPress,
  testID,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.scanBtn, { backgroundColor: color }, pressed && { opacity: 0.85 }]}
      testID={testID}
    >
      <Feather name={icon} size={20} color="#FFFFFF" />
      <ThemedText type="small" style={styles.scanBtnText} lightColor="#FFFFFF" darkColor="#FFFFFF">
        {label}
      </ThemedText>
    </Pressable>
  );
}

function BillingSection({ bg }: { bg: string }) {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [invoice, setInvoice] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  const lookup = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setMessage(null);
    setResult(null);
    setOtpSent(false);
    setOtpCode("");
    try {
      const data = await getJson(
        `/api/dashboard/events/billing/lookup?q=${encodeURIComponent(query.trim())}`,
      );
      setResult(data);
    } catch (e: any) {
      setMessage({ ok: false, text: e?.message || "Lookup failed" });
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    if (!result?.registration?.id) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await apiRequest("POST", "/api/dashboard/events/billing/send-otp", {
        registrationId: result.registration.id,
      });
      const data = await response.json();
      if (data.otpRequired === false) {
        setResult((prev: any) => prev ? { ...prev, otpRequired: false, billingOtpEnabled: false } : prev);
        setOtpSent(false);
        return;
      }
      setOtpSent(true);
      setMessage({ ok: true, text: "OTP sent on WhatsApp" });
    } catch (e: any) {
      setMessage({ ok: false, text: String(e?.message || "Failed to send OTP").replace(/^\d+:\s*/, "") });
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!result?.registration?.id) return;
    if (!otpCode.trim()) {
      setMessage({ ok: false, text: "Enter the OTP" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await apiRequest("POST", "/api/dashboard/events/billing/verify-otp", {
        registrationId: result.registration.id,
        code: otpCode.trim(),
      });
      const data = await response.json();
      if (data.otpRequired === false) {
        setResult((prev: any) => prev ? { ...prev, otpRequired: false, billingOtpEnabled: false } : prev);
        setOtpSent(false);
        setOtpCode("");
        return;
      }
      setResult((prev: any) => (prev ? { ...prev, otpVerified: true } : prev));
      setMessage({ ok: true, text: "OTP verified" });
    } catch (e: any) {
      setMessage({ ok: false, text: String(e?.message || "Incorrect OTP").replace(/^\d+:\s*/, "") });
    } finally {
      setBusy(false);
    }
  };

  const redeem = async () => {
    if (!result?.registration?.id) return;
    const rupees = parseFloat(invoice);
    if (!Number.isFinite(rupees) || rupees < 0) {
      setMessage({ ok: false, text: "Enter a valid invoice amount in rupees" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiRequest("POST", "/api/dashboard/events/billing/redeem", {
        registrationId: result.registration.id,
        invoiceAmount: Math.round(rupees * 100),
      });
      const data = await res.json();
      setMessage({
        ok: true,
        text: `Redeemed ${fmtPaise(data.redemption.advanceRedeemed)} · Due ${fmtPaise(data.redemption.finalAmountDue)}`,
      });
      setResult(null);
      setQuery("");
      setInvoice("");
    } catch (e: any) {
      setMessage({ ok: false, text: String(e?.message || "Redeem failed").replace(/^\d+:\s*/, "") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Billing — Redeem Advance" bg={bg}>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          placeholder="Booking ID / phone / QR value"
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          testID="input-billing-query"
        />
        <Pressable
          onPress={lookup}
          disabled={busy}
          style={[styles.smallBtn, { backgroundColor: theme.primary }]}
          testID="button-billing-lookup"
        >
          {busy && !result ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="search" size={18} color="#FFFFFF" />
          )}
        </Pressable>
      </View>

      {result ? (
        <View style={[styles.lookupCard, { borderColor: theme.border }]}>
          <ThemedText type="body" style={{ fontWeight: "700" }} testID="text-billing-customer">
            {result.registration.customerName} · {result.registration.bookingId}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {result.eventName} · Status: {result.registration.status}
          </ThemedText>
          <ThemedText type="body" style={{ marginTop: Spacing.xs }}>
            Advance available: {fmtPaise(result.advanceAvailable)}
          </ThemedText>
          {!result.redemption && result.billingOtpEnabled === false ? (
            <ThemedText type="small" style={{ color: theme.success, marginTop: Spacing.xs }}>
              Billing OTP is disabled for this event. Proceed directly to the invoice.
            </ThemedText>
          ) : null}
          {result.redemption ? (
            <ThemedText type="small" style={{ color: theme.error }}>
              Already redeemed {fmtPaise(result.redemption.advanceRedeemed)}
            </ThemedText>
          ) : result.otpRequired && !result.otpVerified ? (
            <View>
              <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
                OTP verification required before redeeming the advance
              </ThemedText>
              <View style={styles.inputRow}>
                <Pressable
                  onPress={sendOtp}
                  disabled={busy}
                  style={[styles.smallBtn, { backgroundColor: theme.primary, paddingHorizontal: Spacing.md }]}
                  testID="button-billing-send-otp"
                >
                  <ThemedText type="small" lightColor="#FFFFFF" darkColor="#FFFFFF" style={{ fontWeight: "700" }}>
                    {otpSent ? "Resend OTP" : "Send OTP"}
                  </ThemedText>
                </Pressable>
                {otpSent ? (
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                    placeholder="6-digit OTP"
                    placeholderTextColor={theme.textSecondary}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    testID="input-billing-otp"
                  />
                ) : null}
                {otpSent ? (
                  <Pressable
                    onPress={verifyOtp}
                    disabled={busy}
                    style={[styles.smallBtn, { backgroundColor: theme.success }]}
                    testID="button-billing-verify-otp"
                  >
                    <Feather name="check" size={18} color="#FFFFFF" />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                placeholder="Invoice total (rupees)"
                placeholderTextColor={theme.textSecondary}
                value={invoice}
                onChangeText={setInvoice}
                keyboardType="decimal-pad"
                testID="input-billing-invoice"
              />
              <Pressable
                onPress={redeem}
                disabled={busy}
                style={[styles.smallBtn, { backgroundColor: theme.success }]}
                testID="button-billing-redeem"
              >
                <Feather name="check" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          )}
        </View>
      ) : null}

      {message ? (
        <ThemedText
          type="small"
          style={{ color: message.ok ? theme.success : theme.error, marginTop: Spacing.sm }}
          testID="text-billing-message"
        >
          {message.text}
        </ThemedText>
      ) : null}
    </Section>
  );
}

function ParkingSection({
  bg,
  eventId,
  total,
  occupied,
  onChanged,
}: {
  bg: string;
  eventId: string;
  total: number;
  occupied: number;
  onChanged: () => void;
}) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<{ total: number; occupied: number } | null>(null);

  useEffect(() => {
    setLocal({ total, occupied });
  }, [total, occupied]);

  const adjust = async (action: "increment" | "decrement") => {
    setBusy(true);
    try {
      const res = await apiRequest("POST", `/api/dashboard/events/${eventId}/parking`, {
        action,
        value: 1,
      });
      const data = await res.json();
      setLocal({ total: data.parkingTotalSpaces, occupied: data.parkingOccupied });
      onChanged();
    } catch {
      // leave counters unchanged on failure
    } finally {
      setBusy(false);
    }
  };

  const t = local?.total ?? total;
  const o = local?.occupied ?? occupied;
  const available = Math.max(0, t - o);
  const full = t > 0 && available === 0;

  return (
    <Section title="Parking — Manual Counter" bg={bg}>
      <View style={styles.parkingRow}>
        <Pressable
          onPress={() => adjust("decrement")}
          disabled={busy || o <= 0}
          style={[styles.parkBtn, { backgroundColor: theme.error, opacity: busy || o <= 0 ? 0.4 : 1 }]}
          testID="button-parking-decrement"
        >
          <Feather name="minus" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.parkingMid}>
          <ThemedText type="h2" testID="text-parking-occupied">
            {o} / {t}
          </ThemedText>
          <ThemedText
            type="small"
            style={{ color: full ? theme.error : theme.textSecondary, fontWeight: full ? "700" : "400" }}
            testID="text-parking-available"
          >
            {full ? "FULL" : `${available} available`}
          </ThemedText>
        </View>
        <Pressable
          onPress={() => adjust("increment")}
          disabled={busy || (t > 0 && o >= t)}
          style={[
            styles.parkBtn,
            { backgroundColor: theme.success, opacity: busy || (t > 0 && o >= t) ? 0.4 : 1 },
          ]}
          testID="button-parking-increment"
        >
          <Feather name="plus" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
    </Section>
  );
}

function SupportSection({ bg }: { bg: string }) {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const lookup = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await getJson(
        `/api/dashboard/events/support/lookup?q=${encodeURIComponent(query.trim())}`,
      );
      setResults(data.results || []);
      if (!data.results?.length) setMessage({ ok: false, text: "No matching registrations" });
    } catch (e: any) {
      setResults([]);
      setMessage({ ok: false, text: e?.message || "Lookup failed" });
    } finally {
      setBusy(false);
    }
  };

  const resend = async (registrationId: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest("POST", "/api/dashboard/events/support/resend-ticket", { registrationId });
      setMessage({ ok: true, text: "Ticket re-sent on WhatsApp" });
    } catch (e: any) {
      setMessage({ ok: false, text: String(e?.message || "Resend failed").replace(/^\d+:\s*/, "") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Support — Find Ticket" bg={bg}>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          placeholder="Name / phone / booking ID"
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          testID="input-support-query"
        />
        <Pressable
          onPress={lookup}
          disabled={busy}
          style={[styles.smallBtn, { backgroundColor: theme.primary }]}
          testID="button-support-lookup"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="search" size={18} color="#FFFFFF" />
          )}
        </Pressable>
      </View>

      {results.map((r) => (
        <View key={r.id} style={[styles.lookupCard, { borderColor: theme.border }]}>
          <ThemedText type="body" style={{ fontWeight: "700" }}>
            {r.customerName} · {r.bookingId}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {r.eventName} · {r.customerPhone} · Status: {r.status}
          </ThemedText>
          <Pressable
            onPress={() => resend(r.id)}
            disabled={busy}
            style={[styles.resendBtn, { backgroundColor: theme.primary }]}
            testID={`button-support-resend-${r.id}`}
          >
            <Feather name="send" size={14} color="#FFFFFF" />
            <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600" }}>
              Resend ticket
            </ThemedText>
          </Pressable>
        </View>
      ))}

      {message ? (
        <ThemedText
          type="small"
          style={{ color: message.ok ? theme.success : theme.error, marginTop: Spacing.sm }}
          testID="text-support-message"
        >
          {message.text}
        </ThemedText>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  center: { paddingVertical: Spacing["4xl"], alignItems: "center" },
  chipRow: { flexGrow: 0, marginBottom: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  emptyCard: { alignItems: "center", gap: Spacing.md, paddingVertical: Spacing["3xl"] },
  eventHeaderRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  statusPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md },
  kpiCard: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  kpiTop: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  sectionTitle: { fontWeight: "700", marginBottom: Spacing.md },
  scanBtnRow: { flexDirection: "row", gap: Spacing.md },
  scanBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  scanBtnText: { fontWeight: "700" },
  inputRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
  },
  smallBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  lookupCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: 2,
  },
  resendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  parkingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  parkingMid: { alignItems: "center" },
  parkBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
