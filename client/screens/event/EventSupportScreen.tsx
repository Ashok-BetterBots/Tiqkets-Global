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
  Linking,
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
const BRAND_BG = BRAND + "12";
const SUCCESS = "#10B981";
const FAIL = "#EF4444";
const WARN = "#F59E0B";

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

interface EditAction {
  type: EditType;
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  desc: string;
  color: string;
}

const EDIT_ACTIONS: EditAction[] = [
  { type: "edit_name", icon: "edit-2", label: "Edit Name", desc: "Correct customer's name", color: BRAND },
  { type: "edit_guests", icon: "users", label: "Edit Guest Count", desc: "Change number of guests", color: "#3B82F6" },
  { type: "set_status", icon: "activity", label: "Change Status", desc: "Override booking status", color: "#8B5CF6" },
  { type: "cancel_billing", icon: "x-circle", label: "Cancel Billing", desc: "Reverse advance redemption", color: FAIL },
  { type: "edit_vehicle", icon: "hash", label: "Vehicle Registration", desc: "Update parking vehicle number", color: "#10B981" },
];

const STATUS_OPTIONS = [
  { value: "ticket_generated", label: "Ticket Generated", color: "#8B5CF6" },
  { value: "arrived", label: "Arrived", color: "#3B82F6" },
  { value: "checked_in", label: "Checked In", color: SUCCESS },
  { value: "exited", label: "Exited", color: "#6B7280" },
];

