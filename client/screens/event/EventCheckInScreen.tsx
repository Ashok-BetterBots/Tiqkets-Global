import React, { useState, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Platform,
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

interface ScanResult {
  success: boolean;
  title: string;
  detail?: string;
}

export default function EventCheckInScreen() {
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

  return <ScanPanel action="checkin" actionLabel="Check-In" />;
}

function ScanPanel({
  action,
  actionLabel,
}: {
  action: "checkin" | "exit";
  actionLabel: string;
}) {
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
      Speech.speak(action === "checkin" ? "Checked in" : "Exit recorded", { language: "en-US", rate: 1.1 });
      setRecentRefreshKey((k) => k + 1);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Speech.speak("Error", { language: "en-US", rate: 1.1 });
    }
  }, [action]);

  const processValue = useCallback(async (value: string) => {
    try {
      const res = await apiRequest("POST", "/api/dashboard/events/scan", {
        value: value.trim(),
        action,
      });
      const data = await res.json();
      const g = data.guests || 1;
      const detail = data.registration
        ? `${data.registration.customerName} · ${data.registration.bookingId} · ${g} guest${g > 1 ? "s" : ""}${data.eventPaused ? " — Event paused" : ""}`
        : undefined;
      showResult({ success: true, title: actionLabel + " recorded", detail });
    } catch (e: any) {
      const msg = e?.message ? String(e.message).replace(/^\d+:\s*/, "") : "Scan failed";
      showResult({ success: false, title: msg });
    }
  }, [action, actionLabel, showResult]);

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
          {/* Result banner */}
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
                size={22}
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

          {/* Scan card */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ThemedText type="body" style={styles.cardTitle}>Scan or Enter Ticket</ThemedText>

            {/* Inline camera */}
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
                  Point at the visitor's QR ticket to scan
                </ThemedText>
              </View>
            ) : (
              <Pressable
                onPress={openCamera}
                style={[styles.scanBtn, { backgroundColor: BRAND }]}
                testID="button-scan-qr"
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

            {/* Divider */}
            <ThemedText type="small" style={[styles.orText, { color: theme.textSecondary }]}>
              or search manually
            </ThemedText>

            {/* Manual input row */}
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundRoot }]}
                placeholder="Booking ID or phone number"
                placeholderTextColor={theme.textSecondary}
                value={manualQuery}
                onChangeText={setManualQuery}
                onSubmitEditing={handleManualSearch}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                testID="input-scan-manual"
              />
              <Pressable
                onPress={handleManualSearch}
                style={[styles.searchBtn, { backgroundColor: BRAND, opacity: searching ? 0.7 : 1 }]}
                disabled={searching}
                testID="button-manual-checkin"
              >
                {searching ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="search" size={18} color="#fff" />
                )}
              </Pressable>
            </View>
          </View>

          {/* Recent activity section */}
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconBox, { backgroundColor: BRAND_BG }]}>
              <Feather name="log-in" size={14} color={BRAND} />
            </View>
            <ThemedText type="body" style={styles.sectionTitle}>Recent Check-Ins</ThemedText>
          </View>

          <RecentActivityList type="checkin" refreshKey={recentRefreshKey} />
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

  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },

  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontWeight: "700",
    marginBottom: Spacing.md,
    fontSize: 16,
  },

  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: 50,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  scanBtnText: { color: "#fff", fontWeight: "700" },

  orText: {
    textAlign: "center",
    marginBottom: Spacing.md,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    fontSize: 15,
  },
  searchBtn: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionIconBox: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontWeight: "700",
    fontSize: 15,
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
});
