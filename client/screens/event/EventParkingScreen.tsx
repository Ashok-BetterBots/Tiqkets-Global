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
  Modal,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { playSuccessTone, playErrorTone } from "@/utils/alertSounds";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import {
  notifyEventDataChanged,
} from "@/lib/event-live-refresh";
import { useEventLiveRefresh } from "@/hooks/useEventLiveRefresh";
import { useEventSelection } from "@/contexts/EventSelectionContext";
import { SelectedEventBanner } from "@/components/event/SelectedEventBanner";

const BRAND      = BrandColors.primary;
const BRAND_BG   = BRAND + "15";
const ENTRY_COLOR = "#10B981";
const EXIT_COLOR  = "#EF4444";

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({
  occupied, total, fillPct, barColor, trackColor, textColor, subColor,
  size = 128,
}: {
  occupied: number; total: number; fillPct: number;
  barColor: string; trackColor: string; textColor: string; subColor: string;
  size?: number;
}) {
  const sw  = 14;
  const r   = (size - sw) / 2;
  const cx  = size / 2;
  const cy  = size / 2;
  const c   = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, fillPct));
  const filled = c * pct;

  return (
    <Svg width={size} height={size}>
      {/* Background track */}
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
      {/* Filled arc */}
      {filled > 0 ? (
        <Circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={barColor} strokeWidth={sw}
          strokeDasharray={`${filled} ${c - filled}`}
          strokeDashoffset={c / 4}
          strokeLinecap="round"
        />
      ) : null}
      {/* Occupied count */}
      <SvgText
        x={cx} y={cy - 4}
        textAnchor="middle" alignmentBaseline="middle"
        fill={textColor} fontSize={26} fontWeight="800"
      >
        {occupied}
      </SvgText>
      {/* Total label */}
      <SvgText
        x={cx} y={cy + 18}
        textAnchor="middle" alignmentBaseline="middle"
        fill={subColor} fontSize={11}
      >
        of {total}
      </SvgText>
    </Svg>
  );
}

interface ParkingInfo {
  eventId: string;
  eventName: string;
  totalSpaces: number;
  occupied: number;
  available: number;
}

interface CustomerInfo {
  registrationId?: string;
  name: string;
  bookingId: string;
  phone: string;
  guests: number;
  hasParkingEntry?: boolean;
  // Has already completed one full park + exit cycle for this event — such
  // customers are blocked from re-entering.
  parkedAndExited?: boolean;
}

interface ParkingLogPair {
  key: string;
  customerName: string | null;
  bookingId: string | null;
  vehicleRegNumber: string | null;
  entryLog: ParkingLogItem | null;
  exitLog: ParkingLogItem | null;
}

interface ParkingLogItem {
  id: string;
  action: "entry" | "exit";
  customerName?: string | null;
  bookingId?: string | null;
  customerPhone?: string | null;
  vehicleRegNumber?: string | null;
  createdAt: string;
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

function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
}

function groupParkingLogs(logs: ParkingLogItem[]): ParkingLogPair[] {
  const pairMap = new Map<string, ParkingLogPair>();
  const order: string[] = [];

  logs.forEach((log) => {
    if (log.bookingId) {
      if (!pairMap.has(log.bookingId)) {
        const pair: ParkingLogPair = {
          key: log.bookingId,
          customerName: log.customerName ?? null,
          bookingId: log.bookingId,
          vehicleRegNumber: log.vehicleRegNumber ?? null,
          entryLog: null,
          exitLog: null,
        };
        pairMap.set(log.bookingId, pair);
        order.push(log.bookingId);
      }
      const pair = pairMap.get(log.bookingId)!;
      if (log.action === "entry" && !pair.entryLog) pair.entryLog = log;
      if (log.action === "exit"  && !pair.exitLog)  pair.exitLog  = log;
      if (!pair.vehicleRegNumber && log.vehicleRegNumber) pair.vehicleRegNumber = log.vehicleRegNumber;
    } else {
      // Walk-in — no bookingId, each log is its own card
      const key = log.id;
      pairMap.set(key, {
        key,
        customerName: log.customerName ?? null,
        bookingId: null,
        vehicleRegNumber: log.vehicleRegNumber ?? null,
        entryLog: log.action === "entry" ? log : null,
        exitLog:  log.action === "exit"  ? log : null,
      });
      order.push(key);
    }
  });

  return order.map((k) => pairMap.get(k)!);
}

// ─────────────────────────────────────────────────────────────────────────────
export default function EventParkingScreen() {
  const { theme } = useTheme();
  const insets    = useSafeAreaInsets();

  if (Platform.OS === "web") {
    return (
      <ThemedView style={[styles.center, { paddingTop: insets.top + Spacing["4xl"] }]}>
        <View style={[styles.iconCircle, { backgroundColor: BRAND_BG }]}>
          <Feather name="smartphone" size={44} color={BRAND} />
        </View>
        <ThemedText type="h4" style={styles.centeredText}>Use Mobile for Parking</ThemedText>
        <ThemedText type="body" style={{ textAlign: "center", color: theme.textSecondary }}>
          Open this app in Expo Go on your mobile device to manage parking.
        </ThemedText>
      </ThemedView>
    );
  }

  return <ParkingPanel />;
}

