import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { BottomSheetModal } from "@/components/BottomSheetModal";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { apiRequest, queryClient, getErrorMessage } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";

// WhatsApp triggers that an organiser can override per-event. Mirrors the
// "events" trigger set in shared/wa-templates.ts.
const EVENT_WA_TRIGGERS: Array<{ key: string; label: string }> = [
  { key: "ticket", label: "Ticket / Boarding Pass" },
  { key: "reminder_day", label: "Reminder · Day Before" },
  { key: "reminder_hour", label: "Reminder · 1 Hour Before" },
  { key: "slot_active", label: "Slot Active · Come Now" },
  { key: "arrived", label: "Arrival Confirmed" },
  { key: "checked_in", label: "Checked In · Welcome" },
  { key: "thank_you_feedback", label: "Thank You + Feedback" },
];

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
  registrationFee: number;
  supportContact?: string | null;
  parkingTotalSpaces: number;
  messageTemplates?: Record<string, string> | null;
}

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
  supportContact: string;
  parkingTotalSpaces: string;
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
  supportContact: "",
  parkingTotalSpaces: "0",
};

function toDateInput(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function fmtRupeesFromPaise(paise: number | null | undefined): string {
  const v = (paise || 0) / 100;
  return `\u20B9${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function OrgEventManageScreen() {
  const insets = useSafeAreaInsets();
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

  const [editing, setEditing] = useState<EventRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [waEvent, setWaEvent] = useState<EventRow | null>(null);
  const [waTemplates, setWaTemplates] = useState<Record<string, string>>({});
  const [waSaving, setWaSaving] = useState(false);

  const [confirm, setConfirm] = useState<{ event: EventRow; kind: "end" | "delete" } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const cardBg = isDark ? theme.backgroundDefault : "#FFFFFF";

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/events/branch", activeBranchId] });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

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
      supportContact: ev.supportContact ?? "",
      parkingTotalSpaces: String(ev.parkingTotalSpaces ?? 0),
    });
    setFormError(null);
    setShowForm(true);
  };

  const saveForm = async () => {
    if (!form.name.trim()) {
      setFormError("Please enter an event name");
      return;
    }
    if (!form.startDate.trim() || !form.endDate.trim()) {
      setFormError("Please enter start and end dates (YYYY-MM-DD)");
      return;
    }
    if (!activeBranchId || !organization?.id) {
      setFormError("No branch selected");
      return;
    }
    setSaving(true);
    setFormError(null);
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
        registrationFee: Math.max(0, Math.round((parseFloat(form.registrationFee) || 0) * 100)),
        supportContact: form.supportContact.trim() || null,
        parkingTotalSpaces: parseInt(form.parkingTotalSpaces, 10) || 0,
      };
      if (editing) {
        await apiRequest("PUT", `/api/dashboard/events/${editing.id}`, payload);
      } else {
        await apiRequest("POST", "/api/dashboard/events", {
          ...payload,
          branchId: activeBranchId,
          organizationId: organization.id,
        });
      }
      await invalidate();
      setShowForm(false);
    } catch (e) {
      setFormError(getErrorMessage(e, "Failed to save event"));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (ev: EventRow, status: string) => {
    setRowBusy(ev.id);
    try {
      await apiRequest("POST", `/api/dashboard/events/${ev.id}/status`, { status });
      await invalidate();
    } catch {
      // keep prior state on failure
    } finally {
      setRowBusy(null);
    }
  };

  const openWa = (ev: EventRow) => {
    setWaEvent(ev);
    setWaTemplates({ ...(ev.messageTemplates || {}) });
  };

  const saveWa = async () => {
    if (!waEvent) return;
    setWaSaving(true);
    try {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(waTemplates)) {
        if (v && v.trim()) clean[k] = v.trim();
      }
      await apiRequest("PUT", `/api/dashboard/events/${waEvent.id}`, { messageTemplates: clean });
      await invalidate();
      setWaEvent(null);
    } catch {
      // leave sheet open on failure
    } finally {
      setWaSaving(false);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === "delete") {
        await apiRequest("DELETE", `/api/dashboard/events/${confirm.event.id}`);
      } else {
        await apiRequest("POST", `/api/dashboard/events/${confirm.event.id}/status`, { status: "ended" });
      }
      await invalidate();
      setConfirm(null);
    } catch {
      // leave dialog open on failure
    } finally {
      setConfirmBusy(false);
    }
  };

  const statusColor = (status: string) =>
    status === "published"
      ? theme.success
      : status === "paused"
        ? theme.warning
        : status === "ended"
          ? theme.error
          : theme.textSecondary;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing["3xl"] }]}
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
                    ? { backgroundColor: theme.primary }
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

        <Pressable
          onPress={openCreate}
          style={[styles.createBtn, { backgroundColor: theme.primary }]}
          testID="button-create-event"
        >
          <Feather name="plus" size={18} color="#FFFFFF" />
          <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "700" }}>
            New Event
          </ThemedText>
        </Pressable>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.primary} />
          </View>
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
                  <ThemedText type="h4" testID={`text-event-name-${ev.id}`}>
                    {ev.name}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    {new Date(ev.startDate).toLocaleDateString()} – {new Date(ev.endDate).toLocaleDateString()}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
                    {fmtRupeesFromPaise(ev.registrationFee)} · {ev.maxCapacityPerSlot ?? 0}/slot · {ev.slotDurationMinutes ?? 0}min
                  </ThemedText>
                </View>
                <View style={[styles.statusPill, { backgroundColor: statusColor(ev.status) + "22" }]}>
                  <ThemedText
                    type="small"
                    style={{ color: statusColor(ev.status), fontWeight: "700", textTransform: "capitalize" }}
                    testID={`text-event-status-${ev.id}`}
                  >
                    {ev.status}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.actionRow}>
                {ev.status === "draft" || ev.status === "paused" ? (
                  <ActionBtn
                    icon="play"
                    label={ev.status === "paused" ? "Resume" : "Publish"}
                    color={theme.success}
                    busy={rowBusy === ev.id}
                    onPress={() => changeStatus(ev, "published")}
                    testID={`button-publish-${ev.id}`}
                  />
                ) : null}
                {ev.status === "published" ? (
                  <ActionBtn
                    icon="pause"
                    label="Pause"
                    color={theme.warning}
                    busy={rowBusy === ev.id}
                    onPress={() => changeStatus(ev, "paused")}
                    testID={`button-pause-${ev.id}`}
                  />
                ) : null}
                {ev.status !== "ended" && ev.status !== "draft" ? (
                  <ActionBtn
                    icon="square"
                    label="End"
                    color={theme.error}
                    onPress={() => setConfirm({ event: ev, kind: "end" })}
                    testID={`button-end-${ev.id}`}
                  />
                ) : null}
              </View>

              <View style={[styles.actionRow, { marginTop: Spacing.sm }]}>
                <ActionBtn icon="edit-2" label="Edit" color={theme.primary} onPress={() => openEdit(ev)} testID={`button-edit-${ev.id}`} />
                <ActionBtn icon="message-circle" label="Messages" color={theme.primary} onPress={() => openWa(ev)} testID={`button-messages-${ev.id}`} />
                <ActionBtn icon="trash-2" label="Delete" color={theme.error} onPress={() => setConfirm({ event: ev, kind: "delete" })} testID={`button-delete-${ev.id}`} />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create / edit event */}
      <BottomSheetModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit Event" : "New Event"}
        onConfirm={saveForm}
        confirmLabel={editing ? "Save" : "Create"}
        confirmLoading={saving}
      >
        <Field label="Event name" value={form.name} onChangeText={(t) => setForm((f) => ({ ...f, name: t }))} placeholder="Summer Carnival" testID="input-event-name" />
        <Field label="Description" value={form.description} onChangeText={(t) => setForm((f) => ({ ...f, description: t }))} placeholder="Optional" multiline testID="input-event-description" />
        <Field label="Venue" value={form.venue} onChangeText={(t) => setForm((f) => ({ ...f, venue: t }))} placeholder="Optional" testID="input-event-venue" />
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field label="Start date" value={form.startDate} onChangeText={(t) => setForm((f) => ({ ...f, startDate: t }))} placeholder="YYYY-MM-DD" testID="input-event-start" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="End date" value={form.endDate} onChangeText={(t) => setForm((f) => ({ ...f, endDate: t }))} placeholder="YYYY-MM-DD" testID="input-event-end" />
          </View>
        </View>
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field label="Opens" value={form.operatingHoursStart} onChangeText={(t) => setForm((f) => ({ ...f, operatingHoursStart: t }))} placeholder="09:00" testID="input-event-open" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Closes" value={form.operatingHoursEnd} onChangeText={(t) => setForm((f) => ({ ...f, operatingHoursEnd: t }))} placeholder="21:00" testID="input-event-close" />
          </View>
        </View>
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field label="Slot minutes" value={form.slotDurationMinutes} onChangeText={(t) => setForm((f) => ({ ...f, slotDurationMinutes: t }))} keyboardType="number-pad" testID="input-event-slot" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Capacity / slot" value={form.maxCapacityPerSlot} onChangeText={(t) => setForm((f) => ({ ...f, maxCapacityPerSlot: t }))} keyboardType="number-pad" testID="input-event-capacity" />
          </View>
        </View>
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field label={"Fee (\u20B9)"} value={form.registrationFee} onChangeText={(t) => setForm((f) => ({ ...f, registrationFee: t }))} keyboardType="decimal-pad" testID="input-event-fee" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Parking spaces" value={form.parkingTotalSpaces} onChangeText={(t) => setForm((f) => ({ ...f, parkingTotalSpaces: t }))} keyboardType="number-pad" testID="input-event-parking" />
          </View>
        </View>
        <Field label="Support contact" value={form.supportContact} onChangeText={(t) => setForm((f) => ({ ...f, supportContact: t }))} placeholder="Phone / email" testID="input-event-support" />
        {formError ? (
          <ThemedText type="small" style={{ color: theme.error, marginTop: Spacing.sm }} testID="text-event-form-error">
            {formError}
          </ThemedText>
        ) : null}
      </BottomSheetModal>

      {/* WhatsApp templates */}
      <BottomSheetModal
        visible={!!waEvent}
        onClose={() => setWaEvent(null)}
        title="WhatsApp Messages"
        onConfirm={saveWa}
        confirmLoading={waSaving}
      >
        <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
          Leave blank to use the default template. Variables: {"{{customer_name}} {{event_name}} {{booking_id}} {{slot_date}} {{slot_time}} {{venue}}"}
        </ThemedText>
        {EVENT_WA_TRIGGERS.map((t) => (
          <Field
            key={t.key}
            label={t.label}
            value={waTemplates[t.key] ?? ""}
            onChangeText={(v) => setWaTemplates((prev) => ({ ...prev, [t.key]: v }))}
            placeholder="Default template"
            multiline
            testID={`input-wa-${t.key}`}
          />
        ))}
      </BottomSheetModal>

      {/* Confirm end / delete */}
      <BottomSheetModal
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === "delete" ? "Delete Event" : "End Event"}
        onConfirm={runConfirm}
        confirmLabel={confirm?.kind === "delete" ? "Delete" : "End Event"}
        confirmLoading={confirmBusy}
      >
        <ThemedText type="body" style={{ color: theme.text }}>
          {confirm?.kind === "delete"
            ? `Permanently delete "${confirm?.event.name}"? This cannot be undone.`
            : `End "${confirm?.event.name}"? Registrations will close and the event will no longer accept guests.`}
        </ThemedText>
      </BottomSheetModal>
    </ThemedView>
  );
}

function ActionBtn({
  icon,
  label,
  color,
  onPress,
  busy,
  testID,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  busy?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.actionBtn, { borderColor: color, opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}
      testID={testID}
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Feather name={icon} size={15} color={color} />
      )}
      <ThemedText type="small" style={{ color, fontWeight: "700" }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  multiline?: boolean;
  testID: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 4, fontWeight: "600" }}>
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceMuted },
          multiline ? { minHeight: 64, textAlignVertical: "top" } : null,
        ]}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  center: { paddingVertical: Spacing["4xl"], alignItems: "center" },
  chipRow: { flexGrow: 0, marginBottom: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  card: { borderRadius: BorderRadius.lg, padding: Spacing.lg },
  emptyCard: { alignItems: "center", gap: Spacing.md, paddingVertical: Spacing["3xl"] },
  eventHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.md },
  statusPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginTop: Spacing.md },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
  },
  field: { marginBottom: Spacing.md },
  twoCol: { flexDirection: "row", gap: Spacing.md },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
  },
});
