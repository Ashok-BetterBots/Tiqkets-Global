import React, { useState, useCallback } from "react";
import { View, StyleSheet, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

export default function EventCheckInScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  if (Platform.OS === "web") {
    return (
      <ThemedView style={[styles.permWrap, { paddingTop: insets.top + Spacing["4xl"] }]}>
        <View style={[styles.permIcon, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="smartphone" size={48} color={theme.primary} />
        </View>
        <ThemedText type="h4" style={styles.permTitle}>Scanner Not Available on Web</ThemedText>
        <ThemedText type="body" style={[styles.permText, { color: theme.textSecondary }]}>
          Open this app in Expo Go on your mobile device to use the QR scanner.
        </ThemedText>
      </ThemedView>
    );
  }

  return <ScannerView action="checkin" actionLabel="Check-In" actionIcon="log-in" accentColor="#10B981" />;
}

function ScannerView({
  action,
  actionLabel,
  actionIcon,
  accentColor,
}: {
  action: "checkin" | "exit";
  actionLabel: string;
  actionIcon: keyof typeof Feather.glyphMap;
  accentColor: string;
}) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const CameraModule = require("expo-camera");
  const { CameraView, useCameraPermissions } = CameraModule;
  const [permission, requestPermission] = useCameraPermissions();
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
        const detail = data.registration
          ? `${data.registration.customerName} · ${data.registration.bookingId} · ${data.guests || 1} guest${(data.guests || 1) > 1 ? "s" : ""}${data.eventPaused ? " — Event paused" : ""}`
          : undefined;
        setScanResult({ success: true, title: actionLabel + " recorded", detail });
      } catch (e: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const msg = e?.message ? String(e.message).replace(/^\d+:\s*/, "") : "Scan failed";
        setScanResult({ success: false, title: msg });
      }
      setTimeout(() => {
        setScanned(false);
        setScanResult(null);
      }, 2500);
    },
    [scanned, action, actionLabel],
  );

  if (!permission) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.center}>
          <ThemedText type="body">Loading camera...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView style={[styles.permWrap, { paddingTop: insets.top + Spacing["2xl"] }]}>
        <View style={[styles.permIcon, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="camera" size={48} color={theme.primary} />
        </View>
        <ThemedText type="h4" style={styles.permTitle}>Camera Access Required</ThemedText>
        <ThemedText type="body" style={[styles.permText, { color: theme.textSecondary }]}>
          To scan event tickets, TIQKETS needs camera access.
        </ThemedText>
        {permission.status === "denied" && !permission.canAskAgain ? (
          Platform.OS !== "web" ? (
            <Button
              onPress={async () => {
                try { await Linking.openSettings(); } catch {}
              }}
              style={styles.permBtn}
            >
              Open Settings
            </Button>
          ) : null
        ) : (
          <Button onPress={requestPermission} style={styles.permBtn}>Enable Camera</Button>
        )}
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
        <View style={styles.topBadge}>
          <View style={[styles.actionBadge, { backgroundColor: accentColor }]}>
            <Feather name={actionIcon} size={14} color="#fff" />
            <ThemedText type="small" style={styles.badgeText} lightColor="#fff" darkColor="#fff">
              {actionLabel}
            </ThemedText>
          </View>
        </View>

        <View style={styles.scanArea}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft, { borderColor: accentColor }]} />
            <View style={[styles.corner, styles.topRight, { borderColor: accentColor }]} />
            <View style={[styles.corner, styles.bottomLeft, { borderColor: accentColor }]} />
            <View style={[styles.corner, styles.bottomRight, { borderColor: accentColor }]} />
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: tabBarHeight + Spacing.lg }]}>
          <ThemedText type="body" style={styles.instruction} lightColor="#fff" darkColor="#fff">
            Scan the visitor's QR ticket
          </ThemedText>
          <ThemedText
            type="small"
            style={styles.subInstruction}
            lightColor="rgba(255,255,255,0.65)"
            darkColor="rgba(255,255,255,0.65)"
          >
            Mode: {actionLabel}
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
            <View style={styles.resultIconWrap}>
              <Feather
                name={scanResult.success ? "check-circle" : "x-circle"}
                size={48}
                color="#fff"
              />
            </View>
            <ThemedText type="h4" style={styles.resultTitle} lightColor="#fff" darkColor="#fff">
              {scanResult.title}
            </ThemedText>
            {scanResult.detail ? (
              <ThemedText
                type="body"
                style={styles.resultDetail}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  permWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing["3xl"] },
  permIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  permTitle: { textAlign: "center", marginBottom: Spacing.md },
  permText: { textAlign: "center", marginBottom: Spacing.lg },
  permBtn: { paddingHorizontal: Spacing["3xl"] },
  overlay: { ...StyleSheet.absoluteFillObject },
  topBadge: { alignItems: "center", paddingTop: Spacing.lg },
  actionBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  badgeText: { fontWeight: "700" },
  scanArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  scanFrame: { width: 260, height: 260, position: "relative" },
  corner: { position: "absolute", width: 44, height: 44 },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: BorderRadius.md },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: BorderRadius.md },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: BorderRadius.md },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: BorderRadius.md },
  footer: { alignItems: "center", paddingHorizontal: Spacing["2xl"] },
  instruction: { textAlign: "center", fontWeight: "600", marginBottom: Spacing.xs },
  subInstruction: { textAlign: "center" },
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.82)",
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
  resultIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  resultTitle: { textAlign: "center", marginBottom: Spacing.sm },
  resultDetail: { textAlign: "center" },
});
