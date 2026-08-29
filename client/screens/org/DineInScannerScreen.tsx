import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
  ActivityIndicator,
  Modal,
  ScrollView,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius, Colors, Shadows } from "@/constants/theme";
import { OrgStackParamList } from "@/navigation/OrgStackNavigator";
import { playSuccessTone, playErrorTone } from "@/utils/alertSounds";
import { useOrganization } from "@/contexts/OrganizationContext";

type NavigationProp = NativeStackNavigationProp<OrgStackParamList, "DineInScanner">;

// ── Always-light palette for the sheet (immune to device dark mode) ──────────
const SH = {
  bg:         "#FFFFFF",
  surface:    "#F8F9FB",
  border:     "#E5E7EB",
  text:       "#0F172A",
  textSub:    "#64748B",
  textMuted:  "#94A3B8",
  disabled:   "#CBD5E1",
  disabledBg: "#F1F5F9",
  error:      "#EF4444",
  primary:    Colors.light.primary,
};

interface TicketData {
  id:           string;
  ticketNumber: string;
  customerName: string;
  customerPhone?: string;
  status:       string;
  tableNumber?: string | null;
  branchId:     string;
  serviceName?: string;
  position?:    number;
  formData?:    Record<string, unknown>;
}

type ActionKey = "arrive" | "serve" | "hold" | "resume" | "walk_in";

interface ActionDef {
  key:         ActionKey;
  label:       string;
  icon:        keyof typeof Feather.glyphMap;
  activeColor: string;
  endpoint:    string;
}

// ── The three fixed buttons always rendered (except seated / terminal) ───────
const FIXED_ACTIONS: ActionDef[] = [
  { key: "arrive", label: "Arrived", icon: "user-check",   activeColor: "#10B981", endpoint: "arrive" },
  { key: "serve",  label: "Seated",  icon: "check-circle", activeColor: "#3B82F6", endpoint: "serve"  },
  { key: "hold",   label: "Hold",    icon: "pause-circle", activeColor: "#F97316", endpoint: "hold"   },
];

const WALK_IN_ACTION: ActionDef = {
  key: "walk_in", label: "Walk In", icon: "zap", activeColor: "#7C3AED", endpoint: "serve",
};

// ── Per-status button configuration ─────────────────────────────────────────
//
//  Rules (exactly as specified):
//  1. waiting  → Hold enabled; Arrived & Seated disabled
//  2. called   → Seated & Hold enabled; Arrived disabled
//  3. arrived  → terminal — show "already seated" (customer is at the table)
//  4. hold     → Arrived button re-purposed to Resume (calls /resume); Seated & Hold disabled
//  5. serving  → terminal — show "already seated" (customer is dining)
//  6. Walk In  → shown in all stages except arrived / serving / terminal; calls /serve

interface ButtonConfig {
  arriveDisabled: boolean;
  seatedDisabled: boolean;
  holdDisabled:   boolean;
  /** Override the endpoint for the Arrived button (hold→resume) */
  arriveEndpoint: string;
  showWalkIn:     boolean;
  isTerminal:     boolean;
}