// ─────────────────────────────────────────────────────────────────────────────
function ParkingPanel() {
  const { theme }    = useTheme();
  const insets       = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const scrollRef    = useRef<ScrollView>(null);
  const { selectedEvent } = useEventSelection();

  const CameraModule = require("expo-camera");
  const { CameraView, useCameraPermissions } = CameraModule;
  const [permission, requestPermission] = useCameraPermissions();

  // Parking info
  const [info, setInfo]             = useState<ParkingInfo | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [disabledEventName, setDisabledEventName] = useState<string | null>(null);

  // Scan / search
  const [cameraOpen, setCameraOpen]     = useState(false);
  const [scanned, setScanned]           = useState(false);
  const [manualQuery, setManualQuery]   = useState("");
  const [searching, setSearching]       = useState(false);
  const [lookupError, setLookupError]   = useState<string | null>(null);

  // Action modal
  const [modalCustomer, setModalCustomer]   = useState<CustomerInfo | null>(null);
  const [modalVisible, setModalVisible]     = useState(false);
  const [vehicleReg, setVehicleReg]         = useState("");
  const [actionLoading, setActionLoading]   = useState<"entry" | "exit" | null>(null);
  const [actionSuccess, setActionSuccess]   = useState<"entry" | "exit" | null>(null);

  // Counter manual vehicle reg
  const [counterVehicleReg, setCounterVehicleReg] = useState("");
  const [counterLoading, setCounterLoading]         = useState<"entry" | "exit" | null>(null);

  // Recent logs
  const [logs, setLogs]               = useState<ParkingLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage]       = useState(1);
  const [logsSearch, setLogsSearch]   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventIdRef                    = useRef<string | null>(null);
  const parkingRefreshInFlightRef     = useRef(false);
  const logsRequestSeqRef             = useRef(0);
  const parkingInfoRequestSeqRef      = useRef(0);
  const selectionGenerationRef        = useRef(0);

  // ── Load parking info ──────────────────────────────────────────────────────
  const loadParking = useCallback(async (
    quiet = false,
    isCurrent: () => boolean = () => true,
  ) => {
    const requestSeq = ++parkingInfoRequestSeqRef.current;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      if (!selectedEvent) {
        eventIdRef.current = null;
        setInfo(null);
        setLogs([]);
        return;
      }
      if (selectedEvent.parkingEnabled === false) {
        eventIdRef.current = selectedEvent.id;
        setInfo(null);
        setLogs([]);
        setDisabledEventName(selectedEvent.name || "This event");
        return;
      }
      setDisabledEventName(null);
      const stats = await fetchJson(`/api/dashboard/events/${selectedEvent.id}/stats?t=${Date.now()}`);
      if (requestSeq !== parkingInfoRequestSeqRef.current || !isCurrent()) return;
      eventIdRef.current = selectedEvent.id;
      setInfo({
        eventId:     selectedEvent.id,
        eventName:   stats.event?.name || selectedEvent.name,
        totalSpaces: stats.event?.parkingTotalSpaces ?? 0,
        occupied:    stats.event?.parkingOccupied ?? 0,
        available:   (stats.event?.parkingTotalSpaces ?? 0) - (stats.event?.parkingOccupied ?? 0),
      });
    } catch (e: any) {
      if (requestSeq === parkingInfoRequestSeqRef.current && isCurrent()) {
        setError(e?.message || "Failed to load parking data");
      }
    } finally {
      if (requestSeq === parkingInfoRequestSeqRef.current && isCurrent()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedEvent]);

  // ── Load recent logs ───────────────────────────────────────────────────────
  const loadLogs = useCallback(async (
    evId: string,
    pg: number,
    q: string,
    quiet = false,
    isCurrent: () => boolean = () => true,
  ) => {
    const requestSeq = ++logsRequestSeqRef.current;
    if (!quiet) setLogsLoading(true);
    try {
      const searchParam = q ? `&search=${encodeURIComponent(q)}` : "";
      const data = await fetchJson(
        `/api/dashboard/events/${evId}/parking/logs?page=${pg}${searchParam}&t=${Date.now()}`
      );
      if (requestSeq === logsRequestSeqRef.current && isCurrent()) setLogs(data.items || []);
    } catch {}
    if (requestSeq === logsRequestSeqRef.current && isCurrent()) setLogsLoading(false);
  }, []);

  const refreshParkingData = useCallback(async (
    quiet = true,
    isCurrent: () => boolean = () => true,
  ) => {
    if (parkingRefreshInFlightRef.current) return;
    parkingRefreshInFlightRef.current = true;
    try {
      await loadParking(quiet, isCurrent);
      if (!isCurrent()) return;
      const eventId = selectedEvent?.id;
      if (eventId) await loadLogs(eventId, logsPage, debouncedSearch, quiet, isCurrent);
    } finally {
      parkingRefreshInFlightRef.current = false;
    }
  }, [loadParking, loadLogs, logsPage, debouncedSearch, selectedEvent?.id]);

  const triggerParkingRefresh = useEventLiveRefresh(
    (reason, isCurrent) => refreshParkingData(reason !== "focus", isCurrent),
  );

  useEffect(() => {
    selectionGenerationRef.current += 1;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    parkingInfoRequestSeqRef.current += 1;
    logsRequestSeqRef.current += 1;
    eventIdRef.current = selectedEvent?.id ?? null;
    setInfo(null);
    setLogs([]);
    setDisabledEventName(null);
    setLogsPage(1);
    setLogsSearch("");
    setDebouncedSearch("");
    setModalVisible(false);
    setModalCustomer(null);
    setActionLoading(null);
    setActionSuccess(null);
    setCounterLoading(null);
    setCounterVehicleReg("");
    setVehicleReg("");
    setSearching(false);
    setManualQuery("");
    setScanned(false);
    if (selectedEvent) {
      void loadParking(false);
      if (selectedEvent.parkingEnabled !== false) {
        void loadLogs(selectedEvent.id, 1, "", false);
      }
    } else {
      setLoading(false);
    }
  }, [selectedEvent, loadParking, loadLogs]);

  useEffect(() => {
    if (selectedEvent?.id) {
      void loadLogs(selectedEvent.id, logsPage, debouncedSearch, true);
    }
  }, [selectedEvent?.id, logsPage, debouncedSearch, loadLogs]);

  const handleLogsSearch = (text: string) => {
    const selectionGeneration = selectionGenerationRef.current;
    setLogsSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (selectionGeneration !== selectionGenerationRef.current) return;
      setDebouncedSearch(text);
      setLogsPage(1);
    }, 400);
  };

  // ── Customer lookup ────────────────────────────────────────────────────────
  const lookupCustomer = useCallback(async (value: string) => {
    if (!value.trim()) return;
    const selectionGeneration = selectionGenerationRef.current;
    setLookupError(null);
    setSearching(true);
    try {
      const q    = encodeURIComponent(value.trim());
      const data = await fetchJson(`/api/dashboard/events/support/lookup?q=${q}&t=${Date.now()}`);
      if (selectionGeneration !== selectionGenerationRef.current) return;
      const results = data.results || [];
      if (results.length > 0) {
        const r = results[0];
        // Determine parking status for this booking
        let hasParkingEntry: boolean | undefined;
        let parkedAndExited: boolean | undefined;
        const evId = eventIdRef.current;
        if (evId && r.bookingId) {
          try {
            const logsData = await fetchJson(
              `/api/dashboard/events/${evId}/parking/logs?search=${encodeURIComponent(r.bookingId)}&t=${Date.now()}`
            );
            if (selectionGeneration !== selectionGenerationRef.current) return;
            const bkLogs: ParkingLogItem[] = (logsData.items || []).filter(
              (l: ParkingLogItem) => l.bookingId === r.bookingId
            );
            const entries = bkLogs.filter((l) => l.action === "entry").length;
            const exits   = bkLogs.filter((l) => l.action === "exit").length;
            hasParkingEntry = entries > exits;
            parkedAndExited = entries > 0 && exits > 0;
          } catch {}
        }
        setModalCustomer({
          registrationId: r.id,
          name:      r.customerName,
          bookingId: r.bookingId,
          phone:     r.customerPhone,
          guests:    1 + (r.familyMembersCount || 0),
          hasParkingEntry,
          parkedAndExited,
        });
        setVehicleReg("");
        setActionSuccess(null);
        setModalVisible(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setLookupError("No registration found");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        playErrorTone();
      }
    } catch (e: any) {
      if (selectionGeneration !== selectionGenerationRef.current) return;
      setLookupError(e?.message || "Lookup failed");
    } finally {
      if (selectionGeneration === selectionGenerationRef.current) {
        setSearching(false);
        setManualQuery("");
      }
    }
  }, []);

  const handleBarCodeScanned = useCallback(async (scanData: { data: string }) => {
    if (scanned) return;
    const selectionGeneration = selectionGenerationRef.current;
    setScanned(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCameraOpen(false);
    await lookupCustomer(scanData.data);
    setTimeout(() => {
      if (selectionGeneration === selectionGenerationRef.current) setScanned(false);
    }, 1500);
  }, [scanned, lookupCustomer]);

  const openCamera = useCallback(async () => {
    if (!permission?.granted) await requestPermission();
    setCameraOpen(true);
    setLookupError(null);
  }, [permission, requestPermission]);

  // ── Parking action (from modal or counter) ─────────────────────────────────
  const doAction = useCallback(async (
    action: "entry" | "exit",
    opts?: { vehicleReg?: string; customer?: CustomerInfo | null }
  ) => {
    if (!info?.eventId) return;
    const actionEventId = info.eventId;
    const selectionGeneration = selectionGenerationRef.current;
    parkingInfoRequestSeqRef.current += 1;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await apiRequest("POST", `/api/dashboard/events/${actionEventId}/parking`, {
        action: action === "entry" ? "increment" : "decrement",
        value: 1,
        vehicleRegNumber: opts?.vehicleReg || undefined,
        registrationId:   opts?.customer?.registrationId || undefined,
        customerName:     opts?.customer?.name || undefined,
        bookingId:        opts?.customer?.bookingId || undefined,
        customerPhone:    opts?.customer?.phone || undefined,
        logAction:        action,
      });
      const data = await res.json();
      notifyEventDataChanged(actionEventId);
      if (selectionGeneration !== selectionGenerationRef.current || eventIdRef.current !== actionEventId) return null;
      setInfo((prev) =>
        prev ? { ...prev, occupied: data.parkingOccupied ?? prev.occupied, available: data.available ?? prev.available } : prev
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSuccessTone();
      void triggerParkingRefresh();
      return true;
    } catch (e: any) {
      if (selectionGeneration !== selectionGenerationRef.current) return false;
      setError(e?.message || "Update failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      playErrorTone();
      return false;
    }
  }, [info?.eventId, triggerParkingRefresh]);

  // Modal action
  const handleModalAction = useCallback(async (action: "entry" | "exit") => {
    if (actionLoading) return;
    const selectionGeneration = selectionGenerationRef.current;
    setActionLoading(action);
    const ok = await doAction(action, { vehicleReg, customer: modalCustomer });
    if (ok && selectionGeneration === selectionGenerationRef.current) {
      setActionSuccess(action);
      setTimeout(() => {
        if (selectionGeneration !== selectionGenerationRef.current) return;
        setModalVisible(false);
        setModalCustomer(null);
        setVehicleReg("");
        setActionSuccess(null);
        // Scroll back to scan section
        setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
      }, 800);
    }
    if (selectionGeneration === selectionGenerationRef.current) setActionLoading(null);
  }, [actionLoading, doAction, vehicleReg, modalCustomer]);

  // Counter action
  const handleCounterAction = useCallback(async (action: "entry" | "exit") => {
    if (counterLoading) return;
    const selectionGeneration = selectionGenerationRef.current;
    setCounterLoading(action);
    await doAction(action, { vehicleReg: counterVehicleReg });
    if (selectionGeneration === selectionGenerationRef.current) {
      setCounterLoading(null);
      setCounterVehicleReg("");
    }
  }, [counterLoading, doAction, counterVehicleReg]);

  if (loading && !info) {
    return (
      <ThemedView style={[styles.center, { paddingTop: insets.top + 80 }]}>
        <ActivityIndicator size="large" color={BRAND} />
      </ThemedView>
    );
  }

  if (disabledEventName) {
    return (
      <ThemedView style={[styles.center, { paddingHorizontal: Spacing.xl }]}>
        <MaterialCommunityIcons name="car-off" size={52} color={theme.textSecondary} />
        <ThemedText type="h4" style={{ marginTop: Spacing.lg, textAlign: "center" }}>
          Parking unavailable
        </ThemedText>
        <ThemedText type="body" style={{ marginTop: Spacing.sm, color: theme.textSecondary, textAlign: "center" }}>
          Parking controls are disabled for {disabledEventName}.
        </ThemedText>
      </ThemedView>
    );
  }

  if (!permission) {
    return (
      <ThemedView style={[styles.center, { paddingTop: insets.top + 80 }]}>
        <ActivityIndicator color={BRAND} />
      </ThemedView>
    );
  }

  const fillPct  = info && info.totalSpaces > 0 ? info.occupied / info.totalSpaces : 0;
  const isFull   = info ? info.occupied >= info.totalSpaces && info.totalSpaces > 0 : false;
  const isEmpty  = info ? info.occupied <= 0 : true;
  const barColor = fillPct > 0.9 ? EXIT_COLOR : fillPct > 0.7 ? "#F59E0B" : ENTRY_COLOR;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ThemedView style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: Spacing.xl, paddingBottom: tabBarHeight + Spacing["2xl"] },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void triggerParkingRefresh().finally(() => setRefreshing(false));
              }}
              tintColor={BRAND}
            />
          }
        >
          <SelectedEventBanner />
          {/* Error banner */}
          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: EXIT_COLOR + "18", borderColor: EXIT_COLOR + "33" }]}>
              <Feather name="alert-circle" size={14} color={EXIT_COLOR} />
              <ThemedText type="small" style={{ color: EXIT_COLOR, flex: 1 }}>{error}</ThemedText>
              <Pressable onPress={() => setError(null)} hitSlop={8}>
                <Feather name="x" size={14} color={EXIT_COLOR} />
              </Pressable>
            </View>
          ) : null}

          {/* ── Scan / Search Card ── */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ThemedText style={styles.cardTitle}>Scan or Search Ticket</ThemedText>

            {cameraOpen && permission.granted ? (
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
                <ThemedText type="small" style={{ textAlign: "center", color: theme.textSecondary, marginTop: 4 }}>
                  Scan the visitor's QR ticket
                </ThemedText>
              </View>
            ) : (
              <Pressable
                onPress={openCamera}
                style={[styles.scanBtn, { backgroundColor: BRAND }]}
                testID="button-parking-scan"
              >
                <Feather name="camera" size={18} color="#fff" />
                <ThemedText type="body" style={styles.scanBtnText}>
                  {!permission.granted
                    ? permission.status === "denied" && !permission.canAskAgain
                      ? "Open Settings for Camera"
                      : "Enable Camera to Scan QR"
                    : "Scan QR Code"}
                </ThemedText>
              </Pressable>
            )}

            <ThemedText type="small" style={[styles.orText, { color: theme.textSecondary }]}>
              or search manually
            </ThemedText>

            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundRoot }]}
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
              <Pressable
                onPress={() => lookupCustomer(manualQuery)}
                style={[styles.searchBtn, { backgroundColor: BRAND, opacity: searching ? 0.7 : 1 }]}
                disabled={searching || !manualQuery.trim()}
                testID="button-parking-search"
              >
                {searching ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="search" size={18} color="#fff" />
                )}
              </Pressable>
            </View>

            {lookupError ? (
              <View style={[styles.lookupError, { backgroundColor: EXIT_COLOR + "12", borderColor: EXIT_COLOR + "30" }]}>
                <Feather name="alert-circle" size={13} color={EXIT_COLOR} />
                <ThemedText type="small" style={{ color: EXIT_COLOR }}>{lookupError}</ThemedText>
              </View>
            ) : null}
          </View>

          {/* ── Parking Counter Card ── */}
          {info ? (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.counterHeader}>
                <View>
                  <ThemedText style={styles.cardTitle}>Parking Spaces</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>{info.eventName}</ThemedText>
                </View>
                {isFull ? (
                  <View style={[styles.fullBadge, { backgroundColor: EXIT_COLOR + "18", borderColor: EXIT_COLOR + "40" }]}>
                    <ThemedText type="small" style={{ color: EXIT_COLOR, fontWeight: "700" }}>FULL</ThemedText>
                  </View>
                ) : null}
              </View>

              {/* Stats + Donut side-by-side */}
              <View style={styles.statsDonutRow}>
                {/* Left: text breakdown */}
                <View style={styles.statsLeft}>
                  <View style={styles.pillsRow}>
                    <View style={[styles.pill, { backgroundColor: ENTRY_COLOR + "15", borderColor: ENTRY_COLOR + "35" }]}>
                      <View style={[styles.dot, { backgroundColor: ENTRY_COLOR }]} />
                      <ThemedText style={[styles.pillText, { color: ENTRY_COLOR }]}>
                        {info.available} free
                      </ThemedText>
                    </View>
                    <View style={[styles.pill, { backgroundColor: barColor + "15", borderColor: barColor + "35" }]}>
                      <View style={[styles.dot, { backgroundColor: barColor }]} />
                      <ThemedText style={[styles.pillText, { color: barColor }]}>
                        {info.occupied} used
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={[styles.totalLabel, { color: theme.textSecondary }]}>
                    Total capacity
                  </ThemedText>
                  <ThemedText style={[styles.totalValue, { color: theme.text }]}>
                    {info.totalSpaces} spaces
                  </ThemedText>
                  <ThemedText style={[styles.pctLabel, { color: barColor }]}>
                    {info.totalSpaces > 0 ? Math.round(fillPct * 100) : 0}% occupied
                  </ThemedText>
                </View>

                {/* Right: donut chart */}
                <DonutChart
                  occupied={info.occupied}
                  total={info.totalSpaces}
                  fillPct={fillPct}
                  barColor={barColor}
                  trackColor={theme.border}
                  textColor={theme.text}
                  subColor={theme.textSecondary}
                />
              </View>

              {/* Vehicle reg for manual entry */}
              <View style={[styles.vehicleRegWrap, { borderTopColor: theme.border }]}>
                <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
                  Vehicle Registration (optional)
                </ThemedText>
                <TextInput
                  style={[styles.vehicleRegInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundRoot }]}
                  placeholder="e.g. TN 01 AB 1234"
                  placeholderTextColor={theme.textSecondary}
                  value={counterVehicleReg}
                  onChangeText={setCounterVehicleReg}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  testID="input-counter-vehicle-reg"
                />
              </View>

              {/* Entry / Exit buttons */}
              <View style={styles.controlsRow}>
                <Pressable
                  onPress={() => handleCounterAction("entry")}
                  disabled={(isFull && info.totalSpaces > 0) || !!counterLoading}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    {
                      backgroundColor: isFull && info.totalSpaces > 0 ? theme.border + "80" : ENTRY_COLOR + "18",
                      borderColor:     isFull && info.totalSpaces > 0 ? theme.border : ENTRY_COLOR + "60",
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  testID="button-counter-entry"
                >
                  {counterLoading === "entry" ? (
                    <ActivityIndicator size="small" color={ENTRY_COLOR} />
                  ) : (
                    <>
                      <Feather name="arrow-down-circle" size={26} color={isFull && info.totalSpaces > 0 ? theme.textSecondary : ENTRY_COLOR} />
                      <ThemedText style={{ fontWeight: "700", color: isFull && info.totalSpaces > 0 ? theme.textSecondary : ENTRY_COLOR }}>
                        Entry
                      </ThemedText>
                    </>
                  )}
                </Pressable>

                <View style={[styles.vehicleIconCircle, { backgroundColor: BRAND_BG }]}>
                  <MaterialCommunityIcons name="car" size={24} color={BRAND} />
                </View>

                <Pressable
                  onPress={() => handleCounterAction("exit")}
                  disabled={isEmpty || !!counterLoading}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    {
                      backgroundColor: isEmpty ? theme.border + "80" : EXIT_COLOR + "18",
                      borderColor:     isEmpty ? theme.border : EXIT_COLOR + "60",
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  testID="button-counter-exit"
                >
                  {counterLoading === "exit" ? (
                    <ActivityIndicator size="small" color={EXIT_COLOR} />
                  ) : (
                    <>
                      <Feather name="arrow-up-circle" size={26} color={isEmpty ? theme.textSecondary : EXIT_COLOR} />
                      <ThemedText style={{ fontWeight: "700", color: isEmpty ? theme.textSecondary : EXIT_COLOR }}>
                        Exit
                      </ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.center}>
              <Feather name="map-pin" size={48} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
                No active event found
              </ThemedText>
            </View>
          )}

          {/* ── Recent Parking ── */}
          {info ? (
            <RecentParkingList
              logs={logs}
              loading={logsLoading}
              page={logsPage}
              search={logsSearch}
              onSearch={handleLogsSearch}
              onPageChange={setLogsPage}
              theme={theme}
            />
          ) : null}
        </ScrollView>

        {/* ── Parking Action Modal (bottom sheet) ── */}
        <ParkingActionModal
          visible={modalVisible}
          customer={modalCustomer}
          vehicleReg={vehicleReg}
          onChangeVehicleReg={setVehicleReg}
          actionLoading={actionLoading}
          actionSuccess={actionSuccess}
          isFull={isFull}
          isEmpty={isEmpty}
          totalSpaces={info?.totalSpaces ?? 0}
          onEntry={() => handleModalAction("entry")}
          onExit={() => handleModalAction("exit")}
          onClose={() => { setModalVisible(false); setModalCustomer(null); setVehicleReg(""); setActionSuccess(null); }}
          theme={theme}
        />
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bottom-sheet modal
// ─────────────────────────────────────────────────────────────────────────────
function ParkingActionModal({
  visible, customer, vehicleReg, onChangeVehicleReg,
  actionLoading, actionSuccess, isFull, isEmpty, totalSpaces,
  onEntry, onExit, onClose, theme,
}: {
  visible: boolean;
  customer: CustomerInfo | null;
  vehicleReg: string;
  onChangeVehicleReg: (v: string) => void;
  actionLoading: "entry" | "exit" | null;
  actionSuccess: "entry" | "exit" | null;
  isFull: boolean;
  isEmpty: boolean;
  totalSpaces: number;
  onEntry: () => void;
  onExit: () => void;
  onClose: () => void;
  theme: any;
}) {
  const colorScheme = useColorScheme();
  const { height: windowHeight } = useWindowDimensions();
  const sheetBg     = colorScheme === "dark" ? "#1c1c1e" : "#ffffff";

  // If we know the customer's parking status, use it; otherwise fall back to lot-level logic
  const hasKnownStatus  = customer?.hasParkingEntry !== undefined;
  const alreadyExited   = !!customer?.parkedAndExited;
  const entryDisabled   = alreadyExited || (hasKnownStatus ? customer!.hasParkingEntry === true : (isFull && totalSpaces > 0)) || !!actionLoading;
  const exitDisabled    = (hasKnownStatus ? customer!.hasParkingEntry === false : isEmpty) || !!actionLoading;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalSheet}
        >
          <View style={[styles.modalContent, { backgroundColor: sheetBg, borderColor: theme.border, flexShrink: 1, maxHeight: windowHeight * 0.9 }]}>
            <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Spacing.md }}>
            {/* Handle */}
            <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />

            {/* Success overlay */}
            {actionSuccess ? (
              <View style={[
                styles.successOverlay,
                { backgroundColor: actionSuccess === "entry" ? ENTRY_COLOR + "15" : EXIT_COLOR + "15" },
              ]}>
                <View style={[styles.successIcon, { backgroundColor: actionSuccess === "entry" ? ENTRY_COLOR : EXIT_COLOR }]}>
                  <Feather name="check" size={28} color="#fff" />
                </View>
                <ThemedText type="h4" style={{ fontWeight: "800", color: actionSuccess === "entry" ? ENTRY_COLOR : EXIT_COLOR }}>
                  {actionSuccess === "entry" ? "Entry Recorded" : "Exit Recorded"}
                </ThemedText>
              </View>
            ) : (
              <>
                {/* Customer info */}
                {customer ? (
                  <View style={[styles.customerBlock, { backgroundColor: BRAND + "10", borderColor: BRAND + "25" }]}>
                    <View style={[styles.avatarCircle, { backgroundColor: BRAND + "20" }]}>
                      <Feather name="user" size={20} color={BRAND} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <ThemedText style={{ fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
                        {customer.name}
                      </ThemedText>
                      <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        {customer.bookingId}  ·  {customer.guests} guest{customer.guests > 1 ? "s" : ""}
                      </ThemedText>
                    </View>
                  </View>
                ) : null}

                {alreadyExited ? (
                  <View style={[styles.customerBlock, { backgroundColor: "#EF444415", borderColor: "#EF444440", marginTop: -Spacing.sm }]}>
                    <View style={[styles.avatarCircle, { backgroundColor: "#EF444425" }]}>
                      <Feather name="alert-triangle" size={18} color="#EF4444" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <ThemedText style={{ fontWeight: "700", fontSize: 13, color: "#EF4444" }}>
                        Already parked & exited
                      </ThemedText>
                      <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        This customer cannot re-enter after exiting once.
                      </ThemedText>
                    </View>
                  </View>
                ) : null}

                {/* Vehicle reg input */}
                <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
                  Vehicle Registration Number
                </ThemedText>
                <View style={[styles.modalInput, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <Feather name="hash" size={15} color={theme.textSecondary} />
                  <TextInput
                    style={[styles.modalInputText, { color: theme.text }]}
                    placeholder="e.g. TN 01 AB 1234"
                    placeholderTextColor={theme.textSecondary}
                    value={vehicleReg}
                    onChangeText={onChangeVehicleReg}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    testID="input-modal-vehicle-reg"
                  />
                </View>

                {/* Action buttons */}
                <View style={styles.modalActionRow}>
                  <Pressable
                    onPress={onEntry}
                    disabled={entryDisabled}
                    style={[
                      styles.modalActionBtn,
                      entryDisabled
                        ? { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }
                        : { backgroundColor: ENTRY_COLOR },
                    ]}
                    testID="button-modal-entry"
                  >
                    {actionLoading === "entry" ? (
                      <ActivityIndicator size="small" color={entryDisabled ? theme.textSecondary : "#fff"} />
                    ) : (
                      <>
                        <Feather name="arrow-down-circle" size={20} color={entryDisabled ? theme.textSecondary : "#fff"} />
                        <ThemedText style={{ color: entryDisabled ? theme.textSecondary : "#fff", fontWeight: "700", fontSize: 15 }}>
                          Mark Entry
                        </ThemedText>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={onExit}
                    disabled={exitDisabled}
                    style={[
                      styles.modalActionBtn,
                      exitDisabled
                        ? { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }
                        : { backgroundColor: EXIT_COLOR },
                    ]}
                    testID="button-modal-exit"
                  >
                    {actionLoading === "exit" ? (
                      <ActivityIndicator size="small" color={exitDisabled ? theme.textSecondary : "#fff"} />
                    ) : (
                      <>
                        <Feather name="arrow-up-circle" size={20} color={exitDisabled ? theme.textSecondary : "#fff"} />
                        <ThemedText style={{ color: exitDisabled ? theme.textSecondary : "#fff", fontWeight: "700", fontSize: 15 }}>
                          Mark Exit
                        </ThemedText>
                      </>
                    )}
                  </Pressable>
                </View>

                {/* Cancel */}
                <Pressable onPress={onClose} style={styles.cancelBtn} testID="button-modal-cancel">
                  <ThemedText type="small" style={{ color: theme.textSecondary, fontWeight: "600" }}>Cancel</ThemedText>
                </Pressable>
              </>
            )}
            </ScrollView>
            </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent Parking List
// ─────────────────────────────────────────────────────────────────────────────
function RecentParkingList({
  logs, loading, page, search, onSearch, onPageChange, theme,
}: {
  logs: ParkingLogItem[];
  loading: boolean;
  page: number;
  search: string;
  onSearch: (v: string) => void;
  onPageChange: (p: number) => void;
  theme: any;
}) {
  const isLastPage = logs.length < 10;

  return (
    <View style={[styles.recentContainer, { borderTopColor: theme.border }]}>
      {/* Header */}
      <View style={styles.recentHeader}>
        <View style={[styles.recentHeaderIcon, { backgroundColor: BRAND + "15" }]}>
          <Feather name="list" size={13} color={BRAND} />
        </View>
        <ThemedText type="body" style={{ fontWeight: "700", flex: 1 }}>Recent Parking</ThemedText>
        {loading ? <ActivityIndicator size="small" color={BRAND} /> : null}
      </View>

      {/* Search */}
      <View style={[styles.recentSearchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Feather name="search" size={14} color={theme.textSecondary} />
        <TextInput
          value={search}
          onChangeText={onSearch}
          placeholder="Search by booking ID, phone or vehicle reg…"
          placeholderTextColor={theme.textSecondary}
          style={[styles.recentSearchInput, { color: theme.text }]}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        {search.length > 0 ? (
          <Pressable onPress={() => onSearch("")} hitSlop={8}>
            <Feather name="x" size={14} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {/* List */}
      {logs.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          {search
            ? <Feather name="search" size={28} color={theme.textSecondary} />
            : <MaterialCommunityIcons name="car" size={28} color={theme.textSecondary} />
          }
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
            {search ? `No results for "${search}"` : "No parking activity yet"}
          </ThemedText>
        </View>
      ) : (
        <>
          {groupParkingLogs(logs).map((pair, idx, arr) => {
            const isLast = idx === arr.length - 1;
            const hasEntry = pair.entryLog !== null;
            const hasExit  = pair.exitLog !== null;
            // Left icon: green if only entry, red if has exit, mixed if both
            const iconColor = hasExit ? EXIT_COLOR : ENTRY_COLOR;
            return (
              <View
                key={pair.key}
                style={[
                  styles.logRow,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    marginBottom: isLast ? 0 : Spacing.xs,
                  },
                ]}
              >
                {/* Left icon */}
                <View style={[styles.logIcon, { backgroundColor: iconColor + "15" }]}>
                  <MaterialCommunityIcons name="car" size={16} color={iconColor} />
                </View>

                {/* Info: name+booking on left, time pills on right — all one row */}
                <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                  {/* Left: Booking ID (primary) + vehicle registration (secondary) */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText style={styles.logName} numberOfLines={1}>
                      {pair.bookingId || "Walk-in"}
                    </ThemedText>
                    {pair.vehicleRegNumber ? (
                      <View style={styles.logMeta}>
                        <View style={[styles.vehicleBadge, { backgroundColor: theme.border + "40" }]}>
                          <Feather name="hash" size={10} color={theme.textSecondary} />
                          <ThemedText style={[styles.vehicleBadgeText, { color: theme.text }]}>
                            {pair.vehicleRegNumber}
                          </ThemedText>
                        </View>
                      </View>
                    ) : null}
                  </View>

                  {/* Right: time pills */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.xs, flexShrink: 0 }}>
                    {hasEntry ? (
                      <View style={[styles.timePill, { backgroundColor: ENTRY_COLOR + "12", borderColor: ENTRY_COLOR + "35" }]}>
                        <MaterialCommunityIcons name="car-outline" size={12} color={ENTRY_COLOR} />
                        <ThemedText style={[styles.logTime, { color: ENTRY_COLOR, fontWeight: "700" }]}>
                          {fmtTime(pair.entryLog!.createdAt)}
                        </ThemedText>
                      </View>
                    ) : null}
                    {hasExit ? (
                      <View style={[styles.timePill, { backgroundColor: EXIT_COLOR + "12", borderColor: EXIT_COLOR + "35" }]}>
                        <MaterialCommunityIcons name="car-outline" size={12} color={EXIT_COLOR} />
                        <ThemedText style={[styles.logTime, { color: EXIT_COLOR, fontWeight: "700" }]}>
                          {fmtTime(pair.exitLog!.createdAt)}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}

          {/* Pagination */}
          <View style={styles.pagination}>
            <Pressable
              onPress={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              style={[styles.pageBtn, { borderColor: page <= 1 ? theme.border : BRAND, opacity: page <= 1 ? 0.4 : 1 }]}
            >
              <Feather name="chevron-left" size={14} color={page <= 1 ? theme.textSecondary : BRAND} />
              <ThemedText type="small" style={{ color: page <= 1 ? theme.textSecondary : BRAND, fontWeight: "600" }}>Prev</ThemedText>
            </Pressable>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>Page {page}</ThemedText>
            <Pressable
              onPress={() => onPageChange(page + 1)}
              disabled={isLastPage}
              style={[styles.pageBtn, { borderColor: isLastPage ? theme.border : BRAND, opacity: isLastPage ? 0.4 : 1 }]}
            >
              <ThemedText type="small" style={{ color: isLastPage ? theme.textSecondary : BRAND, fontWeight: "600" }}>Next</ThemedText>
              <Feather name="chevron-right" size={14} color={isLastPage ? theme.textSecondary : BRAND} />
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  center:       { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing["3xl"] },
  iconCircle:   { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: Spacing["2xl"] },
  centeredText: { textAlign: "center", marginBottom: Spacing.md },
  scroll:       { paddingHorizontal: Spacing.lg },

  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1,
    marginBottom: Spacing.md,
  },

  // ── Shared card ──
  card: {
    borderRadius: BorderRadius.xl, borderWidth: 1, padding: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontWeight: "700", fontSize: 16, marginBottom: Spacing.md },

  // ── Scan card ──
  scanBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, height: 50, borderRadius: BorderRadius.full, marginBottom: Spacing.md,
  },
  scanBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  orText:      { textAlign: "center", marginBottom: Spacing.md },
  inputRow:    { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  input: {
    flex: 1, height: 48, borderRadius: BorderRadius.full, borderWidth: 1,
    paddingHorizontal: Spacing.md, fontSize: 15, letterSpacing: 0,
  },
  searchBtn: {
    width: 48, height: 48, borderRadius: BorderRadius.full,
    alignItems: "center", justifyContent: "center",
  },
  lookupError: {
    flexDirection: "row", alignItems: "center", gap: Spacing.xs,
    marginTop: Spacing.md, padding: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1,
  },
  cameraBox: { height: 240, borderRadius: BorderRadius.xl, overflow: "hidden", borderWidth: 2, backgroundColor: "#000" },
  corner:    { position: "absolute", width: 36, height: 36 },
  TL: { top: 14, left: 14, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  TR: { top: 14, right: 14, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  BL: { bottom: 14, left: 14, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  BR: { bottom: 14, right: 14, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
  cameraClose: {
    position: "absolute", top: 10, right: 10, width: 30, height: 30,
    borderRadius: 15, backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
  },

  // ── Counter card ──
  counterHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: Spacing.md },
  dot:           { width: 8, height: 8, borderRadius: 4 },
  fullBadge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: BorderRadius.md, borderWidth: 1,
  },
  // Stats + donut layout
  statsDonutRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: Spacing.md, gap: Spacing.md,
  },
  statsLeft: { flex: 1, gap: Spacing.xs },
  pillsRow:  { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs, marginBottom: Spacing.xs },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  pillText:    { fontSize: 12, fontWeight: "700" },
  totalLabel:  { fontSize: 12, marginTop: Spacing.xs },
  totalValue:  { fontSize: 16, fontWeight: "700" },
  pctLabel:    { fontSize: 12, fontWeight: "600", marginTop: 2 },
  vehicleRegWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  vehicleRegInput: {
    height: 44, borderRadius: BorderRadius.md, borderWidth: 1,
    paddingHorizontal: Spacing.md, fontSize: 14,
  },
  controlsRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, height: 56, borderRadius: BorderRadius.xl, borderWidth: 1,
  },
  vehicleIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },

  // ── Recent parking ──
  recentContainer: {
    marginTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.lg,
  },
  recentHeader: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.md,
  },
  recentHeaderIcon: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  recentSearchBar: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 9, marginBottom: Spacing.md,
  },
  recentSearchInput: { flex: 1, fontSize: 14, padding: 0, letterSpacing: 0 },
  emptyState: { alignItems: "center", padding: Spacing.xl, gap: Spacing.xs },
  logRow: {
    flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: StyleSheet.hairlineWidth,
  },
  logIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
  },
  logName:     { fontSize: 14, fontWeight: "600", flex: 1 },
  logMeta:     { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  logTime:     { fontSize: 11 },
  timePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  actionBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full, borderWidth: 1, flexShrink: 0,
  },
  actionBadgeText: { fontSize: 11, fontWeight: "700" },
  vehicleBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  vehicleBadgeText: { fontSize: 11, fontWeight: "600" },
  pagination: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: Spacing.md,
  },
  pageBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 6, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1,
  },

  // ── Modal ──
  modalOverlay:  { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  modalSheet:    { flex: 1, width: "100%", justifyContent: "flex-end" },
  modalContent: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    paddingBottom: Spacing["2xl"],
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: Spacing.lg },
  customerBlock: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.lg,
  },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  modalInput: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    borderWidth: 1, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, height: 48, marginBottom: Spacing.lg,
  },
  modalInputText: { flex: 1, fontSize: 15, padding: 0 },
  modalActionRow: { flexDirection: "row", gap: Spacing.md, marginBottom: Spacing.md },
  modalActionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, height: 52, borderRadius: BorderRadius.xl,
  },
  cancelBtn: { alignItems: "center", paddingVertical: Spacing.md },
  successOverlay: {
    alignItems: "center", paddingVertical: Spacing["3xl"],
    borderRadius: BorderRadius.xl, gap: Spacing.lg,
  },
  successIcon: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
  },
});
