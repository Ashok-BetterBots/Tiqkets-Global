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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";

const BRAND = "#8c1867";
const BRAND_BG = "#8c186715";
const SUCCESS = "#10B981";
const FAIL = "#EF4444";

type BillingStep = "idle" | "loading" | "looked_up" | "otp_sent" | "success";

interface LookupResult {
  registration: {
    id: string;
    customerName: string;
    bookingId: string;
    amountPaid: number;
    status: string;
    customerPhone: string;
  };
  eventName: string;
  advanceAvailable: number;
  redemption: { advanceRedeemed: number; finalAmountDue: number; invoiceAmount: number } | null;
  otpRequired: boolean;
  otpVerified: boolean;
}

function fmtPaise(p: number | null | undefined): string {
  const v = (p || 0) / 100;
  return `\u20B9${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

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
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const [step, setStep] = useState<BillingStep>("idle");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  const [invoiceRupees, setInvoiceRupees] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [successData, setSuccessData] = useState<{
    redeemed: number;
    finalDue: number;
    customerName: string;
  } | null>(null);

  const doLookup = useCallback(async (value: string) => {
    if (!value.trim()) return;
    setError(null);
    setLoading(true);
    setStep("loading");
    try {
      const q = encodeURIComponent(value.trim());
      const data: LookupResult = await fetchJson(`/api/dashboard/events/billing/lookup?q=${q}&t=${Date.now()}`);
      setLookup(data);
      setOtpVerified(data.otpVerified);
      setStep("looked_up");
    } catch (e: any) {
      setError(e?.message || "Lookup failed");
      setStep("idle");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualSubmit = useCallback(() => {
    if (manualInput.trim()) {
      doLookup(manualInput.trim());
    }
  }, [manualInput, doLookup]);

  const handleSendOtp = useCallback(async () => {
    if (!lookup?.registration) return;
    setOtpSending(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/dashboard/events/billing/send-otp", {
        registrationId: lookup.registration.id,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("otp_sent");
    } catch (e: any) {
      setError(e?.message || "Failed to send OTP");
    } finally {
      setOtpSending(false);
    }
  }, [lookup]);

  const handleVerifyOtp = useCallback(async () => {
    if (!lookup?.registration || !otpCode.trim()) return;
    setOtpVerifying(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/dashboard/events/billing/verify-otp", {
        registrationId: lookup.registration.id,
        code: otpCode.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOtpVerified(true);
      setStep("looked_up");
      setOtpCode("");
    } catch (e: any) {
      setError(e?.message || "OTP verification failed");
    } finally {
      setOtpVerifying(false);
    }
  }, [lookup, otpCode]);

  const handleRedeem = useCallback(async () => {
    if (!lookup?.registration) return;
    const invoicePaise = Math.round(parseFloat(invoiceRupees || "0") * 100);
    if (!invoicePaise || invoicePaise <= 0) {
      setError("Enter a valid invoice amount");
      return;
    }
    setRedeeming(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/dashboard/events/billing/redeem", {
        registrationId: lookup.registration.id,
        invoiceAmount: invoicePaise,
      });
      const data = await res.json();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessData({
        redeemed: data.redemption?.advanceRedeemed ?? 0,
        finalDue: data.redemption?.finalAmountDue ?? 0,
        customerName: lookup.registration.customerName,
      });
      setStep("success");
    } catch (e: any) {
      setError(e?.message || "Redemption failed");
    } finally {
      setRedeeming(false);
    }
  }, [lookup, invoiceRupees]);

  const reset = useCallback(() => {
    setStep("idle");
    setLookup(null);
    setManualInput("");
    setOtpCode("");
    setOtpVerified(false);
    setInvoiceRupees("");
    setSuccessData(null);
    setError(null);
    setCameraOpen(false);
    setScanned(false);
  }, []);

  const readyForBilling = !lookup?.otpRequired || otpVerified;
  const alreadyRedeemed = !!lookup?.redemption;

  // ─── Camera setup ────────────────────────────────────────────────────────
  const CameraModule = require("expo-camera");
  const { CameraView, useCameraPermissions } = CameraModule;
  const [permission, requestPermission] = useCameraPermissions();

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

  // ─── Success screen ────────────────────────────────────────────────────────
  if (step === "success" && successData) {
    return (
      <ThemedView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing["4xl"], paddingBottom: tabBarHeight + Spacing["2xl"] }]}>
          <View style={[styles.card, { backgroundColor: SUCCESS + "12", borderColor: SUCCESS + "33" }]}>
            <View style={styles.successIconWrap}>
              <View style={[styles.successIcon, { backgroundColor: SUCCESS }]}>
                <Feather name="check-circle" size={40} color="#fff" />
              </View>
            </View>
            <ThemedText type="h3" style={{ textAlign: "center", marginBottom: Spacing.sm }}>
              Advance Redeemed!
            </ThemedText>
            <ThemedText type="body" style={{ textAlign: "center", color: SUCCESS, fontWeight: "700", fontSize: 18, marginBottom: Spacing.xl }}>
              {successData.customerName}
            </ThemedText>
            <View style={styles.infoRow}>
              <ThemedText type="body">Advance Redeemed</ThemedText>
              <ThemedText type="body" style={{ fontWeight: "700", color: SUCCESS }}>
                {fmtPaise(successData.redeemed)}
              </ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText type="body">Final Amount Due</ThemedText>
              <ThemedText type="body" style={{ fontWeight: "700" }}>
                {fmtPaise(successData.finalDue)}
              </ThemedText>
            </View>
          </View>
          <Button onPress={reset} style={{ marginTop: Spacing.md }}>Scan Next Customer</Button>
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ThemedView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + Spacing.lg, paddingBottom: tabBarHeight + Spacing["2xl"] },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* ─── Idle / Input ─── */}
          {step === "idle" || step === "loading" ? (
            <>
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <ThemedText type="body" style={{ fontWeight: "700", marginBottom: Spacing.sm }}>Scan or Enter Booking</ThemedText>

                {/* Inline camera */}
                {cameraOpen && Platform.OS !== "web" && CameraView && permission?.granted ? (
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
                ) : Platform.OS !== "web" ? (
                  <Pressable
                    onPress={async () => {
                      if (!permission?.granted) await requestPermission();
                      setCameraOpen(true);
                    }}
                    style={[styles.scanQrBtn, { backgroundColor: BRAND }]}
                    testID="button-billing-scan"
                  >
                    <Feather name="camera" size={18} color="#fff" />
                    <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>
                      Scan QR Code
                    </ThemedText>
                  </Pressable>
                ) : null}

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                  <ThemedText type="small" style={{ color: theme.textSecondary, flexShrink: 0 }}>
                    or enter manually
                  </ThemedText>
                  <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                </View>

                {/* Manual input */}
                <View style={styles.inputRow}>
                  <TextInput
                    value={manualInput}
                    onChangeText={setManualInput}
                    placeholder="Booking ID or QR token"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={handleManualSubmit}
                    testID="input-billing-search"
                  />
                  <Pressable
                    onPress={handleManualSubmit}
                    style={[styles.searchIconBtn, { backgroundColor: BRAND }]}
                    testID="button-billing-search"
                  >
                    <Feather name="search" size={18} color="#fff" />
                  </Pressable>
                </View>
              </View>
              {step === "loading" ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={BRAND} />
                  <ThemedText type="body" style={{ color: theme.textSecondary }}>Looking up...</ThemedText>
                </View>
              ) : null}
            </>
          ) : null}

          {/* ─── Error ─── */}
          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: FAIL + "18", borderColor: FAIL + "33" }]}>
              <Feather name="alert-circle" size={16} color={FAIL} />
              <ThemedText type="small" style={{ color: FAIL, flex: 1 }}>{error}</ThemedText>
            </View>
          ) : null}

          {/* ─── Looked-up registration ─── */}
          {(step === "looked_up" || step === "otp_sent") && lookup ? (
            <>
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.regHeader}>
                  <View style={[styles.avatar, { backgroundColor: BRAND_BG }]}>
                    <Feather name="user" size={22} color={BRAND} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="body" style={{ fontWeight: "700", fontSize: 16 }}>
                      {lookup.registration.customerName}
                    </ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {lookup.registration.bookingId}
                    </ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {lookup.eventName}
                    </ThemedText>
                  </View>
                  <Pressable onPress={reset} hitSlop={10} testID="button-billing-reset">
                    <Feather name="x" size={20} color={theme.textSecondary} />
                  </Pressable>
                </View>

                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                <View style={styles.infoRow}>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>Advance Paid</ThemedText>
                  <ThemedText type="body" style={{ fontWeight: "700" }}>
                    {fmtPaise(lookup.registration.amountPaid)}
                  </ThemedText>
                </View>
                <View style={styles.infoRow}>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>Available for Redemption</ThemedText>
                  <ThemedText type="body" style={{ fontWeight: "700", color: lookup.advanceAvailable > 0 ? SUCCESS : theme.textSecondary }}>
                    {fmtPaise(lookup.advanceAvailable)}
                  </ThemedText>
                </View>
              </View>

              {/* Already redeemed */}
              {alreadyRedeemed && lookup.redemption ? (
                <View style={[styles.card, { backgroundColor: SUCCESS + "10", borderColor: SUCCESS + "33" }]}>
                  <View style={styles.regHeader}>
                    <Feather name="check-circle" size={20} color={SUCCESS} />
                    <ThemedText type="body" style={{ color: SUCCESS, fontWeight: "700" }}>
                      Already Redeemed
                    </ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>Redeemed</ThemedText>
                    <ThemedText type="body" style={{ fontWeight: "600" }}>{fmtPaise(lookup.redemption.advanceRedeemed)}</ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>Invoice Total</ThemedText>
                    <ThemedText type="body" style={{ fontWeight: "600" }}>{fmtPaise(lookup.redemption.invoiceAmount)}</ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>Final Due</ThemedText>
                    <ThemedText type="body" style={{ fontWeight: "600" }}>{fmtPaise(lookup.redemption.finalAmountDue)}</ThemedText>
                  </View>
                  <Button onPress={reset} style={{ marginTop: Spacing.sm }} variant="outline">Scan Next</Button>
                </View>
              ) : lookup.advanceAvailable <= 0 ? (
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
                    No advance amount available for this booking.
                  </ThemedText>
                  <Button onPress={reset} style={{ marginTop: Spacing.sm }} variant="outline">Scan Next</Button>
                </View>
              ) : (
                <>
                  {/* OTP section */}
                  {lookup.otpRequired && !otpVerified ? (
                    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <View style={styles.sectionHeaderRow}>
                        <Feather name="shield" size={16} color={BRAND} />
                        <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.sm }}>
                          OTP Verification Required
                        </ThemedText>
                      </View>
                      <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
                        Send a one-time password to the customer's WhatsApp (
                        {lookup.registration.customerPhone.slice(-4).padStart(10, "•")}) to verify before redemption.
                      </ThemedText>

                      {step === "otp_sent" ? (
                        <>
                          <TextInput
                            value={otpCode}
                            onChangeText={setOtpCode}
                            placeholder="Enter 6-digit OTP"
                            placeholderTextColor={theme.textSecondary}
                            keyboardType="number-pad"
                            maxLength={6}
                            style={[styles.otpInput, { color: theme.text, borderColor: BRAND + "55" }]}
                            testID="input-otp"
                          />
                          <Button
                            onPress={handleVerifyOtp}
                            loading={otpVerifying}
                            disabled={otpCode.length < 6}
                            style={{ marginTop: Spacing.sm }}
                            testID="button-verify-otp"
                          >
                            Verify OTP
                          </Button>
                          <Pressable onPress={handleSendOtp} style={styles.resendLink} testID="button-resend-otp">
                            <ThemedText type="small" style={{ color: BRAND }}>Resend OTP</ThemedText>
                          </Pressable>
                        </>
                      ) : (
                        <Button onPress={handleSendOtp} loading={otpSending} style={{ marginTop: Spacing.xs }} testID="button-send-otp">
                          Send OTP to Customer
                        </Button>
                      )}
                    </View>
                  ) : (
                    /* Billing / Invoice section */
                    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <View style={styles.sectionHeaderRow}>
                        <Feather name="credit-card" size={16} color={BRAND} />
                        <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.sm }}>
                          Enter Invoice Amount
                        </ThemedText>
                      </View>
                      {otpVerified && lookup.otpRequired ? (
                        <View style={[styles.verifiedBadge, { backgroundColor: SUCCESS + "15", borderColor: SUCCESS + "33" }]}>
                          <Feather name="check-circle" size={12} color={SUCCESS} />
                          <ThemedText type="small" style={{ color: SUCCESS, fontWeight: "600" }}>OTP Verified</ThemedText>
                        </View>
                      ) : null}
                      <View style={styles.invoiceRow}>
                        <ThemedText type="h4" style={{ color: theme.textSecondary, marginRight: Spacing.sm }}>₹</ThemedText>
                        <TextInput
                          value={invoiceRupees}
                          onChangeText={setInvoiceRupees}
                          placeholder="0"
                          placeholderTextColor={theme.textSecondary}
                          keyboardType="decimal-pad"
                          style={[styles.invoiceInput, { color: theme.text, borderColor: BRAND + "55" }]}
                          testID="input-invoice-amount"
                        />
                      </View>
                      {invoiceRupees && parseFloat(invoiceRupees) > 0 ? (
                        <View style={[styles.calcPreview, { backgroundColor: theme.backgroundRoot }]}>
                          <View style={styles.infoRow}>
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>Invoice</ThemedText>
                            <ThemedText type="small" style={{ fontWeight: "600" }}>
                              {fmtPaise(parseFloat(invoiceRupees) * 100)}
                            </ThemedText>
                          </View>
                          <View style={styles.infoRow}>
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>Advance</ThemedText>
                            <ThemedText type="small" style={{ fontWeight: "600", color: SUCCESS }}>
                              - {fmtPaise(Math.min(lookup.advanceAvailable, parseFloat(invoiceRupees) * 100))}
                            </ThemedText>
                          </View>
                          <View style={[styles.divider, { backgroundColor: theme.border }]} />
                          <View style={styles.infoRow}>
                            <ThemedText type="body" style={{ fontWeight: "700" }}>Customer Pays</ThemedText>
                            <ThemedText type="body" style={{ fontWeight: "700", color: BRAND }}>
                              {fmtPaise(Math.max(0, parseFloat(invoiceRupees) * 100 - lookup.advanceAvailable))}
                            </ThemedText>
                          </View>
                        </View>
                      ) : null}
                      <Button
                        onPress={handleRedeem}
                        loading={redeeming}
                        disabled={!invoiceRupees || parseFloat(invoiceRupees) <= 0}
                        style={{ marginTop: Spacing.sm }}
                        testID="button-redeem"
                      >
                        Redeem Advance
                      </Button>
                    </View>
                  )}
                </>
              )}
            </>
          ) : null}
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.lg },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  cameraBox: {
    height: 240,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 2,
    backgroundColor: "#000",
  },
  corner: { position: "absolute", width: 32, height: 32 },
  TL: { top: 12, left: 12, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  TR: { top: 12, right: 12, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  BL: { bottom: 12, left: 12, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  BR: { bottom: 12, right: 12, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
  cameraClose: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanQrBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: 48,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, marginVertical: Spacing.sm },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  inputRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontSize: 15,
  },
  searchIconBtn: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: Spacing.xs },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginBottom: Spacing.sm,
  },
  otpInput: {
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 8,
  },
  invoiceRow: { flexDirection: "row", alignItems: "center" },
  invoiceInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    fontSize: 24,
    fontWeight: "700",
  },
  calcPreview: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  regHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.xs },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, justifyContent: "center", marginTop: Spacing.md },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  resendLink: { alignSelf: "center", marginTop: Spacing.sm, paddingVertical: Spacing.sm },
  successIconWrap: { alignItems: "center", marginBottom: Spacing.md },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
