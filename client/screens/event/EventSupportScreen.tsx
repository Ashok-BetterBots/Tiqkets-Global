import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  useColorScheme,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";

const BRAND = BrandColors.primary;
const SUCCESS = "#10B981";
const FAIL = "#EF4444";
const WARN = "#F59E0B";

// ── Types ─────────────────────────────────────────────────────────────────────
interface RegResult {
  id: string;
  customerName: string;
  customerPhone: string;
  bookingId: string;
  status: string;
  slotDate: string;
  slotTime: string;
  familyMembersCount: number;
  amountPaid: number;
  eventName?: string;
  qrToken?: string;
}

interface StageLogRow {
  id: string;
  stage: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

type EditType = "edit_name" | "edit_guests" | "set_status" | "cancel_billing" | "edit_vehicle";

interface PendingEdit {
  editType: EditType;
  editPayload: Record<string, any>;
  displayValue: string; // human-readable summary of the change
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPaise(p: number | null | undefined): string {
  const v = (p || 0) / 100;
  return `\u20B9${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function fmtTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ts; }
}

function maskPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return phone;
  return "×".repeat(digits.length - 4) + " " + digits.slice(-4);
}

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(new URL(path, getApiUrl()), { credentials: "include" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let b: any = null;
    try { b = JSON.parse(t); } catch {}
    throw new Error(b?.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// ── Display constants ─────────────────────────────────────────────────────────
const STAGE_META: Record<string, { icon: React.ComponentProps<typeof Feather>["name"]; label: string; color: string }> = {
  registration_started: { icon: "user-plus", label: "Registration Started", color: BRAND },
  payment_completed: { icon: "dollar-sign", label: "Payment Completed", color: SUCCESS },
  ticket_generated: { icon: "credit-card", label: "Ticket Generated", color: "#8B5CF6" },
  arrived: { icon: "navigation", label: "Arrived at Venue", color: "#3B82F6" },
  checked_in: { icon: "log-in", label: "Checked In", color: SUCCESS },
  exited: { icon: "log-out", label: "Exited", color: "#6B7280" },
  feedback_submitted: { icon: "star", label: "Feedback Submitted", color: WARN },
  ticket_resent: { icon: "send", label: "Ticket Resent", color: BRAND },
  support_edit: { icon: "edit-2", label: "Support Edit", color: "#6B7280" },
};

const STATUS_COLORS: Record<string, string> = {
  ticket_generated: "#8B5CF6",
  arrived: "#3B82F6",
  checked_in: SUCCESS,
  exited: "#6B7280",
  feedback_submitted: "#6B7280",
  payment_completed: WARN,
  registration_started: "#9CA3AF",
};

const STATUS_OPTIONS = [
  { value: "ticket_generated", label: "Ticket Generated", color: "#8B5CF6" },
  { value: "arrived", label: "Arrived", color: "#3B82F6" },
  { value: "checked_in", label: "Checked In", color: SUCCESS },
  { value: "exited", label: "Exited", color: "#6B7280" },
];

// ── StatusPill ────────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#9CA3AF";
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <View style={[styles.statusPill, { backgroundColor: color + "20", borderColor: color + "44" }]}>
      <ThemedText type="small" style={{ color, fontWeight: "700" }}>{label}</ThemedText>
    </View>
  );
}

// ── InfoRow ───────────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.infoRow}>
      <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }}>{label}</ThemedText>
      <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={1}>{value}</ThemedText>
    </View>
  );
}

// ── Sheet wrapper shared by mini and OTP modals ───────────────────────────────
function BottomSheet({
  visible, onClose, children, blocking,
}: {
  visible: boolean; onClose: () => void; children: React.ReactNode; blocking?: boolean;
}) {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const sheetBg = colorScheme === "dark" ? "#1c1c1e" : "#ffffff";
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={blocking ? undefined : onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { backgroundColor: sheetBg, paddingBottom: insets.bottom + Spacing.xl }]}>
          <View style={styles.sheetHandle} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── MiniEditModal — per-field input, Apply / Cancel (no OTP) ─────────────────
interface MiniEditModalProps {
  visible: boolean;
  editType: EditType | null;
  registration: RegResult;
  currentPayload?: Record<string, any>;
  onApply: (editType: EditType, payload: Record<string, any>, displayValue: string) => void;
  onCancel: () => void;
}

function MiniEditModal({ visible, editType, registration, currentPayload, onApply, onCancel }: MiniEditModalProps) {
  const { theme } = useTheme();

  const [nameVal, setNameVal] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState("ticket_generated");
  const [vehicleReg, setVehicleReg] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Reset inputs when modal opens
  useEffect(() => {
    if (visible && editType && registration) {
      setLocalError(null);
      if (editType === "edit_name") {
        setNameVal(currentPayload?.name ?? registration.customerName ?? "");
      } else if (editType === "edit_guests") {
        setGuestCount(currentPayload?.count ?? (1 + (registration.familyMembersCount || 0)));
      } else if (editType === "set_status") {
        const s = currentPayload?.status ?? registration.status;
        setSelectedStatus(STATUS_OPTIONS.some(o => o.value === s) ? s : "ticket_generated");
      } else if (editType === "edit_vehicle") {
        setVehicleReg(currentPayload?.vehicleRegNumber ?? "");
      }
    }
  }, [visible, editType]);

  const handleApply = () => {
    setLocalError(null);
    if (!editType) return;
    if (editType === "edit_name") {
      if (!nameVal.trim()) { setLocalError("Name cannot be empty"); return; }
      onApply("edit_name", { name: nameVal.trim() }, nameVal.trim());
    } else if (editType === "edit_guests") {
      onApply("edit_guests", { count: guestCount }, `${guestCount} guest${guestCount !== 1 ? "s" : ""}`);
    } else if (editType === "set_status") {
      const opt = STATUS_OPTIONS.find(o => o.value === selectedStatus);
      onApply("set_status", { status: selectedStatus }, opt?.label ?? selectedStatus);
    } else if (editType === "cancel_billing") {
      onApply("cancel_billing", {}, "Cancel billing redemption");
    } else if (editType === "edit_vehicle") {
      if (!vehicleReg.trim()) { setLocalError("Vehicle registration cannot be empty"); return; }
      onApply("edit_vehicle", { vehicleRegNumber: vehicleReg.trim().toUpperCase() }, vehicleReg.trim().toUpperCase());
    }
  };

  const fieldTitle: Record<EditType, string> = {
    edit_name: "Edit Name",
    edit_guests: "Edit Guest Count",
    set_status: "Change Status",
    cancel_billing: "Cancel Billing",
    edit_vehicle: "Vehicle Registration",
  };

  return (
    <BottomSheet visible={visible} onClose={onCancel}>
      <View style={styles.sheetHeader}>
        <ThemedText type="h4">{editType ? fieldTitle[editType] : ""}</ThemedText>
        <Pressable onPress={onCancel} hitSlop={12}>
          <Feather name="x" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View style={[styles.sheetDivider, { backgroundColor: theme.border }]} />

      <View style={styles.sheetBody}>
        {localError ? (
          <View style={[styles.inlineBanner, { backgroundColor: FAIL + "15", borderColor: FAIL + "30" }]}>
            <Feather name="alert-circle" size={13} color={FAIL} />
            <ThemedText type="small" style={{ color: FAIL, flex: 1 }}>{localError}</ThemedText>
          </View>
        ) : null}

        {editType === "edit_name" ? (
          <>
            <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>Customer Name</ThemedText>
            <View style={[styles.fieldInput, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
              <TextInput
                value={nameVal}
                onChangeText={setNameVal}
                placeholder="Full name"
                placeholderTextColor={theme.textSecondary}
                style={[styles.fieldInputText, { color: theme.text }]}
                autoCapitalize="words"
                autoCorrect={false}
                testID="input-edit-name"
              />
            </View>
          </>
        ) : editType === "edit_guests" ? (
          <>
            <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>Number of Guests (incl. primary)</ThemedText>
            <View style={styles.counterRow}>
              <Pressable
                onPress={() => setGuestCount(g => Math.max(1, g - 1))}
                style={[styles.counterBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                testID="button-guest-minus"
              >
                <Feather name="minus" size={18} color={guestCount <= 1 ? theme.textSecondary : BRAND} />
              </Pressable>
              <View style={[styles.counterDisplay, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
                <ThemedText type="h3" style={{ color: BRAND }}>{guestCount}</ThemedText>
              </View>
              <Pressable
                onPress={() => setGuestCount(g => Math.min(50, g + 1))}
                style={[styles.counterBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                testID="button-guest-plus"
              >
                <Feather name="plus" size={18} color={guestCount >= 50 ? theme.textSecondary : BRAND} />
              </Pressable>
            </View>
          </>
        ) : editType === "set_status" ? (
          <>
            <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>New Status</ThemedText>
            <View style={styles.chipWrap}>
              {STATUS_OPTIONS.map((opt) => {
                const sel = selectedStatus === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setSelectedStatus(opt.value)}
                    style={[
                      styles.chip,
                      { backgroundColor: sel ? opt.color + "18" : theme.backgroundRoot, borderColor: sel ? opt.color : theme.border },
                    ]}
                    testID={`chip-${opt.value}`}
                  >
                    {sel ? <View style={[styles.chipDot, { backgroundColor: opt.color }]} /> : null}
                    <ThemedText type="small" style={{ color: sel ? opt.color : theme.textSecondary, fontWeight: sel ? "700" : "400" }}>
                      {opt.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : editType === "cancel_billing" ? (
          <View style={[styles.warnBox, { backgroundColor: WARN + "10", borderColor: WARN + "25" }]}>
            <Feather name="alert-triangle" size={20} color={WARN} />
            <ThemedText type="body" style={{ fontWeight: "700", color: WARN, marginTop: Spacing.xs }}>
              Cancel Advance Redemption
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.xs }}>
              The billing redemption record for {registration.customerName} will be removed.
              The advance payment remains on file but will no longer be marked as redeemed.
            </ThemedText>
          </View>
        ) : editType === "edit_vehicle" ? (
          <>
            <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>Vehicle Registration Number</ThemedText>
            <View style={[styles.fieldInput, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
              <TextInput
                value={vehicleReg}
                onChangeText={setVehicleReg}
                placeholder="e.g. TN 01 AB 1234"
                placeholderTextColor={theme.textSecondary}
                style={[styles.fieldInputText, { color: theme.text, letterSpacing: 1.5 }]}
                autoCapitalize="characters"
                autoCorrect={false}
                testID="input-edit-vehicle"
              />
            </View>
          </>
        ) : null}

        {/* Apply / Cancel */}
        <View style={styles.sheetFooterRow}>
          <Pressable
            onPress={onCancel}
            style={[styles.ghostBtn, { borderColor: theme.border }]}
            testID="button-mini-cancel"
          >
            <ThemedText type="body" style={{ fontWeight: "600", color: theme.textSecondary }}>Cancel</ThemedText>
          </Pressable>
          <Pressable
            onPress={handleApply}
            style={[styles.solidBtn, { backgroundColor: BRAND, flex: 1 }]}
            testID="button-mini-apply"
          >
            <Feather name="check" size={16} color="#fff" />
            <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Apply</ThemedText>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

// ── OtpConfirmModal — sends all pending edits in one OTP ─────────────────────
interface OtpConfirmModalProps {
  visible: boolean;
  registrationId: string;
  pendingEdits: PendingEdit[];
  onSuccess: (updated: RegResult) => void;
  onClose: () => void;
}

function OtpConfirmModal({ visible, registrationId, pendingEdits, onSuccess, onClose }: OtpConfirmModalProps) {
  const { theme } = useTheme();
  type Step = "sending" | "otp" | "applying" | "success";
  const [step, setStep] = useState<Step>("sending");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const otpRef = useRef<TextInput>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setResendCountdown(60);
    countdownRef.current = setInterval(() => {
      setResendCountdown(v => {
        if (v <= 1) { clearInterval(countdownRef.current!); return 0; }
        return v - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (visible) {
      setStep("sending");
      setOtpCode("");
      setError(null);
      setMaskedPhone("");
      setResendCountdown(0);
      sendOtp();
    } else {
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
  }, [visible]);

  const sendOtp = async () => {
    try {
      const data = await apiRequest("POST", "/api/dashboard/events/support/request-edit", {
        registrationId,
        edits: pendingEdits.map(e => ({ editType: e.editType, editPayload: e.editPayload })),
      });
      setMaskedPhone((data as any)?.maskedPhone || "");
      setStep("otp");
      startCountdown();
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch (e: any) {
      setError(e?.message || "Failed to send OTP");
      setStep("otp");
    }
  };

  const handleConfirm = async () => {
    if (!otpCode.trim() || step === "applying") return;
    setError(null);
    setStep("applying");
    try {
      const data = await apiRequest("POST", "/api/dashboard/events/support/confirm-edit", {
        registrationId,
        code: otpCode.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("success");
      onSuccess((data as any).registration);
    } catch (e: any) {
      setError(e?.message || "Incorrect OTP or expired");
      setStep("otp");
    }
  };

  return (
    <BottomSheet visible={visible} onClose={step === "applying" || step === "sending" ? () => {} : onClose} blocking={step === "applying"}>
      {/* Header */}
      <View style={styles.sheetHeader}>
        <View style={[styles.sheetIconCircle, { backgroundColor: BRAND + "15" }]}>
          <Feather name="shield" size={18} color={BRAND} />
        </View>
        <ThemedText type="h4" style={{ flex: 1 }}>Confirm Changes</ThemedText>
        {step !== "sending" && step !== "applying" ? (
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={20} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.sheetDivider, { backgroundColor: theme.border }]} />

      <View style={styles.sheetBody}>
        {/* Pending edits summary */}
        {step !== "success" ? (
          <View style={[styles.summaryBox, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
            {pendingEdits.map((e, i) => (
              <View key={e.editType} style={[
                styles.summaryRow,
                i < pendingEdits.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border } : {},
              ]}>
                <Feather name="edit-2" size={13} color={BRAND} />
                <ThemedText type="small" style={{ flex: 1, color: theme.textSecondary }}>
                  {e.editType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                </ThemedText>
                <ThemedText type="small" style={{ color: BRAND, fontWeight: "700" }}>{e.displayValue}</ThemedText>
              </View>
            ))}
          </View>
        ) : null}

        {/* Error banner */}
        {error ? (
          <View style={[styles.inlineBanner, { backgroundColor: FAIL + "15", borderColor: FAIL + "30" }]}>
            <Feather name="alert-circle" size={13} color={FAIL} />
            <ThemedText type="small" style={{ color: FAIL, flex: 1 }}>{error}</ThemedText>
          </View>
        ) : null}

        {/* Sending */}
        {step === "sending" ? (
          <View style={styles.centeredLoading}>
            <ActivityIndicator color={BRAND} size="large" />
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
              Sending OTP to customer's WhatsApp...
            </ThemedText>
          </View>
        ) : step === "otp" || step === "applying" ? (
          <>
            {maskedPhone ? (
              <View style={[styles.otpSentBadge, { backgroundColor: SUCCESS + "12", borderColor: SUCCESS + "30" }]}>
                <Feather name="check-circle" size={13} color={SUCCESS} />
                <ThemedText type="small" style={{ color: SUCCESS, fontWeight: "600" }}>
                  OTP sent — customer's WhatsApp: {maskedPhone}
                </ThemedText>
              </View>
            ) : null}
            <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              Enter the 6-digit OTP from the customer
            </ThemedText>
            <View style={[styles.otpBox, { backgroundColor: theme.backgroundRoot, borderColor: otpCode.length === 6 ? BRAND : theme.border }]}>
              <TextInput
                ref={otpRef}
                value={otpCode}
                onChangeText={v => setOtpCode(v.replace(/\D/g, "").slice(0, 6))}
                placeholder="——————"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.otpText, { color: theme.text }]}
                testID="input-otp"
              />
            </View>
            <Pressable
              onPress={handleConfirm}
              disabled={otpCode.length < 6 || step === "applying"}
              style={[styles.solidBtn, { backgroundColor: otpCode.length < 6 ? theme.border : BRAND }]}
              testID="button-otp-confirm"
            >
              {step === "applying" ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="check" size={16} color="#fff" />
                  <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Confirm & Save</ThemedText>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={resendCountdown > 0 ? undefined : () => { setOtpCode(""); setError(null); sendOtp(); }}
              style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: Spacing.xs }}
              hitSlop={10}
              testID="button-resend-otp"
            >
              {resendCountdown > 0 ? (
                <>
                  <Feather name="clock" size={12} color={theme.textSecondary} />
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    Resend in {resendCountdown}s
                  </ThemedText>
                </>
              ) : (
                <ThemedText type="small" style={{ color: BRAND, textDecorationLine: "underline" }}>Resend OTP</ThemedText>
              )}
            </Pressable>
          </>
        ) : step === "success" ? (
          <View style={styles.successBody}>
            <View style={[styles.successCircle, { backgroundColor: SUCCESS + "18" }]}>
              <Feather name="check-circle" size={40} color={SUCCESS} />
            </View>
            <ThemedText type="h4" style={{ color: SUCCESS }}>Changes Saved</ThemedText>
            <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
              All edits were applied to the booking.
            </ThemedText>
            <Pressable onPress={onClose} style={[styles.solidBtn, { backgroundColor: BRAND }]} testID="button-otp-done">
              <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Done</ThemedText>
            </Pressable>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

// ── EditPanel — toggled by pencil button on customer card ─────────────────────
interface EditPanelProps {
  registration: RegResult;
  onEditApplied: (updated: RegResult) => void;
}

const EDIT_FIELDS: Array<{ type: EditType; label: string; getValue: (r: RegResult) => string }> = [
  { type: "edit_name", label: "Name", getValue: r => r.customerName },
  { type: "edit_guests", label: "Guests", getValue: r => String(1 + (r.familyMembersCount || 0)) },
  { type: "set_status", label: "Status", getValue: r => r.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) },
  { type: "cancel_billing", label: "Billing", getValue: () => "Cancel redemption" },
  { type: "edit_vehicle", label: "Vehicle Reg", getValue: () => "— tap to set" },
];

function EditPanel({ registration, onEditApplied }: EditPanelProps) {
  const { theme } = useTheme();
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [openField, setOpenField] = useState<EditType | null>(null);
  const [otpVisible, setOtpVisible] = useState(false);

  const getPending = (t: EditType) => pendingEdits.find(e => e.editType === t);

  const handleApply = (editType: EditType, payload: Record<string, any>, displayValue: string) => {
    setPendingEdits(prev => {
      const filtered = prev.filter(e => e.editType !== editType);
      return [...filtered, { editType, editPayload: payload, displayValue }];
    });
    setOpenField(null);
  };

  const removePending = (t: EditType) => setPendingEdits(prev => prev.filter(e => e.editType !== t));

  const handleSaveSuccess = (updated: RegResult) => {
    setPendingEdits([]);
    setOtpVisible(false);
    onEditApplied(updated);
  };

  return (
    <>
      <View style={[styles.editPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.sectionHeader, { marginBottom: Spacing.sm }]}>
          <Feather name="edit-2" size={14} color={BRAND} />
          <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.xs }}>Edit Booking</ThemedText>
        </View>

        {EDIT_FIELDS.map((field, idx) => {
          const pending = getPending(field.type);
          const displayVal = pending ? pending.displayValue : field.getValue(registration);
          const isPending = !!pending;
          return (
            <View
              key={field.type}
              style={[
                styles.editFieldRow,
                idx < EDIT_FIELDS.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border } : {},
              ]}
            >
              <ThemedText type="small" style={{ color: theme.textSecondary, width: 80 }}>{field.label}</ThemedText>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.xs }}>
                {isPending ? <View style={[styles.pendingDot, { backgroundColor: BRAND }]} /> : null}
                <ThemedText
                  type="body"
                  style={{ fontWeight: "500", color: isPending ? BRAND : theme.text }}
                  numberOfLines={1}
                >
                  {displayVal}
                </ThemedText>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                {isPending ? (
                  <Pressable onPress={() => removePending(field.type)} hitSlop={10} testID={`button-remove-${field.type}`}>
                    <Feather name="x" size={14} color={FAIL} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => setOpenField(field.type)}
                  style={[styles.pencilBtn, { backgroundColor: BRAND + "12" }]}
                  testID={`button-edit-${field.type}`}
                >
                  <Feather name="edit-2" size={13} color={BRAND} />
                </Pressable>
              </View>
            </View>
          );
        })}

        {pendingEdits.length > 0 ? (
          <View style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
            <Pressable
              onPress={() => setOtpVisible(true)}
              style={[styles.solidBtn, { backgroundColor: BRAND }]}
              testID="button-save-edits"
            >
              <Feather name="save" size={16} color="#fff" />
              <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>
                Save {pendingEdits.length} Change{pendingEdits.length !== 1 ? "s" : ""}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => setPendingEdits([])} style={{ alignSelf: "center" }} hitSlop={10} testID="button-discard-edits">
              <ThemedText type="small" style={{ color: theme.textSecondary, textDecorationLine: "underline" }}>
                Discard all changes
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
      </View>

      <MiniEditModal
        visible={openField !== null}
        editType={openField}
        registration={registration}
        currentPayload={openField ? getPending(openField)?.editPayload : undefined}
        onApply={handleApply}
        onCancel={() => setOpenField(null)}
      />

      <OtpConfirmModal
        visible={otpVisible}
        registrationId={registration.id}
        pendingEdits={pendingEdits}
        onSuccess={handleSaveSuccess}
        onClose={() => setOtpVisible(false)}
      />
    </>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function EventSupportScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const CameraModule = Platform.OS !== "web" ? require("expo-camera") : null;
  const { CameraView, useCameraPermissions } = CameraModule || {};
  const [permission, requestPermission] = useCameraPermissions ? useCameraPermissions() : [null, () => {}];

  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RegResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RegResult | null>(null);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [stageLog, setStageLog] = useState<StageLogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const editPanelY = useRef(0);

  useEffect(() => {
    if (editPanelOpen) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: editPanelY.current - Spacing.md, animated: true });
      }, 120);
    }
  }, [editPanelOpen]);

  const openCamera = useCallback(async () => {
    if (!permission?.granted) await requestPermission();
    setCameraOpen(true);
    setError(null);
  }, [permission, requestPermission]);

  const loadLog = useCallback(async (regId: string) => {
    setStageLog([]);
    setLogLoading(true);
    try {
      const data = await fetchJson(`/api/dashboard/events/registration/${regId}/log?t=${Date.now()}`);
      setStageLog(data.log || []);
    } catch { setStageLog([]); }
    finally { setLogLoading(false); }
  }, []);

  const selectRegistration = useCallback(async (reg: RegResult) => {
    setSelected(reg);
    setEditPanelOpen(false);
    loadLog(reg.id);
  }, [loadLog]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSelected(null);
    setStageLog([]);
    setSearched(false);
    setEditPanelOpen(false);
    try {
      const enc = encodeURIComponent(q.trim());
      const data = await fetchJson(`/api/dashboard/events/support/lookup?q=${enc}&t=${Date.now()}`);
      const regs: RegResult[] = data.results || [];
      setResults(regs);
      setSearched(true);
      if (regs.length === 1) selectRegistration(regs[0]);
    } catch (e: any) {
      setError(e?.message || "Search failed");
    } finally { setLoading(false); }
  }, [selectRegistration]);

  const handleBarCodeScanned = useCallback(async (scanData: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCameraOpen(false);
    await doSearch(scanData.data);
    setTimeout(() => setScanned(false), 1500);
  }, [scanned, doSearch]);

  const handleResend = useCallback(async () => {
    if (!selected) return;
    setResending(true);
    setResendSuccess(false);
    try {
      await apiRequest("POST", "/api/dashboard/events/support/resend-ticket", { registrationId: selected.id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResendSuccess(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setResendSuccess(false), 3000);
    } catch (e: any) {
      setError(e?.message || "Resend failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setResending(false); }
  }, [selected]);


  const handleEditApplied = useCallback((updated: RegResult) => {
    setSelected(updated);
    setEditPanelOpen(false);
    loadLog(updated.id);
  }, [loadLog]);

  const baseUrl = getApiUrl().replace(/\/$/, "");

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingTop: Spacing.xl, paddingBottom: tabBarHeight + Spacing["2xl"] }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Search card ── */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ThemedText type="body" style={{ fontWeight: "700", marginBottom: Spacing.md }}>Find Customer</ThemedText>

          {Platform.OS !== "web" && cameraOpen && permission?.granted ? (
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
                Scan the customer's QR ticket
              </ThemedText>
            </View>
          ) : Platform.OS !== "web" ? (
            <Pressable onPress={openCamera} style={[styles.scanBtn, { backgroundColor: BRAND }]} testID="button-support-scan">
              <Feather name="camera" size={19} color="#fff" />
              <ThemedText type="body" style={styles.scanBtnText}>
                {!permission?.granted ? "Enable Camera to Scan" : "Scan QR Code"}
              </ThemedText>
            </Pressable>
          ) : null}

          {Platform.OS !== "web" ? (
            <ThemedText type="small" style={[styles.orText, { color: theme.textSecondary }]}>or search manually</ThemedText>
          ) : null}

          <View style={styles.inputRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Booking ID, phone, or name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundRoot }]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => doSearch(query)}
              testID="input-support-search"
            />
            <Pressable
              onPress={() => doSearch(query)}
              disabled={!query.trim() || loading}
              style={[styles.searchBtn, { backgroundColor: !query.trim() ? theme.border : BRAND, opacity: loading ? 0.7 : 1 }]}
              testID="button-support-search"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="search" size={18} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>

        {/* Error */}
        {error ? (
          <View style={[styles.banner, { backgroundColor: FAIL + "18", borderColor: FAIL + "33" }]}>
            <Feather name="alert-circle" size={15} color={FAIL} />
            <ThemedText type="small" style={{ color: FAIL, flex: 1 }}>{error}</ThemedText>
          </View>
        ) : null}

        {/* Multiple results */}
        {searched && !selected && results.length > 1 ? (
          <View style={{ marginBottom: Spacing.md }}>
            <View style={[styles.sectionHeader, { marginBottom: Spacing.sm }]}>
              <Feather name="users" size={14} color={BRAND} />
              <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.xs }}>
                {results.length} registrations found
              </ThemedText>
            </View>
            {results.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => selectRegistration(r)}
                style={[styles.resultRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                testID={`result-${r.bookingId}`}
              >
                <View style={[styles.resultAvatar, { backgroundColor: BRAND + "18" }]}>
                  <Feather name="user" size={16} color={BRAND} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="body" style={{ fontWeight: "600" }}>{r.customerName}</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    {r.bookingId} · {maskPhone(r.customerPhone)}
                  </ThemedText>
                  {r.eventName ? (
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>{r.eventName}</ThemedText>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <StatusPill status={r.status} />
                  <Feather name="chevron-right" size={16} color={theme.textSecondary} />
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Empty state */}
        {searched && !loading && results.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="inbox" size={40} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
              No registrations found
            </ThemedText>
          </View>
        ) : null}

        {/* ── Selected registration ── */}
        {selected ? (
          <>
            {results.length > 1 ? (
              <Pressable onPress={() => { setSelected(null); setStageLog([]); setEditPanelOpen(false); }} style={styles.backLink}>
                <Feather name="chevron-left" size={16} color={BRAND} />
                <ThemedText type="body" style={{ color: BRAND }}>All results</ThemedText>
              </Pressable>
            ) : null}

            {/* Customer card */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.avatar, { backgroundColor: BRAND + "20" }]}>
                  <Feather name="user" size={22} color={BRAND} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="h4">{selected.customerName}</ThemedText>
                  {selected.eventName ? (
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>{selected.eventName}</ThemedText>
                  ) : null}
                </View>
                <StatusPill status={selected.status} />
                {/* Pencil / Edit toggle */}
                <Pressable
                  onPress={() => setEditPanelOpen(v => !v)}
                  style={[styles.pencilToggle, {
                    backgroundColor: editPanelOpen ? BRAND + "18" : theme.backgroundRoot,
                    borderColor: editPanelOpen ? BRAND : theme.border,
                  }]}
                  testID="button-toggle-edit"
                >
                  <Feather name="edit-2" size={15} color={editPanelOpen ? BRAND : theme.textSecondary} />
                </Pressable>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <InfoRow label="Booking ID" value={selected.bookingId} />
              <InfoRow label="Phone" value={maskPhone(selected.customerPhone)} />
              <InfoRow label="Slot" value={`${selected.slotDate}  ${selected.slotTime}`} />
              <InfoRow label="Guests" value={String(1 + (selected.familyMembersCount || 0))} />
              <InfoRow label="Advance Paid" value={fmtPaise(selected.amountPaid)} />
            </View>

            {/* Current status */}
            <View style={[styles.stageCard, {
              backgroundColor: (STATUS_COLORS[selected.status] ?? "#9CA3AF") + "12",
              borderColor: (STATUS_COLORS[selected.status] ?? "#9CA3AF") + "30",
            }]}>
              <Feather name="activity" size={16} color={STATUS_COLORS[selected.status] ?? "#9CA3AF"} />
              <View style={{ flex: 1 }}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>Current Status</ThemedText>
                <ThemedText type="body" style={{ fontWeight: "700", color: STATUS_COLORS[selected.status] ?? "#9CA3AF" }}>
                  {selected.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </ThemedText>
              </View>
            </View>

            {/* Edit panel — only when pencil is toggled */}
            <View onLayout={(e) => { editPanelY.current = e.nativeEvent.layout.y; }}>
              {editPanelOpen ? (
                <EditPanel registration={selected} onEditApplied={handleEditApplied} />
              ) : null}
            </View>

            {/* Timeline */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.sectionHeader, { marginBottom: Spacing.md }]}>
                <Feather name="clock" size={15} color={BRAND} />
                <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.xs }}>Full Journey</ThemedText>
              </View>
              {logLoading ? (
                <View style={styles.logLoading}>
                  <ActivityIndicator color={BRAND} />
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>Loading history...</ThemedText>
                </View>
              ) : stageLog.length === 0 ? (
                <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", padding: Spacing.md }}>
                  No activity recorded yet
                </ThemedText>
              ) : (
                stageLog.map((row, idx) => {
                  const meta = STAGE_META[row.stage] ?? { icon: "activity", label: row.stage.replace(/_/g, " "), color: BRAND };
                  const isLast = idx === stageLog.length - 1;
                  const isCurrent = idx === 0;
                  return (
                    <View key={row.id} style={styles.timelineItem}>
                      {!isLast ? <View style={[styles.timelineLine, { backgroundColor: theme.border }]} /> : null}
                      <View style={[styles.timelineDot, {
                        backgroundColor: isCurrent ? meta.color : theme.surface,
                        borderColor: meta.color,
                        borderWidth: isCurrent ? 0 : 2,
                      }]}>
                        <Feather name={meta.icon} size={10} color={isCurrent ? "#fff" : meta.color} />
                      </View>
                      <View style={{ flex: 1, paddingBottom: isLast ? 0 : Spacing.xl }}>
                        <ThemedText type="body" style={{ fontWeight: isCurrent ? "700" : "500", color: isCurrent ? meta.color : theme.text }}>
                          {meta.label}
                        </ThemedText>
                        <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
                          {fmtTs(row.createdAt)}
                        </ThemedText>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* Ticket */}
            {selected.qrToken ? (
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.sectionHeader, { marginBottom: Spacing.md }]}>
                  <Feather name="credit-card" size={15} color={BRAND} />
                  <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.xs }}>Ticket</ThemedText>
                </View>
                <View style={styles.qrWrap}>
                  <Image source={{ uri: `${baseUrl}/event-qr/${selected.qrToken}.png` }} style={styles.qrImage} resizeMode="contain" />
                </View>
                <View style={styles.ticketActions}>
                  {resendSuccess ? (
                    <View style={[styles.pill, { backgroundColor: SUCCESS + "15", borderColor: SUCCESS + "33" }]}>
                      <Feather name="check-circle" size={14} color={SUCCESS} />
                      <ThemedText type="small" style={{ color: SUCCESS, fontWeight: "600" }}>Sent!</ThemedText>
                    </View>
                  ) : (
                    <Pressable
                      onPress={handleResend}
                      disabled={resending}
                      style={[styles.pill, { backgroundColor: "#25D36615", borderColor: "#25D36630" }]}
                      testID="button-resend-ticket"
                    >
                      {resending ? <ActivityIndicator size="small" color="#25D366" /> : <Feather name="send" size={15} color="#25D366" />}
                      <ThemedText type="small" style={{ color: "#25D366", fontWeight: "700" }}>WhatsApp</ThemedText>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => WebBrowser.openBrowserAsync(`${baseUrl}/event-ticket/${selected.qrToken}`)}
                    style={[styles.pill, { backgroundColor: BRAND + "15", borderColor: BRAND + "30" }]}
                    testID="button-open-ticket"
                  >
                    <Feather name="external-link" size={15} color={BRAND} />
                    <ThemedText type="small" style={{ color: BRAND, fontWeight: "700" }}>View / Print</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.lg },

  // Cards
  card: {
    borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg, marginBottom: Spacing.md, gap: Spacing.sm,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.xs },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 28 },
  stageCard: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    padding: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.md,
  },

  // Pencil toggle on customer card
  pencilToggle: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },

  // Edit panel
  editPanel: {
    borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg, marginBottom: Spacing.md,
  },
  editFieldRow: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
  },
  pendingDot: { width: 6, height: 6, borderRadius: 3 },
  pencilBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
  },

  // Search
  scanBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, height: 50, borderRadius: BorderRadius.full, marginBottom: Spacing.md,
  },
  scanBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  orText: { textAlign: "center", marginBottom: Spacing.md },
  inputRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  input: {
    flex: 1, height: 48,
    borderRadius: BorderRadius.full, borderWidth: 1,
    paddingHorizontal: Spacing.md, fontSize: 15, letterSpacing: 0,
  },
  searchBtn: {
    width: 48, height: 48,
    borderRadius: BorderRadius.full,
    alignItems: "center", justifyContent: "center",
  },

  // Results
  banner: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, marginBottom: Spacing.md,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center" },
  resultRow: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    padding: Spacing.lg, borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth, marginBottom: Spacing.sm,
  },
  resultAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  emptyWrap: { alignItems: "center", marginTop: Spacing["4xl"] },
  backLink: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, marginBottom: Spacing.md },

  // Camera
  cameraBox: {
    height: 220, borderRadius: BorderRadius.xl, overflow: "hidden",
    borderWidth: 2, marginBottom: Spacing.sm, position: "relative",
  },
  corner: { position: "absolute", width: 20, height: 20, borderWidth: 2.5 },
  TL: { top: 10, left: 10, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  TR: { top: 10, right: 10, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  BL: { bottom: 10, left: 10, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  BR: { bottom: 10, right: 10, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  cameraClose: {
    position: "absolute", top: 10, right: 10,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12, padding: 5,
  },

  // Timeline
  logLoading: { alignItems: "center", padding: Spacing.xl },
  timelineItem: { flexDirection: "row", gap: Spacing.md, paddingLeft: 2 },
  timelineLine: { position: "absolute", left: 11, top: 20, width: 1.5, bottom: 0, zIndex: 0 },
  timelineDot: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center", zIndex: 1, flexShrink: 0, marginTop: 1,
  },

  // Ticket
  qrWrap: { alignItems: "center", padding: Spacing.sm },
  qrImage: { width: 160, height: 160 },
  ticketActions: { flexDirection: "row", gap: Spacing.sm, flexWrap: "wrap" },
  pill: {
    flexDirection: "row", alignItems: "center", gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  statusPill: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },

  // Sheet (modal)
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  kav: { justifyContent: "flex-end", flex: 1 },
  sheet: {
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.xs,
    shadowColor: "#000", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 12,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#9CA3AF40", alignSelf: "center", marginVertical: Spacing.sm },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  sheetIconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sheetDivider: { height: StyleSheet.hairlineWidth },
  sheetBody: { padding: Spacing.lg, gap: Spacing.md },
  sheetFooterRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.xs },

  // Shared buttons
  solidBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, height: 50, borderRadius: BorderRadius.lg,
  },
  ghostBtn: {
    height: 50, borderRadius: BorderRadius.lg, borderWidth: 1,
    alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing.lg,
  },

  // Mini modal inputs
  fieldLabel: { fontWeight: "600" },
  fieldInput: {
    borderRadius: BorderRadius.lg, borderWidth: 1, height: 50,
    justifyContent: "center", paddingHorizontal: Spacing.md,
  },
  fieldInputText: { fontSize: 16 },
  counterRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.xl },
  counterBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  counterDisplay: {
    width: 80, height: 52, borderRadius: BorderRadius.lg,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  chip: {
    flexDirection: "row", alignItems: "center", gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  warnBox: { padding: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1, alignItems: "center", gap: Spacing.xs },
  inlineBanner: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1,
  },

  // OTP modal
  summaryBox: { borderRadius: BorderRadius.lg, borderWidth: 1, overflow: "hidden" },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.sm + 2 },
  centeredLoading: { alignItems: "center", paddingVertical: Spacing["2xl"] },
  otpSentBadge: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1,
  },
  otpBox: {
    borderRadius: BorderRadius.lg, borderWidth: 1.5,
    height: 68, alignItems: "center", justifyContent: "center",
  },
  otpText: { fontSize: 30, letterSpacing: 10, textAlign: "center", width: "100%" },
  successBody: { alignItems: "center", gap: Spacing.md, paddingVertical: Spacing.lg },
  successCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
});
