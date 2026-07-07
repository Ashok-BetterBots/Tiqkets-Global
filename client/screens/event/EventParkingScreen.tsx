import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";

const BRAND = BrandColors.primary;
const ENTRY_COLOR = "#10B981";
const EXIT_COLOR = "#EF4444";

interface ParkingInfo {
  eventId: string;
  eventName: string;
  totalSpaces: number;
  occupied: number;
  available: number;
}

interface CustomerInfo {
  name: string;
  bookingId: string;
  phone: string;
  guests: number;
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

export default function EventParkingScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [info, setInfo] = useState<ParkingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<"increment" | "decrement" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const CameraModule = Platform.OS !== "web" ? require("expo-camera") : null;
  const { CameraView, useCameraPermissions } = CameraModule || {};
  const [permission, requestPermission] = useCameraPermissions ? useCameraPermissions() : [null, () => {}];

  const loadParking = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const evRes = await fetchJson(`/api/dashboard/events?t=${Date.now()}`);
      const evList = evRes.events || evRes || [];
      const active = evList.find((e: any) => e.status === "published" || e.status === "active") ?? evList[0];
      if (!active) { setInfo(null); return; }
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
            ? {
                ...prev,
                occupied: data.parkingOccupied ?? prev.occupied,
                available: data.available ?? prev.available,
              }
            : prev,
        );
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setCustomer(null);
      } catch (e: any) {
        setError(e?.message || "Update failed");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setActionLoading(null);
      }
    },
    [info?.eventId, actionLoading],
  );

  const lookupCustomer = useCallback(async (value: string) => {
    if (!value.trim()) return;
    setLookupError(null);
    setSearching(true);
    try {
      const q = encodeURIComponent(value.trim());
      const data = await fetchJson(`/api/dashboard/events/support/lookup?q=${q}&t=${Date.now()}`);
      const results = data.results || [];
      if (results.length > 0) {
        const r = results[0];
        setCustomer({
          name: r.customerName,
          bookingId: r.bookingId,
          phone: r.customerPhone,
          guests: 1 + (r.familyMembersCount || 0),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setLookupError("No registration found");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (e: any) {
      setLookupError(e?.message || "Lookup failed");
    } finally {
      setSearching(false);
      setManualQuery("");
    }
  }, []);

  const handleBarCodeScanned = useCallback(
    async (scanData: { data: string }) => {
      if (scanned) return;
      setScanned(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCameraOpen(false);
      await lookupCustomer(scanData.data);
      setTimeout(() => setScanned(false), 1500);
    },
    [scanned, lookupCustomer],
  );

  const openCamera = useCallback(async () => {
    if (!permission?.granted) await requestPermission();
    setCameraOpen(true);
    setCustomer(null);
    setLookupError(null);
  }, [permission, requestPermission]);

  if (loading && !info) {
    return (
      <ThemedView style={[styles.center, { paddingTop: insets.top + 80 }]}>
        <ActivityIndicator size="large" color={BRAND} />
      </ThemedView>
    );
  }

  if (Platform.OS === "web") {
    return (
      <ThemedView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + Spacing.lg, paddingBottom: tabBarHeight + Spacing["2xl"] },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
        >
          <ParkingCounterContent
            info={info}
            actionLoading={actionLoading}
            error={error}
            customer={customer}
            lookupError={lookupError}
            searching={searching}
            manualQuery={manualQuery}
            setManualQuery={setManualQuery}
            onEntry={() => handleAction("increment")}
            onExit={() => handleAction("decrement")}
            onManualSearch={() => lookupCustomer(manualQuery)}
            onClearCustomer={() => setCustomer(null)}
            showCamera={false}
            onOpenCamera={() => {}}
            permission={null}
            theme={theme}
          />
        </ScrollView>
      </ThemedView>
    );
  }

  const fillPct = info && info.totalSpaces > 0 ? info.occupied / info.totalSpaces : 0;
  const isFull = info ? info.occupied >= info.totalSpaces && info.totalSpaces > 0 : false;
  const isEmpty = info ? info.occupied <= 0 : true;
  const barColor = fillPct > 0.9 ? "#EF4444" : fillPct > 0.7 ? "#F59E0B" : "#10B981";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + Spacing.lg, paddingBottom: tabBarHeight + Spacing["2xl"] },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: "#EF444418", borderColor: "#EF444433" }]}>
              <Feather name="alert-circle" size={15} color="#EF4444" />
              <ThemedText type="small" style={{ color: "#EF4444", flex: 1 }}>{error}</ThemedText>
            </View>
          ) : null}

          {/* Mode badge */}
          <View style={[styles.modeBadge, { backgroundColor: BRAND + "12", borderColor: BRAND + "30" }]}>
            <Feather name="truck" size={14} color={BRAND} />
            <ThemedText type="small" style={{ color: BRAND, fontWeight: "700" }}>Parking Management</ThemedText>
          </View>

          {/* Scan section */}
          <View style={[styles.scanCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ThemedText type="body" style={{ fontWeight: "700", marginBottom: Spacing.md }}>
              Identify Vehicle
            </ThemedText>

            {/* Camera */}
            {cameraOpen && permission?.granted ? (
              <View style={{ marginBottom: Spacing.md }}>
                <View style={[styles.cameraBox, { borderColor: BRAND + "55" }]}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                  />
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <View style={[styles.corner, styles.TL, { borderColor: BRAND }]} />
                    <View style={[styles.corner, styles.TR, { borderColor: BRAND }]} />
                    <View style={[styles.corner, styles.BL, { borderColor: BRAND }]} />
                    <View style={[styles.corner, styles.BR, { borderColor: BRAND }]} />
                  </View>
                  <Pressable onPress={() => setCameraOpen(false)} style={styles.cameraClose}>
                    <Feather name="x" size={16} color="#fff" />
                  </Pressable>
                </View>
                <ThemedText type="small" style={{ textAlign: "center", color: theme.textSecondary, marginTop: Spacing.xs }}>
                  Scan the visitor's QR ticket
                </ThemedText>
              </View>
            ) : (
              <Pressable
                onPress={openCamera}
                style={[styles.scanBtn, { backgroundColor: BRAND }]}
                testID="button-parking-scan"
              >
                <Feather name="camera" size={19} color="#fff" />
                <ThemedText type="body" style={styles.scanBtnText}>
                  {!permission?.granted ? "Enable Camera to Scan" : "Scan QR Code"}
                </ThemedText>
              </Pressable>
            )}

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>or search manually</ThemedText>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            {/* Manual input */}
            <View style={[styles.inputWrap, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
              <Feather name="search" size={16} color={theme.textSecondary} style={{ marginLeft: Spacing.md }} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Booking ID or phone number"
                placeholderTextColor={theme.textSecondary}
                value={manualQuery}
                onChangeText={setManualQuery}
                onSubmitEditing={() => lookupCustomer(manualQuery)}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                testID="input-parking-manual"
              />
              {searching ? (
                <ActivityIndicator size="small" color={BRAND} style={{ marginRight: Spacing.md }} />
              ) : manualQuery.length > 0 ? (
                <Pressable
                  onPress={() => lookupCustomer(manualQuery)}
                  style={[styles.goBtn, { backgroundColor: BRAND }]}
                >
                  <ThemedText type="small" style={{ color: "#fff", fontWeight: "700" }}>Go</ThemedText>
                </Pressable>
              ) : null}
            </View>

            {/* Lookup result */}
            {lookupError ? (
              <View style={[styles.lookupError, { backgroundColor: "#EF444412", borderColor: "#EF444430" }]}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <ThemedText type="small" style={{ color: "#EF4444" }}>{lookupError}</ThemedText>
              </View>
            ) : null}

            {customer ? (
              <View style={[styles.customerCard, { backgroundColor: ENTRY_COLOR + "10", borderColor: ENTRY_COLOR + "30" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.sm }}>
                  <View style={[styles.avatarSm, { backgroundColor: BRAND + "20" }]}>
                    <Feather name="user" size={16} color={BRAND} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="body" style={{ fontWeight: "700" }}>{customer.name}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {customer.bookingId} · {customer.guests} guest{customer.guests > 1 ? "s" : ""}
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => setCustomer(null)} hitSlop={10}>
                    <Feather name="x" size={16} color={theme.textSecondary} />
                  </Pressable>
                </View>
                <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
                  Use the Entry / Exit buttons below to record
                </ThemedText>
              </View>
            ) : null}
          </View>

          {/* Parking counter */}
          {info ? (
            <>
              <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.xs }}>
                {info.eventName}
              </ThemedText>

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
                      Available:{" "}
                      <ThemedText type="small" style={{ fontWeight: "700", color: theme.text }}>
                        {info.available}
                      </ThemedText>
                    </ThemedText>
                  </View>
                  {isFull ? (
                    <View style={[styles.fullBadge, { backgroundColor: "#EF444418", borderColor: "#EF444440" }]}>
                      <ThemedText type="small" style={{ color: "#EF4444", fontWeight: "700" }}>FULL</ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Entry / Exit buttons */}
              <View style={styles.controlsRow}>
                <Pressable
                  onPress={() => handleAction("increment")}
                  disabled={(isFull && info.totalSpaces > 0) || !!actionLoading}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    {
                      backgroundColor: isFull && info.totalSpaces > 0 ? theme.border + "80" : ENTRY_COLOR + "18",
                      borderColor: isFull && info.totalSpaces > 0 ? theme.border : ENTRY_COLOR + "44",
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  testID="button-parking-entry"
                >
                  {actionLoading === "increment" ? (
                    <ActivityIndicator size="small" color={ENTRY_COLOR} />
                  ) : (
                    <>
                      <Feather name="arrow-down-circle" size={28} color={isFull && info.totalSpaces > 0 ? theme.textSecondary : ENTRY_COLOR} />
                      <ThemedText type="body" style={{ fontWeight: "700", color: isFull && info.totalSpaces > 0 ? theme.textSecondary : ENTRY_COLOR }}>
                        Entry
                      </ThemedText>
                    </>
                  )}
                </Pressable>

                <View style={[styles.vehicleIcon, { backgroundColor: BRAND + "15" }]}>
                  <Feather name="truck" size={26} color={BRAND} />
                </View>

                <Pressable
                  onPress={() => handleAction("decrement")}
                  disabled={isEmpty || !!actionLoading}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    {
                      backgroundColor: isEmpty ? theme.border + "80" : EXIT_COLOR + "18",
                      borderColor: isEmpty ? theme.border : EXIT_COLOR + "44",
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  testID="button-parking-exit"
                >
                  {actionLoading === "decrement" ? (
                    <ActivityIndicator size="small" color={EXIT_COLOR} />
                  ) : (
                    <>
                      <Feather name="arrow-up-circle" size={28} color={isEmpty ? theme.textSecondary : EXIT_COLOR} />
                      <ThemedText type="body" style={{ fontWeight: "700", color: isEmpty ? theme.textSecondary : EXIT_COLOR }}>
                        Exit
                      </ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
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
    </KeyboardAvoidingView>
  );
}

function ParkingCounterContent({ info, actionLoading, error, customer, lookupError, searching, manualQuery, setManualQuery, onEntry, onExit, onManualSearch, onClearCustomer, showCamera, onOpenCamera, permission, theme }: any) {
  const fillPct = info && info.totalSpaces > 0 ? info.occupied / info.totalSpaces : 0;
  const isFull = info ? info.occupied >= info.totalSpaces && info.totalSpaces > 0 : false;
  const isEmpty = info ? info.occupied <= 0 : true;
  const barColor = fillPct > 0.9 ? "#EF4444" : fillPct > 0.7 ? "#F59E0B" : "#10B981";

  return (
    <>
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
          <View style={[styles.mainCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.xs }}>Current Occupancy</ThemedText>
            <View style={styles.occupancyRow}>
              <ThemedText style={{ fontSize: 72, fontWeight: "800", color: theme.text, lineHeight: 80 }}>{info.occupied}</ThemedText>
              <View style={styles.totalWrap}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>of</ThemedText>
                <ThemedText style={{ fontSize: 28, fontWeight: "700", color: theme.textSecondary }}>{info.totalSpaces}</ThemedText>
              </View>
            </View>
            {info.totalSpaces > 0 ? (
              <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                <View style={[styles.progressFill, { backgroundColor: barColor, width: `${Math.min(100, fillPct * 100)}%` as any }]} />
              </View>
            ) : null}
          </View>
          <View style={styles.controlsRow}>
            <Pressable onPress={onEntry} disabled={isFull || !!actionLoading} style={[styles.actionBtn, { backgroundColor: ENTRY_COLOR + "18", borderColor: ENTRY_COLOR + "44" }]}>
              <Feather name="arrow-down-circle" size={28} color={ENTRY_COLOR} />
              <ThemedText type="body" style={{ fontWeight: "700", color: ENTRY_COLOR }}>Entry</ThemedText>
            </Pressable>
            <View style={[styles.vehicleIcon, { backgroundColor: BRAND + "15" }]}>
              <Feather name="truck" size={26} color={BRAND} />
            </View>
            <Pressable onPress={onExit} disabled={isEmpty || !!actionLoading} style={[styles.actionBtn, { backgroundColor: EXIT_COLOR + "18", borderColor: EXIT_COLOR + "44" }]}>
              <Feather name="arrow-up-circle" size={28} color={EXIT_COLOR} />
              <ThemedText type="body" style={{ fontWeight: "700", color: EXIT_COLOR }}>Exit</ThemedText>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.center}>
          <Feather name="map-pin" size={48} color={theme.textSecondary} />
          <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>No active event found</ThemedText>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  scroll: { paddingHorizontal: Spacing.lg },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, marginBottom: Spacing.md,
  },
  modeBadge: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    alignSelf: "flex-start", paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, borderWidth: 1, marginBottom: Spacing.lg,
  },
  scanCard: {
    borderRadius: BorderRadius.xl, borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg, marginBottom: Spacing.xl,
  },
  scanBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, height: 50, borderRadius: BorderRadius.lg, marginBottom: Spacing.md,
  },
  scanBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cameraBox: {
    height: 220, borderRadius: BorderRadius.xl, overflow: "hidden",
    borderWidth: 2, marginBottom: Spacing.sm, position: "relative",
  },
  corner: { position: "absolute", width: 20, height: 20, borderWidth: 2.5 },
  TL: { top: 10, left: 10, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  TR: { top: 10, right: 10, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  BL: { bottom: 10, left: 10, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  BR: { bottom: 10, right: 10, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  cameraClose: {
    position: "absolute", top: 10, right: 10,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12, padding: 5,
  },
  dividerRow: {
    flexDirection: "row", alignItems: "center",
    gap: Spacing.sm, marginVertical: Spacing.md,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    borderRadius: BorderRadius.lg, borderWidth: 1, height: 48, overflow: "hidden",
  },
  input: { flex: 1, paddingHorizontal: Spacing.sm, fontSize: 15 },
  goBtn: {
    paddingHorizontal: Spacing.md, height: "100%",
    alignItems: "center", justifyContent: "center",
  },
  lookupError: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, marginTop: Spacing.sm,
  },
  customerCard: {
    padding: Spacing.md, borderRadius: BorderRadius.lg,
    borderWidth: 1, marginTop: Spacing.sm,
  },
  avatarSm: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  mainCard: {
    borderRadius: BorderRadius.xl, borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.xl, marginBottom: Spacing.xl,
  },
  occupancyRow: { flexDirection: "row", alignItems: "flex-end", gap: Spacing.md, marginBottom: Spacing.lg },
  totalWrap: { alignItems: "flex-start", paddingBottom: 10 },
  progressBar: { height: 10, borderRadius: 5, overflow: "hidden", marginBottom: Spacing.md },
  progressFill: { height: "100%", borderRadius: 5 },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statChip: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  fullBadge: {
    paddingHorizontal: Spacing.md, paddingVertical: 3,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  controlsRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", gap: Spacing.md, marginBottom: Spacing.sm,
  },
  actionBtn: {
    flex: 1, height: 90, borderRadius: BorderRadius.xl, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", gap: Spacing.xs,
  },
  vehicleIcon: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
  },
});
