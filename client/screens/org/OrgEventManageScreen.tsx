import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
  Keyboard,
  Switch,
  Image,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { BottomSheetModal } from "@/components/BottomSheetModal";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { apiRequest, queryClient, getErrorMessage, getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius, BrandColors, headingFont } from "@/constants/theme";

const BRAND = BrandColors.primary;

// Generate slot times from operating hours + duration (mirrors server logic)
function generateSlotTimes(
  start: string | null | undefined,
  end: string | null | undefined,
  durMin: number,
): string[] {
  const parseT = (t: string | null | undefined) => {
    if (!t) return 0;
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const startMin = parseT(start);
  const endMin = parseT(end);
  const dur = Math.max(15, durMin);
  const out: string[] = [];
  for (let t = startMin; t + dur <= endMin; t += dur) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

function fmtSlotLabel(time: string, durMin: number): string {
  const [h, m] = time.split(":").map(Number);
  const endTotalMin = h * 60 + m + durMin;
  const eh = Math.floor(endTotalMin / 60);
  const em = endTotalMin % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${time} – ${pad(eh)}:${pad(em)}`;
}

function fmtOverrideKey(key: string): string {
  const [date, time] = key.split("|");
  if (!date || !time) return key;
  try {
    const d = new Date(date + "T00:00:00");
    const dStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `${dStr}  ·  ${time}`;
  } catch {
    return key;
  }
}

interface EventRow {
  id: string;
  name: string;
  description?: string | null;
  venue?: string | null;
  status: string;
  startDate: string;
  endDate: string;
  operatingHoursStart?: string | null;
  operatingHoursEnd?: string | null;
  slotDurationMinutes?: number;
  maxCapacityPerSlot?: number;
  slotCapacityOverrides?: Record<string, number> | null;
  registrationFee: number;
  registrationFeeCustomText?: string | null;
  supportContact?: string | null;
  parkingTotalSpaces: number;
  parkingEnabled?: boolean;
  refundable?: boolean;
  refundMessage?: string | null;
  whatsappTriggers?: EventWhatsappTriggers | null;
  messageTemplates?: Record<string, string> | null;
  checkoutAlert?: CheckoutAlertConfig | null;
  otpSettings?: EventOtpSettings | null;
}

type EventOtpSettings = {
  registration: boolean;
  billing: boolean;
};

type CheckoutAlertConfig = {
  enabled: boolean;
  maxDurationMinutes: number;
  title: string;
  message: string;
  iconUrl: string;
};

type EventWhatsappTriggers = {
  reminder_day: boolean;
  reminder_hour: boolean;
  checked_in: boolean;
  billing: boolean;
  thank_you_feedback: boolean;
};

const DEFAULT_WHATSAPP_TRIGGERS: EventWhatsappTriggers = {
  reminder_day: true,
  reminder_hour: true,
  checked_in: true,
  billing: true,
  thank_you_feedback: true,
};

interface EventForm {
  name: string;
  description: string;
  venue: string;
  startDate: string;
  endDate: string;
  operatingHoursStart: string;
  operatingHoursEnd: string;
  slotDurationMinutes: string;
  maxCapacityPerSlot: string;
  registrationFee: string;
  registrationFeeCustomText: string;
  refundable: boolean;
  refundMessage: string;
  supportContact: string;
  parkingTotalSpaces: string;
  parkingEnabled: boolean;
  otpSettings: EventOtpSettings;
  whatsappTriggers: EventWhatsappTriggers;
  checkoutAlert: {
    enabled: boolean;
    maxDurationMinutes: string;
    title: string;
    message: string;
    iconUrl: string;
  };
}

interface PayoutProfileResponse {
  profile?: {
    paymentMethod?: "razorpay_route" | "razorpay_direct" | "razorpay_payment_links";
    directReady?: boolean;
    paymentLinksReady?: boolean;
    canAcceptPaidTickets?: boolean;
    productId?: string | null;
    productStatus?: string | null;
  } | null;
}

const EMPTY_FORM: EventForm = {
  name: "",
  description: "",
  venue: "",
  startDate: "",
  endDate: "",
  operatingHoursStart: "09:00",
  operatingHoursEnd: "21:00",
  slotDurationMinutes: "30",
  maxCapacityPerSlot: "50",
  registrationFee: "0",
  registrationFeeCustomText: "",
  refundable: false,
  refundMessage: "",
  supportContact: "",
  parkingTotalSpaces: "0",
  parkingEnabled: true,
  otpSettings: { registration: true, billing: true },
  whatsappTriggers: { ...DEFAULT_WHATSAPP_TRIGGERS },
  checkoutAlert: { enabled: false, maxDurationMinutes: "60", title: "", message: "", iconUrl: "" },
};

function toDateInput(iso?: string | null): string {
  if (!iso) return "";
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return ""; }
}

function fmtRupeesFromPaise(paise: number | null | undefined): string {
  const v = (paise || 0) / 100;
  return `\u20B9${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

type ConfirmKind = "pause" | "end" | "delete";

export default function OrgEventManageScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, isDark } = useTheme();
  const { getAccessibleBranches, organization } = useOrganization();
  const branches = getAccessibleBranches();

  const [branchId, setBranchId] = useState<string | null>(
    branches.length > 0 ? branches[0].id : null,
  );
  const activeBranchId = branchId ?? (branches.length > 0 ? branches[0].id : null);

  const { data, isLoading, refetch, isRefetching } = useQuery<{ events: EventRow[] }>({
    queryKey: ["/api/dashboard/events/branch", activeBranchId],
    enabled: !!activeBranchId,
  });
  const events = data?.events ?? [];
  const payoutProfileQuery = useQuery<PayoutProfileResponse>({
    queryKey: ["/api/dashboard/payouts", organization?.id, "profile", "event-fee-gate"],
    enabled: !!organization?.id,
    queryFn: async () => (
      await apiRequest("GET", `/api/dashboard/payouts/${organization!.id}/profile`)
    ).json(),
  });
  const payoutProfile = payoutProfileQuery.data?.profile;
  const razorpayProductId = String(payoutProfile?.productId || "").trim();
  const registrationFeesReady = payoutProfile?.paymentMethod === "razorpay_direct"
    ? payoutProfile.directReady === true
    : payoutProfile?.paymentMethod === "razorpay_payment_links"
      ? (payoutProfile.paymentLinksReady ?? payoutProfile.canAcceptPaidTickets) === true
      : /^acc_prd_[A-Za-z0-9]+$/.test(razorpayProductId);

  // ── Create / edit form ──────────────────────────────────────────────────
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [checkoutIconUploading, setCheckoutIconUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Danger-zone confirmation ─────────────────────────────────────────────
  const [confirm, setConfirm] = useState<{ event: EventRow; kind: ConfirmKind } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [rowBusy, setRowBusy] = useState<string | null>(null);

  // ── Slot edit modal ──────────────────────────────────────────────────────
  const [slotEditEvent, setSlotEditEvent] = useState<EventRow | null>(null);
  const [slotDuration, setSlotDuration] = useState(30);
  const [slotCapacity, setSlotCapacity] = useState(50);
  const [slotSaving, setSlotSaving] = useState(false);

  // Per-slot override modal (separate from slot edit)
  const [overrideEvent, setOverrideEvent] = useState<EventRow | null>(null);
  const [overrideDate, setOverrideDate] = useState<Date>(new Date());
  const [overrideTime, setOverrideTime] = useState("");
  const [overrideCapacity, setOverrideCapacity] = useState(50);
  const [currentOverrides, setCurrentOverrides] = useState<Record<string, number>>({});
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [slotDropOpen, setSlotDropOpen] = useState(false);

  // Slot times for override (uses the event's saved duration)
  const overrideSlotTimes = useMemo(
    () => generateSlotTimes(
      overrideEvent?.operatingHoursStart,
      overrideEvent?.operatingHoursEnd,
      overrideEvent?.slotDurationMinutes ?? 30,
    ),
    [overrideEvent],
  );

  // Keep overrideTime valid when event changes
  useEffect(() => {
    if (overrideSlotTimes.length > 0 && !overrideSlotTimes.includes(overrideTime)) {
      setOverrideTime(overrideSlotTimes[0]);
    }
  }, [overrideSlotTimes]);

  const cardBg = isDark ? theme.backgroundDefault : "#FFFFFF";
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/events/branch", activeBranchId] }),
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/events"] }),
    ]);
  };

  // ── Handlers ─────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      otpSettings: { ...EMPTY_FORM.otpSettings },
      whatsappTriggers: { ...DEFAULT_WHATSAPP_TRIGGERS },
      checkoutAlert: { ...EMPTY_FORM.checkoutAlert },
    });
    setFormError(null);
    setShowForm(true);
  };

  useEffect(() => {
    if (showForm && !editing && !registrationFeesReady && form.registrationFee !== "0") {
      setForm((current) => ({ ...current, registrationFee: "0" }));
    }
  }, [showForm, editing, registrationFeesReady, form.registrationFee]);

  const openEdit = (ev: EventRow) => {
    setEditing(ev);
    setForm({
      name: ev.name ?? "",
      description: ev.description ?? "",
      venue: ev.venue ?? "",
      startDate: toDateInput(ev.startDate),
      endDate: toDateInput(ev.endDate),
      operatingHoursStart: ev.operatingHoursStart ?? "09:00",
      operatingHoursEnd: ev.operatingHoursEnd ?? "21:00",
      slotDurationMinutes: String(ev.slotDurationMinutes ?? 30),
      maxCapacityPerSlot: String(ev.maxCapacityPerSlot ?? 50),
      registrationFee: String((ev.registrationFee ?? 0) / 100),
      registrationFeeCustomText: ev.registrationFeeCustomText ?? "",
      refundable: ev.refundable === true,
      refundMessage: ev.refundMessage ?? "",
      supportContact: ev.supportContact ?? "",
      parkingTotalSpaces: String(ev.parkingTotalSpaces ?? 0),
      parkingEnabled: ev.parkingEnabled !== false,
      otpSettings: {
        registration: ev.otpSettings?.registration !== false,
        billing: ev.otpSettings?.billing !== false,
      },
      whatsappTriggers: { ...DEFAULT_WHATSAPP_TRIGGERS, ...(ev.whatsappTriggers || {}) },
      checkoutAlert: {
        enabled: ev.checkoutAlert?.enabled === true,
        maxDurationMinutes: String(ev.checkoutAlert?.maxDurationMinutes ?? 60),
        title: ev.checkoutAlert?.title ?? "",
        message: ev.checkoutAlert?.message ?? "",
        iconUrl: ev.checkoutAlert?.iconUrl ?? "",
      },
    });
    setFormError(null);
    setShowForm(true);
  };

  const openSlotEdit = (ev: EventRow) => {
    setSlotEditEvent(ev);
    setSlotDuration(ev.slotDurationMinutes ?? 30);
    setSlotCapacity(ev.maxCapacityPerSlot ?? 50);
  };

  const openOverride = (ev: EventRow) => {
    const startD = ev.startDate ? new Date(ev.startDate) : new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minD = startD > today ? startD : today;
    const times = generateSlotTimes(ev.operatingHoursStart, ev.operatingHoursEnd, ev.slotDurationMinutes ?? 30);
    setOverrideEvent(ev);
    setCurrentOverrides(ev.slotCapacityOverrides ? { ...ev.slotCapacityOverrides } : {});
    setOverrideDate(minD);
    setOverrideTime(times[0] ?? "");
    setOverrideCapacity(ev.maxCapacityPerSlot ?? 50);
    setShowDatePicker(false);
    setSlotDropOpen(false);
  };

  const saveSlots = async () => {
    if (!slotEditEvent) return;
    setSlotSaving(true);
    try {
      await apiRequest("PUT", `/api/dashboard/events/${slotEditEvent.id}`, {
        slotDurationMinutes: slotDuration,
        maxCapacityPerSlot: slotCapacity,
      });
      await invalidate();
      setSlotEditEvent(null);
    } catch { } finally { setSlotSaving(false); }
  };

  const overrideDateStr = `${overrideDate.getFullYear()}-${String(overrideDate.getMonth() + 1).padStart(2, "0")}-${String(overrideDate.getDate()).padStart(2, "0")}`;

  const applyOverride = async () => {
    if (!overrideEvent || !overrideDateStr || !overrideTime) return;
    const key = `${overrideDateStr}|${overrideTime}`;
    const updated = { ...currentOverrides, [key]: overrideCapacity };
    setOverrideSaving(true);
    try {
      await apiRequest("PUT", `/api/dashboard/events/${overrideEvent.id}`, {
        slotCapacityOverrides: updated,
      });
      setCurrentOverrides(updated);
      await invalidate();
    } catch { } finally { setOverrideSaving(false); }
  };

  const removeOverride = async (key: string) => {
    if (!overrideEvent) return;
    const updated = { ...currentOverrides };
    delete updated[key];
    try {
      await apiRequest("PUT", `/api/dashboard/events/${overrideEvent.id}`, {
        slotCapacityOverrides: updated,
      });
      setCurrentOverrides(updated);
      await invalidate();
    } catch { }
  };

  const saveForm = async () => {
    if (!form.name.trim()) { setFormError("Please enter an event name"); return; }
    if (!form.startDate.trim() || !form.endDate.trim()) {
      setFormError("Please enter start and end dates (YYYY-MM-DD)"); return;
    }
    if (!activeBranchId || !organization?.id) { setFormError("No branch selected"); return; }
    const checkoutMinutes = parseInt(form.checkoutAlert.maxDurationMinutes, 10);
    if (form.checkoutAlert.enabled && (!Number.isFinite(checkoutMinutes) || checkoutMinutes < 1 || checkoutMinutes > 10080)) {
      setFormError("Checkout alert duration must be between 1 and 10,080 minutes"); return;
    }
    if (form.checkoutAlert.enabled && (!form.checkoutAlert.title.trim() || !form.checkoutAlert.message.trim() || !form.checkoutAlert.iconUrl)) {
      setFormError("Add a checkout title, message, and image icon"); return;
    }
    setSaving(true); setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        venue: form.venue.trim() || null,
        startDate: form.startDate.trim(),
        endDate: form.endDate.trim(),
        operatingHoursStart: form.operatingHoursStart.trim() || "09:00",
        operatingHoursEnd: form.operatingHoursEnd.trim() || "21:00",
        slotDurationMinutes: parseInt(form.slotDurationMinutes, 10) || 30,
        maxCapacityPerSlot: parseInt(form.maxCapacityPerSlot, 10) || 50,
        registrationFee: !registrationFeesReady
          ? 0
          : Math.max(0, Math.round((parseFloat(form.registrationFee) || 0) * 100)),
        registrationFeeCustomText: form.registrationFeeCustomText.trim(),
        refundable: form.refundable,
        refundMessage: form.refundMessage.trim(),
        supportContact: form.supportContact.trim() || null,
        parkingTotalSpaces: parseInt(form.parkingTotalSpaces, 10) || 0,
        parkingEnabled: form.parkingEnabled,
        otpSettings: form.otpSettings,
        whatsappTriggers: form.whatsappTriggers,
        checkoutAlert: {
          enabled: form.checkoutAlert.enabled,
          maxDurationMinutes: checkoutMinutes || 60,
          title: form.checkoutAlert.title.trim(),
          message: form.checkoutAlert.message.trim(),
          iconUrl: form.checkoutAlert.iconUrl,
        },
      };
      if (editing) {
        await apiRequest("PUT", `/api/dashboard/events/${editing.id}`, payload);
      } else {
        await apiRequest("POST", "/api/dashboard/events", {
          ...payload, branchId: activeBranchId, organizationId: organization.id,
        });
      }
      await invalidate();
      setShowForm(false);
    } catch (e) {
      setFormError(getErrorMessage(e, "Failed to save event"));
    } finally { setSaving(false); }
  };

  const pickCheckoutIcon = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Allow photo access to upload a checkout icon.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset?.base64) return;
      setCheckoutIconUploading(true);
      const mime = asset.mimeType || "image/jpeg";
      const response = await apiRequest("POST", "/api/dashboard/events/upload-image", {
        image: `data:${mime};base64,${asset.base64}`,
      });
      const uploaded = await response.json();
      setForm((f) => ({ ...f, checkoutAlert: { ...f.checkoutAlert, iconUrl: uploaded.url } }));
    } catch (e) {
      setFormError(getErrorMessage(e, "Failed to upload checkout icon"));
    } finally {
      setCheckoutIconUploading(false);
    }
  };

  const openConfirm = (event: EventRow, kind: ConfirmKind) => {
    setConfirm({ event, kind }); setConfirmText("");
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === "delete") {
        await apiRequest("DELETE", `/api/dashboard/events/${confirm.event.id}`);
      } else {
        const status = confirm.kind === "pause" ? "paused" : "ended";
        await apiRequest("POST", `/api/dashboard/events/${confirm.event.id}/status`, { status });
      }
      await invalidate();
      setConfirm(null);
    } catch { } finally { setConfirmBusy(false); }
  };

  const changeStatus = async (ev: EventRow, status: string) => {
    setRowBusy(ev.id);
    try {
      await apiRequest("POST", `/api/dashboard/events/${ev.id}/status`, { status });
      await invalidate();
    } catch { } finally { setRowBusy(null); }
  };

  const statusColor = (s: string) =>
    s === "published" ? theme.success : s === "paused" ? theme.warning : s === "ended" ? theme.error : theme.textSecondary;

  const confirmKindLabel = (k: ConfirmKind) => k === "pause" ? "Pause" : k === "end" ? "End" : "Delete";
  const confirmKindColor = (k: ConfirmKind) => k === "pause" ? theme.warning : theme.error;
  const confirmMatches = confirmText.trim().toLowerCase() === (confirm?.event.name ?? "").trim().toLowerCase();

  const overrideEntries = Object.entries(currentOverrides).sort(([a], [b]) => a.localeCompare(b));

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing["3xl"] },
        ]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        {branches.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {branches.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => setBranchId(b.id)}
                style={[
                  styles.chip,
                  activeBranchId === b.id
                    ? { backgroundColor: BRAND }
                    : { backgroundColor: cardBg, borderWidth: 1, borderColor: theme.border },
                ]}
                testID={`chip-manage-branch-${b.id}`}
              >
                <ThemedText
                  type="small"
                  style={{ color: activeBranchId === b.id ? "#FFFFFF" : theme.text, fontWeight: "600" }}
                >
                  {b.name}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <Pressable onPress={openCreate} style={[styles.createBtn, { backgroundColor: BRAND }]} testID="button-create-event">
          <Feather name="plus" size={18} color="#FFFFFF" />
          <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "700" }}>New Event</ThemedText>
        </Pressable>

        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color={BRAND} /></View>
        ) : events.length === 0 ? (
          <View style={[styles.card, styles.emptyCard, { backgroundColor: cardBg }]}>
            <Feather name="calendar" size={36} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
              No events yet. Tap "New Event" to create your first one.
            </ThemedText>
          </View>
        ) : (
          events.map((ev) => (
            <View key={ev.id} style={[styles.card, { backgroundColor: cardBg }]} testID={`card-event-${ev.id}`}>
              <View style={styles.eventHeaderRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.eventName} testID={`text-event-name-${ev.id}`}>{ev.name}</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
                    {new Date(ev.startDate).toLocaleDateString()} – {new Date(ev.endDate).toLocaleDateString()}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
                    {fmtRupeesFromPaise(ev.registrationFee)} · {ev.maxCapacityPerSlot ?? 0}/slot · {ev.slotDurationMinutes ?? 0}min
                  </ThemedText>
                </View>
                <View style={[styles.statusPill, { backgroundColor: statusColor(ev.status) + "22" }]}>
                  <ThemedText type="small" style={{ color: statusColor(ev.status), fontWeight: "700", textTransform: "capitalize" }} testID={`text-event-status-${ev.id}`}>
                    {ev.status}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.actionRow}>
                {ev.status === "draft" || ev.status === "paused" ? (
                  <ActionBtn icon="play" label={ev.status === "paused" ? "Resume" : "Publish"} iconColor="#10B981" busy={rowBusy === ev.id} onPress={() => changeStatus(ev, "published")} testID={`button-publish-${ev.id}`} />
                ) : null}
                {ev.status === "published" ? (
                  <ActionBtn icon="pause" label="Pause" iconColor="#F59E0B" busy={rowBusy === ev.id} onPress={() => openConfirm(ev, "pause")} testID={`button-pause-${ev.id}`} />
                ) : null}
                {ev.status !== "ended" && ev.status !== "draft" ? (
                  <ActionBtn icon="square" label="End" iconColor="#EF4444" onPress={() => openConfirm(ev, "end")} testID={`button-end-${ev.id}`} />
                ) : null}
              </View>

              <View style={[styles.actionRow, { marginTop: Spacing.sm }]}>
                <ActionBtn icon="edit-2" label="Edit" iconColor={BRAND} onPress={() => openEdit(ev)} testID={`button-edit-${ev.id}`} />
                <ActionBtn icon="clock" label="Slots" iconColor={BRAND} onPress={() => openSlotEdit(ev)} testID={`button-slots-${ev.id}`} />
                <ActionBtn icon="sliders" label="Override" iconColor={BRAND} onPress={() => openOverride(ev)} testID={`button-override-${ev.id}`} />
                <ActionBtn icon="trash-2" label="Delete" iconColor="#EF4444" onPress={() => openConfirm(ev, "delete")} testID={`button-delete-${ev.id}`} />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Create / Edit form ── */}
      <BottomSheetModal visible={showForm} onClose={() => setShowForm(false)} title={editing ? "Edit Event" : "New Event"} onConfirm={saveForm} confirmLabel={editing ? "Save" : "Create"} confirmLoading={saving}>
        <Field label="Event name" value={form.name} onChangeText={(t) => setForm((f) => ({ ...f, name: t }))} placeholder="Summer Carnival" testID="input-event-name" />
        <Field label="Description" value={form.description} onChangeText={(t) => setForm((f) => ({ ...f, description: t }))} placeholder="Optional" multiline testID="input-event-description" />
        <Field label="Venue" value={form.venue} onChangeText={(t) => setForm((f) => ({ ...f, venue: t }))} placeholder="Optional" testID="input-event-venue" />
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}><Field label="Start date" value={form.startDate} onChangeText={(t) => setForm((f) => ({ ...f, startDate: t }))} placeholder="YYYY-MM-DD" testID="input-event-start" /></View>
          <View style={{ flex: 1 }}><Field label="End date" value={form.endDate} onChangeText={(t) => setForm((f) => ({ ...f, endDate: t }))} placeholder="YYYY-MM-DD" testID="input-event-end" /></View>
        </View>
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}><Field label="Opens" value={form.operatingHoursStart} onChangeText={(t) => setForm((f) => ({ ...f, operatingHoursStart: t }))} placeholder="09:00" testID="input-event-open" /></View>
          <View style={{ flex: 1 }}><Field label="Closes" value={form.operatingHoursEnd} onChangeText={(t) => setForm((f) => ({ ...f, operatingHoursEnd: t }))} placeholder="21:00" testID="input-event-close" /></View>
        </View>
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}><Field label="Slot minutes" value={form.slotDurationMinutes} onChangeText={(t) => setForm((f) => ({ ...f, slotDurationMinutes: t }))} keyboardType="number-pad" testID="input-event-slot" /></View>
          <View style={{ flex: 1 }}><Field label="Capacity / slot" value={form.maxCapacityPerSlot} onChangeText={(t) => setForm((f) => ({ ...f, maxCapacityPerSlot: t }))} keyboardType="number-pad" testID="input-event-capacity" /></View>
        </View>
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field
              label={"Fee (\u20B9)"}
              value={!registrationFeesReady ? "0" : form.registrationFee}
              onChangeText={(t) => setForm((f) => ({ ...f, registrationFee: t }))}
              keyboardType="decimal-pad"
              editable={registrationFeesReady}
              testID="input-event-fee"
            />
          </View>
          <View style={{ flex: 1 }}><Field label="Parking spaces" value={form.parkingTotalSpaces} onChangeText={(t) => setForm((f) => ({ ...f, parkingTotalSpaces: t }))} keyboardType="number-pad" testID="input-event-parking" /></View>
        </View>
        {!registrationFeesReady ? (
          <View style={[styles.payoutSetupNotice, { borderColor: "#F59E0B", backgroundColor: "#FFFBEB" }]}>
            <Feather name="alert-circle" size={18} color="#B45309" />
            <ThemedText type="small" style={{ color: "#92400E", flex: 1, fontWeight: "700" }}>
              {payoutProfileQuery.isLoading
                ? "Checking payout setup before enabling registration fees..."
                : "Create Payout setup before adding fee details. A valid Razorpay Product ID is required."}
            </ThemedText>
          </View>
        ) : null}
        <Field
          label="Registration fee custom text"
          value={form.registrationFeeCustomText}
          onChangeText={(registrationFeeCustomText) => setForm((f) => ({ ...f, registrationFeeCustomText }))}
          placeholder="Text shown below the fee on the customer review page"
          multiline
          testID="input-event-fee-custom-text"
        />
        <View style={[styles.refundPolicyBox, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <ThemedText type="body" style={{ color: theme.text, fontWeight: "700" }}>Registration fee refund policy</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
              Customer-facing guidance only; this does not change payment collection or refunds.
            </ThemedText>
          </View>
          <View style={styles.refundToggle}>
            <Pressable
              onPress={() => setForm((f) => ({ ...f, refundable: false }))}
              style={[styles.refundOption, { borderColor: !form.refundable ? BRAND : theme.border, backgroundColor: !form.refundable ? BRAND + "12" : theme.surface }]}
              testID="button-event-nonrefundable"
            >
              <ThemedText type="small" style={{ color: !form.refundable ? BRAND : theme.textSecondary, fontWeight: "700" }}>No</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setForm((f) => ({ ...f, refundable: true }))}
              style={[styles.refundOption, { borderColor: form.refundable ? BRAND : theme.border, backgroundColor: form.refundable ? BRAND + "12" : theme.surface }]}
              testID="button-event-refundable"
            >
              <ThemedText type="small" style={{ color: form.refundable ? BRAND : theme.textSecondary, fontWeight: "700" }}>Yes</ThemedText>
            </Pressable>
          </View>
        </View>
        <Field
          label="Refund message (shown to customers)"
          value={form.refundMessage}
          onChangeText={(refundMessage) => setForm((f) => ({ ...f, refundMessage }))}
          placeholder="e.g. Refunds are available up to 24 hours before your visit."
          multiline
          testID="input-event-refund-message"
        />
        <SettingsToggle
          label="Show Parking page"
          description="Allow parking staff to open and use this event's Parking page."
          value={form.parkingEnabled}
          onValueChange={(value) => setForm((f) => ({ ...f, parkingEnabled: value }))}
          testID="switch-event-parking-enabled"
        />
        <ThemedText type="small" style={{ fontWeight: "800", marginTop: Spacing.sm, marginBottom: Spacing.xs }}>
          OTP verification
        </ThemedText>
        <SettingsToggle
          label="Registration OTP"
          description="Require customers to verify their WhatsApp number before completing registration."
          value={form.otpSettings.registration}
          onValueChange={(registration) => setForm((f) => ({ ...f, otpSettings: { ...f.otpSettings, registration } }))}
          testID="switch-event-registration-otp"
        />
        <SettingsToggle
          label="Billing OTP"
          description="Require an OTP before redeeming a customer's advance. When off, billing proceeds directly to the invoice like a store registration."
          value={form.otpSettings.billing}
          onValueChange={(billing) => setForm((f) => ({ ...f, otpSettings: { ...f.otpSettings, billing } }))}
          testID="switch-event-billing-otp"
        />
        <ThemedText type="small" style={{ fontWeight: "800", marginTop: Spacing.sm, marginBottom: Spacing.xs }}>
          Checkout alert
        </ThemedText>
        <SettingsToggle
          label="Show message for short visits"
          description="Show staff a custom message when checkout is within the duration below."
          value={form.checkoutAlert.enabled}
          onValueChange={(enabled) => setForm((f) => ({ ...f, checkoutAlert: { ...f.checkoutAlert, enabled } }))}
          testID="switch-event-checkout-alert"
        />
        {form.checkoutAlert.enabled ? (
          <>
            <Field label="Maximum duration (minutes)" value={form.checkoutAlert.maxDurationMinutes} onChangeText={(maxDurationMinutes) => setForm((f) => ({ ...f, checkoutAlert: { ...f.checkoutAlert, maxDurationMinutes } }))} keyboardType="number-pad" testID="input-event-checkout-duration" />
            <Field label="Checkout title" value={form.checkoutAlert.title} onChangeText={(title) => setForm((f) => ({ ...f, checkoutAlert: { ...f.checkoutAlert, title } }))} placeholder="Thank you for visiting" testID="input-event-checkout-title" />
            <Field label="Checkout message" value={form.checkoutAlert.message} onChangeText={(message) => setForm((f) => ({ ...f, checkoutAlert: { ...f.checkoutAlert, message } }))} placeholder="Custom message for staff" multiline testID="input-event-checkout-message" />
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md, marginBottom: Spacing.md }}>
              {form.checkoutAlert.iconUrl ? (
                <Image source={{ uri: new URL(form.checkoutAlert.iconUrl, getApiUrl()).toString() }} style={{ width: 64, height: 64, borderRadius: 14 }} />
              ) : (
                <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: theme.backgroundRoot, alignItems: "center", justifyContent: "center" }}>
                  <Feather name="image" size={24} color={theme.textSecondary} />
                </View>
              )}
              <Pressable onPress={pickCheckoutIcon} disabled={checkoutIconUploading} style={[styles.smallButton, { borderColor: theme.border }]}>
                {checkoutIconUploading ? <ActivityIndicator size="small" color={BRAND} /> : <Feather name="upload" size={15} color={BRAND} />}
                <ThemedText type="small" style={{ color: BRAND, fontWeight: "700" }}>{form.checkoutAlert.iconUrl ? "Replace icon" : "Upload icon"}</ThemedText>
              </Pressable>
              {form.checkoutAlert.iconUrl ? (
                <Pressable onPress={() => setForm((f) => ({ ...f, checkoutAlert: { ...f.checkoutAlert, iconUrl: "" } }))}>
                  <Feather name="trash-2" size={18} color={theme.error} />
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}
        <ThemedText type="small" style={{ fontWeight: "800", marginTop: Spacing.sm, marginBottom: Spacing.xs }}>
          WhatsApp messages
        </ThemedText>
        {([
          ["reminder_day", "24-hour reminder"],
          ["reminder_hour", "30-minute reminder"],
          ["checked_in", "Check-in successful"],
          ["billing", "Billing redeemed"],
          ["thank_you_feedback", "Feedback request"],
        ] as const).map(([key, label]) => (
          <SettingsToggle
            key={key}
            label={label}
            value={form.whatsappTriggers[key]}
            onValueChange={(value) => setForm((f) => ({
              ...f,
              whatsappTriggers: { ...f.whatsappTriggers, [key]: value },
            }))}
            testID={`switch-event-whatsapp-${key}`}
          />
        ))}
        <Field label="Support contact" value={form.supportContact} onChangeText={(t) => setForm((f) => ({ ...f, supportContact: t }))} placeholder="Phone / email" testID="input-event-support" />
        {formError ? <ThemedText type="small" style={{ color: theme.error, marginTop: Spacing.sm }} testID="text-event-form-error">{formError}</ThemedText> : null}
      </BottomSheetModal>

      {/* ── Slot edit modal ── */}
      <Modal visible={!!slotEditEvent} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setSlotEditEvent(null)}>
        <KeyboardAvoidingView style={styles.modalOuter} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSlotEditEvent(null)} />
          <View style={[styles.slotSheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontSize: 15, fontWeight: "700" }}>Edit Slots</ThemedText>
              {slotEditEvent ? (
                <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={1}>
                  {slotEditEvent.name}
                </ThemedText>
              ) : null}
            </View>
            <Pressable onPress={() => setSlotEditEvent(null)} style={styles.sheetClose} testID="button-slot-close">
              <Feather name="x" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={[styles.sheetScroll, { maxHeight: windowHeight * 0.62 }]} contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* ─ Slot Duration stepper ─ */}
            <View style={[styles.stepperCard, { backgroundColor: theme.backgroundRoot ?? theme.background, borderColor: theme.border }]}>
              <View style={styles.stepperInfo}>
                <View style={[styles.stepperIconBg, { backgroundColor: BRAND + "18" }]}>
                  <Feather name="clock" size={20} color={BRAND} />
                </View>
                <View>
                  <ThemedText type="body" style={{ fontWeight: "700" }}>Slot Duration</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>Minutes per time slot · steps of 15</ThemedText>
                </View>
              </View>
              <View style={styles.stepper}>
                <Pressable onPress={() => { Keyboard.dismiss(); setSlotDuration((v) => Math.max(15, v - 15)); }} style={[styles.stepBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} testID="button-slot-duration-minus">
                  <Feather name="minus" size={18} color={BRAND} />
                </Pressable>
                <View style={[styles.stepValue, { borderColor: BRAND }]}>
                  <TextInput
                    value={String(slotDuration)}
                    onChangeText={(t) => { const n = parseInt(t, 10); if (!isNaN(n) && n > 0) setSlotDuration(n); }}
                    onBlur={() => setSlotDuration((v) => Math.max(15, Math.min(240, v)))}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    style={{ fontSize: 20, fontWeight: "800", color: BRAND, textAlign: "center", minWidth: 60 }}
                    testID="input-slot-duration-value"
                  />
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>min</ThemedText>
                </View>
                <Pressable onPress={() => { Keyboard.dismiss(); setSlotDuration((v) => Math.min(240, v + 15)); }} style={[styles.stepBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} testID="button-slot-duration-plus">
                  <Feather name="plus" size={18} color={BRAND} />
                </Pressable>
              </View>
            </View>

            {/* ─ Slot Capacity stepper ─ */}
            <View style={[styles.stepperCard, { backgroundColor: theme.backgroundRoot ?? theme.background, borderColor: theme.border }]}>
              <View style={styles.stepperInfo}>
                <View style={[styles.stepperIconBg, { backgroundColor: BRAND + "18" }]}>
                  <Feather name="users" size={20} color={BRAND} />
                </View>
                <View>
                  <ThemedText type="body" style={{ fontWeight: "700" }}>Default Capacity</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>Max guests for all slots</ThemedText>
                </View>
              </View>
              <View style={styles.stepper}>
                <Pressable onPress={() => { Keyboard.dismiss(); setSlotCapacity((v) => Math.max(1, v - 1)); }} style={[styles.stepBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} testID="button-slot-capacity-minus">
                  <Feather name="minus" size={18} color={theme.text} />
                </Pressable>
                <View style={[styles.stepValue, { borderColor: BRAND }]}>
                  <TextInput
                    value={String(slotCapacity)}
                    onChangeText={(t) => { const n = parseInt(t, 10); if (!isNaN(n) && n > 0) setSlotCapacity(n); }}
                    onBlur={() => setSlotCapacity((v) => Math.max(1, Math.min(9999, v)))}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    style={{ fontSize: 20, fontWeight: "800", color: BRAND, textAlign: "center", minWidth: 60 }}
                    testID="input-slot-capacity-value"
                  />
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>guests</ThemedText>
                </View>
                <Pressable onPress={() => { Keyboard.dismiss(); setSlotCapacity((v) => Math.min(9999, v + 1)); }} style={[styles.stepBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} testID="button-slot-capacity-plus">
                  <Feather name="plus" size={18} color={theme.text} />
                </Pressable>
              </View>
            </View>

            <Pressable onPress={() => { Keyboard.dismiss(); saveSlots(); }} disabled={slotSaving} style={[styles.slotSaveBtn, { backgroundColor: BRAND, opacity: slotSaving ? 0.6 : 1 }]} testID="button-slot-save">
              {slotSaving ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check" size={18} color="#fff" />}
              <ThemedText style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{slotSaving ? "Saving…" : "Save Slots"}</ThemedText>
            </Pressable>

          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Per-Slot Override Modal ── */}
      <Modal visible={!!overrideEvent} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setOverrideEvent(null)}>
        <KeyboardAvoidingView style={styles.modalOuter} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setOverrideEvent(null)} />
          <View style={[styles.slotSheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontSize: 15, fontWeight: "700" }}>Slot Override</ThemedText>
              {overrideEvent ? (
                <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={1}>
                  {overrideEvent.name}
                </ThemedText>
              ) : null}
            </View>
            <Pressable onPress={() => setOverrideEvent(null)} style={styles.sheetClose} testID="button-override-close">
              <Feather name="x" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={[styles.sheetScroll, { maxHeight: windowHeight * 0.62 }]} contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Override the capacity for a specific date and time slot, keeping all others at the default.
            </ThemedText>

            <View style={[styles.overrideCard, { backgroundColor: theme.backgroundRoot ?? theme.background, borderColor: theme.border }]}>

              {/* ── Date row ── */}
              <View style={styles.overrideRow}>
                <View style={[styles.overrideIconBg, { backgroundColor: BRAND + "18" }]}>
                  <Feather name="calendar" size={16} color={BRAND} />
                </View>
                <ThemedText type="small" style={[styles.overrideLabel, { color: theme.textSecondary }]}>Date</ThemedText>
                <Pressable
                  onPress={() => setShowDatePicker((v) => !v)}
                  style={[styles.slotPickerBtn, { borderColor: showDatePicker ? BRAND : theme.border, backgroundColor: theme.surface }]}
                  testID="button-date-picker"
                >
                  <Feather name="calendar" size={14} color={BRAND} />
                  <ThemedText type="small" style={{ flex: 1, color: theme.text, fontWeight: "600" }}>
                    {overrideDateStr}
                  </ThemedText>
                  <Feather name={showDatePicker ? "chevron-up" : "chevron-down"} size={14} color={theme.textSecondary} />
                </Pressable>
              </View>

              {showDatePicker ? (
                <DateTimePicker
                  value={overrideDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  minimumDate={(() => {
                    if (!overrideEvent) return new Date();
                    const startD = new Date(overrideEvent.startDate);
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    return startD > today ? startD : today;
                  })()}
                  maximumDate={overrideEvent?.endDate ? new Date(overrideEvent.endDate) : undefined}
                  onChange={(_e, d) => {
                    if (d) setOverrideDate(d);
                    if (Platform.OS === "android") setShowDatePicker(false);
                  }}
                  accentColor={BRAND}
                  themeVariant={isDark ? "dark" : "light"}
                />
              ) : null}

              {/* ── Slot dropdown ── */}
              <View style={[styles.overrideRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: Spacing.md }]}>
                <View style={[styles.overrideIconBg, { backgroundColor: BRAND + "18" }]}>
                  <Feather name="clock" size={16} color={BRAND} />
                </View>
                <ThemedText type="small" style={[styles.overrideLabel, { color: theme.textSecondary }]}>Slot</ThemedText>
                {overrideSlotTimes.length > 0 ? (
                  <Pressable
                    onPress={() => setSlotDropOpen((v) => !v)}
                    style={[styles.slotPickerBtn, { borderColor: slotDropOpen ? BRAND : theme.border, backgroundColor: theme.surface }]}
                    testID="button-slot-picker"
                  >
                    <Feather name="clock" size={14} color={BRAND} />
                    <ThemedText type="small" style={{ flex: 1, color: theme.text, fontWeight: "600" }}>
                      {overrideTime ? fmtSlotLabel(overrideTime, overrideEvent?.slotDurationMinutes ?? 30) : "Select slot"}
                    </ThemedText>
                    <Feather name={slotDropOpen ? "chevron-up" : "chevron-down"} size={14} color={theme.textSecondary} />
                  </Pressable>
                ) : (
                  <ThemedText type="small" style={{ flex: 1, color: theme.textSecondary }}>No slots — check event hours</ThemedText>
                )}
              </View>

              {slotDropOpen ? (
                <View style={[styles.slotDropList, { borderColor: BRAND + "40", backgroundColor: theme.backgroundRoot ?? theme.background }]}>
                  {overrideSlotTimes.map((t) => {
                    const sel = t === overrideTime;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => { setOverrideTime(t); setSlotDropOpen(false); }}
                        style={[
                          styles.slotDropItem,
                          { borderBottomColor: theme.border },
                          sel && { backgroundColor: BRAND + "12" },
                        ]}
                        testID={`slot-option-${t}`}
                      >
                        <View style={[styles.slotPickerDot, { backgroundColor: sel ? BRAND : theme.border }]} />
                        <ThemedText type="small" style={{ flex: 1, color: theme.text, fontWeight: sel ? "700" : "400" }}>
                          {fmtSlotLabel(t, overrideEvent?.slotDurationMinutes ?? 30)}
                        </ThemedText>
                        {sel ? <Feather name="check" size={15} color={BRAND} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {/* ── Capacity stepper ── */}
              <View style={[{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: Spacing.md }]}>
                <View style={styles.overrideRow}>
                  <View style={[styles.overrideIconBg, { backgroundColor: BRAND + "18" }]}>
                    <Feather name="users" size={16} color={BRAND} />
                  </View>
                  <ThemedText type="small" style={[styles.overrideLabel, { color: theme.textSecondary }]}>Capacity</ThemedText>
                  <View style={[styles.miniStepper, { flex: 1, justifyContent: "flex-end" }]}>
                    <Pressable onPress={() => { Keyboard.dismiss(); setOverrideCapacity((v) => Math.max(1, v - 1)); }} style={[styles.miniStepBtn, { borderColor: theme.border, backgroundColor: theme.surface }]} testID="button-override-capacity-minus">
                      <Feather name="minus" size={14} color={BRAND} />
                    </Pressable>
                    <TextInput
                      value={String(overrideCapacity)}
                      onChangeText={(t) => { const n = parseInt(t, 10); if (!isNaN(n) && n > 0) setOverrideCapacity(n); }}
                      onBlur={() => setOverrideCapacity((v) => Math.max(1, Math.min(9999, v)))}
                      keyboardType="number-pad"
                      selectTextOnFocus
                      style={{ fontSize: 17, fontWeight: "800", color: BRAND, minWidth: 44, textAlign: "center", borderBottomWidth: 1.5, borderBottomColor: BRAND + "60", paddingVertical: 2 }}
                      testID="input-override-capacity-value"
                    />
                    <Pressable onPress={() => { Keyboard.dismiss(); setOverrideCapacity((v) => Math.min(9999, v + 1)); }} style={[styles.miniStepBtn, { borderColor: theme.border, backgroundColor: theme.surface }]} testID="button-override-capacity-plus">
                      <Feather name="plus" size={14} color={BRAND} />
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>

            <Pressable
              onPress={() => { Keyboard.dismiss(); applyOverride(); }}
              disabled={overrideSaving || !overrideDateStr || !overrideTime}
              style={[
                styles.slotSaveBtn,
                { backgroundColor: BRAND, opacity: overrideSaving || !overrideDateStr || !overrideTime ? 0.45 : 1 },
              ]}
              testID="button-override-apply"
            >
              {overrideSaving ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check-circle" size={18} color="#fff" />}
              <ThemedText style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                {overrideSaving ? "Applying…" : "Apply Override"}
              </ThemedText>
            </Pressable>

            {/* Active overrides list */}
            {overrideEntries.length > 0 ? (
              <View style={{ gap: Spacing.xs }}>
                <ThemedText type="small" style={{ color: theme.textSecondary, fontWeight: "700", marginBottom: 2 }}>
                  ACTIVE OVERRIDES
                </ThemedText>
                {overrideEntries.map(([key, cap]) => (
                  <View key={key} style={[styles.overrideChip, { backgroundColor: BRAND + "10", borderColor: BRAND + "30" }]}>
                    <Feather name="clock" size={13} color={BRAND} />
                    <ThemedText type="small" style={{ flex: 1, color: theme.text, fontWeight: "600" }}>
                      {fmtOverrideKey(key)}
                    </ThemedText>
                    <ThemedText type="small" style={{ color: BRAND, fontWeight: "800" }}>
                      {cap} guests
                    </ThemedText>
                    <Pressable onPress={() => removeOverride(key)} style={styles.overrideChipDel} testID={`button-override-delete-${key}`}>
                      <Feather name="x" size={14} color={theme.textSecondary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Danger-zone confirm ── */}
      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <KeyboardAvoidingView style={styles.dangerBackdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
          <View style={[styles.dangerSheet, { backgroundColor: theme.surface }]}>
            <View style={[styles.dangerBanner, { backgroundColor: confirmKindColor(confirm?.kind ?? "end") + "15", borderColor: confirmKindColor(confirm?.kind ?? "end") + "40" }]}>
              <Feather name="alert-triangle" size={18} color={confirmKindColor(confirm?.kind ?? "end")} />
              <View style={{ flex: 1 }}>
                <ThemedText type="body" style={{ fontWeight: "700", color: confirmKindColor(confirm?.kind ?? "end") }}>Danger Zone</ThemedText>
                <ThemedText type="small" style={{ color: confirmKindColor(confirm?.kind ?? "end"), opacity: 0.85, marginTop: 2 }}>
                  This action affects the entire event and all its customers.
                </ThemedText>
              </View>
            </View>

            <ThemedText type="h4" style={{ fontWeight: "700", marginBottom: Spacing.xs }}>
              {confirmKindLabel(confirm?.kind ?? "end")} Event
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.textSecondary, marginBottom: Spacing.lg }}>
              {confirm?.kind === "delete"
                ? "All registrations, check-in data and billing records will be permanently removed. This cannot be undone."
                : confirm?.kind === "pause"
                ? "New registrations will be blocked. Existing customers will be notified of the pause."
                : "The event will stop accepting guests. All active registrations will be closed."}
            </ThemedText>

            <ThemedText type="small" style={{ fontWeight: "700", color: theme.textSecondary, marginBottom: Spacing.xs }}>
              Type{" "}
              <ThemedText type="small" style={{ fontWeight: "800", color: theme.text }}>
                "{confirm?.event.name}"
              </ThemedText>{" "}
              to confirm
            </ThemedText>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder={confirm?.event.name ?? ""}
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.confirmInput,
                {
                  color: theme.text,
                  borderColor: confirmMatches ? confirmKindColor(confirm?.kind ?? "end") : theme.border,
                  backgroundColor: theme.backgroundRoot,
                },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
              testID="input-confirm-text"
            />

            <View style={styles.dangerActions}>
              <Pressable onPress={() => setConfirm(null)} style={[styles.dangerCancelBtn, { borderColor: theme.border }]} testID="button-confirm-cancel">
                <ThemedText type="body" style={{ color: theme.textSecondary, fontWeight: "600" }}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={runConfirm}
                disabled={!confirmMatches || confirmBusy}
                style={[styles.dangerConfirmBtn, { backgroundColor: confirmKindColor(confirm?.kind ?? "end"), opacity: confirmMatches && !confirmBusy ? 1 : 0.35 }]}
                testID="button-confirm-action"
              >
                {confirmBusy ? <ActivityIndicator size="small" color="#fff" /> : <Feather name={confirm?.kind === "delete" ? "trash-2" : confirm?.kind === "pause" ? "pause" : "square"} size={16} color="#fff" />}
                <ThemedText style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                  {confirmKindLabel(confirm?.kind ?? "end")}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

function ActionBtn({ icon, label, iconColor, onPress, busy, testID }: {
  icon: keyof typeof Feather.glyphMap; label: string; iconColor: string;
  onPress: () => void; busy?: boolean; testID: string;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.actionBtn, { borderColor: theme.border, opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}
      testID={testID}
    >
      {busy ? <ActivityIndicator size="small" color={iconColor} /> : <Feather name={icon} size={15} color={iconColor} />}
      <ThemedText type="small" style={{ color: theme.text, fontWeight: "600" }}>{label}</ThemedText>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, editable = true, testID }: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; keyboardType?: "default" | "number-pad" | "decimal-pad";
  multiline?: boolean; editable?: boolean; testID: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 4, fontWeight: "600" }}>{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceMuted, opacity: editable ? 1 : 0.55 }, multiline ? { minHeight: 64, textAlignVertical: "top" } : null]}
        testID={testID}
      />
    </View>
  );
}

function SettingsToggle({ label, description, value, onValueChange, testID }: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.settingsToggle, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]}>
      <View style={{ flex: 1 }}>
        <ThemedText type="small" style={{ fontWeight: "700" }}>{label}</ThemedText>
        {description ? (
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>{description}</ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.border, true: BRAND + "80" }}
        thumbColor={value ? BRAND : undefined}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  smallButton: {
    minHeight: 40,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  container: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  center: { paddingVertical: Spacing["4xl"], alignItems: "center" },
  chipRow: { flexGrow: 0, marginBottom: Spacing.xs },
  chip: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, marginRight: Spacing.sm },
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },
  card: { borderRadius: BorderRadius.lg, padding: Spacing.lg },
  emptyCard: { alignItems: "center", gap: Spacing.md, paddingVertical: Spacing["3xl"] },
  eventHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.md, marginBottom: Spacing.xs },
  eventName: { fontSize: 15, fontWeight: "700", lineHeight: 22, fontFamily: headingFont("bold") },
  statusPill: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginTop: Spacing.sm },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1 },
  field: { marginBottom: Spacing.md },
  twoCol: { flexDirection: "row", gap: Spacing.md },
  payoutSetupNotice: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm, borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  refundPolicyBox: { flexDirection: "row", alignItems: "center", gap: Spacing.md, borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  refundToggle: { flexDirection: "row", gap: Spacing.xs },
  refundOption: { minWidth: 42, alignItems: "center", borderWidth: 1, borderRadius: BorderRadius.sm, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm },
  input: { borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: 15 },
  settingsToggle: { flexDirection: "row", alignItems: "center", gap: Spacing.md, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: Spacing.sm },

  // Slot modal
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  modalOuter: { flex: 1, justifyContent: "flex-end" },
  slotSheet: { width: "100%", borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingTop: Spacing.sm },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: Spacing.md },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  sheetClose: { padding: Spacing.xs },
  sheetScroll: {},
  sheetBody: { paddingHorizontal: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.lg },

  stepperCard: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, gap: Spacing.md },
  stepperInfo: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  stepperIconBg: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.md },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepValue: { minWidth: 80, alignItems: "center", paddingVertical: Spacing.xs, borderBottomWidth: 2 },
  slotSaveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },

  // Override card
  overrideCard: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, gap: Spacing.md },
  overrideRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  overrideIconBg: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  overrideLabel: { width: 70, fontWeight: "600" },
  slotPickerBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.sm, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minHeight: 40 },
  slotDropList: { borderWidth: 1, borderRadius: BorderRadius.md, overflow: "hidden", marginTop: Spacing.xs },
  slotDropItem: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  slotPickerDot: { width: 8, height: 8, borderRadius: 4 },
  miniStepper: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  miniStepBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  overrideChip: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  overrideChipDel: { padding: 4 },

  // Danger zone modal
  dangerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: Spacing.lg },
  dangerSheet: { width: "100%", borderRadius: BorderRadius.xl, padding: Spacing.xl, gap: Spacing.md },
  dangerBanner: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.md, borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  confirmInput: { borderWidth: 1.5, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: 15, marginBottom: Spacing.sm },
  dangerActions: { flexDirection: "row", gap: Spacing.md },
  dangerCancelBtn: { flex: 1, borderWidth: 1, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: "center" },
  dangerConfirmBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, borderRadius: BorderRadius.md, paddingVertical: Spacing.md },
});