function getButtonConfig(status: string): ButtonConfig {
  switch (status) {
    case "waiting":
      return { arriveDisabled: true,  seatedDisabled: true,  holdDisabled: false, arriveEndpoint: "arrive", showWalkIn: true,  isTerminal: false };
    case "called":
      return { arriveDisabled: true,  seatedDisabled: false, holdDisabled: false, arriveEndpoint: "arrive", showWalkIn: true,  isTerminal: false };
    case "arrived":
      // Customer is already at their table — treat as terminal, show info card
      return { arriveDisabled: true,  seatedDisabled: true,  holdDisabled: true,  arriveEndpoint: "arrive", showWalkIn: false, isTerminal: true  };
    case "hold":
      // Arrived button re-purposed: clicking it resumes the customer
      return { arriveDisabled: false, seatedDisabled: true,  holdDisabled: true,  arriveEndpoint: "resume", showWalkIn: true,  isTerminal: false };
    case "serving":
      // Seated — all buttons off, show info card
      return { arriveDisabled: true,  seatedDisabled: true,  holdDisabled: true,  arriveEndpoint: "arrive", showWalkIn: false, isTerminal: true  };
    default:
      // completed / cancelled / no_show
      return { arriveDisabled: true,  seatedDisabled: true,  holdDisabled: true,  arriveEndpoint: "arrive", showWalkIn: false, isTerminal: true  };
  }
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    waiting: "Waiting", called: "Called", arrived: "Arrived",
    serving: "Seated",  hold: "On Hold",  completed: "Completed",
    cancelled: "Cancelled", no_show: "No Show",
  };
  return map[status] ?? status;
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    waiting: SH.primary, called: "#F59E0B", arrived: "#10B981",
    serving: "#3B82F6",  hold: "#F97316",
  };
  return map[status] ?? SH.textMuted;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function DineInScannerScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme }  = useTheme();
  const colors     = theme.background === Colors.dark.background ? Colors.dark : Colors.light;

  if (Platform.OS === "web") {
    return (
      <ThemedView style={[styles.container, styles.centred, { paddingTop: insets.top + Spacing["4xl"] }]}>
        <View style={[styles.permIcon, { backgroundColor: colors.primary + "15" }]}>
          <Feather name="smartphone" size={48} color={colors.primary} />
        </View>
        <ThemedText type="h4" style={styles.permTitle}>Scanner Not Available on Web</ThemedText>
        <ThemedText type="body" style={[styles.permText, { color: colors.textSecondary }]}>
          The dine-in QR scanner requires a mobile device camera.
        </ThemedText>
        <Button onPress={() => navigation.goBack()} style={styles.permBtn}>Go Back</Button>
      </ThemedView>
    );
  }

  return <DineInScannerNative />;
}

