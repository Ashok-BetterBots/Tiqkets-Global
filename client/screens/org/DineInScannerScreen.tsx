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

function getActions(status: string, colors: typeof Colors.light): ActionConfig[] {
  switch (status) {
    case "waiting":
      return [
        { key: "hold",   label: "Hold",   icon: "pause-circle", color: "#F97316", endpoint: "hold"   },
      ];
    case "called":
      return [
        { key: "arrive", label: "Arrived",  icon: "user-check",  color: "#10B981", endpoint: "arrive" },
        { key: "hold",   label: "Hold",     icon: "pause-circle", color: "#F97316", endpoint: "hold"   },
      ];
    case "arrived":
      return [
        { key: "serve",  label: "Seated",  icon: "check-circle", color: "#3B82F6", endpoint: "serve" },
        { key: "hold",   label: "Hold",    icon: "pause-circle", color: "#F97316", endpoint: "hold"  },
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
  const { theme } = useTheme();

  if (Platform.OS === "web") {
    return (
      <ThemedView style={[styles.container, styles.permissionContainer, { paddingTop: insets.top + Spacing["4xl"] }]}>
        <View style={[styles.permissionIcon, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="smartphone" size={48} color={theme.primary} />
        </View>
        <ThemedText type="h4" style={styles.permissionTitle}>
          Scanner Not Available on Web
        </ThemedText>
        <ThemedText type="body" style={[styles.permissionText, { color: theme.textSecondary }]}>
          The dine-in QR scanner requires a mobile device camera.
        </ThemedText>
        <Button onPress={() => navigation.goBack()} style={styles.permissionButton}>
          Go Back
        </Button>
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

  const CameraModule = require("expo-camera");
  const { CameraView, useCameraPermissions } = CameraModule;
  const [permission, requestPermission] = useCameraPermissions();

  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [actionLoading, setActionLoading] = useState<ActionKey | null>(null);
  const [errorCard, setErrorCard] = useState<string | null>(null);

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
        // Extract raw token — handle full URLs like https://host/t/<token>
        const raw = result.data.trim();
        const token = raw.includes("/") ? raw.split("/").filter(Boolean).pop()! : raw;

        const res = await apiRequest("GET", `/api/org/tickets/by-qr/${encodeURIComponent(token)}`);
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
        setErrorCard(msg);
        setTimeout(() => {
          setErrorCard(null);
          resetScanner();
        }, 2500);
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
        const res = await apiRequest("POST", `/api/tickets/${ticket.id}/${action.endpoint}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        await playSuccessTone();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Refresh the branch queue so OrgQueueScreen picks up the change.
        if (ticket.branchId) {
          refreshQueueForBranch(ticket.branchId).catch(() => {});
        }
        closeSheet();
      } catch (e: any) {
        const msg = e?.message ? String(e.message).replace(/^\d+:\s*/, "") : "Action failed";
        await playErrorTone();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        // Update local ticket status optimistically failed — just show error in alert
        // and keep sheet open so staff can try another action.
        setActionLoading(null);
        // Show a non-blocking inline error by briefly surfacing the card
        setErrorCard(msg);
        setTimeout(() => setErrorCard(null), 2500);
      } finally {
        setActionLoading(null);
      }
    },
    [ticket, actionLoading, closeSheet, refreshQueueForBranch],
  );

  if (!permission) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.light.primary} />
        </View>
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView style={[styles.container, styles.permissionContainer, { paddingTop: insets.top }]}>
        <View style={[styles.permissionIcon, { backgroundColor: Colors.light.primary + "15" }]}>
          <Feather name="camera" size={48} color={Colors.light.primary} />
        </View>
        <ThemedText type="h4" style={styles.permissionTitle}>Camera Access Required</ThemedText>
        <ThemedText type="body" style={[styles.permissionText, { color: Colors.light.textSecondary }]}>
          To scan dine-in tickets, TIQKETS needs access to your camera.
        </ThemedText>
        {permission.status === "denied" && !permission.canAskAgain ? (
          Platform.OS !== "web" ? (
            <Button onPress={() => Linking.openSettings().catch(() => {})} style={styles.permissionButton}>
              Open Settings
            </Button>
          ) : null
        ) : (
          <Button onPress={requestPermission} style={styles.permissionButton}>
            Enable Camera
          </Button>
        )}
        <Pressable onPress={() => navigation.goBack()} style={styles.cancelLink}>
          <ThemedText type="body" style={{ color: Colors.light.primary }}>Cancel</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const actions = ticket ? getActions(ticket.status, colors) : [];
  const statusColor = ticket ? getStatusColor(ticket.status, colors) : colors.textSecondary;
  const statusLabel = ticket ? getStatusLabel(ticket.status) : "";

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      {/* Camera */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Camera overlay */}
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.closeButton} hitSlop={12}>
            <Feather name="x" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerBadge}>
            <Feather name="coffee" size={16} color="#FFFFFF" />
            <ThemedText type="small" style={styles.headerBadgeText} lightColor="#FFFFFF" darkColor="#FFFFFF">
              Dine-In Scanner
            </ThemedText>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Scan frame */}
        <View style={styles.scanArea}>
          {loading ? (
            <ActivityIndicator size="large" color="#FFFFFF" />
          ) : (
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.topLeft,     { borderColor: Colors.light.primary }]} />
              <View style={[styles.corner, styles.topRight,    { borderColor: Colors.light.primary }]} />
              <View style={[styles.corner, styles.bottomLeft,  { borderColor: Colors.light.primary }]} />
              <View style={[styles.corner, styles.bottomRight, { borderColor: Colors.light.primary }]} />
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing["2xl"] }]}>
          <ThemedText type="body" style={styles.instruction} lightColor="#FFFFFF" darkColor="#FFFFFF">
            Scan the customer's ticket QR code
          </ThemedText>
          <ThemedText type="small" style={styles.subInstruction} lightColor="rgba(255,255,255,0.65)" darkColor="rgba(255,255,255,0.65)">
            Check table assignment and update status instantly
          </ThemedText>
        </View>
      </View>

      {/* Error flash card */}
      {errorCard ? (
        <View style={styles.resultOverlay}>
          <View style={[styles.resultCard, { backgroundColor: Colors.light.error }]}>
            <Feather name="x-circle" size={40} color="#FFFFFF" />
            <ThemedText type="h4" style={styles.resultTitle} lightColor="#FFFFFF" darkColor="#FFFFFF">
              {errorCard}
            </ThemedText>
          </View>
        </View>
      ) : null}

      {/* Bottom sheet */}
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
                  {/* Status badge */}
                  <View style={styles.statusRow}>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      <ThemedText style={[styles.statusText, { color: statusColor }]}>
                        {statusLabel}
                      </ThemedText>
                    </View>
                    <View style={[styles.ticketBadge, { backgroundColor: colors.surfaceMuted }]}>
                      <Feather name="hash" size={12} color={colors.textSecondary} />
                      <ThemedText style={[styles.ticketBadgeText, { color: colors.textSecondary }]}>
                        {ticket.ticketNumber}
                      </ThemedText>
                    </View>
                  </View>

                  {/* Customer name */}
                  <ThemedText type="h3" style={styles.customerName}>
                    {ticket.customerName}
                  </ThemedText>

                  {/* Service */}
                  {ticket.serviceName ? (
                    <ThemedText style={[styles.serviceText, { color: colors.textSecondary }]}>
                      {ticket.serviceName}
                    </ThemedText>
                  ) : null}

                  {/* Table info */}
                  <View style={[styles.tableRow, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                    <Feather
                      name="grid"
                      size={18}
                      color={ticket.tableNumber ? Colors.light.primary : colors.textSecondary}
                    />
                    <View style={{ flex: 1 }}>
                      <ThemedText style={[styles.tableLabel, { color: colors.textSecondary }]}>
                        Table
                      </ThemedText>
                      <ThemedText style={[
                        styles.tableValue,
                        { color: ticket.tableNumber ? colors.text : colors.textSecondary }
                      ]}>
                        {ticket.tableNumber || "Not yet assigned"}
                      </ThemedText>
                    </View>
                    {ticket.tableNumber ? (
                      <View style={[styles.tableAssignedBadge, { backgroundColor: Colors.light.primary + "18" }]}>
                        <ThemedText style={[styles.tableAssignedText, { color: Colors.light.primary }]}>
                          Assigned
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>

                  {/* Divider */}
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />

                  {/* Action buttons */}
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
                          {actionLoading === action.key ? (
                            <ActivityIndicator size="small" color={action.color} />
                          ) : (
                            <Feather name={action.icon} size={22} color={action.color} />
                          )}
                          <ThemedText style={[styles.actionBtnLabel, { color: action.color }]}>
                            {action.label}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    /* No actions — terminal status */
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

                  {/* Close / scan next */}
                  <Pressable style={[styles.closeSheetBtn, { borderColor: colors.border }]} onPress={closeSheet}>
                    <Feather name="camera" size={16} color={colors.textSecondary} />
                    <ThemedText style={[styles.closeSheetText, { color: colors.textSecondary }]}>
                      Scan Next Ticket
                    </ThemedText>
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1 },
  loadingContainer:     { flex: 1, alignItems: "center", justifyContent: "center" },
  permissionContainer:  { alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing["3xl"] },
  permissionIcon:       { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: Spacing["2xl"] },
  permissionTitle:      { textAlign: "center", marginBottom: Spacing.md },
  permissionText:       { textAlign: "center", marginBottom: Spacing["2xl"] },
  permissionButton:     { width: "100%", marginBottom: Spacing.md },
  cancelLink:           { paddingVertical: Spacing.md },

  // Camera overlay
  overlay:       { flex: 1, justifyContent: "space-between" },
  header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  closeButton:   { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  headerBadge:   { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: BorderRadius.full },
  headerBadgeText: { fontWeight: "700", fontSize: 14 },
  scanArea:      { flex: 1, alignItems: "center", justifyContent: "center" },
  scanFrame:     { width: 240, height: 240 },
  corner:        { position: "absolute", width: 32, height: 32, borderWidth: 3 },
  topLeft:       { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  topRight:      { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  bottomLeft:    { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  bottomRight:   { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  footer:        { alignItems: "center", paddingHorizontal: Spacing["2xl"], gap: Spacing.xs },
  instruction:   { fontWeight: "700", textAlign: "center" },
  subInstruction: { textAlign: "center", lineHeight: 18 },

  // Error flash
  resultOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)", padding: Spacing["2xl"] },
  resultCard:    { width: "100%", borderRadius: BorderRadius.xl, padding: Spacing["2xl"], alignItems: "center", gap: Spacing.md, ...Shadows.large },
  resultTitle:   { fontWeight: "700", textAlign: "center", fontSize: 16 },

  // Bottom sheet
  sheetBackdrop:  { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet:          { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.lg, ...Shadows.large, maxHeight: "82%" },
  dragHandle:     { alignItems: "center", paddingVertical: Spacing.md },
  dragPill:       { width: 40, height: 4, borderRadius: 2 },

  // Sheet content
  statusRow:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md },
  statusBadge:        { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusDot:          { width: 8, height: 8, borderRadius: 4 },
  statusText:         { fontWeight: "700", fontSize: 13 },
  ticketBadge:        { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  ticketBadgeText:    { fontSize: 13, fontWeight: "600" },
  customerName:       { marginBottom: Spacing.xs },
  serviceText:        { fontSize: 14, marginBottom: Spacing.lg },
  tableRow:           { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.lg },
  tableLabel:         { fontSize: 11, fontWeight: "500", marginBottom: 2 },
  tableValue:         { fontSize: 16, fontWeight: "700" },
  tableAssignedBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  tableAssignedText:  { fontSize: 11, fontWeight: "700" },
  divider:            { height: 1, marginBottom: Spacing.lg },

  actionsGrid:    { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md, marginBottom: Spacing.lg },
  actionBtn:      { flex: 1, minWidth: "45%", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingVertical: Spacing.lg, borderRadius: BorderRadius.xl, borderWidth: 1.5 },
  actionBtnFull:  { flex: 0, width: "100%" },
  actionBtnLabel: { fontWeight: "700", fontSize: 15 },

  terminalState:  { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.lg },
  terminalText:   { flex: 1, fontSize: 14 },

  closeSheetBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1 },
  closeSheetText: { fontSize: 14, fontWeight: "600" },
});
