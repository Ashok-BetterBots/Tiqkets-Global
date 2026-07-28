import React, { useState, useCallback } from "react";
import {
  View,
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

interface TicketData {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerPhone?: string;
  status: string;
  tableNumber?: string | null;
  branchId: string;
  serviceName?: string;
  position?: number;
}

type ActionKey = "arrive" | "serve" | "hold" | "resume";

interface ActionConfig {
  key: ActionKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  endpoint: string;
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "waiting":   return "Waiting";
    case "called":    return "Called";
    case "arrived":   return "Arrived";
    case "serving":   return "Seated";
    case "hold":      return "On Hold";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    case "no_show":   return "No Show";
    default:          return status;
  }
}

function getStatusColor(status: string, colors: typeof Colors.light): string {
  switch (status) {
    case "waiting":   return colors.primary;
    case "called":    return "#F59E0B";
    case "arrived":   return "#10B981";
    case "serving":   return "#3B82F6";
    case "hold":      return "#F97316";
    case "completed": return colors.textSecondary;
    default:          return colors.textSecondary;
  }
}

function getActions(status: string): ActionConfig[] {
  switch (status) {
    case "waiting":
      return [
        { key: "hold",   label: "Hold",    icon: "pause-circle", color: "#F97316", endpoint: "hold"   },
      ];
    case "called":
      return [
        { key: "arrive", label: "Arrived", icon: "user-check",   color: "#10B981", endpoint: "arrive" },
        { key: "hold",   label: "Hold",    icon: "pause-circle", color: "#F97316", endpoint: "hold"   },
      ];
    case "arrived":
      return [
        { key: "serve",  label: "Seated",  icon: "check-circle", color: "#3B82F6", endpoint: "serve"  },
        { key: "hold",   label: "Hold",    icon: "pause-circle", color: "#F97316", endpoint: "hold"   },
      ];
    case "hold":
      return [
        { key: "resume", label: "Resume",  icon: "play-circle",  color: "#10B981", endpoint: "resume" },
      ];
    default:
      return [];
  }
}

export default function DineInScannerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();

  if (Platform.OS === "web") {
    return (
      <ThemedView style={[styles.container, styles.centred, { paddingTop: insets.top + Spacing["4xl"] }]}>
        <View style={[styles.permIcon, { backgroundColor: Colors.light.primary + "15" }]}>
          <Feather name="smartphone" size={48} color={Colors.light.primary} />
        </View>
        <ThemedText type="h4" style={styles.permTitle}>Scanner Not Available on Web</ThemedText>
        <ThemedText type="body" style={[styles.permText, { color: Colors.light.textSecondary }]}>
          The dine-in QR scanner requires a mobile device camera.
        </ThemedText>
        <Button onPress={() => navigation.goBack()} style={styles.permBtn}>Go Back</Button>
      </ThemedView>
    );
  }

  return <DineInScannerNative />;
}

