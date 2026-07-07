import React, { useState, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Platform,
  Linking,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RecentActivityList } from "@/components/event/RecentActivityList";

const BRAND = "#8c1867";
const BRAND_BG = "#8c186715";
const SUCCESS = "#10B981";
const FAIL = "#EF4444";
const EXIT_ACCENT = "#6B7280";

interface ScanResult {
  success: boolean;
  title: string;
  detail?: string;
}

export default function EventCheckOutScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  if (Platform.OS === "web") {
    return (
      <ThemedView style={[styles.center, { paddingTop: insets.top + Spacing["4xl"] }]}>
        <View style={[styles.iconCircle, { backgroundColor: BRAND_BG }]}>
          <Feather name="smartphone" size={44} color={BRAND} />
        </View>
        <ThemedText type="h4" style={styles.centeredText}>Scanner Not Available on Web</ThemedText>
        <ThemedText type="body" style={[styles.centeredText, { color: theme.textSecondary }]}>
          Open this app in Expo Go on your mobile device to scan tickets.
        </ThemedText>
      </ThemedView>
    );
  }

  return <ExitScanPanel />;
}

function ExitScanPanel() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const CameraModule = require("expo-camera");
  const { CameraView, useCameraPermissions } = CameraModule;
  const [permission, requestPermission] = useCameraPermissions();

  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [recentRefreshKey, setRecentRefreshKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showResult = useCallback((res: ScanResult) => {
    setResult(res);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setResult(null), 4000);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Speech.speak("Exit recorded", { language: "en-US", rate: 1.1 });
      setRecentRefreshKey((k) => k + 1);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Speech.speak("Error", { language: "en-US", rate: 1.1 });
    }
  }, []);

  const processValue = useCallback(async (value: string) => {
    try {
      const res = await apiRequest("POST", "/api/dashboard/events/scan", {
        value: value.trim(),
        action: "exit",
      });
      const data = await res.json();
      const dur = data.registration?.visitDurationMinutes;
      const detail = data.registration
        ? `${data.registration.customerName} · ${data.registration.bookingId}${dur ? ` · ${dur}m visit` : ""}`
        : undefined;
      showResult({ success: true, title: "Exit recorded", detail });
    } catch (e: any) {
      const msg = e?.message ? String(e.message).replace(/^\d+:\s*/, "") : "Scan failed";
      showResult({ success: false, title: msg });
    }
  }, [showResult]);

  const handleBarCodeScanned = useCallback(
    async (scanData: { data: string }) => {
      if (scanned) return;
      setScanned(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCameraOpen(false);
      await processValue(scanData.data);
      setTimeout(() => setScanned(false), 1500);
    },
    [scanned, processValue],
  );

  const handleManualSearch = useCallback(async () => {
    if (!manualQuery.trim() || searching) return;
    setSearching(true);
    await processValue(manualQuery.trim());
    setSearching(false);
    setManualQuery("");
  }, [manualQuery, searching, processValue]);

  const openCamera = useCallback(async () => {
    if (!permission?.granted) {
      await requestPermission();
    }
    setCameraOpen(true);
  }, [permission, requestPermission]);

  if (!permission) {
    return (
      <ThemedView style={[styles.center, { paddingTop: insets.top + 60 }]}>
        <ActivityIndicator color={BRAND} />
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ThemedView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + Spacing.lg, paddingBottom: tabBarHeight + Spacing["2xl"] },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Mode badge */}
          <View style={[styles.modeBadge, { backgroundColor: EXIT_ACCENT + "18", borderColor: EXIT_ACCENT + "30" }]}>
            <View style={[styles.modeDot, { backgroundColor: EXIT_ACCENT }]} />
            <ThemedText type="small" style={{ color: EXIT_ACCENT, fontWeight: "700" }}>
              Checkout / Exit Mode
            </ThemedText>
          </View>

          {/* Result card */}
          {result ? (
            <View style={[
              styles.resultCard,
              {
                backgroundColor: result.success ? SUCCESS + "15" : FAIL + "15",
                borderColor: result.success ? SUCCESS + "50" : FAIL + "50",
              },
            ]}>
              <Feather
                name={result.success ? "check-circle" : "x-circle"}
                size={26}
                color={result.success ? SUCCESS : FAIL}
              />
              <View style={{ flex: 1 }}>
                <ThemedText type="body" style={{ fontWeight: "700", color: result.success ? SUCCESS : FAIL }}>
                  {result.title}
                </ThemedText>
                {result.detail ? (
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
                    {result.detail}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Inline camera box */}
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
              <ThemedText type="small" style={{ textAlign: "center", color: theme.textSecondary, marginTop: Spacing.xs }}>
                Point at the visitor's QR ticket to record exit
              </ThemedText>
            </View>
          ) : (
            <Pressable
              onPress={openCamera}
              style={[styles.primaryBtn, { backgroundColor: BRAND }]}
              testID="button-scan-qr-exit"
            >
              <Feather name="camera" size={20} color="#fff" />
              <ThemedText type="body" style={styles.primaryBtnText}>
                {!permission.granted
                  ? permission.status === "denied" && !permission.canAskAgain
                    ? "Open Settings for Camera"
                    : "Enable Camera to Scan QR"
                  : "Scan QR Code"}
              </ThemedText>
            </Pressable>
          )}

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <ThemedText type="small" style={{ color: theme.textSecondary, flexShrink: 0 }}>
              or search manually
            </ThemedText>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>

          {/* Manual input */}
          <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Feather name="search" size={17} color={theme.textSecondary} style={{ marginLeft: Spacing.md }} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Booking ID or phone number"
              placeholderTextColor={theme.textSecondary}
              value={manualQuery}
              onChangeText={setManualQuery}
              onSubmitEditing={handleManualSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              testID="input-exit-manual"
            />
            {manualQuery.length > 0 ? (
              <Pressable onPress={() => setManualQuery("")} style={{ paddingHorizontal: Spacing.sm }}>
                <Feather name="x" size={15} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={handleManualSearch}
            disabled={!manualQuery.trim() || searching}
            style={({ pressed }) => [
              styles.secondaryBtn,
              {
                backgroundColor: manualQuery.trim() ? BRAND : theme.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            testID="button-manual-exit"
          >
            {searching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="log-out" size={16} color="#fff" />
                <ThemedText type="body" style={styles.primaryBtnText}>Search & Record Exit</ThemedText>
              </>
            )}
          </Pressable>

          <RecentActivityList type="exit" refreshKey={recentRefreshKey} />
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing["3xl"] },
  iconCircle: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: Spacing["2xl"] },
  centeredText: { textAlign: "center", marginBottom: Spacing.md },
  scroll: { paddingHorizontal: Spacing.lg },
  modeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  modeDot: { width: 8, height: 8, borderRadius: 4 },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  cameraBox: {
    height: 260,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    borderWidth: 2,
    backgroundColor: "#000",
  },
  corner: { position: "absolute", width: 36, height: 36 },
  TL: { top: 14, left: 14, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  TR: { top: 14, right: 14, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  BL: { bottom: 14, left: 14, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  BR: { bottom: 14, right: 14, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
  cameraClose: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: 52,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, marginBottom: Spacing.lg },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    height: 52,
    marginBottom: Spacing.md,
  },
  input: { flex: 1, paddingHorizontal: Spacing.md, fontSize: 15, height: "100%" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: 52,
    borderRadius: BorderRadius.lg,
  },
});
