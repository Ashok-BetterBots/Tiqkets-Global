import React, { useState, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { OrgStackParamList } from "@/navigation/OrgStackNavigator";

type NavigationProp = NativeStackNavigationProp<OrgStackParamList, "EventScanner">;
type RouteProps = RouteProp<OrgStackParamList, "EventScanner">;

type ScanAction = "arrive" | "checkin" | "exit";

const ACTIONS: Array<{ id: ScanAction; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { id: "arrive", label: "Arrival", icon: "map-pin" },
  { id: "checkin", label: "Check-in", icon: "log-in" },
  { id: "exit", label: "Exit", icon: "log-out" },
];

export default function EventScannerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();

  if (Platform.OS === "web") {
    return (
      <ThemedView
        style={[styles.container, styles.permissionContainer, { paddingTop: insets.top + Spacing["4xl"] }]}
      >
        <View style={[styles.permissionIcon, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="smartphone" size={48} color={theme.primary} />
        </View>
        <ThemedText type="h4" style={styles.permissionTitle}>
          Scanner Not Available on Web
        </ThemedText>
        <ThemedText type="body" style={[styles.permissionText, { color: theme.textSecondary }]}>
          The event ticket scanner requires a mobile device camera. Please use Expo Go on your
          phone, or use the scan console on the web dashboard.
        </ThemedText>
        <Button onPress={() => navigation.goBack()} style={styles.permissionButton}>
          Go Back
        </Button>
      </ThemedView>
    );
  }

  return <EventScannerNative />;
}

function EventScannerNative() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { theme } = useTheme();

  const CameraModule = require("expo-camera");
  const { CameraView, useCameraPermissions } = CameraModule;
  const [permission, requestPermission] = useCameraPermissions();
  const [action, setAction] = useState<ScanAction>(route.params?.action || "arrive");
  const [scanned, setScanned] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    title: string;
    detail?: string;
  } | null>(null);

  const handleBarCodeScanned = useCallback(
    async (result: { data: string }) => {
      if (scanned) return;
      setScanned(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      try {
        const res = await apiRequest("POST", "/api/dashboard/events/scan", {
          value: result.data.trim(),
          action,
        });
        const data = await res.json();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const labels: Record<ScanAction, string> = {
          arrive: "Arrival recorded",
          checkin: "Checked in",
          exit: "Exit recorded",
        };
        const baseDetail = data.registration
          ? `${data.registration.customerName} · ${data.registration.bookingId} · ${data.guests || 1} guest${(data.guests || 1) > 1 ? "s" : ""}`
          : undefined;
        setScanResult({
          success: true,
          title: labels[action],
          detail: data.eventPaused
            ? `${baseDetail ? baseDetail + " — " : ""}Event paused: existing tickets valid, new registrations blocked`
            : baseDetail,
        });
      } catch (e: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const msg = e?.message ? String(e.message).replace(/^\d+:\s*/, "") : "Scan failed";
        setScanResult({ success: false, title: msg });
      }

      setTimeout(() => {
        setScanned(false);
        setScanResult(null);
      }, 2200);
    },
    [scanned, action],
  );

  if (!permission) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText type="body">Loading camera...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView style={[styles.container, styles.permissionContainer, { paddingTop: insets.top }]}>
        <View style={[styles.permissionIcon, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="camera" size={48} color={theme.primary} />
        </View>
        <ThemedText type="h4" style={styles.permissionTitle}>
          Camera Access Required
        </ThemedText>
        <ThemedText type="body" style={[styles.permissionText, { color: theme.textSecondary }]}>
          To scan event tickets, TIQKETS needs access to your camera.
        </ThemedText>
        {permission.status === "denied" && !permission.canAskAgain ? (
          Platform.OS !== "web" ? (
            <Button
              onPress={async () => {
                try {
                  await Linking.openSettings();
                } catch {
                  console.error("Could not open settings");
                }
              }}
              style={styles.permissionButton}
            >
              Open Settings
            </Button>
          ) : null
        ) : (
          <Button onPress={requestPermission} style={styles.permissionButton}>
            Enable Camera
          </Button>
        )}
        <Pressable onPress={() => navigation.goBack()} style={styles.cancelLink} testID="button-scanner-cancel">
          <ThemedText type="body" style={{ color: theme.primary }}>
            Cancel
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.closeButton} hitSlop={12} testID="button-scanner-close">
            <Feather name="x" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerBadge}>
            <Feather name="tag" size={16} color="#FFFFFF" />
            <ThemedText type="small" style={styles.headerBadgeText} lightColor="#FFFFFF" darkColor="#FFFFFF">
              Event Scanner
            </ThemedText>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.scanArea}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft, { borderColor: theme.primary }]} />
            <View style={[styles.corner, styles.topRight, { borderColor: theme.primary }]} />
            <View style={[styles.corner, styles.bottomLeft, { borderColor: theme.primary }]} />
            <View style={[styles.corner, styles.bottomRight, { borderColor: theme.primary }]} />
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing["2xl"] }]}>
          <View style={styles.actionRow}>
            {ACTIONS.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setAction(a.id)}
                style={[
                  styles.actionChip,
                  action === a.id
                    ? { backgroundColor: theme.primary }
                    : { backgroundColor: "rgba(255,255,255,0.15)" },
                ]}
                testID={`button-scan-action-${a.id}`}
              >
                <Feather name={a.icon} size={16} color="#FFFFFF" />
                <ThemedText type="small" style={styles.actionChipText} lightColor="#FFFFFF" darkColor="#FFFFFF">
                  {a.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          <ThemedText type="body" style={styles.instruction} lightColor="#FFFFFF" darkColor="#FFFFFF">
            Scan the visitor's QR ticket
          </ThemedText>
          <ThemedText
            type="small"
            style={styles.subInstruction}
            lightColor="rgba(255,255,255,0.7)"
            darkColor="rgba(255,255,255,0.7)"
          >
            Mode: {ACTIONS.find((a) => a.id === action)?.label}
          </ThemedText>
        </View>
      </View>

      {scanResult ? (
        <View style={styles.resultOverlay}>
          <View
            style={[
              styles.resultCard,
              { backgroundColor: scanResult.success ? Colors.light.success : Colors.light.error },
            ]}
          >
            <View style={styles.resultIconContainer}>
              <Feather name={scanResult.success ? "check-circle" : "x-circle"} size={48} color="#FFFFFF" />
            </View>
            <ThemedText type="h4" style={styles.resultTitle} lightColor="#FFFFFF" darkColor="#FFFFFF">
              {scanResult.title}
            </ThemedText>
            {scanResult.detail ? (
              <ThemedText
                type="body"
                style={styles.resultMessage}
                lightColor="rgba(255,255,255,0.9)"
                darkColor="rgba(255,255,255,0.9)"
              >
                {scanResult.detail}
              </ThemedText>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  permissionContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  permissionIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  permissionTitle: { textAlign: "center", marginBottom: Spacing.md },
  permissionText: { textAlign: "center", marginBottom: Spacing.lg },
  permissionButton: { paddingHorizontal: Spacing["3xl"] },
  cancelLink: { marginTop: Spacing.xl },
  overlay: { ...StyleSheet.absoluteFillObject },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  headerBadgeText: { fontWeight: "600" },
  scanArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  scanFrame: { width: 280, height: 280, position: "relative" },
  corner: { position: "absolute", width: 50, height: 50 },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: BorderRadius.md },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: BorderRadius.md },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: BorderRadius.md },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: BorderRadius.md },
  footer: { alignItems: "center", paddingHorizontal: Spacing["2xl"] },
  actionRow: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.lg },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  actionChipText: { fontWeight: "700" },
  instruction: { textAlign: "center", fontWeight: "600", marginBottom: Spacing.sm },
  subInstruction: { textAlign: "center" },
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["2xl"],
  },
  resultCard: {
    width: "100%",
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  resultIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  resultTitle: { textAlign: "center", marginBottom: Spacing.md },
  resultMessage: { textAlign: "center" },
});
