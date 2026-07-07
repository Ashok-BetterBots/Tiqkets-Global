import React, { useState, useCallback } from "react";
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
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";

type BillingStep = "idle" | "scanning" | "loading" | "looked_up" | "otp_sent" | "success";

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
  const [scannerOpen, setScannerOpen] = useState(false);
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
      setScannerOpen(false);
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
      const msg = e?.message || "Failed to send OTP";
      setError(msg);
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
    setScannerOpen(false);
  }, []);

  const readyForBilling = !lookup?.otpRequired || otpVerified;
  const alreadyRedeemed = !!lookup?.redemption;

  // ─── Success screen ───────────────────────────────────────────────────────
  if (step === "success" && successData) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + Spacing["4xl"], paddingBottom: tabBarHeight + Spacing["2xl"] },
          ]}
        >
          <View style={[styles.successCard, { backgroundColor: "#10B98118", borderColor: "#10B98133" }]}>
            <View style={[styles.successIcon, { backgroundColor: "#10B981" }]}>
              <Feather name="check-circle" size={40} color="#fff" />
            </View>
            <ThemedText type="h3" style={{ textAlign: "center", marginBottom: Spacing.sm }}>
              Advance Redeemed!
            </ThemedText>
            <ThemedText type="body" style={{ textAlign: "center", color: "#10B981", fontWeight: "700", fontSize: 18, marginBottom: Spacing.xl }}>
              {successData.customerName}
            </ThemedText>
            <View style={styles.amountRow}>
              <ThemedText type="body">Advance Redeemed</ThemedText>
              <ThemedText type="body" style={{ fontWeight: "700", color: "#10B981" }}>
                {fmtPaise(successData.redeemed)}
              </ThemedText>
            </View>
            <View style={styles.amountRow}>
              <ThemedText type="body">Final Amount Due</ThemedText>
              <ThemedText type="body" style={{ fontWeight: "700" }}>
                {fmtPaise(successData.finalDue)}
              </ThemedText>
            </View>
          </View>
          <Button onPress={reset} style={styles.resetBtn}>Scan Next Customer</Button>
        </ScrollView>
      </ThemedView>
    );
  }

  // ─── Inline QR Scanner ────────────────────────────────────────────────────
  if (scannerOpen && Platform.OS !== "web") {
    return <BillingScanner onScan={(v) => { setScannerOpen(false); doLookup(v); }} onClose={() => setScannerOpen(false)} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ThemedView style={styles.container}>
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
              <ThemedText type="h4" style={styles.sectionTitle}>Scan or Enter Booking</ThemedText>
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
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
                    style={[styles.searchBtn, { backgroundColor: theme.primary }]}
                    testID="button-billing-search"
                  >
                    <Feather name="search" size={18} color="#fff" />
                  </Pressable>
                </View>
                {Platform.OS !== "web" ? (
                  <Pressable
                    onPress={() => setScannerOpen(true)}
                    style={[styles.scanBtn, { borderColor: theme.primary, backgroundColor: theme.primary + "12" }]}
                    testID="button-billing-scan"
                  >
                    <Feather name="maximize" size={20} color={theme.primary} />
                    <ThemedText type="body" style={{ color: theme.primary, fontWeight: "600" }}>
                      Scan QR Code
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
              {step === "loading" ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={theme.primary} />
                  <ThemedText type="body" style={{ color: theme.textSecondary }}>Looking up...</ThemedText>
                </View>
              ) : null}
            </>
          ) : null}

          {/* ─── Error ─── */}
          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: "#EF444418", borderColor: "#EF444433" }]}>
              <Feather name="alert-circle" size={16} color="#EF4444" />
              <ThemedText type="small" style={{ color: "#EF4444", flex: 1 }}>{error}</ThemedText>
            </View>
          ) : null}

          {/* ─── Looked-up registration ─── */}
          {(step === "looked_up" || step === "otp_sent") && lookup ? (
            <>
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.regHeader}>
                  <View style={[styles.avatar, { backgroundColor: theme.primary + "20" }]}>
                    <Feather name="user" size={22} color={theme.primary} />
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
                  <ThemedText type="body" style={{ fontWeight: "700", color: lookup.advanceAvailable > 0 ? "#10B981" : theme.textSecondary }}>
                    {fmtPaise(lookup.advanceAvailable)}
                  </ThemedText>
                </View>
              </View>

              {/* Already redeemed */}
              {alreadyRedeemed && lookup.redemption ? (
                <View style={[styles.card, { backgroundColor: "#10B98110", borderColor: "#10B98133" }]}>
                  <View style={styles.regHeader}>
                    <Feather name="check-circle" size={20} color="#10B981" />
                    <ThemedText type="body" style={{ color: "#10B981", fontWeight: "700" }}>
                      Already Redeemed
                    </ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>Redeemed</ThemedText>
                    <ThemedText type="body" style={{ fontWeight: "600" }}>
                      {fmtPaise(lookup.redemption.advanceRedeemed)}
                    </ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>Invoice Total</ThemedText>
                    <ThemedText type="body" style={{ fontWeight: "600" }}>
                      {fmtPaise(lookup.redemption.invoiceAmount)}
                    </ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>Final Due</ThemedText>
                    <ThemedText type="body" style={{ fontWeight: "600" }}>
                      {fmtPaise(lookup.redemption.finalAmountDue)}
                    </ThemedText>
                  </View>
                  <Button onPress={reset} style={styles.resetBtn} variant="outline">
                    Scan Next
                  </Button>
                </View>
              ) : lookup.advanceAvailable <= 0 ? (
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
                    No advance amount available for this booking.
                  </ThemedText>
                  <Button onPress={reset} style={styles.resetBtn} variant="outline">Scan Next</Button>
                </View>
              ) : (
                <>
                  {/* OTP section */}
                  {lookup.otpRequired && !otpVerified ? (
                    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <View style={styles.sectionHeaderRow}>
                        <Feather name="shield" size={16} color={theme.primary} />
                        <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.sm }}>
                          OTP Verification Required
                        </ThemedText>
                      </View>
                      <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
                        Send a one-time password to the customer's WhatsApp ({lookup.registration.customerPhone.slice(-4).padStart(10, "•")}) to verify identity before redemption.
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
                            style={[styles.input, { color: theme.text, borderColor: theme.border, textAlign: "center", fontSize: 22, letterSpacing: 8, marginBottom: Spacing.md }]}
                            testID="input-otp"
                          />
                          <Button
                            onPress={handleVerifyOtp}
                            loading={otpVerifying}
                            disabled={otpCode.length < 6}
                            style={styles.actionBtn}
                            testID="button-verify-otp"
                          >
                            Verify OTP
                          </Button>
                          <Pressable onPress={handleSendOtp} style={styles.resendLink} testID="button-resend-otp">
                            <ThemedText type="small" style={{ color: theme.primary }}>Resend OTP</ThemedText>
                          </Pressable>
                        </>
                      ) : (
                        <Button
                          onPress={handleSendOtp}
                          loading={otpSending}
                          style={styles.actionBtn}
                          testID="button-send-otp"
                        >
                          Send OTP to Customer
                        </Button>
                      )}
                    </View>
                  ) : (
                    /* Billing / Invoice section */
                    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <View style={styles.sectionHeaderRow}>
                        <Feather name="credit-card" size={16} color={theme.primary} />
                        <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.sm }}>
                          Enter Invoice Amount
                        </ThemedText>
                      </View>
                      {otpVerified && lookup.otpRequired ? (
                        <View style={[styles.verifiedBadge, { backgroundColor: "#10B98115", borderColor: "#10B98133" }]}>
                          <Feather name="check-circle" size={12} color="#10B981" />
                          <ThemedText type="small" style={{ color: "#10B981", fontWeight: "600" }}>OTP Verified</ThemedText>
                        </View>
                      ) : null}
                      <View style={styles.inputRow}>
                        <ThemedText type="h4" style={{ color: theme.textSecondary, marginRight: Spacing.sm }}>₹</ThemedText>
                        <TextInput
                          value={invoiceRupees}
                          onChangeText={setInvoiceRupees}
                          placeholder="0"
                          placeholderTextColor={theme.textSecondary}
                          keyboardType="decimal-pad"
                          style={[styles.invoiceInput, { color: theme.text, borderColor: theme.border }]}
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
                            <ThemedText type="small" style={{ fontWeight: "600", color: "#10B981" }}>
                              - {fmtPaise(Math.min(lookup.advanceAvailable, parseFloat(invoiceRupees) * 100))}
                            </ThemedText>
                          </View>
                          <View style={[styles.divider, { backgroundColor: theme.border }]} />
                          <View style={styles.infoRow}>
                            <ThemedText type="body" style={{ fontWeight: "700" }}>Customer Pays</ThemedText>
                            <ThemedText type="body" style={{ fontWeight: "700", color: theme.primary }}>
                              {fmtPaise(Math.max(0, parseFloat(invoiceRupees) * 100 - lookup.advanceAvailable))}
                            </ThemedText>
                          </View>
                        </View>
                      ) : null}
                      <Button
                        onPress={handleRedeem}
                        loading={redeeming}
                        disabled={!invoiceRupees || parseFloat(invoiceRupees) <= 0}
                        style={styles.actionBtn}
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

