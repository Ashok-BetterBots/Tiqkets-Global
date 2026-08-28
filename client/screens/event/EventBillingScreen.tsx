import React, { useState, useCallback } from "react";
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
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RecentActivityList } from "@/components/event/RecentActivityList";
import { BillingTransactionModal, LookupResult } from "@/components/event/BillingTransactionModal";
import { notifyEventDataChanged } from "@/lib/event-live-refresh";

const BRAND = "#8c1867";
const BRAND_BG = "#8c186715";
const FAIL = "#EF4444";

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(new URL(path, getApiUrl()), { credentials: "include" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let b: any = null;
    try { b = JSON.parse(t); } catch {}
    const err: any = new Error(b?.error || `Request failed (${res.status})`);
    throw err;
  }
  return res.json();
}

export default function EventBillingScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [recentRefreshKey, setRecentRefreshKey] = useState(0);

  const CameraModule = Platform.OS !== "web" ? require("expo-camera") : null;
  const { CameraView, useCameraPermissions } = CameraModule || { CameraView: null, useCameraPermissions: () => [null, () => {}] };
  const [permission, requestPermission] = useCameraPermissions();

  const doLookup = useCallback(async (value: string) => {
    if (!value.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const q = encodeURIComponent(value.trim());
      const data: LookupResult = await fetchJson(`/api/dashboard/events/billing/lookup?q=${q}&t=${Date.now()}`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLookup(data);
      setModalVisible(true);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e?.message || "No matching booking found");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualSubmit = useCallback(() => {
    if (manualInput.trim()) doLookup(manualInput.trim());
  }, [manualInput, doLookup]);

  const handleBarCodeScanned = useCallback(
    (result: { data: string }) => {
      if (scanned) return;
      setScanned(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCameraOpen(false);
      doLookup(result.data.trim());
      setTimeout(() => setScanned(false), 2000);
    },
    [scanned, doLookup],
  );

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
    setLookup(null);
    setManualInput("");
    setCameraOpen(false);
  }, []);

  const handleSuccess = useCallback(() => {
    setRecentRefreshKey((k) => k + 1);
    notifyEventDataChanged();
  }, []);

  if (Platform.OS === "web") {
    return (
      <ThemedView style={styles.center}>
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ThemedView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: Spacing.xl, paddingBottom: tabBarHeight + Spacing["2xl"] },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Scan card ── */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ThemedText style={styles.cardTitle}>Scan or Enter Booking</ThemedText>

            {/* Camera viewer */}
            {cameraOpen && CameraView && permission?.granted ? (
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
                  Point at the customer's QR ticket
                </ThemedText>
              </View>
            ) : (
              <Pressable
                onPress={async () => {
                  if (!permission?.granted) await requestPermission();
                  setCameraOpen(true);
                }}
                style={[styles.scanQrBtn, { backgroundColor: BRAND }]}
                testID="button-billing-scan"
              >
                <Feather name="camera" size={18} color="#fff" />
                <ThemedText style={styles.scanBtnText}>Scan QR Code</ThemedText>
              </Pressable>
            )}

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>or enter manually</ThemedText>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            {/* Manual input */}
            <View style={styles.inputRow}>
              <TextInput
                value={manualInput}
                onChangeText={(t) => { setManualInput(t); setError(null); }}
                placeholder="Booking ID or Phone number"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundRoot }]}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={handleManualSubmit}
                testID="input-billing-search"
              />
              <Pressable
                onPress={handleManualSubmit}
                disabled={loading || !manualInput.trim()}
                style={[styles.searchBtn, { backgroundColor: BRAND, opacity: (loading || !manualInput.trim()) ? 0.7 : 1 }]}
                testID="button-billing-search"
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="search" size={18} color="#fff" />
                )}
              </Pressable>
            </View>

            {/* Error */}
            {error ? (
              <View style={[styles.errorBanner, { backgroundColor: FAIL + "12", borderColor: FAIL + "30" }]}>
                <Feather name="alert-circle" size={14} color={FAIL} />
                <ThemedText style={{ color: FAIL, fontSize: 13, flex: 1 }}>{error}</ThemedText>
              </View>
            ) : null}
          </View>

          {/* Recent billing activity */}
          <RecentActivityList type="billing" refreshKey={recentRefreshKey} />
        </ScrollView>

        {/* Transaction modal */}
        {lookup ? (
          <BillingTransactionModal
            visible={modalVisible}
            lookup={lookup}
            onClose={handleModalClose}
            onSuccess={handleSuccess}
          />
        ) : null}
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.lg,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  centeredText: { textAlign: "center", marginTop: Spacing.sm },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center", marginBottom: Spacing.lg,
  },
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: Spacing.md },
  /* Camera */
  cameraBox: {
    height: 220,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    borderWidth: 2,
    position: "relative",
  },
  corner: { position: "absolute", width: 24, height: 24, borderColor: BRAND },
  TL: { top: 12, left: 12, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 4 },
  TR: { top: 12, right: 12, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 4 },
  BL: { bottom: 12, left: 12, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 4 },
  BR: { bottom: 12, right: 12, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 4 },
  cameraClose: {
    position: "absolute", top: 10, right: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 16, padding: 6,
  },
  /* Scan button */
  scanQrBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: 50,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  scanBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  /* Divider */
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  /* Input row */
  inputRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "center",
  },
  input: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    fontSize: 14,
    letterSpacing: 0,
  },
  searchBtn: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  /* Error */
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
});
