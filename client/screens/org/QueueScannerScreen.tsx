import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { SlideInDown, SlideOutDown, FadeIn, FadeOut } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { OrgStackParamList } from "@/navigation/OrgStackNavigator";

type NavigationProp = NativeStackNavigationProp<OrgStackParamList, "QueueScanner">;

interface TicketData {
  id: string;
  ticketNumber: string;
  customerName: string;
  serviceName: string;
  branchName: string;
  queueMode: string;
  status: string;
  position: number;
  estimatedWait: number;
  joinedAt: string;
  tableNumber: string | null;
  formData: Record<string, any> | null;
}

interface ScanResponse {
  valid: boolean;
  message?: string;
  isTheirTurn?: boolean;
  statusLabel?: string;
  statusColor?: string;
  statusText?: string;
  suggestedAction?: string | null;
  actionLabel?: string | null;
  waitMessage?: string | null;
  ticket?: TicketData;
}

const STATUS_COLORS: Record<string, string> = {
  green: "#22c55e",
  amber: "#f59e0b",
  blue: "#3b82f6",
  gray: "#9ca3af",
  red: "#ef4444",
};

export default function QueueScannerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();

  if (Platform.OS === "web") {
    return (
      <ThemedView style={[styles.container, styles.centerContent, { paddingTop: insets.top + Spacing["4xl"] }]}>
        <View style={[styles.permissionIcon, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="smartphone" size={48} color={theme.primary} />
        </View>
        <ThemedText type="h4" style={styles.centerTitle}>
          Scanner Not Available on Web
        </ThemedText>
        <ThemedText type="body" style={[styles.centerText, { color: theme.textSecondary }]}>
          The queue ticket scanner requires a mobile device camera. Please use
          Expo Go on your phone to scan customer QR tickets.
        </ThemedText>
        <Button onPress={() => navigation.goBack()} style={{ marginTop: Spacing["2xl"] }}>
          Go Back
        </Button>
      </ThemedView>
    );
  }

  return <QueueScannerNative />;
}

function QueueScannerNative() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();

  const CameraModule = require("expo-camera");
  const { CameraView, useCameraPermissions } = CameraModule;
  const [permission, requestPermission] = useCameraPermissions();

  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanData, setScanData] = useState<ScanResponse | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionDone, setActionDone] = useState<"success" | "error" | null>(null);

  const resetScan = useCallback(() => {
    setScanData(null);
    setActionDone(null);
    setScanned(false);
  }, []);

  const handleBarCodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (scanned || loading) return;
      setScanned(true);
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      try {
        // Extract QR token — it may be a full URL or a bare token
        let qrToken = data.trim();
        const urlMatch = qrToken.match(/\/queue-ticket\/([a-f0-9]+)/i);
        if (urlMatch) qrToken = urlMatch[1];

        const res = await apiRequest("POST", "/api/dashboard/queue/scan", { qrToken });
        const result: ScanResponse = await res.json();
        setScanData(result);

        if (result.valid) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } catch (e: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const msg = e?.message ? String(e.message).replace(/^\d+:\s*/, "") : "Scan failed";
        setScanData({ valid: false, message: msg });
      } finally {
        setLoading(false);
      }
    },
    [scanned, loading],
  );

  const handleAction = useCallback(async () => {
    if (!scanData?.ticket || !scanData.suggestedAction) return;
    setActionLoading(true);

    const { id } = scanData.ticket;
    const action = scanData.suggestedAction;
    const endpointMap: Record<string, string> = {
      call: `/api/tickets/${id}/call`,
      serve: `/api/tickets/${id}/serve`,
      arrive: `/api/tickets/${id}/arrive`,
      complete: `/api/tickets/${id}/complete`,
    };

    const endpoint = endpointMap[action];
    if (!endpoint) {
      setActionLoading(false);
      return;
    }

    try {
      await apiRequest("POST", endpoint, {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setActionDone("success");
      setTimeout(() => resetScan(), 2000);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setActionDone("error");
      setTimeout(() => setActionDone(null), 2500);
    } finally {
      setActionLoading(false);
    }
  }, [scanData, resetScan]);

  if (!permission) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.textSecondary} />
          <ThemedText type="body" style={{ marginTop: Spacing.md }}>Loading camera...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <View style={[styles.permissionIcon, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="camera" size={48} color={theme.primary} />
        </View>
        <ThemedText type="h4" style={styles.centerTitle}>Camera Access Required</ThemedText>
        <ThemedText type="body" style={[styles.centerText, { color: theme.textSecondary }]}>
          To scan queue tickets, TIQKETS needs access to your camera.
        </ThemedText>
        {permission.status === "denied" && !permission.canAskAgain ? (
          Platform.OS !== "web" ? (
            <Button
              onPress={async () => {
                try { await Linking.openSettings(); } catch {}
              }}
              style={{ marginTop: Spacing.lg }}
            >
              Open Settings
            </Button>
          ) : null
        ) : (
          <Button onPress={requestPermission} style={{ marginTop: Spacing.lg }}>
            Enable Camera
          </Button>
        )}
        <Pressable onPress={() => navigation.goBack()} style={styles.cancelLink} testID="button-scanner-cancel">
          <ThemedText type="body" style={{ color: theme.primary }}>Cancel</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const statusColor = scanData?.statusColor
    ? STATUS_COLORS[scanData.statusColor] ?? STATUS_COLORS.gray
    : STATUS_COLORS.gray;

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Scan overlay */}
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
            hitSlop={12}
            testID="button-scanner-close"
          >
            <Feather name="x" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerBadge}>
            <Feather name="users" size={16} color="#FFFFFF" />
            <ThemedText type="small" style={styles.badgeText} lightColor="#FFFFFF" darkColor="#FFFFFF">
              Queue Scanner
            </ThemedText>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.scanArea}>
          <View style={[styles.scanFrame, { width: Math.min(width - Spacing["2xl"] * 2, 280), aspectRatio: 1 }]}>
            <View style={[styles.corner, styles.topLeft, { borderColor: theme.primary }]} />
            <View style={[styles.corner, styles.topRight, { borderColor: theme.primary }]} />
            <View style={[styles.corner, styles.bottomLeft, { borderColor: theme.primary }]} />
            <View style={[styles.corner, styles.bottomRight, { borderColor: theme.primary }]} />
          </View>
          {loading ? (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#FFFFFF" />
              <ThemedText type="body" lightColor="rgba(255,255,255,0.9)" darkColor="rgba(255,255,255,0.9)" style={{ marginTop: 12 }}>
                Looking up ticket...
              </ThemedText>
            </Animated.View>
          ) : null}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing["2xl"] }]}>
          <ThemedText type="body" style={styles.instruction} lightColor="#FFFFFF" darkColor="#FFFFFF">
            Scan customer's QR ticket
          </ThemedText>
          <ThemedText type="small" lightColor="rgba(255,255,255,0.6)" darkColor="rgba(255,255,255,0.6)" style={{ textAlign: "center" }}>
            Point camera at the QR code on the ticket page
          </ThemedText>
        </View>
      </View>

      {/* Result bottom sheet */}
      {scanData !== null ? (
        <Animated.View entering={SlideInDown.springify()} exiting={SlideOutDown} style={styles.sheetContainer}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            {/* Status bar */}
            <View style={[styles.statusBar, { backgroundColor: statusColor }]} />

            {/* Handle */}
            <View style={styles.sheetHandle} />

            {scanData.valid && scanData.ticket ? (
              <>
                {/* Status header */}
                <View style={[styles.statusHeader, { borderLeftColor: statusColor }]}>
                  <View style={[styles.statusIconWrap, { backgroundColor: statusColor + "20" }]}>
                    <Feather
                      name={
                        scanData.statusColor === "green" ? "check-circle" :
                        scanData.statusColor === "blue" ? "clock" :
                        scanData.statusColor === "amber" ? "clock" :
                        scanData.statusColor === "gray" ? "check" : "alert-circle"
                      }
                      size={24}
                      color={statusColor}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="small" style={[styles.statusLabel, { color: statusColor }]}>
                      {scanData.statusLabel || scanData.statusText || "SCANNED"}
                    </ThemedText>
                    {scanData.waitMessage ? (
                      <ThemedText type="small" style={styles.waitMsg}>
                        {scanData.waitMessage}
                      </ThemedText>
                    ) : null}
                  </View>
                  <View style={styles.ticketBadge}>
                    <ThemedText type="small" style={styles.ticketBadgeText}>
                      {scanData.ticket.ticketNumber}
                    </ThemedText>
                  </View>
                </View>

                {/* Ticket details */}
                <View style={styles.ticketDetails}>
                  <View style={styles.detailRow}>
                    <Feather name="user" size={15} color="#9ca3af" />
                    <ThemedText type="body" style={styles.detailValue}>
                      {scanData.ticket.customerName}
                    </ThemedText>
                  </View>
                  <View style={styles.detailRow}>
                    <Feather name="layers" size={15} color="#9ca3af" />
                    <ThemedText type="body" style={[styles.detailValue, { color: "#6b7280" }]}>
                      {scanData.ticket.serviceName}
                    </ThemedText>
                    <ThemedText type="small" style={styles.detailSub}>
                      {scanData.ticket.branchName}
                    </ThemedText>
                  </View>
                  {scanData.ticket.tableNumber ? (
                    <View style={styles.detailRow}>
                      <Feather name="grid" size={15} color="#9ca3af" />
                      <ThemedText type="body" style={styles.detailValue}>
                        Table {scanData.ticket.tableNumber}
                      </ThemedText>
                    </View>
                  ) : null}
                  {scanData.ticket.position > 0 && scanData.ticket.status === "waiting" ? (
                    <View style={styles.detailRow}>
                      <Feather name="list" size={15} color="#9ca3af" />
                      <ThemedText type="body" style={styles.detailValue}>
                        Position {scanData.ticket.position}
                        {scanData.ticket.estimatedWait > 0
                          ? `  ·  ~${scanData.ticket.estimatedWait} min wait`
                          : ""}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>

                {/* Action area */}
                {actionDone === "success" ? (
                  <Animated.View entering={FadeIn} style={[styles.actionDone, { backgroundColor: "#d1fae5" }]}>
                    <Feather name="check-circle" size={20} color="#065f46" />
                    <ThemedText type="body" style={[styles.actionDoneText, { color: "#065f46" }]}>
                      Done!
                    </ThemedText>
                  </Animated.View>
                ) : actionDone === "error" ? (
                  <Animated.View entering={FadeIn} style={[styles.actionDone, { backgroundColor: "#fee2e2" }]}>
                    <Feather name="x-circle" size={20} color="#991b1b" />
                    <ThemedText type="body" style={[styles.actionDoneText, { color: "#991b1b" }]}>
                      Action failed — please try again
                    </ThemedText>
                  </Animated.View>
                ) : scanData.suggestedAction && scanData.actionLabel ? (
                  <Button
                    onPress={handleAction}
                    loading={actionLoading}
                    style={[styles.actionButton, { backgroundColor: statusColor }]}
                    testID="button-queue-scan-action"
                  >
                    {scanData.actionLabel}
                  </Button>
                ) : null}

                <Pressable onPress={resetScan} style={styles.scanNextLink} testID="button-scan-next">
                  <Feather name="refresh-cw" size={14} color="#6b7280" />
                  <ThemedText type="small" style={styles.scanNextText}>
                    Scan next ticket
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              <>
                {/* Invalid / error state */}
                <View style={styles.invalidState}>
                  <View style={[styles.invalidIcon, { backgroundColor: "#fee2e2" }]}>
                    <Feather name="alert-circle" size={32} color="#ef4444" />
                  </View>
                  <ThemedText type="h4" style={styles.invalidTitle}>
                    Ticket Not Found
                  </ThemedText>
                  <ThemedText type="body" style={styles.invalidMsg}>
                    {scanData.message || "Could not read this QR code. Make sure it is a valid TIQKETS queue ticket."}
                  </ThemedText>
                </View>
                <Button onPress={resetScan} style={{ marginTop: Spacing.lg }} testID="button-scan-again">
                  Try Again
                </Button>
              </>
            )}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing["3xl"] },
  permissionIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: Spacing["2xl"] },
  centerTitle: { textAlign: "center", marginBottom: Spacing.md },
  centerText: { textAlign: "center", marginBottom: Spacing.lg },
  cancelLink: { marginTop: Spacing.xl },

  overlay: { ...StyleSheet.absoluteFillObject },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.lg },
  closeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  headerBadge: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.primary, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full, gap: Spacing.xs },
  badgeText: { fontWeight: "700" },

  scanArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  scanFrame: { maxWidth: 280, width: "100%", aspectRatio: 1, position: "relative" },
  corner: { position: "absolute", width: 44, height: 44 },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: BorderRadius.md },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: BorderRadius.md },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: BorderRadius.md },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: BorderRadius.md },
  loadingOverlay: { position: "absolute", alignItems: "center" },

  footer: { alignItems: "center", paddingHorizontal: Spacing["2xl"], paddingTop: Spacing.lg },
  instruction: { textAlign: "center", fontWeight: "700", marginBottom: Spacing.xs },

  sheetContainer: { position: "absolute", bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 0,
    paddingHorizontal: Spacing["2xl"],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  statusBar: { height: 4, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginHorizontal: -Spacing["2xl"] },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", alignSelf: "center", marginTop: 12, marginBottom: Spacing.lg },

  statusHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.md, borderLeftWidth: 3, paddingLeft: Spacing.md, marginBottom: Spacing.lg },
  statusIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  statusLabel: { fontWeight: "800", fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase" },
  waitMsg: { color: "#6b7280", marginTop: 2 },
  ticketBadge: { backgroundColor: "#f3f4f6", paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.md },
  ticketBadgeText: { fontWeight: "800", color: "#374151", fontSize: 14 },

  ticketDetails: { gap: Spacing.sm, marginBottom: Spacing.xl, paddingLeft: 4 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  detailValue: { fontWeight: "600", flex: 1 },
  detailSub: { color: "#9ca3af" },

  actionButton: { borderRadius: BorderRadius.lg, marginBottom: Spacing.md },
  actionDone: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, padding: Spacing.lg, borderRadius: BorderRadius.lg, marginBottom: Spacing.md },
  actionDoneText: { fontWeight: "700" },

  scanNextLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.xs, paddingVertical: Spacing.md },
  scanNextText: { color: "#6b7280" },

  invalidState: { alignItems: "center", paddingVertical: Spacing["2xl"] },
  invalidIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: Spacing.lg },
  invalidTitle: { textAlign: "center", marginBottom: Spacing.md },
  invalidMsg: { textAlign: "center", color: "#6b7280", lineHeight: 22 },
});
