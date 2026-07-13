import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { playSuccessTone, playErrorTone } from "@/utils/alertSounds";

const BRAND = "#8c1867";
const SUCCESS = "#10B981";
const FAIL = "#EF4444";

function fmtPaise(p: number | null | undefined): string {
  const v = (p || 0) / 100;
  return `\u20B9${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export interface LookupResult {
  registration: {
    id: string;
    customerName: string;
    bookingId: string;
    amountPaid: number;
    status: string;
    customerPhone: string;
    familyMembersCount?: number;
    slotDate?: string | null;
    slotTime?: string | null;
  };
  eventName: string;
  advanceAvailable: number;
  redemption: { advanceRedeemed: number; finalAmountDue: number; invoiceAmount: number } | null;
  otpRequired: boolean;
  otpVerified: boolean;
  /** True when the registration was paid in cash at the counter (manual registration).
   *  OTP is not required — payment was physically verified by staff at the time of registration. */
  cashPaidAtCounter?: boolean;
}

type ModalStep = "details" | "otp" | "invoice" | "success";

interface Props {
  visible: boolean;
  lookup: LookupResult;
  onClose: () => void;
  onSuccess: () => void;
}

function StepIndicator({ step, otpRequired, cashPaidAtCounter }: { step: ModalStep; otpRequired: boolean; cashPaidAtCounter?: boolean }) {
  const visibleSteps: { key: ModalStep; label: string }[] = [
    { key: "details", label: "Details" },
    ...(otpRequired && !cashPaidAtCounter ? [{ key: "otp" as ModalStep, label: "OTP" }] : []),
    { key: "invoice", label: "Invoice" },
    { key: "success", label: "Done" },
  ];
  const currentIdx = visibleSteps.findIndex((s) => s.key === step);

  return (
    <View style={si.row}>
      {visibleSteps.map((s, i) => {
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;
        return (
          <React.Fragment key={s.key}>
            <View style={[si.dot, isActive && si.dotActive, isDone && si.dotDone]}>
              {isDone ? (
                <Feather name="check" size={10} color="#fff" />
              ) : (
                <ThemedText style={[si.dotText, (isActive || isDone) && { color: "#fff" }]}>
                  {i + 1}
                </ThemedText>
              )}
            </View>
            <ThemedText style={[si.label, isActive && { color: BRAND, fontWeight: "700" }]}>
              {s.label}
            </ThemedText>
            {i < visibleSteps.length - 1 ? (
              <View style={[si.line, isDone && { backgroundColor: BRAND }]} />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const si = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: Spacing.lg,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
  dotActive: { backgroundColor: BRAND },
  dotDone: { backgroundColor: BRAND + "AA" },
  dotText: { fontSize: 10, fontWeight: "700", color: "#6B7280" },
  label: { fontSize: 10, color: "#9CA3AF", fontWeight: "500" },
  line: { flex: 1, height: 1.5, backgroundColor: "#E5E7EB", maxWidth: 24 },
});

export function BillingTransactionModal({ visible, lookup, onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const alreadyRedeemed = !!lookup.redemption;
  const noAdvance = lookup.advanceAvailable <= 0 && !alreadyRedeemed;
  const otpAlreadyVerified = lookup.otpVerified;

  const [step, setStep] = useState<ModalStep>("details");
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpVerified, setOtpVerified] = useState(otpAlreadyVerified);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [invoiceRupees, setInvoiceRupees] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    redeemed: number; finalDue: number; invoiceTotal: number;
  } | null>(null);

  // Override state — shown when customer's phone is unavailable
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState<"lost_phone" | "phone_off" | "other">("lost_phone");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [overrideInvoiceRupees, setOverrideInvoiceRupees] = useState("");
  const [overriding, setOverriding] = useState(false);

  const clearError = () => setError(null);

  // ── Resend countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleCancel = useCallback(() => {
    setStep("details");
    setOtpSent(false);
    setOtpCode("");
    setOtpVerified(otpAlreadyVerified);
    setResendCooldown(0);
    setInvoiceRupees("");
    setError(null);
    setSuccessData(null);
    setShowOverride(false);
    setOverrideNotes("");
    setOverrideInvoiceRupees("");
    setOverrideReason("lost_phone");
    onClose();
  }, [onClose, otpAlreadyVerified]);

  const handleSendOtp = useCallback(async () => {
    if (otpSending) return;
    setOtpSending(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/dashboard/events/billing/send-otp", {
        registrationId: lookup.registration.id,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOtpSent(true);
      setResendCooldown(60);
    } catch (e: any) {
      setError(e?.message || "Failed to send OTP");
      setOtpSent(false);
    } finally {
      setOtpSending(false);
    }
  }, [lookup.registration.id, otpSending]);

  const handleOverrideRedeem = useCallback(async () => {
    const invoicePaise = Math.round(parseFloat(overrideInvoiceRupees || "0") * 100);
    if (isNaN(invoicePaise) || invoicePaise < 0 || !overrideInvoiceRupees.trim()) {
      setError("Please enter the invoice amount to continue");
      return;
    }
    setOverriding(true);
    setError(null);
    try {
      const result = await apiRequest("POST", "/api/dashboard/events/billing/override-redeem", {
        registrationId: lookup.registration.id,
        invoiceAmount: invoicePaise,
        reason: overrideReason,
        notes: overrideNotes.trim() || null,
      }) as any;
      setSuccessData({
        redeemed: result.redemption?.advanceRedeemed ?? 0,
        finalDue: result.redemption?.finalAmountDue ?? 0,
        invoiceTotal: result.redemption?.invoiceAmount ?? invoicePaise,
      });
      setStep("success");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSuccessTone();
      onSuccess();
    } catch (e: any) {
      setError(e?.message || "Override failed. Please try again.");
      playErrorTone();
    } finally {
      setOverriding(false);
    }
  }, [lookup.registration.id, overrideReason, overrideNotes, overrideInvoiceRupees, onSuccess]);

  const handleContinueFromDetails = () => {
    setError(null);
    if (alreadyRedeemed || noAdvance) return handleCancel();
    // Cash/counter payments skip OTP — proceed directly to invoice
    if (lookup.otpRequired && !otpVerified && !lookup.cashPaidAtCounter) {
      setOtpSent(false);
      setStep("otp");
    } else {
      setStep("invoice");
    }
  };

  const handleResendOtp = useCallback(async () => {
    if (resendCooldown > 0 || otpSending) return;
    setOtpSent(false);
    setOtpCode("");
    setError(null);
    setOtpSending(true);
    try {
      await apiRequest("POST", "/api/dashboard/events/billing/send-otp", {
        registrationId: lookup.registration.id,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOtpSent(true);
      setResendCooldown(60);
    } catch (e: any) {
      setError(e?.message || "Failed to resend OTP");
      setOtpSent(true); // keep input visible even on failure
    } finally {
      setOtpSending(false);
    }
  }, [lookup.registration.id, resendCooldown, otpSending]);

  const handleVerifyOtp = useCallback(async () => {
    if (!otpCode.trim()) return;
    setOtpVerifying(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/dashboard/events/billing/verify-otp", {
        registrationId: lookup.registration.id,
        code: otpCode.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOtpVerified(true);
      setOtpCode("");
      setStep("invoice");
    } catch (e: any) {
      setError(e?.message || "OTP verification failed");
    } finally {
      setOtpVerifying(false);
    }
  }, [lookup.registration.id, otpCode]);

  const handleRedeem = useCallback(async () => {
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
      playSuccessTone();
      setSuccessData({
        redeemed: data.redemption?.advanceRedeemed ?? 0,
        finalDue: data.redemption?.finalAmountDue ?? 0,
        invoiceTotal: data.redemption?.invoiceAmount ?? invoicePaise,
      });
      setStep("success");
      onSuccess();
    } catch (e: any) {
      setError(e?.message || "Redemption failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      playErrorTone();
    } finally {
      setRedeeming(false);
    }
  }, [lookup.registration.id, invoiceRupees, onSuccess]);

  const invoicePaise = parseFloat(invoiceRupees || "0") * 100;
  const advanceApplied = Math.min(lookup.advanceAvailable, invoicePaise);
  const finalDue = Math.max(0, invoicePaise - advanceApplied);

  const maskPhone = (p: string) => {
    const d = p.replace(/\D/g, "");
    return d.length > 4 ? "•".repeat(Math.min(d.length - 4, 6)) + d.slice(-4) : p;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.overlay} onPress={step === "success" ? handleCancel : undefined}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + Spacing.xl }]}
            onPress={() => {}}
          >
            {/* Drag handle */}
            <View style={[styles.handle, { backgroundColor: theme.border }]} />

            {/* Step indicator */}
            <StepIndicator step={step} otpRequired={lookup.otpRequired && !otpAlreadyVerified} cashPaidAtCounter={lookup.cashPaidAtCounter} />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Spacing.sm }}
            >
              {/* ── Customer summary — always visible at top ── */}
              <View style={[styles.customerBanner, { backgroundColor: BRAND + "10", borderColor: BRAND + "25" }]}>
                <View style={[styles.avatar, { backgroundColor: BRAND + "20" }]}>
                  <Feather name="user" size={20} color={BRAND} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ThemedText style={styles.customerName} numberOfLines={1}>
                    {lookup.registration.customerName}
                  </ThemedText>
                  <ThemedText style={[styles.customerSub, { color: theme.textSecondary }]} numberOfLines={1}>
                    {lookup.registration.bookingId} · {lookup.eventName}
                  </ThemedText>
                </View>
                {step !== "success" ? (
                  <Pressable onPress={handleCancel} hitSlop={12} style={styles.closeIcon}>
                    <Feather name="x" size={18} color={theme.textSecondary} />
                  </Pressable>
                ) : null}
              </View>

              {/* ── Error banner ── */}
              {error ? (
                <Pressable onPress={clearError} style={[styles.errorBanner, { backgroundColor: FAIL + "15", borderColor: FAIL + "33" }]}>
                  <Feather name="alert-circle" size={14} color={FAIL} />
                  <ThemedText style={{ color: FAIL, flex: 1, fontSize: 13 }}>{error}</ThemedText>
                  <Feather name="x" size={13} color={FAIL} />
                </Pressable>
              ) : null}

              {/* ══════════════════════════════════════════════════════════
                  STEP: details
              ══════════════════════════════════════════════════════════ */}
              {step === "details" ? (
                <View style={[styles.card, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
                  <ThemedText style={styles.cardTitle}>Booking Details</ThemedText>

                  <DetailRow icon="phone" label="Phone" value={maskPhone(lookup.registration.customerPhone)} theme={theme} />
                  <DetailRow icon="credit-card" label="Advance Paid" value={fmtPaise(lookup.registration.amountPaid)} theme={theme} />

                  <View style={[styles.divider, { backgroundColor: theme.border }]} />

                  {alreadyRedeemed && lookup.redemption ? (
                    <>
                      <View style={[styles.statusBadge, { backgroundColor: SUCCESS + "15", borderColor: SUCCESS + "30" }]}>
                        <Feather name="check-circle" size={14} color={SUCCESS} />
                        <ThemedText style={{ color: SUCCESS, fontWeight: "700", fontSize: 13 }}>
                          Already Redeemed
                        </ThemedText>
                      </View>
                      <DetailRow icon="trending-down" label="Advance Redeemed" value={fmtPaise(lookup.redemption.advanceRedeemed)} theme={theme} />
                      <DetailRow icon="file-text" label="Invoice Total" value={fmtPaise(lookup.redemption.invoiceAmount)} theme={theme} />
                      <DetailRow icon="check-square" label="Final Amount Due" value={fmtPaise(lookup.redemption.finalAmountDue)} theme={theme} />
                    </>
                  ) : noAdvance ? (
                    <View style={[styles.statusBadge, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
                      <Feather name="info" size={14} color={theme.textSecondary} />
                      <ThemedText style={{ color: theme.textSecondary, fontSize: 13 }}>
                        No advance amount available
                      </ThemedText>
                    </View>
                  ) : (
                    // ── Available for redemption row ──
                    <>
                      {lookup.cashPaidAtCounter ? (
                        <View style={[styles.cashBadge, { backgroundColor: "#D1FAE5", borderColor: "#6EE7B7" }]}>
                          <Feather name="check-circle" size={14} color="#065F46" />
                          <View style={{ flex: 1 }}>
                            <ThemedText style={[styles.cashBadgeTitle, { color: "#065F46" }]}>
                              Paid at Counter
                            </ThemedText>
                            <ThemedText style={[styles.cashBadgeSub, { color: "#065F46AA" }]}>
                              Cash collected at registration — no OTP needed
                            </ThemedText>
                          </View>
                        </View>
                      ) : null}
                      <View style={[styles.availableBox, { backgroundColor: BRAND + "08" }]}>
                        <View style={styles.availableInner}>
                          <View style={[styles.availableIconWrap, { backgroundColor: BRAND + "18" }]}>
                            <Feather name="tag" size={14} color={BRAND} />
                          </View>
                          <ThemedText style={[styles.availableLabel, { color: theme.textSecondary }]}>
                            Available for Redemption
                          </ThemedText>
                          <ThemedText style={styles.availableAmount}>
                            {fmtPaise(lookup.advanceAvailable)}
                          </ThemedText>
                        </View>
                      </View>
                    </>
                  )}
                </View>
              ) : null}

              {/* ══════════════════════════════════════════════════════════
                  STEP: otp
              ══════════════════════════════════════════════════════════ */}
              {step === "otp" ? (
                <View style={[styles.card, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
                  <View style={styles.otpHeaderRow}>
                    <View style={[styles.otpIconWrap, { backgroundColor: BRAND + "15" }]}>
                      <Feather name="shield" size={20} color={BRAND} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.cardTitle}>OTP Verification</ThemedText>
                      <ThemedText style={[styles.otpSubtitle, { color: theme.textSecondary }]}>
                        {otpSent
                          ? `A one-time code has been sent to the customer's WhatsApp (${maskPhone(lookup.registration.customerPhone)}).`
                          : `We'll text a one-time code to the customer's WhatsApp (${maskPhone(lookup.registration.customerPhone)}) to verify this redemption.`}
                      </ThemedText>
                    </View>
                  </View>

                  {/* Not sent yet — explicit trigger, no auto-send */}
                  {!otpSending && !otpSent ? (
                    <Pressable
                      onPress={handleSendOtp}
                      style={[styles.primaryBtn, { backgroundColor: BRAND }]}
                      testID="button-send-otp"
                    >
                      <Feather name="send" size={15} color="#fff" />
                      <ThemedText style={styles.primaryBtnText}>Send OTP</ThemedText>
                    </Pressable>
                  ) : otpSending && !otpSent ? (
                    <View style={[styles.statusBadge, { backgroundColor: BRAND + "10", borderColor: BRAND + "25" }]}>
                      <ActivityIndicator size="small" color={BRAND} />
                      <ThemedText style={{ color: BRAND, fontSize: 12, fontWeight: "600" }}>
                        Sending OTP to customer…
                      </ThemedText>
                    </View>
                  ) : otpSent ? (
                    <>
                      <View style={[styles.statusBadge, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                        <Feather name="check-circle" size={13} color="#3B82F6" />
                        <ThemedText style={{ color: "#3B82F6", fontSize: 12, fontWeight: "600" }}>
                          OTP sent to customer's WhatsApp
                        </ThemedText>
                      </View>

                      <ThemedText style={[styles.otpInputLabel, { color: theme.textSecondary }]}>
                        Enter the 6-digit code the customer reads to you
                      </ThemedText>
                      <TextInput
                        value={otpCode}
                        onChangeText={setOtpCode}
                        placeholder="• • • • • •"
                        placeholderTextColor={theme.textSecondary}
                        keyboardType="number-pad"
                        maxLength={6}
                        style={[styles.otpInput, { color: theme.text, borderColor: BRAND + "60", backgroundColor: theme.surface }]}
                        testID="input-otp"
                      />

                      <Pressable
                        onPress={handleVerifyOtp}
                        disabled={otpVerifying || otpCode.length < 6}
                        style={[styles.primaryBtn, { backgroundColor: BRAND, opacity: (otpVerifying || otpCode.length < 6) ? 0.6 : 1, marginTop: Spacing.sm }]}
                      >
                        {otpVerifying ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Feather name="check-circle" size={15} color="#fff" />
                            <ThemedText style={styles.primaryBtnText}>Verify OTP</ThemedText>
                          </>
                        )}
                      </Pressable>

                      {/* Resend with countdown */}
                      <Pressable
                        onPress={handleResendOtp}
                        disabled={otpSending || resendCooldown > 0}
                        style={styles.resendLink}
                      >
                        {otpSending ? (
                          <ActivityIndicator size="small" color={BRAND} />
                        ) : (
                          <ThemedText
                            style={{
                              color: resendCooldown > 0 ? theme.textSecondary : BRAND,
                              fontSize: 13,
                              fontWeight: "600",
                            }}
                          >
                            Resend OTP{resendCooldown > 0 ? `  (${resendCooldown}s)` : ""}
                          </ThemedText>
                        )}
                      </Pressable>

                      {/* Override trigger */}
                      <Pressable
                        onPress={() => { setShowOverride(true); Keyboard.dismiss(); }}
                        style={{ paddingTop: 14, alignItems: "center" }}
                      >
                        <ThemedText style={{ color: theme.textSecondary, fontSize: 12, fontWeight: "500" }}>
                          {"Customer can't receive OTP? "}
                          <ThemedText style={{ color: BRAND, fontWeight: "700", fontSize: 12 }}>Override</ThemedText>
                        </ThemedText>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ) : null}

              {/* ══════════════════════════════════════════════════════════
                  OVERRIDE CARD — shown when customer's phone is unavailable
              ══════════════════════════════════════════════════════════ */}
              {step === "otp" && showOverride ? (
                <View style={[styles.card, { backgroundColor: "#FFF7ED", borderColor: "#FED7AA" }]}>
                  <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                    <Feather name="alert-triangle" size={18} color="#D97706" />
                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ fontSize: 14, fontWeight: "700", color: "#92400E" }}>
                        Override OTP
                      </ThemedText>
                      <ThemedText style={{ fontSize: 12, color: "#B45309", marginTop: 2 }}>
                        This override will be logged with your name and timestamp for audit.
                      </ThemedText>
                    </View>
                  </View>

                  <ThemedText style={{ fontSize: 12, fontWeight: "600", color: "#92400E", marginBottom: 8 }}>
                    Reason *
                  </ThemedText>
                  {(["lost_phone", "phone_off", "other"] as const).map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => setOverrideReason(r)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}
                    >
                      <View style={{
                        width: 18, height: 18, borderRadius: 9,
                        borderWidth: 2,
                        borderColor: overrideReason === r ? BRAND : "#D1D5DB",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        {overrideReason === r ? (
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND }} />
                        ) : null}
                      </View>
                      <ThemedText style={{ fontSize: 13, color: "#92400E" }}>
                        {r === "lost_phone" ? "Phone lost" : r === "phone_off" ? "Phone switched off" : "Other reason"}
                      </ThemedText>
                    </Pressable>
                  ))}

                  <ThemedText style={{ fontSize: 12, fontWeight: "600", color: "#92400E", marginTop: 4, marginBottom: 6 }}>
                    Notes (optional)
                  </ThemedText>
                  <TextInput
                    value={overrideNotes}
                    onChangeText={setOverrideNotes}
                    placeholder="Brief note about the situation…"
                    placeholderTextColor="#B45309AA"
                    multiline
                    numberOfLines={2}
                    style={{
                      borderWidth: 1, borderColor: "#FED7AA", borderRadius: 10,
                      padding: 10, fontSize: 13, color: "#92400E",
                      backgroundColor: "#FFFBF5", marginBottom: 12, minHeight: 52,
                    }}
                  />

                  <ThemedText style={{ fontSize: 12, fontWeight: "600", color: "#92400E", marginBottom: 6 }}>
                    Invoice Amount (₹) *
                  </ThemedText>
                  <TextInput
                    value={overrideInvoiceRupees}
                    onChangeText={(v) => setOverrideInvoiceRupees(v.replace(/[^0-9.]/g, ""))}
                    placeholder="0.00"
                    placeholderTextColor="#B45309AA"
                    keyboardType="decimal-pad"
                    style={{
                      borderWidth: 1, borderColor: "#FED7AA", borderRadius: 10,
                      padding: 12, fontSize: 20, fontWeight: "700", color: "#92400E",
                      backgroundColor: "#FFFBF5", marginBottom: 14,
                    }}
                  />

                  <Pressable
                    onPress={handleOverrideRedeem}
                    disabled={overriding || !overrideInvoiceRupees.trim()}
                    style={[styles.primaryBtn, {
                      backgroundColor: "#D97706",
                      opacity: (overriding || !overrideInvoiceRupees.trim()) ? 0.55 : 1,
                      marginBottom: 8,
                    }]}
                  >
                    {overriding ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Feather name="unlock" size={15} color="#fff" />
                        <ThemedText style={styles.primaryBtnText}>Confirm Override &amp; Redeem</ThemedText>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => setShowOverride(false)}
                    style={{ paddingVertical: 10, alignItems: "center" }}
                  >
                    <ThemedText style={{ fontSize: 13, color: BRAND, fontWeight: "600" }}>
                      Cancel — go back to OTP
                    </ThemedText>
                  </Pressable>
                </View>
              ) : null}

              {/* ══════════════════════════════════════════════════════════
                  STEP: invoice
              ══════════════════════════════════════════════════════════ */}
              {step === "invoice" ? (
                <View style={[styles.card, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
                  {lookup.cashPaidAtCounter ? (
                    <View style={[styles.statusBadge, { backgroundColor: "#D1FAE5", borderColor: "#6EE7B7", marginBottom: Spacing.md }]}>
                      <Feather name="check-circle" size={13} color="#065F46" />
                      <ThemedText style={{ color: "#065F46", fontSize: 12, fontWeight: "600" }}>Cash Paid at Counter</ThemedText>
                    </View>
                  ) : otpVerified && lookup.otpRequired ? (
                    <View style={[styles.statusBadge, { backgroundColor: SUCCESS + "12", borderColor: SUCCESS + "30", marginBottom: Spacing.md }]}>
                      <Feather name="check-circle" size={13} color={SUCCESS} />
                      <ThemedText style={{ color: SUCCESS, fontSize: 12, fontWeight: "600" }}>OTP Verified</ThemedText>
                    </View>
                  ) : null}

                  <ThemedText style={styles.cardTitle}>Invoice Amount</ThemedText>
                  <ThemedText style={[styles.otpSubtitle, { color: theme.textSecondary, marginBottom: Spacing.md }]}>
                    Enter the total bill amount. The advance of {fmtPaise(lookup.advanceAvailable)} will be applied automatically.
                  </ThemedText>

                  {/* Large rupee input */}
                  <View style={[styles.invoiceInputWrap, { borderColor: BRAND + "60", backgroundColor: theme.surface }]}>
                    <ThemedText style={[styles.rupeeSymbol, { color: BRAND }]}>₹</ThemedText>
                    <TextInput
                      value={invoiceRupees}
                      onChangeText={(t) => { setInvoiceRupees(t); setError(null); }}
                      placeholder="0"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="decimal-pad"
                      style={[styles.invoiceInput, { color: theme.text }]}
                      testID="input-invoice-amount"
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                    />
                    {invoiceRupees ? (
                      <Pressable
                        onPress={() => Keyboard.dismiss()}
                        style={[styles.invoiceDoneBtn, { backgroundColor: BRAND }]}
                        testID="button-invoice-done"
                      >
                        <ThemedText style={styles.invoiceDoneBtnText}>Done</ThemedText>
                      </Pressable>
                    ) : null}
                  </View>

                  {/* Live calculation preview */}
                  {invoicePaise > 0 ? (
                    <View style={[styles.calcCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <CalcRow label="Invoice Total" value={fmtPaise(invoicePaise)} theme={theme} />
                      <CalcRow label="Advance Applied" value={`- ${fmtPaise(advanceApplied)}`} color={SUCCESS} theme={theme} />
                      <View style={[styles.calcDivider, { backgroundColor: theme.border }]} />
                      <CalcRow label="Customer Pays" value={fmtPaise(finalDue)} bold theme={theme} />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* ══════════════════════════════════════════════════════════
                  STEP: success
              ══════════════════════════════════════════════════════════ */}
              {step === "success" && successData ? (
                <View style={[styles.card, { backgroundColor: SUCCESS + "0D", borderColor: SUCCESS + "30" }]}>
                  <View style={styles.successIconWrap}>
                    <View style={[styles.successIcon, { backgroundColor: SUCCESS }]}>
                      <Feather name="check-circle" size={36} color="#fff" />
                    </View>
                  </View>
                  <ThemedText style={styles.successTitle}>Transaction Complete!</ThemedText>
                  <ThemedText style={[styles.successName, { color: SUCCESS }]}>
                    {lookup.registration.customerName}
                  </ThemedText>
                  <View style={[styles.calcCard, { backgroundColor: theme.surface, borderColor: SUCCESS + "30", marginTop: Spacing.md }]}>
                    <CalcRow label="Invoice Total" value={fmtPaise(successData.invoiceTotal)} theme={theme} />
                    <CalcRow label="Advance Redeemed" value={`- ${fmtPaise(successData.redeemed)}`} color={SUCCESS} theme={theme} />
                    <View style={[styles.calcDivider, { backgroundColor: theme.border }]} />
                    <CalcRow label="Final Amount Due" value={fmtPaise(successData.finalDue)} bold theme={theme} />
                  </View>
                </View>
              ) : null}

              {/* ── Footer buttons ── */}
              <View style={styles.footer}>
                {step === "details" ? (
                  <>
                    <Pressable onPress={handleCancel} style={[styles.cancelBtn, { borderColor: theme.border }]}>
                      <ThemedText style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</ThemedText>
                    </Pressable>
                    {!alreadyRedeemed && !noAdvance ? (
                      <Pressable onPress={handleContinueFromDetails} style={[styles.primaryBtn, { flex: 2, marginTop: 0 }]}>
                        <ThemedText style={styles.primaryBtnText}>Continue</ThemedText>
                        <Feather name="arrow-right" size={15} color="#fff" />
                      </Pressable>
                    ) : null}
                  </>
                ) : step === "otp" ? (
                  <Pressable onPress={handleCancel} style={[styles.cancelBtn, { borderColor: theme.border, flex: 1 }]}>
                    <Feather name="x" size={14} color={theme.textSecondary} />
                    <ThemedText style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel Transaction</ThemedText>
                  </Pressable>
                ) : step === "invoice" ? (
                  <>
                    <Pressable onPress={handleCancel} style={[styles.cancelBtn, { borderColor: theme.border }]}>
                      <ThemedText style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={handleRedeem}
                      disabled={redeeming || !invoicePaise || invoicePaise <= 0}
                      style={[styles.primaryBtn, { flex: 2, marginTop: 0, backgroundColor: BRAND, opacity: (redeeming || !invoicePaise || invoicePaise <= 0) ? 0.6 : 1 }]}
                    >
                      {redeeming ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Feather name="check-circle" size={15} color="#fff" />
                          <ThemedText style={styles.primaryBtnText}>Confirm & Redeem</ThemedText>
                        </>
                      )}
                    </Pressable>
                  </>
                ) : step === "success" ? (
                  <Pressable onPress={handleCancel} style={[styles.primaryBtn, { flex: 1, backgroundColor: SUCCESS, marginTop: 0 }]}>
                    <Feather name="check" size={15} color="#fff" />
                    <ThemedText style={styles.primaryBtnText}>Done</ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DetailRow({ icon, label, value, theme }: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string; value: string; theme: any;
}) {
  return (
    <View style={styles.detailRow}>
      <Feather name={icon} size={13} color={theme.textSecondary} />
      <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
      <ThemedText style={styles.detailValue} numberOfLines={1}>{value}</ThemedText>
    </View>
  );
}

function CalcRow({ label, value, color, bold, theme }: {
  label: string; value: string; color?: string; bold?: boolean; theme: any;
}) {
  return (
    <View style={styles.calcRow}>
      <ThemedText style={[styles.calcLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
      <ThemedText style={[styles.calcValue, bold && styles.calcValueBold, color ? { color } : null]}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    maxHeight: "92%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  /* Customer banner */
  customerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  customerName: { fontSize: 15, fontWeight: "700" },
  customerSub: { fontSize: 12, fontWeight: "500", marginTop: 1 },
  closeIcon: { padding: 4 },
  /* Error */
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  /* Card */
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: Spacing.sm },
  /* Detail rows */
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  detailLabel: { fontSize: 13, flex: 1 },
  detailValue: { fontSize: 13, fontWeight: "600", flexShrink: 0 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.sm },
  /* Status badges */
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  /* Available box — horizontal row so label and amount never overlap */
  availableBox: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.xs,
  },
  availableInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  availableIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  availableLabel: { fontSize: 12, fontWeight: "600", flex: 1 },
  availableAmount: { fontSize: 18, fontWeight: "800", color: BRAND, flexShrink: 0 },
  /* Cash-paid-at-counter badge */
  cashBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  cashBadgeTitle: { fontSize: 13, fontWeight: "700" },
  cashBadgeSub: { fontSize: 11, marginTop: 1 },
  /* OTP step */
  otpHeaderRow: { flexDirection: "row", gap: Spacing.md, marginBottom: Spacing.md },
  otpIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  otpSubtitle: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  otpInputLabel: { fontSize: 12, fontWeight: "500", marginBottom: Spacing.sm, marginTop: Spacing.md },
  otpInput: {
    borderWidth: 2,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 8,
    textAlign: "center",
  },
  resendLink: {
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  /* Invoice step */
  invoiceInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  rupeeSymbol: { fontSize: 28, fontWeight: "700", marginRight: Spacing.xs },
  invoiceInput: { flex: 1, fontSize: 32, fontWeight: "700", paddingVertical: Spacing.md },
  invoiceDoneBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  invoiceDoneBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  calcCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  calcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  calcLabel: { fontSize: 13 },
  calcValue: { fontSize: 13, fontWeight: "500" },
  calcValueBold: { fontSize: 15, fontWeight: "800" },
  calcDivider: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  /* Success */
  successIconWrap: { alignItems: "center", marginBottom: Spacing.md },
  successIcon: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
  },
  successTitle: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: Spacing.xs },
  successName: { fontSize: 16, fontWeight: "700", textAlign: "center", marginBottom: Spacing.xs },
  /* Footer buttons */
  footer: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  cancelBtnText: { fontWeight: "700", fontSize: 15 },
  primaryBtn: {
    flex: 2,
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: BRAND,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
