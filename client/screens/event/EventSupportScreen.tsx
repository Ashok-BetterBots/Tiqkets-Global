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
import { notifyEventDataChanged } from "@/lib/event-live-refresh";
import { playSuccessTone, playErrorTone } from "@/utils/alertSounds";
import { SelectedEventBanner } from "@/components/event/SelectedEventBanner";
import { useEventSelection } from "@/contexts/EventSelectionContext";

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
  checkoutAlertSnapshot?: {
    title: string;
    message: string;
    iconUrl: string;
    maxDurationMinutes: number;
    elapsedMinutes: number;
    capturedAt: string;
  } | null;
  collectedAt?: string | null;
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
  collected: { icon: "check-circle", label: "Collected", color: SUCCESS },
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
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
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
  const [saving, setSaving] = useState(false);
  // null = idle, "success" = show success overlay, "error" = show error overlay
  const [saveResult, setSaveResult] = useState<{ kind: "success" | "error"; message: string; updated?: any } | null>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getPending = (t: EditType) => pendingEdits.find(e => e.editType === t);

  const handleApply = (editType: EditType, payload: Record<string, any>, displayValue: string) => {
    setPendingEdits(prev => {
      const filtered = prev.filter(e => e.editType !== editType);
      return [...filtered, { editType, editPayload: payload, displayValue }];
    });
    setOpenField(null);
    setSaveResult(null);
  };

  const removePending = (t: EditType) => {
    setPendingEdits(prev => prev.filter(e => e.editType !== t));
    setSaveResult(null);
  };

  const handleSave = async () => {
    if (saving || pendingEdits.length === 0) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await apiRequest("POST", "/api/dashboard/events/support/apply-edit", {
        registrationId: registration.id,
        edits: pendingEdits.map(e => ({ editType: e.editType, editPayload: e.editPayload })),
      });
      const data = await res.json();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSuccessTone();
      setPendingEdits([]);
      const updated = data.registration;
      setSaveResult({ kind: "success", message: "Changes saved successfully", updated });
      // Show the overlay for 1.8s, then hand off to parent (which closes the panel)
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      resultTimerRef.current = setTimeout(() => {
        onEditApplied(updated);
      }, 1800);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      playErrorTone();
      setSaveResult({ kind: "error", message: e?.message || "Failed to save changes" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View style={[styles.editPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>

        {/* ── Result overlay (success / error) — replaces content, like parking ── */}
        {saveResult ? (
          <View style={[
            styles.resultOverlay,
            { backgroundColor: saveResult.kind === "success" ? SUCCESS + "12" : FAIL + "10" },
          ]}>
            <View style={[
              styles.resultIconCircle,
              { backgroundColor: saveResult.kind === "success" ? SUCCESS : FAIL },
            ]}>
              <Feather name={saveResult.kind === "success" ? "check" : "x"} size={26} color="#fff" />
            </View>
            <ThemedText type="h4" style={{ fontWeight: "800", color: saveResult.kind === "success" ? SUCCESS : FAIL, textAlign: "center" }}>
              {saveResult.kind === "success" ? "Changes Saved" : "Save Failed"}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
              {saveResult.message}
            </ThemedText>
            {saveResult.kind === "error" ? (
              <Pressable
                onPress={() => setSaveResult(null)}
                style={[styles.solidBtn, { backgroundColor: FAIL, marginTop: Spacing.sm }]}
                testID="button-dismiss-error"
              >
                <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Try Again</ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
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
                  onPress={handleSave}
                  disabled={saving}
                  style={[styles.solidBtn, { backgroundColor: saving ? theme.border : BRAND }]}
                  testID="button-save-edits"
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="save" size={16} color="#fff" />
                      <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>
                        Save {pendingEdits.length} Change{pendingEdits.length !== 1 ? "s" : ""}
                      </ThemedText>
                    </>
                  )}
                </Pressable>
                <Pressable onPress={() => { setPendingEdits([]); setSaveResult(null); }} style={{ alignSelf: "center" }} hitSlop={10} testID="button-discard-edits">
                  <ThemedText type="small" style={{ color: theme.textSecondary, textDecorationLine: "underline" }}>
                    Discard all changes
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </View>

      <MiniEditModal
        visible={openField !== null}
        editType={openField}
        registration={registration}
        currentPayload={openField ? getPending(openField)?.editPayload : undefined}
        onApply={handleApply}
        onCancel={() => setOpenField(null)}
      />
    </>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function EventSupportScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { selectedEventId } = useEventSelection();

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
  const [markingCollected, setMarkingCollected] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const editPanelY = useRef(0);
  const selectionGenerationRef = useRef(0);

  useEffect(() => {
    selectionGenerationRef.current += 1;
    setQuery("");
    setResults([]);
    setSearched(false);
    setSelected(null);
    setEditPanelOpen(false);
    setStageLog([]);
    setError(null);
    setCameraOpen(false);
  }, [selectedEventId]);

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
    const selectionGeneration = selectionGenerationRef.current;
    setStageLog([]);
    setLogLoading(true);
    try {
      const data = await fetchJson(`/api/dashboard/events/registration/${regId}/log?t=${Date.now()}`);
      if (selectionGeneration !== selectionGenerationRef.current) return;
      setStageLog(data.log || []);
    } catch {
      if (selectionGeneration === selectionGenerationRef.current) setStageLog([]);
    } finally {
      if (selectionGeneration === selectionGenerationRef.current) setLogLoading(false);
    }
  }, []);

  const selectRegistration = useCallback(async (reg: RegResult) => {
    setSelected(reg);
    setEditPanelOpen(false);
    loadLog(reg.id);
  }, [loadLog]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    const selectionGeneration = selectionGenerationRef.current;
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
      if (selectionGeneration !== selectionGenerationRef.current) return;
      const regs: RegResult[] = data.results || [];
      setResults(regs);
      setSearched(true);
      if (regs.length === 1) selectRegistration(regs[0]);
    } catch (e: any) {
      if (selectionGeneration !== selectionGenerationRef.current) return;
      setError(e?.message || "Search failed");
    } finally {
      if (selectionGeneration === selectionGenerationRef.current) setLoading(false);
    }
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
    notifyEventDataChanged();
  }, [loadLog]);

  const handleMarkCollected = useCallback(async () => {
    if (!selected || markingCollected) return;
    setMarkingCollected(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/dashboard/events/support/mark-collected", {
        registrationId: selected.id,
      });
      const data = await res.json();
      const updated: RegResult = data.registration;
      setSelected(updated);
      setResults((current) => current.map((row) => row.id === updated.id ? { ...row, ...updated } : row));
      loadLog(updated.id);
      notifyEventDataChanged();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSuccessTone();
    } catch (e: any) {
      setError(e?.message || "Failed to mark ticket as collected");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      playErrorTone();
    } finally {
      setMarkingCollected(false);
    }
  }, [selected, markingCollected, loadLog]);

  const baseUrl = getApiUrl().replace(/\/$/, "");

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingTop: Spacing.xl, paddingBottom: tabBarHeight + Spacing["2xl"] }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SelectedEventBanner />
        {/* ── Search card ── */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ThemedText type="body" style={styles.cardTitle}>Find Customer</ThemedText>

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
              disabled={loading}
              style={[styles.searchBtn, { backgroundColor: BRAND, opacity: loading ? 0.7 : 1 }]}
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
            {selected.checkoutAlertSnapshot ? (
              <View
                style={[
                  styles.card,
                  styles.checkoutAlertCard,
                  {
                    backgroundColor: isDark ? "#2B1825" : "#FFF4FA",
                    borderColor: isDark ? "#71365D" : "#E7BDD6",
                  },
                ]}
                testID="support-checkout-alert"
              >
                <View style={[styles.sectionHeader, { marginBottom: Spacing.md }]}>
                  <Image
                    source={{ uri: new URL(selected.checkoutAlertSnapshot.iconUrl, getApiUrl()).toString() }}
                    style={styles.checkoutAlertIcon}
                  />
                  <View style={styles.checkoutAlertHeaderContent}>
                    <ThemedText type="h4" style={[styles.transparentText, { color: BRAND }]}>
                      {selected.checkoutAlertSnapshot.title}
                    </ThemedText>
                    <ThemedText type="small" style={[styles.transparentText, { color: theme.textSecondary }]}>
                      Checkout message shown {fmtTs(selected.checkoutAlertSnapshot.capturedAt)}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText type="body" style={styles.transparentText}>{selected.checkoutAlertSnapshot.message}</ThemedText>
                <ThemedText type="small" style={[styles.transparentText, { color: theme.textSecondary, marginTop: Spacing.sm }]}>
                  {selected.checkoutAlertSnapshot.elapsedMinutes} min since check-in · {selected.checkoutAlertSnapshot.maxDurationMinutes} min limit
                </ThemedText>
                {selected.collectedAt ? (
                  <View style={styles.collectedBadge} testID="support-collected-status">
                    <Feather name="check-circle" size={20} color={SUCCESS} />
                    <ThemedText type="body" style={{ color: SUCCESS, fontWeight: "700" }}>Collected</ThemedText>
                  </View>
                ) : selected.status === "exited" ? (
                  <Pressable
                    onPress={handleMarkCollected}
                    disabled={markingCollected}
                    style={[styles.markDoneButton, { backgroundColor: SUCCESS }]}
                    testID="button-mark-collected"
                  >
                    {markingCollected ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Feather name="check" size={18} color="#fff" />
                    )}
                    <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Mark as Done</ThemedText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

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
  cardTitle: { fontWeight: "700", marginBottom: Spacing.md, fontSize: 16 },
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
    overflow: "hidden",
  },
  resultOverlay: {
    alignItems: "center", justifyContent: "center",
    gap: Spacing.md, paddingVertical: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  resultIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
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
  checkoutAlertCard: {
    borderWidth: 1,
    overflow: "hidden",
  },
  checkoutAlertIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    marginRight: Spacing.md,
    backgroundColor: "transparent",
  },
  checkoutAlertHeaderContent: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "transparent",
  },
  transparentText: {
    backgroundColor: "transparent",
  },
  markDoneButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, height: 46, borderRadius: BorderRadius.lg, marginTop: Spacing.lg,
  },
  collectedBadge: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, minHeight: 46, borderRadius: BorderRadius.lg,
    backgroundColor: SUCCESS + "14", marginTop: Spacing.lg,
  },
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