// ─────────────────────────────────────────────────────────────────────────────
function DineInScannerNative() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme }  = useTheme();
  const colors     = theme.background === Colors.dark.background ? Colors.dark : Colors.light;
  const { refreshQueueForBranch } = useOrganization();

  const { CameraView, useCameraPermissions } = require("expo-camera");
  const [permission, requestPermission] = useCameraPermissions();

  // Use a ref (not just state) so the guard is synchronous — prevents expo-camera
  // from firing onBarcodeScanned a second time before the state update propagates.
  const scannedRef                        = useRef(false);
  const [scanning,       setScanning]     = useState(false);  // for UI spinner
  const [ticket,         setTicket]       = useState<TicketData | null>(null);
  const [showSheet,      setShowSheet]    = useState(false);
  const [actionLoading,  setActionLoading]= useState<ActionKey | null>(null);
  const [flashError,     setFlashError]   = useState<string | null>(null);
  const [sheetError,     setSheetError]   = useState<string | null>(null);

  const resetScanner = useCallback(() => {
    scannedRef.current = false;
    setScanning(false);
  }, []);

  const closeSheet = useCallback(() => {
    setShowSheet(false);
    setTicket(null);
    setSheetError(null);
    resetScanner();
  }, [resetScanner]);

  const handleBarCodeScanned = useCallback(async (result: { data: string }) => {
    // Synchronous ref guard prevents double-fire from expo-camera
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const raw   = result.data.trim();
      const token = raw.includes("/") ? raw.split("/").filter(Boolean).pop()! : raw;

      const res  = await apiRequest("GET", `/api/org/tickets/by-qr/${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Single success tone — module-level dedup prevents double-play
      playSuccessTone();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTicket(data.ticket);
      setShowSheet(true);
    } catch (e: any) {
      const msg = e?.message ? String(e.message).replace(/^\d+:\s*/, "") : "Could not find ticket";
      playErrorTone();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFlashError(msg);
      setTimeout(() => { setFlashError(null); resetScanner(); }, 2500);
    } finally {
      setScanning(false);
    }
  }, [resetScanner]);

  const handleAction = useCallback(async (action: ActionDef, overrideEndpoint?: string) => {
    if (!ticket || actionLoading) return;
    setActionLoading(action.key);
    setSheetError(null);
    try {
      const endpoint = overrideEndpoint ?? action.endpoint;
      const res  = await apiRequest("POST", `/api/tickets/${ticket.id}/${endpoint}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      playSuccessTone();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (ticket.branchId) refreshQueueForBranch(ticket.branchId).catch(() => {});
      closeSheet();
    } catch (e: any) {
      const msg = e?.message ? String(e.message).replace(/^\d+:\s*/, "") : "Action failed";
      playErrorTone();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSheetError(msg);
    } finally {
      setActionLoading(null);
    }
  }, [ticket, actionLoading, closeSheet, refreshQueueForBranch]);

  /* ── Permission loading ── */
  if (!permission) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingWrap}><ActivityIndicator color={Colors.light.primary} /></View>
      </ThemedView>
    );
  }

  /* ── Permission denied ── */
  if (!permission.granted) {
    return (
      <ThemedView style={[styles.container, styles.centred, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtnFilled, { backgroundColor: colors.primary, position: "absolute", left: Spacing.lg, top: insets.top + Spacing.sm }]}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={20} color="#FFFFFF" />
        </Pressable>
        <View style={[styles.permIcon, { backgroundColor: Colors.light.primary + "15" }]}>
          <Feather name="camera" size={48} color={Colors.light.primary} />
        </View>
        <ThemedText type="h4" style={styles.permTitle}>Camera Access Required</ThemedText>
        <ThemedText type="body" style={[styles.permText, { color: colors.textSecondary }]}>
          To scan dine-in tickets, TIQKETS needs camera access.
        </ThemedText>
        {permission.status === "denied" && !permission.canAskAgain ? (
          <Button onPress={() => Linking.openSettings().catch(() => {})} style={styles.permBtn}>Open Settings</Button>
        ) : (
          <Button onPress={requestPermission} style={styles.permBtn}>Enable Camera</Button>
        )}
        <Pressable onPress={() => navigation.goBack()} style={styles.cancelLink}>
          <ThemedText type="body" style={{ color: Colors.light.primary }}>Cancel</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  /* ── Derive sheet config ── */
  const cfg         = ticket ? getButtonConfig(ticket.status) : null;
  const statusColor = ticket ? getStatusColor(ticket.status)  : SH.textMuted;
  const statusLabel = ticket ? getStatusLabel(ticket.status)  : "";

  // Build the effective action for each fixed button (Arrived may call /resume in hold mode)
  const effectiveAction = (def: ActionDef): { endpoint: string } => ({
    endpoint: def.key === "arrive" && cfg ? cfg.arriveEndpoint : def.endpoint,
  });

  const isDisabled = (def: ActionDef): boolean => {
    if (!cfg) return true;
    if (def.key === "arrive") return cfg.arriveDisabled;
    if (def.key === "serve")  return cfg.seatedDisabled;
    if (def.key === "hold")   return cfg.holdDisabled;
    return true;
  };

  // Label override: "Arrived" → "Resume" when clicking it resumes from hold
  const buttonLabel = (def: ActionDef): string => {
    if (def.key === "arrive" && ticket?.status === "hold") return "Resume";
    return def.label;
  };

  const buttonIcon = (def: ActionDef): keyof typeof Feather.glyphMap => {
    if (def.key === "arrive" && ticket?.status === "hold") return "play-circle";
    return def.icon;
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── Top bar ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtnFilled, { backgroundColor: colors.primary }]}
          hitSlop={10}
        >
          <Feather name="arrow-left" size={20} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ThemedText type="h4" style={styles.screenTitle}>Scan Ticket</ThemedText>
          <ThemedText type="small" style={[styles.screenSub, { color: colors.textSecondary }]}>
            Point at customer's QR code
          </ThemedText>
        </View>
        <View style={[styles.headerBadge, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}>
          <Feather name="coffee" size={14} color={colors.primary} />
          <ThemedText type="small" style={[styles.headerBadgeText, { color: colors.primary }]}>Dine-In</ThemedText>
        </View>
      </View>

      {/* ── Camera window ── */}
      <View style={styles.cameraSection}>
        <View style={[styles.cameraWindow, { borderColor: colors.primary }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={scannedRef.current ? undefined : handleBarCodeScanned}
          />
          <View style={[styles.corner, styles.topLeft,     { borderColor: colors.primary }]} />
          <View style={[styles.corner, styles.topRight,    { borderColor: colors.primary }]} />
          <View style={[styles.corner, styles.bottomLeft,  { borderColor: colors.primary }]} />
          <View style={[styles.corner, styles.bottomRight, { borderColor: colors.primary }]} />
          {scanning ? (
            <View style={styles.cameraSpinner}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          ) : null}
        </View>
        <ThemedText type="small" style={[styles.hint, { color: colors.textSecondary }]}>
          Align the QR code inside the frame
        </ThemedText>
      </View>

      {/* ── Flash error (scan failure) ── */}
      {flashError ? (
        <View style={styles.flashCard}>
          <Feather name="x-circle" size={18} color="#FFFFFF" />
          <Text style={styles.flashText}>{flashError}</Text>
        </View>
      ) : null}

      {/* ── Bottom sheet ── */}
      <Modal visible={showSheet} transparent animationType="slide" onRequestClose={closeSheet}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />

          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.dragHandle}>
              <View style={styles.dragPill} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.sm }}>
              {ticket && cfg ? (
                <>
                  {/* ── Status chip + ticket number ── */}
                  <View style={styles.sheetHeaderRow}>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                    <View style={styles.ticketBadge}>
                      <Feather name="hash" size={12} color={SH.textSub} />
                      <Text style={styles.ticketBadgeText}>{ticket.ticketNumber}</Text>
                    </View>
                  </View>

                  {/* Customer info */}
                  <Text style={styles.customerName}>{ticket.customerName}</Text>
                  {ticket.serviceName ? (
                    <Text style={styles.serviceText}>{ticket.serviceName}</Text>
                  ) : null}

                  {/* Info row: Table + Guests */}
                  {(() => {
                    const guestCount = ticket.formData?.partySize;
                    const hasGuests  = guestCount != null && Number(guestCount) > 0;
                    return (
                      <View style={styles.infoGrid}>
                        {/* Table card */}
                        <View style={[styles.infoCard, { borderColor: ticket.tableNumber ? SH.primary + "40" : SH.border }]}>
                          <View style={[styles.infoIconWrap, { backgroundColor: ticket.tableNumber ? SH.primary + "12" : "#F1F5F9" }]}>
                            <Feather name="grid" size={16} color={ticket.tableNumber ? SH.primary : SH.textMuted} />
                          </View>
                          <Text style={styles.infoCardLabel}>Table</Text>
                          <Text style={[styles.infoCardValue, { color: ticket.tableNumber ? SH.text : SH.textMuted }]} numberOfLines={1}>
                            {ticket.tableNumber || "—"}
                          </Text>
                          {ticket.tableNumber ? (
                            <View style={[styles.infoCardChip, { backgroundColor: SH.primary + "12" }]}>
                              <Text style={[styles.infoCardChipText, { color: SH.primary }]}>Assigned</Text>
                            </View>
                          ) : null}
                        </View>
                        {/* Guests card */}
                        <View style={[styles.infoCard, { borderColor: hasGuests ? "#10B98140" : SH.border }]}>
                          <View style={[styles.infoIconWrap, { backgroundColor: hasGuests ? "#10B98112" : "#F1F5F9" }]}>
                            <Feather name="users" size={16} color={hasGuests ? "#10B981" : SH.textMuted} />
                          </View>
                          <Text style={styles.infoCardLabel}>Guests</Text>
                          <Text style={[styles.infoCardValue, { color: hasGuests ? SH.text : SH.textMuted }]}>
                            {hasGuests ? String(guestCount) : "—"}
                          </Text>
                          {hasGuests ? (
                            <View style={[styles.infoCardChip, { backgroundColor: "#10B98112" }]}>
                              <Text style={[styles.infoCardChipText, { color: "#10B981" }]}>
                                {Number(guestCount) === 1 ? "1 person" : `${guestCount} people`}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })()}

                  <View style={styles.divider} />

                  {/* ── Actions ── */}
                  {cfg.isTerminal ? (
                    /* Seated / completed / cancelled / no-show */
                    <View style={styles.terminalCard}>
                      <Feather
                        name={ticket.status === "completed" ? "check-circle" : (ticket.status === "serving" || ticket.status === "arrived") ? "coffee" : "info"}
                        size={20}
                        color={SH.textSub}
                      />
                      <Text style={styles.terminalText}>
                        {(ticket.status === "arrived" || ticket.status === "serving") ? "Customer is already seated." :
                          ticket.status === "completed" ? "This customer has been completed." :
                                                          "No further actions available."}
                      </Text>
                    </View>
                  ) : (
                    <>
                      {/* Fixed trio: Arrived · Seated · Hold */}
                      <View style={styles.actionsGrid}>
                        {FIXED_ACTIONS.map((def) => {
                          const disabled  = isDisabled(def) || !!actionLoading;
                          const isLoading = actionLoading === def.key;
                          const ea        = effectiveAction(def);
                          const label     = buttonLabel(def);
                          const icon      = buttonIcon(def);
                          return (
                            <Pressable
                              key={def.key}
                              style={[
                                styles.actionBtn,
                                disabled
                                  ? styles.actionBtnDisabled
                                  : { backgroundColor: def.activeColor + "15", borderColor: def.activeColor + "50" },
                              ]}
                              onPress={() => !disabled && handleAction({ ...def, ...ea }, ea.endpoint)}
                              disabled={disabled}
                            >
                              {isLoading
                                ? <ActivityIndicator size="small" color={def.activeColor} />
                                : <Feather name={icon} size={20} color={disabled ? SH.disabled : def.activeColor} />
                              }
                              <Text style={[styles.actionBtnLabel, { color: disabled ? SH.disabled : def.activeColor }]}>
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {/* Walk In — full-width grey; bypasses flow → seats immediately */}
                      {cfg.showWalkIn ? (
                        <Pressable
                          style={[styles.walkInBtn, actionLoading === "walk_in" && { opacity: 0.65 }]}
                          onPress={() => handleAction(WALK_IN_ACTION)}
                          disabled={!!actionLoading}
                        >
                          {actionLoading === "walk_in"
                            ? <ActivityIndicator size="small" color={SH.textSub} />
                            : <Feather name="zap" size={18} color={SH.textSub} />
                          }
                          <Text style={styles.walkInBtnLabel}>Walk In</Text>
                          <Text style={styles.walkInBtnSub}>Seat customer immediately</Text>
                        </Pressable>
                      ) : null}
                    </>
                  )}

                  {/* Inline action error */}
                  {sheetError ? (
                    <View style={styles.sheetErrorCard}>
                      <Feather name="alert-circle" size={15} color={SH.error} />
                      <Text style={styles.sheetErrorText}>{sheetError}</Text>
                    </View>
                  ) : null}

                  {/* Close without action */}
                  <Pressable style={styles.closeBtn} onPress={closeSheet}>
                    <Feather name="x" size={16} color={SH.textSub} />
                    <Text style={styles.closeBtnText}>Close</Text>
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const WINDOW_SIZE = 260;

const styles = StyleSheet.create({
  container:   { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  centred:     { alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing["3xl"] },

  /* Permission */
  permIcon:   { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: Spacing["2xl"] },
  permTitle:  { textAlign: "center", marginBottom: Spacing.md },
  permText:   { textAlign: "center", marginBottom: Spacing["2xl"] },
  permBtn:    { width: "100%", marginBottom: Spacing.md },
  cancelLink: { paddingVertical: Spacing.md },

  /* Top bar */
  topBar:          { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md },
  backBtnFilled:   { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", ...Shadows.small },
  screenTitle:     { fontWeight: "800" },
  screenSub:       { fontSize: 12, marginTop: 1 },
  headerBadge:     { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full, borderWidth: 1 },
  headerBadgeText: { fontWeight: "700", fontSize: 12 },

  /* Camera window */
  cameraSection: { alignItems: "center", paddingVertical: Spacing["2xl"] },
  cameraWindow:  { width: WINDOW_SIZE, height: WINDOW_SIZE, borderRadius: BorderRadius.xl, overflow: "hidden", borderWidth: 2 },
  cameraSpinner: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  hint:          { marginTop: Spacing.lg, textAlign: "center" },
  corner:        { position: "absolute", width: 24, height: 24, borderWidth: 3 },
  topLeft:       { top: 10,    left: 10,  borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius:     4 },
  topRight:      { top: 10,    right: 10, borderLeftWidth:  0, borderBottomWidth: 0, borderTopRightRadius:    4 },
  bottomLeft:    { bottom: 10, left: 10,  borderRightWidth: 0, borderTopWidth:    0, borderBottomLeftRadius:  4 },
  bottomRight:   { bottom: 10, right: 10, borderLeftWidth:  0, borderTopWidth:    0, borderBottomRightRadius: 4 },

  /* Flash error */
  flashCard: { position: "absolute", bottom: 28, left: Spacing.lg, right: Spacing.lg, flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: "#EF4444F0", ...Shadows.medium },
  flashText: { flex: 1, fontWeight: "600", fontSize: 14, color: "#FFFFFF" },

  /* Bottom sheet — always light */
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.50)" },
  sheet:         { backgroundColor: SH.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.lg, maxHeight: "88%", ...Shadows.large },
  dragHandle:    { alignItems: "center", paddingVertical: Spacing.md },
  dragPill:      { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB" },

  /* Sheet header */
  sheetHeaderRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md },
  statusBadge:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: BorderRadius.full },
  statusDot:       { width: 8, height: 8, borderRadius: 4 },
  statusText:      { fontWeight: "700", fontSize: 13 },
  ticketBadge:     { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: BorderRadius.full, backgroundColor: "#F1F5F9" },
  ticketBadgeText: { fontSize: 13, fontWeight: "600", color: SH.textSub },

  /* Customer info */
  customerName: { fontSize: 22, fontWeight: "800", color: SH.text,    marginBottom: Spacing.xs },
  serviceText:  { fontSize: 14,                    color: SH.textSub, marginBottom: Spacing.lg },

  /* Info grid (Table + Guests) */
  infoGrid:         { flexDirection: "row", gap: Spacing.md, marginBottom: Spacing.lg },
  infoCard:         { flex: 1, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: SH.border, backgroundColor: "#F8F9FB", gap: 4 },
  infoIconWrap:     { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  infoCardLabel:    { fontSize: 11, fontWeight: "600", color: SH.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  infoCardValue:    { fontSize: 20, fontWeight: "800" },
  infoCardChip:     { alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 3, borderRadius: BorderRadius.full, marginTop: 2 },
  infoCardChipText: { fontSize: 10, fontWeight: "700" },
  divider:          { height: 1, backgroundColor: SH.border, marginBottom: Spacing.lg },

  /* Fixed trio */
  actionsGrid:       { flexDirection: "row", gap: Spacing.md, marginBottom: Spacing.md },
  actionBtn:         { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: BorderRadius.xl, borderWidth: 1.5 },
  actionBtnDisabled: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: BorderRadius.xl, borderWidth: 1.5, backgroundColor: SH.disabledBg, borderColor: "#E2E8F0" },
  actionBtnLabel:    { fontWeight: "700", fontSize: 12 },

  /* Walk In */
  walkInBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingVertical: 14, borderRadius: BorderRadius.xl, backgroundColor: "#F1F5F9", borderWidth: 1.5, borderColor: SH.border, marginBottom: Spacing.md },
  walkInBtnLabel: { fontWeight: "800", fontSize: 15, color: SH.textSub },
  walkInBtnSub:   { fontSize: 12, color: SH.textMuted },

  /* Terminal */
  terminalCard: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: "#F8F9FB", marginBottom: Spacing.lg },
  terminalText: { flex: 1, fontSize: 14, color: SH.textSub },

  /* Sheet error */
  sheetErrorCard: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2", marginBottom: Spacing.md },
  sheetErrorText: { flex: 1, fontSize: 13, fontWeight: "600", color: SH.error },

  /* Close */
  closeBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingVertical: 13, borderRadius: BorderRadius.xl, borderWidth: 1.5, borderColor: SH.border, marginBottom: Spacing.sm },
  closeBtnText: { fontSize: 15, fontWeight: "600", color: SH.textSub },
});