function BillingScanner({
  onScan,
  onClose,
}: {
  onScan: (value: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const CameraModule = require("expo-camera");
  const { CameraView, useCameraPermissions } = CameraModule;
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = useCallback(
    (result: { data: string }) => {
      if (scanned) return;
      setScanned(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onScan(result.data.trim());
    },
    [scanned, onScan],
  );

  if (!permission?.granted) {
    return (
      <ThemedView style={[styles.permWrap, { paddingTop: insets.top + Spacing["4xl"] }]}>
        <View style={[styles.avatar, { backgroundColor: theme.primary + "15", width: 80, height: 80, borderRadius: 40 }]}>
          <Feather name="camera" size={36} color={theme.primary} />
        </View>
        <ThemedText type="h4" style={{ marginTop: Spacing.lg, textAlign: "center" }}>Camera Access Required</ThemedText>
        {permission && !permission.granted ? (
          <Button onPress={requestPermission} style={{ marginTop: Spacing.lg, width: "80%" }}>Enable Camera</Button>
        ) : null}
        <Pressable onPress={onClose} style={{ marginTop: Spacing.md }}>
          <ThemedText type="body" style={{ color: theme.primary }}>Cancel</ThemedText>
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
      <View style={[styles.scanOverlay, { paddingTop: insets.top }]}>
        <Pressable onPress={onClose} style={styles.closeBtn} testID="button-billing-scanner-close">
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
        <View style={styles.scanArea}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft, { borderColor: theme.primary }]} />
            <View style={[styles.corner, styles.topRight, { borderColor: theme.primary }]} />
            <View style={[styles.corner, styles.bottomLeft, { borderColor: theme.primary }]} />
            <View style={[styles.corner, styles.bottomRight, { borderColor: theme.primary }]} />
          </View>
        </View>
        <View style={[styles.scanFooter, { paddingBottom: tabBarHeight + Spacing.lg }]}>
          <ThemedText type="body" style={styles.scanInstruction} lightColor="#fff" darkColor="#fff">
            Scan customer's QR ticket
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.lg },
  sectionTitle: { marginBottom: Spacing.md },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  regHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.xs },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: Spacing.xs },
  inputRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontSize: 15,
  },
  invoiceInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    fontSize: 24,
    fontWeight: "700",
  },
  searchBtn: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    marginTop: Spacing.sm,
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
  calcPreview: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  actionBtn: { marginTop: Spacing.sm },
  resetBtn: { marginTop: Spacing.sm },
  resendLink: { alignSelf: "center", marginTop: Spacing.sm, paddingVertical: Spacing.sm },
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
  successCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing["2xl"],
    alignItems: "center",
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  permWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing["3xl"] },
  permIcon: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: Spacing["2xl"] },
  scanOverlay: { ...StyleSheet.absoluteFillObject },
  closeBtn: {
    margin: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  scanFrame: { width: 240, height: 240, position: "relative" },
  corner: { position: "absolute", width: 40, height: 40 },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  scanFooter: { alignItems: "center", paddingHorizontal: Spacing["2xl"] },
  scanInstruction: { textAlign: "center", fontWeight: "600" },
});