function fmtPaise(p: number | null | undefined): string {
  const v = (p || 0) / 100;
  return `\u20B9${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function fmtTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
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

// ── EditActionModal ───────────────────────────────────────────────────────────
interface EditActionModalProps {
  visible: boolean;
  action: EditAction | null;
  registration: RegResult | null;
  onSuccess: (updated: RegResult) => void;
  onClose: () => void;
}

function EditActionModal({ visible, action, registration, onSuccess, onClose }: EditActionModalProps) {
  const { theme } = useTheme();
  const colorScheme = useColorScheme();
  const sheetBg = colorScheme === "dark" ? "#1c1c1e" : "#ffffff";
  const insets = useSafeAreaInsets();

  type Step = "input" | "sending" | "otp" | "applying" | "success";
  const [step, setStep] = useState<Step>("input");
  const [nameVal, setNameVal] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState("ticket_generated");
  const [vehicleReg, setVehicleReg] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const otpInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible && registration) {
      setStep("input");
      setNameVal(registration.customerName || "");
      setGuestCount(1 + (registration.familyMembersCount || 0));
      setSelectedStatus(registration.status && STATUS_OPTIONS.some(s => s.value === registration.status)
        ? registration.status : "ticket_generated");
      setVehicleReg("");
      setOtpCode("");
      setMaskedPhone("");
      setEditError(null);
    }
  }, [visible, registration]);

  const buildPayload = (): Record<string, any> => {
    switch (action?.type) {
      case "edit_name": return { name: nameVal.trim() };
      case "edit_guests": return { count: guestCount };
      case "set_status": return { status: selectedStatus };
      case "cancel_billing": return {};
      case "edit_vehicle": return { vehicleRegNumber: vehicleReg.trim().toUpperCase() };
      default: return {};
    }
  };

  const handleSendOtp = async () => {
    if (!registration || !action) return;
    setEditError(null);
    // Validate input before sending OTP
    if (action.type === "edit_name" && !nameVal.trim()) {
      setEditError("Name cannot be empty"); return;
    }
    if (action.type === "edit_vehicle" && !vehicleReg.trim()) {
      setEditError("Vehicle registration cannot be empty"); return;
    }
    setStep("sending");
    try {
      const data = await apiRequest("POST", "/api/dashboard/events/support/request-edit", {
        registrationId: registration.id,
        editType: action.type,
        editPayload: buildPayload(),
      });
      setMaskedPhone((data as any)?.maskedPhone || "");
      setStep("otp");
      setTimeout(() => otpInputRef.current?.focus(), 400);
    } catch (e: any) {
      setEditError(e?.message || "Failed to send OTP");
      setStep("input");
    }
  };

  const handleConfirm = async () => {
    if (!registration || !otpCode.trim()) return;
    setEditError(null);
    setStep("applying");
    try {
      const data = await apiRequest("POST", "/api/dashboard/events/support/confirm-edit", {
        registrationId: registration.id,
        code: otpCode.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess((data as any).registration);
      setStep("success");
    } catch (e: any) {
      setEditError(e?.message || "Failed to apply change");
      setStep("otp");
    }
  };

  const handleClose = () => {
    if (step === "sending" || step === "applying") return;
    onClose();
  };

  if (!action || !registration) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.modalOverlay} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalKAV}
        pointerEvents="box-none"
      >
        <View style={[styles.modalSheet, { backgroundColor: sheetBg, paddingBottom: insets.bottom + Spacing.xl }]}>
          {/* Handle */}
          <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />

          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={[styles.modalIconCircle, { backgroundColor: action.color + "18" }]}>
              <Feather name={action.icon} size={20} color={action.color} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="h4" style={{ color: action.color }}>{action.label}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>{registration.customerName}</ThemedText>
            </View>
            {step !== "sending" && step !== "applying" ? (
              <Pressable onPress={handleClose} hitSlop={12}>
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.modalDivider, { backgroundColor: theme.border }]} />

          {/* Error */}
          {editError ? (
            <View style={[styles.editErrorBanner, { backgroundColor: FAIL + "18", borderColor: FAIL + "33" }]}>
              <Feather name="alert-circle" size={14} color={FAIL} />
              <ThemedText type="small" style={{ color: FAIL, flex: 1 }}>{editError}</ThemedText>
            </View>
          ) : null}

          {/* ── STEP: input ─────────────────────────────────────── */}
          {step === "input" || step === "sending" ? (
            <View style={styles.modalBody}>
              {action.type === "edit_name" ? (
                <>
                  <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>New Name</ThemedText>
                  <View style={[styles.editInput, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
                    <TextInput
                      value={nameVal}
                      onChangeText={setNameVal}
                      placeholder="Customer's full name"
                      placeholderTextColor={theme.textSecondary}
                      style={[styles.editInputText, { color: theme.text }]}
                      autoCapitalize="words"
                      autoCorrect={false}
                      testID="input-edit-name"
                    />
                  </View>
                </>
              ) : action.type === "edit_guests" ? (
                <>
                  <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>Number of Guests</ThemedText>
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
                  <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.xs }}>
                    Including primary guest
                  </ThemedText>
                </>
              ) : action.type === "set_status" ? (
                <>
                  <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>New Status</ThemedText>
                  <View style={styles.statusChipRow}>
                    {STATUS_OPTIONS.map((opt) => {
                      const sel = selectedStatus === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() => setSelectedStatus(opt.value)}
                          style={[
                            styles.statusChip,
                            { backgroundColor: sel ? opt.color + "18" : theme.backgroundRoot, borderColor: sel ? opt.color : theme.border },
                          ]}
                          testID={`chip-status-${opt.value}`}
                        >
                          <ThemedText type="small" style={{ color: sel ? opt.color : theme.textSecondary, fontWeight: sel ? "700" : "400" }}>
                            {opt.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : action.type === "cancel_billing" ? (
                <View style={[styles.warnBox, { backgroundColor: WARN + "12", borderColor: WARN + "30" }]}>
                  <Feather name="alert-triangle" size={18} color={WARN} style={{ marginBottom: Spacing.sm }} />
                  <ThemedText type="body" style={{ fontWeight: "700", color: WARN, textAlign: "center", marginBottom: Spacing.xs }}>
                    Cancel Billing Redemption
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
                    This will remove the advance redemption record for {registration.customerName}.
                    The payment record will remain but the redemption will be reversed.
                  </ThemedText>
                </View>
              ) : action.type === "edit_vehicle" ? (
                <>
                  <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>Vehicle Registration Number</ThemedText>
                  <View style={[styles.editInput, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
                    <TextInput
                      value={vehicleReg}
                      onChangeText={setVehicleReg}
                      placeholder="e.g. TN 01 AB 1234"
                      placeholderTextColor={theme.textSecondary}
                      style={[styles.editInputText, { color: theme.text, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }]}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      testID="input-edit-vehicle"
                    />
                  </View>
                </>
              ) : null}

              <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.md }}>
                An OTP will be sent to the customer's WhatsApp to confirm this change.
              </ThemedText>

              <Pressable
                onPress={handleSendOtp}
                disabled={step === "sending"}
                style={[styles.primaryBtn, { backgroundColor: action.color }]}
                testID="button-send-otp"
              >
                {step === "sending" ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="message-circle" size={16} color="#fff" />
                    <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Send OTP to Customer</ThemedText>
                  </>
                )}
              </Pressable>
            </View>
          ) : null}

          {/* ── STEP: otp ───────────────────────────────────────── */}
          {step === "otp" || step === "applying" ? (
            <View style={styles.modalBody}>
              <View style={[styles.otpSentBadge, { backgroundColor: SUCCESS + "12", borderColor: SUCCESS + "30" }]}>
                <Feather name="check-circle" size={14} color={SUCCESS} />
                <ThemedText type="small" style={{ color: SUCCESS, fontWeight: "600" }}>
                  OTP sent to {maskedPhone || "customer's WhatsApp"}
                </ThemedText>
              </View>

              <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>Enter 6-digit OTP</ThemedText>
              <View style={[styles.otpInput, { backgroundColor: theme.backgroundRoot, borderColor: otpCode.length === 6 ? BRAND : theme.border }]}>
                <TextInput
                  ref={otpInputRef}
                  value={otpCode}
                  onChangeText={v => setOtpCode(v.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={[styles.otpInputText, { color: theme.text }]}
                  testID="input-otp-code"
                />
              </View>

              <Pressable
                onPress={() => { setStep("input"); setOtpCode(""); setEditError(null); }}
                style={{ alignSelf: "center", marginBottom: Spacing.md }}
                hitSlop={10}
              >
                <ThemedText type="small" style={{ color: BRAND, textDecorationLine: "underline" }}>
                  Request a new OTP
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={handleConfirm}
                disabled={otpCode.length < 6 || step === "applying"}
                style={[styles.primaryBtn, { backgroundColor: otpCode.length < 6 ? theme.border : action.color }]}
                testID="button-confirm-edit"
              >
                {step === "applying" ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="check" size={16} color="#fff" />
                    <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Confirm Change</ThemedText>
                  </>
                )}
              </Pressable>
            </View>
          ) : null}

          {/* ── STEP: success ────────────────────────────────────── */}
          {step === "success" ? (
            <View style={[styles.modalBody, { alignItems: "center" }]}>
              <View style={[styles.successCircle, { backgroundColor: SUCCESS + "18" }]}>
                <Feather name="check-circle" size={36} color={SUCCESS} />
              </View>
              <ThemedText type="h4" style={{ color: SUCCESS, marginBottom: Spacing.xs }}>Change Applied</ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.xl }}>
                The booking has been updated successfully.
              </ThemedText>
              <Pressable onPress={onClose} style={[styles.primaryBtn, { backgroundColor: SUCCESS, width: "100%" }]} testID="button-edit-done">
                <Feather name="x" size={16} color="#fff" />
                <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Done</ThemedText>
              </Pressable>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── EditPanel ─────────────────────────────────────────────────────────────────
interface EditPanelProps {
  registration: RegResult;
  onEditApplied: (updated: RegResult) => void;
}

function EditPanel({ registration, onEditApplied }: EditPanelProps) {
  const { theme } = useTheme();
  const [activeAction, setActiveAction] = useState<EditAction | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const openAction = (action: EditAction) => {
    setActiveAction(action);
    setModalVisible(true);
  };

  const handleSuccess = (updated: RegResult) => {
    onEditApplied(updated);
  };

  const handleClose = () => {
    setModalVisible(false);
  };

  return (
    <>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.sectionHeader, { marginBottom: Spacing.md }]}>
          <Feather name="tool" size={15} color={BRAND} />
          <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.xs }}>Edit Booking</ThemedText>
        </View>
        {EDIT_ACTIONS.map((action, idx) => (
          <Pressable
            key={action.type}
            onPress={() => openAction(action)}
            style={[
              styles.editActionRow,
              idx < EDIT_ACTIONS.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border } : {},
            ]}
            testID={`button-edit-${action.type}`}
          >
            <View style={[styles.editActionIcon, { backgroundColor: action.color + "14" }]}>
              <Feather name={action.icon} size={16} color={action.color} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="body" style={{ fontWeight: "600" }}>{action.label}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>{action.desc}</ThemedText>
            </View>
            <Feather name="chevron-right" size={16} color={theme.textSecondary} />
          </Pressable>
        ))}
      </View>

      <EditActionModal
        visible={modalVisible}
        action={activeAction}
        registration={registration}
        onSuccess={handleSuccess}
        onClose={handleClose}
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
  const [stageLog, setStageLog] = useState<StageLogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openCamera = useCallback(async () => {
    if (!permission?.granted) await requestPermission();
    setCameraOpen(true);
    setError(null);
  }, [permission, requestPermission]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSelected(null);
    setStageLog([]);
    setSearched(false);
    try {
      const enc = encodeURIComponent(q.trim());
      const data = await fetchJson(`/api/dashboard/events/support/lookup?q=${enc}&t=${Date.now()}`);
      const regs: RegResult[] = data.results || [];
      setResults(regs);
      setSearched(true);
      if (regs.length === 1) selectRegistration(regs[0]);
    } catch (e: any) {
      setError(e?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLog = useCallback(async (regId: string) => {
    setStageLog([]);
    setLogLoading(true);
    try {
      const data = await fetchJson(`/api/dashboard/events/registration/${regId}/log?t=${Date.now()}`);
      setStageLog(data.log || []);
    } catch {
      setStageLog([]);
    } finally {
      setLogLoading(false);
    }
  }, []);

  const selectRegistration = useCallback(async (reg: RegResult) => {
    setSelected(reg);
    loadLog(reg.id);
  }, [loadLog]);

  const handleBarCodeScanned = useCallback(
    async (scanData: { data: string }) => {
      if (scanned) return;
      setScanned(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCameraOpen(false);
      await doSearch(scanData.data);
      setTimeout(() => setScanned(false), 1500);
    },
    [scanned, doSearch],
  );

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
    } finally {
      setResending(false);
    }
  }, [selected]);

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setSelected(null);
    setStageLog([]);
    setSearched(false);
    setError(null);
    setResendSuccess(false);
    setCameraOpen(false);
  }, []);

  const handleEditApplied = useCallback((updated: RegResult) => {
    setSelected(updated);
    loadLog(updated.id);
  }, [loadLog]);

  const baseUrl = getApiUrl().replace(/\/$/, "");

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: Spacing.xl, paddingBottom: tabBarHeight + Spacing["2xl"] },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Search panel */}
        <View style={[styles.searchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
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
            <Pressable
              onPress={openCamera}
              style={[styles.scanBtn, { backgroundColor: BRAND }]}
              testID="button-support-scan"
            >
              <Feather name="camera" size={19} color="#fff" />
              <ThemedText type="body" style={styles.scanBtnText}>
                {!permission?.granted ? "Enable Camera to Scan" : "Scan QR Code"}
              </ThemedText>
            </Pressable>
          ) : null}

          {Platform.OS !== "web" ? (
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>or search manually</ThemedText>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>
          ) : null}

          <View style={[styles.inputWrap, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
            <Feather name="search" size={16} color={theme.textSecondary} style={{ marginLeft: Spacing.md }} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Booking ID, phone, or name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text }]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => doSearch(query)}
              testID="input-support-search"
            />
            {query.length > 0 ? (
              <Pressable onPress={handleClear} style={styles.clearBtn} hitSlop={10} testID="button-support-clear">
                <Feather name="x" size={16} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => doSearch(query)}
            disabled={!query.trim() || loading}
            style={[styles.searchSubmitBtn, { backgroundColor: !query.trim() ? theme.border : BRAND }]}
            testID="button-support-search"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="search" size={16} color="#fff" />
                <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Search</ThemedText>
              </>
            )}
          </Pressable>
        </View>

        {/* Error */}
        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: FAIL + "18", borderColor: FAIL + "33" }]}>
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
                    {r.bookingId} · {r.customerPhone}
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

        {/* Detailed view */}
        {selected ? (
          <>
            {results.length > 1 ? (
              <Pressable onPress={() => { setSelected(null); setStageLog([]); }} style={styles.backLink}>
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
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <InfoRow label="Booking ID" value={selected.bookingId} mono />
              <InfoRow label="Phone" value={selected.customerPhone} />
              <InfoRow label="Slot" value={`${selected.slotDate}  ${selected.slotTime}`} />
              <InfoRow label="Guests" value={String(1 + (selected.familyMembersCount || 0))} />
              <InfoRow label="Advance Paid" value={fmtPaise(selected.amountPaid)} />
            </View>

            {/* Current stage */}
            <View style={[styles.currentStageCard, { backgroundColor: (STATUS_COLORS[selected.status] ?? "#9CA3AF") + "12", borderColor: (STATUS_COLORS[selected.status] ?? "#9CA3AF") + "30" }]}>
              <Feather name="activity" size={16} color={STATUS_COLORS[selected.status] ?? "#9CA3AF"} />
              <View style={{ flex: 1 }}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>Current Status</ThemedText>
                <ThemedText type="body" style={{ fontWeight: "700", color: STATUS_COLORS[selected.status] ?? "#9CA3AF" }}>
                  {selected.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </ThemedText>
              </View>
            </View>

            {/* Edit Panel */}
            <EditPanel registration={selected} onEditApplied={handleEditApplied} />

            {/* Timeline */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.sectionHeader, { marginBottom: Spacing.md }]}>
                <Feather name="clock" size={15} color={BRAND} />
                <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.xs }}>Full Journey</ThemedText>
              </View>
              {logLoading ? (
                <View style={styles.logLoading}>
                  <ActivityIndicator color={BRAND} />
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
                    Loading history...
                  </ThemedText>
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
                      {!isLast ? (
                        <View style={[styles.timelineLine, { backgroundColor: theme.border }]} />
                      ) : null}
                      <View style={[
                        styles.timelineDot,
                        {
                          backgroundColor: isCurrent ? meta.color : theme.surface,
                          borderColor: meta.color,
                          borderWidth: isCurrent ? 0 : 2,
                        },
                      ]}>
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

            {/* Ticket section */}
            {selected.qrToken ? (
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.sectionHeader, { marginBottom: Spacing.md }]}>
                  <Feather name="credit-card" size={15} color={BRAND} />
                  <ThemedText type="body" style={{ fontWeight: "700", marginLeft: Spacing.xs }}>Ticket</ThemedText>
                </View>

                <View style={styles.qrWrap}>
                  <Image
                    source={{ uri: `${baseUrl}/event-qr/${selected.qrToken}.png` }}
                    style={styles.qrImage}
                    resizeMode="contain"
                  />
                </View>

                <View style={styles.ticketActions}>
                  {resendSuccess ? (
                    <View style={[styles.successBadge, { backgroundColor: SUCCESS + "15", borderColor: SUCCESS + "33" }]}>
                      <Feather name="check-circle" size={14} color={SUCCESS} />
                      <ThemedText type="small" style={{ color: SUCCESS, fontWeight: "600" }}>Sent!</ThemedText>
                    </View>
                  ) : (
                    <Pressable
                      onPress={handleResend}
                      disabled={resending}
                      style={[styles.actionPill, { backgroundColor: "#25D36615", borderColor: "#25D36630" }]}
                      testID="button-resend-ticket"
                    >
                      {resending ? (
                        <ActivityIndicator size="small" color="#25D366" />
                      ) : (
                        <Feather name="send" size={15} color="#25D366" />
                      )}
                      <ThemedText type="small" style={{ color: "#25D366", fontWeight: "700" }}>WhatsApp</ThemedText>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={() => WebBrowser.openBrowserAsync(`${baseUrl}/event-ticket/${selected.qrToken}`)}
                    style={[styles.actionPill, { backgroundColor: BRAND + "15", borderColor: BRAND + "30" }]}
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

// ── InfoRow ───────────────────────────────────────────────────────────────────
function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={styles.infoRow}>
      <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }}>{label}</ThemedText>
      <ThemedText
        type="body"
        style={{ fontWeight: "600", fontFamily: mono ? (Platform.OS === "ios" ? "Courier" : "monospace") : undefined }}
        numberOfLines={1}
      >
        {value}
      </ThemedText>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.lg },
  searchCard: {
    borderRadius: BorderRadius.xl, borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg, marginBottom: Spacing.md,
  },
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
  scanBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, height: 50, borderRadius: BorderRadius.lg, marginBottom: Spacing.md,
  },
  scanBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginVertical: Spacing.md },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    borderRadius: BorderRadius.lg, borderWidth: 1, height: 48, overflow: "hidden",
    marginBottom: Spacing.md,
  },
  input: { flex: 1, paddingHorizontal: Spacing.sm, fontSize: 15 },
  clearBtn: { paddingHorizontal: Spacing.md },
  searchSubmitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, height: 48, borderRadius: BorderRadius.lg,
  },
  errorBanner: {
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
  card: {
    borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg, marginBottom: Spacing.md, gap: Spacing.sm,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.xs },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  currentStageCard: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    padding: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.md,
  },
  logLoading: { alignItems: "center", padding: Spacing.xl },
  timelineItem: { flexDirection: "row", gap: Spacing.md, paddingLeft: 2 },
  timelineLine: { position: "absolute", left: 11, top: 20, width: 1.5, bottom: 0, zIndex: 0 },
  timelineDot: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    zIndex: 1, flexShrink: 0, marginTop: 1,
  },
  statusPill: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  qrWrap: { alignItems: "center", padding: Spacing.sm },
  qrImage: { width: 160, height: 160 },
  ticketActions: { flexDirection: "row", gap: Spacing.sm, flexWrap: "wrap" },
  actionPill: {
    flexDirection: "row", alignItems: "center", gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  successBadge: {
    flexDirection: "row", alignItems: "center", gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  // Edit Panel
  editActionRow: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  editActionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  // Modal
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  modalKAV: { justifyContent: "flex-end", flex: 1 },
  modalSheet: {
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.sm, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 12,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginVertical: Spacing.sm },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  modalIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  modalDivider: { height: StyleSheet.hairlineWidth, marginBottom: Spacing.md },
  modalBody: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md },
  editErrorBanner: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    padding: Spacing.sm, marginHorizontal: Spacing.lg, marginBottom: Spacing.xs,
    borderRadius: BorderRadius.md, borderWidth: 1,
  },
  fieldLabel: { fontWeight: "600", marginBottom: -Spacing.xs },
  editInput: {
    borderRadius: BorderRadius.lg, borderWidth: 1, height: 50, justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  editInputText: { fontSize: 16, flex: 1 },
  counterRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.lg },
  counterBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  counterDisplay: {
    width: 80, height: 52, borderRadius: BorderRadius.lg, alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  statusChipRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  statusChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  warnBox: {
    padding: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1,
    alignItems: "center",
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, height: 50, borderRadius: BorderRadius.lg,
  },
  otpSentBadge: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1,
  },
  otpInput: {
    borderRadius: BorderRadius.lg, borderWidth: 1.5, height: 64, justifyContent: "center",
    alignItems: "center",
  },
  otpInputText: { fontSize: 28, letterSpacing: 8, textAlign: "center", width: "100%" },
  successCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center",
    marginBottom: Spacing.md,
  },
});