function DineInScannerNative() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const isDark = theme.background === Colors.dark.background;
  const colors = isDark ? Colors.dark : Colors.light;
  const { refreshQueueForBranch } = useOrganization();

  const { CameraView, useCameraPermissions } = require("expo-camera");
  const [permission, requestPermission] = useCameraPermissions();

  const [scanned, setScanned]             = useState(false);
  const [loading, setLoading]             = useState(false);
  const [ticket, setTicket]               = useState<TicketData | null>(null);
  const [showSheet, setShowSheet]         = useState(false);
  const [actionLoading, setActionLoading] = useState<ActionKey | null>(null);
  const [flashError, setFlashError]       = useState<string | null>(null);

  const resetScanner = useCallback(() => {
    setScanned(false);
    setLoading(false);
  }, []);

  const closeSheet = useCallback(() => {
    setShowSheet(false);
    setTicket(null);
    resetScanner();
  }, [resetScanner]);

  const handleBarCodeScanned = useCallback(
    async (result: { data: string }) => {
      if (scanned || loading) return;
      setScanned(true);
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      try {
        const raw   = result.data.trim();
        const token = raw.includes("/") ? raw.split("/").filter(Boolean).pop()! : raw;

        const res  = await apiRequest("GET", `/api/org/tickets/by-qr/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        await playSuccessTone();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTicket(data.ticket);
        setShowSheet(true);
      } catch (e: any) {
        const msg = e?.message ? String(e.message).replace(/^\d+:\s*/, "") : "Could not find ticket";
        await playErrorTone();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFlashError(msg);
        setTimeout(() => { setFlashError(null); resetScanner(); }, 2500);
      } finally {
        setLoading(false);
      }
    },
    [scanned, loading, resetScanner],
  );

  const handleAction = useCallback(
    async (action: ActionConfig) => {
      if (!ticket || actionLoading) return;
      setActionLoading(action.key);
      try {
        const res  = await apiRequest("POST", `/api/tickets/${ticket.id}/${action.endpoint}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        await playSuccessTone();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (ticket.branchId) refreshQueueForBranch(ticket.branchId).catch(() => {});
        closeSheet();
      } catch (e: any) {
        const msg = e?.message ? String(e.message).replace(/^\d+:\s*/, "") : "Action failed";
        await playErrorTone();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setFlashError(msg);
        setTimeout(() => setFlashError(null), 2500);
      } finally {
        setActionLoading(null);
      }
    },
    [ticket, actionLoading, closeSheet, refreshQueueForBranch],
  );

  /* ─── Permission screens ─── */
  if (!permission) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingWrap}><ActivityIndicator color={Colors.light.primary} /></View>
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView style={[styles.container, styles.centred, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={[styles.backBtn, { top: insets.top + Spacing.md }]}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <View style={[styles.permIcon, { backgroundColor: Colors.light.primary + "15" }]}>
          <Feather name="camera" size={48} color={Colors.light.primary} />
        </View>
        <ThemedText type="h4" style={styles.permTitle}>Camera Access Required</ThemedText>
        <ThemedText type="body" style={[styles.permText, { color: colors.textSecondary }]}>
          To scan dine-in tickets, TIQKETS needs camera access.
        </ThemedText>
        {permission.status === "denied" && !permission.canAskAgain ? (
          <Button onPress={() => Linking.openSettings().catch(() => {})} style={styles.permBtn}>
            Open Settings
          </Button>
        ) : (
          <Button onPress={requestPermission} style={styles.permBtn}>Enable Camera</Button>
        )}
        <Pressable onPress={() => navigation.goBack()} style={styles.cancelLink}>
          <ThemedText type="body" style={{ color: Colors.light.primary }}>Cancel</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const actions     = ticket ? getActions(ticket.status) : [];
  const statusColor = ticket ? getStatusColor(ticket.status, colors) : colors.textSecondary;
  const statusLabel = ticket ? getStatusLabel(ticket.status) : "";

  return (
    <ThemedView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── Top bar ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ThemedText type="h4" style={styles.screenTitle}>Scan Ticket</ThemedText>
          <ThemedText type="small" style={[styles.screenSub, { color: colors.textSecondary }]}>
            Point at customer's QR code
          </ThemedText>
        </View>
        <View style={[styles.headerBadge, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}>
          <Feather name="coffee" size={14} color={colors.primary} />
          <ThemedText type="small" style={[styles.headerBadgeText, { color: colors.primary }]}>
            Dine-In
          </ThemedText>
        </View>
      </View>

      {/* ── Camera window ── */}
      <View style={styles.cameraSection}>
        <View style={[styles.cameraWindow, { borderColor: colors.border }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />

          {/* Corner markers */}
          <View style={[styles.corner, styles.topLeft,     { borderColor: colors.primary }]} />
          <View style={[styles.corner, styles.topRight,    { borderColor: colors.primary }]} />
          <View style={[styles.corner, styles.bottomLeft,  { borderColor: colors.primary }]} />
          <View style={[styles.corner, styles.bottomRight, { borderColor: colors.primary }]} />

          {/* Loading spinner overlay */}
          {loading ? (
            <View style={styles.cameraSpinner}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          ) : null}
        </View>

        <ThemedText type="small" style={[styles.hint, { color: colors.textSecondary }]}>
          Align the QR code inside the frame
        </ThemedText>
      </View>

      {/* ── Error flash ── */}
      {flashError ? (
        <View style={[styles.flashCard, { backgroundColor: colors.error + "F0" }]}>
          <Feather name="x-circle" size={18} color="#FFFFFF" />
          <ThemedText type="small" style={styles.flashText} lightColor="#FFFFFF" darkColor="#FFFFFF">
            {flashError}
          </ThemedText>
        </View>
      ) : null}

      {/* ── Bottom sheet ── */}
      <Modal visible={showSheet} transparent animationType="slide" onRequestClose={closeSheet}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + Spacing.lg }]}>
            {/* Drag handle */}
            <View style={styles.dragHandle}>
              <View style={[styles.dragPill, { backgroundColor: colors.borderSubtle }]} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.md }}>
              {ticket ? (
                <>
                  {/* Status + ticket number */}
                  <View style={styles.statusRow}>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      <ThemedText style={[styles.statusText, { color: statusColor }]}>{statusLabel}</ThemedText>
                    </View>
                    <View style={[styles.ticketBadge, { backgroundColor: colors.surfaceMuted }]}>
                      <Feather name="hash" size={12} color={colors.textSecondary} />
                      <ThemedText style={[styles.ticketBadgeText, { color: colors.textSecondary }]}>
                        {ticket.ticketNumber}
                      </ThemedText>
                    </View>
                  </View>

                  <ThemedText type="h3" style={styles.customerName}>{ticket.customerName}</ThemedText>
                  {ticket.serviceName ? (
                    <ThemedText style={[styles.serviceText, { color: colors.textSecondary }]}>
                      {ticket.serviceName}
                    </ThemedText>
                  ) : null}

                  {/* Table row */}
                  <View style={[styles.tableRow, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                    <Feather
                      name="grid"
                      size={18}
                      color={ticket.tableNumber ? colors.primary : colors.textSecondary}
                    />
                    <View style={{ flex: 1 }}>
                      <ThemedText style={[styles.tableLabel, { color: colors.textSecondary }]}>Table</ThemedText>
                      <ThemedText style={[styles.tableValue, { color: ticket.tableNumber ? colors.text : colors.textSecondary }]}>
                        {ticket.tableNumber || "Not yet assigned"}
                      </ThemedText>
                    </View>
                    {ticket.tableNumber ? (
                      <View style={[styles.tableChip, { backgroundColor: colors.primary + "18" }]}>
                        <ThemedText style={[styles.tableChipText, { color: colors.primary }]}>Assigned</ThemedText>
                      </View>
                    ) : null}
                  </View>

                  <View style={[styles.divider, { backgroundColor: colors.border }]} />

                  {/* Actions */}
                  {actions.length > 0 ? (
                    <View style={styles.actionsGrid}>
                      {actions.map((action) => (
                        <Pressable
                          key={action.key}
                          style={[
                            styles.actionBtn,
                            { backgroundColor: action.color + "15", borderColor: action.color + "40" },
                            actions.length === 1 && styles.actionBtnFull,
                            actionLoading === action.key && { opacity: 0.6 },
                          ]}
                          onPress={() => handleAction(action)}
                          disabled={!!actionLoading}
                        >
                          {actionLoading === action.key
                            ? <ActivityIndicator size="small" color={action.color} />
                            : <Feather name={action.icon} size={22} color={action.color} />
                          }
                          <ThemedText style={[styles.actionBtnLabel, { color: action.color }]}>
                            {action.label}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <View style={[styles.terminalState, { backgroundColor: colors.surfaceMuted }]}>
                      <Feather
                        name={ticket.status === "completed" ? "check-circle" : "info"}
                        size={20}
                        color={colors.textSecondary}
                      />
                      <ThemedText style={[styles.terminalText, { color: colors.textSecondary }]}>
                        {ticket.status === "completed"
                          ? "This customer has been completed."
                          : ticket.status === "serving"
                          ? "Customer is already seated."
                          : "No actions available for this status."}
                      </ThemedText>
                    </View>
                  )}

                  {/* Inline flash inside sheet */}
                  {flashError ? (
                    <View style={[styles.sheetFlash, { backgroundColor: colors.error + "18", borderColor: colors.error + "40" }]}>
                      <Feather name="alert-circle" size={16} color={colors.error} />
                      <ThemedText style={[styles.sheetFlashText, { color: colors.error }]}>{flashError}</ThemedText>
                    </View>
                  ) : null}

                  {/* Scan next */}
                  <Pressable style={[styles.scanNextBtn, { borderColor: colors.border }]} onPress={closeSheet}>
                    <Feather name="camera" size={16} color={colors.textSecondary} />
                    <ThemedText style={[styles.scanNextText, { color: colors.textSecondary }]}>
                      Scan Next Ticket
                    </ThemedText>
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
  topBar:         { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md },
  backBtn:        { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  screenTitle:    { fontWeight: "800" },
  screenSub:      { fontSize: 12, marginTop: 1 },
  headerBadge:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full, borderWidth: 1 },
  headerBadgeText:{ fontWeight: "700", fontSize: 12 },

  /* Camera window */
  cameraSection: { alignItems: "center", paddingVertical: Spacing["2xl"] },
  cameraWindow:  {
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    borderWidth: 1,
  },
  cameraSpinner: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  hint:          { marginTop: Spacing.lg, textAlign: "center" },

  /* Corner markers — layered on top of camera */
  corner:      { position: "absolute", width: 24, height: 24, borderWidth: 3 },
  topLeft:     { top: 10,  left: 10,  borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius:     4 },
  topRight:    { top: 10,  right: 10, borderLeftWidth:  0, borderBottomWidth: 0, borderTopRightRadius:    4 },
  bottomLeft:  { bottom: 10, left: 10,  borderRightWidth: 0, borderTopWidth: 0,  borderBottomLeftRadius:  4 },
  bottomRight: { bottom: 10, right: 10, borderLeftWidth:  0, borderTopWidth: 0,  borderBottomRightRadius: 4 },

  /* Error flash (outside sheet) */
  flashCard: { position: "absolute", bottom: 24, left: Spacing.lg, right: Spacing.lg, flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.lg, ...Shadows.medium },
  flashText: { flex: 1, fontWeight: "600" },

  /* Bottom sheet */
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.lg, maxHeight: "85%", ...Shadows.large },
  dragHandle:    { alignItems: "center", paddingVertical: Spacing.md },
  dragPill:      { width: 40, height: 4, borderRadius: 2 },

  /* Sheet content */
  statusRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md },
  statusBadge:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusDot:       { width: 8, height: 8, borderRadius: 4 },
  statusText:      { fontWeight: "700", fontSize: 13 },
  ticketBadge:     { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  ticketBadgeText: { fontSize: 13, fontWeight: "600" },
  customerName:    { marginBottom: Spacing.xs },
  serviceText:     { fontSize: 14, marginBottom: Spacing.lg },
  tableRow:        { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.lg },
  tableLabel:      { fontSize: 11, fontWeight: "500", marginBottom: 2 },
  tableValue:      { fontSize: 16, fontWeight: "700" },
  tableChip:       { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  tableChipText:   { fontSize: 11, fontWeight: "700" },
  divider:         { height: 1, marginBottom: Spacing.lg },

  actionsGrid:   { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md, marginBottom: Spacing.lg },
  actionBtn:     { flex: 1, minWidth: "45%", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingVertical: Spacing.lg, borderRadius: BorderRadius.xl, borderWidth: 1.5 },
  actionBtnFull: { flex: 0, width: "100%" },
  actionBtnLabel:{ fontWeight: "700", fontSize: 15 },

  terminalState: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.lg },
  terminalText:  { flex: 1, fontSize: 14 },

  sheetFlash:     { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.md },
  sheetFlashText: { flex: 1, fontSize: 13, fontWeight: "600" },

  scanNextBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1 },
  scanNextText: { fontSize: 14, fontWeight: "600" },
});
