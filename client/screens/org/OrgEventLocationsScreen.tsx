import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Switch,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { BottomSheetModal } from "@/components/BottomSheetModal";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { apiRequest, getErrorMessage } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";
import { InputField, OrgService } from "@/types/organization";

const FIELD_TYPES: Array<InputField["type"]> = [
  "text",
  "email",
  "phone",
  "number",
  "select",
  "checkbox",
  "date",
];

interface EventConfig {
  operatingHoursStart: string;
  operatingHoursEnd: string;
  slotDurationMinutes: string;
  maxCapacityPerSlot: string;
  registrationFee: string;
  registrationFeeCustomText: string;
  refundable: boolean;
  refundMessage: string;
}

const EMPTY_CONFIG: EventConfig = {
  operatingHoursStart: "09:00",
  operatingHoursEnd: "21:00",
  slotDurationMinutes: "30",
  maxCapacityPerSlot: "50",
  registrationFee: "0",
  registrationFeeCustomText: "",
  refundable: false,
  refundMessage: "",
};

function readConfig(svc: OrgService): EventConfig {
  const ev = (svc.serviceSettings as any)?.event || {};
  return {
    operatingHoursStart: ev.operatingHoursStart ?? "09:00",
    operatingHoursEnd: ev.operatingHoursEnd ?? "21:00",
    slotDurationMinutes: String(ev.slotDurationMinutes ?? 30),
    maxCapacityPerSlot: String(ev.maxCapacityPerSlot ?? 50),
    registrationFee: String((ev.registrationFee ?? 0) / 100),
    registrationFeeCustomText: typeof ev.registrationFeeCustomText === "string" ? ev.registrationFeeCustomText : "",
    refundable: ev.refundable === true,
    refundMessage: typeof ev.refundMessage === "string" ? ev.refundMessage : "",
  };
}

export default function OrgEventLocationsScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isNarrowScreen = screenWidth < 380;
  const { theme, isDark } = useTheme();
  const {
    getAccessibleBranches,
    addService,
    updateService,
    deleteService,
    updateBranch,
    refreshOrganizationData,
  } = useOrganization();
  const branches = getAccessibleBranches();

  const [branchId, setBranchId] = useState<string | null>(
    branches.length > 0 ? branches[0].id : null,
  );
  const activeBranchId = branchId ?? (branches.length > 0 ? branches[0].id : null);

  const branch = useMemo(
    () => branches.find((b) => b.id === activeBranchId) || null,
    [branches, activeBranchId],
  );
  const locations = branch?.services ?? [];

  const [refreshing, setRefreshing] = useState(false);

  // Location details (name/description) editor
  const [detailSvc, setDetailSvc] = useState<OrgService | null>(null);
  const [detailNew, setDetailNew] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [locName, setLocName] = useState("");
  const [locDesc, setLocDesc] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Event-settings editor
  const [settingsSvc, setSettingsSvc] = useState<OrgService | null>(null);
  const [config, setConfig] = useState<EventConfig>(EMPTY_CONFIG);
  const [fields, setFields] = useState<InputField[]>([]);
  const [applyToAll, setApplyToAll] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // New custom field sub-form
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<InputField["type"]>("text");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldOptions, setNewFieldOptions] = useState("");

  const [confirmDelete, setConfirmDelete] = useState<OrgService | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const cardBg = isDark ? theme.backgroundDefault : "#FFFFFF";

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshOrganizationData();
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  };

  const openCreate = () => {
    setDetailSvc(null);
    setDetailNew(true);
    setLocName("");
    setLocDesc("");
    setDetailError(null);
    setShowDetail(true);
  };

  const openEditDetail = (svc: OrgService) => {
    setDetailSvc(svc);
    setDetailNew(false);
    setLocName(svc.name ?? "");
    setLocDesc(svc.description ?? "");
    setDetailError(null);
    setShowDetail(true);
  };

  const saveDetail = async () => {
    if (!locName.trim()) {
      setDetailError("Please enter a location name");
      return;
    }
    if (!activeBranchId) {
      setDetailError("No branch selected");
      return;
    }
    setDetailSaving(true);
    setDetailError(null);
    try {
      if (detailNew) {
        const created = await addService({
          name: locName.trim(),
          description: locDesc.trim(),
          averageWaitTime: 0,
          estimatedDuration: 0,
          isActive: true,
          inputFields: [],
          branchId: activeBranchId,
        } as any);
        if (branch && created) {
          await updateBranch(branch.id, { services: [...branch.services, created] });
        }
      } else if (detailSvc) {
        await updateService(detailSvc.id, {
          name: locName.trim(),
          description: locDesc.trim(),
        });
      }
      setShowDetail(false);
    } catch (e) {
      setDetailError(getErrorMessage(e, "Failed to save location"));
    } finally {
      setDetailSaving(false);
    }
  };

  const openSettings = (svc: OrgService) => {
    setSettingsSvc(svc);
    setConfig(readConfig(svc));
    setFields([...(svc.inputFields || [])]);
    setApplyToAll(false);
    setSettingsError(null);
    setNewFieldLabel("");
    setNewFieldType("text");
    setNewFieldRequired(false);
    setNewFieldOptions("");
  };

  const addField = () => {
    if (!newFieldLabel.trim()) return;
    const field: InputField = {
      id: Math.random().toString(36).slice(2, 11),
      label: newFieldLabel.trim(),
      type: newFieldType,
      required: newFieldRequired,
      options:
        newFieldType === "select"
          ? newFieldOptions.split(",").map((o) => o.trim()).filter(Boolean)
          : undefined,
    };
    setFields((prev) => [...prev, field]);
    setNewFieldLabel("");
    setNewFieldType("text");
    setNewFieldRequired(false);
    setNewFieldOptions("");
  };

  const removeField = (id: string) => setFields((prev) => prev.filter((f) => f.id !== id));

  const saveSettings = async () => {
    if (!settingsSvc) return;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      await apiRequest("PUT", `/api/dashboard/events/location/${settingsSvc.id}/event-settings`, {
        config: {
          operatingHoursStart: config.operatingHoursStart.trim() || "09:00",
          operatingHoursEnd: config.operatingHoursEnd.trim() || "21:00",
          slotDurationMinutes: parseInt(config.slotDurationMinutes, 10) || 30,
          maxCapacityPerSlot: parseInt(config.maxCapacityPerSlot, 10) || 0,
          registrationFee: Math.max(0, Math.round((parseFloat(config.registrationFee) || 0) * 100)),
          registrationFeeCustomText: config.registrationFeeCustomText.trim(),
          refundable: config.refundable,
          refundMessage: config.refundMessage.trim(),
        },
        inputFields: fields,
        applyToAll,
      });
      await refreshOrganizationData();
      setSettingsSvc(null);
    } catch (e) {
      setSettingsError(getErrorMessage(e, "Failed to save settings"));
    } finally {
      setSettingsSaving(false);
    }
  };

  const runDelete = async () => {
    if (!confirmDelete) return;
    setConfirmBusy(true);
    try {
      await deleteService(confirmDelete.id);
      if (branch) {
        await updateBranch(branch.id, {
          services: branch.services.filter((s) => s.id !== confirmDelete.id),
        });
      }
      setConfirmDelete(null);
    } catch {
      // ignore
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing["3xl"] }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
                testID={`chip-loc-branch-${b.id}`}
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
          testID="button-create-location"
        >
          <Feather name="plus" size={18} color="#FFFFFF" />
          <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "700" }}>
            Add Location
          </ThemedText>
        </Pressable>

        {locations.length === 0 ? (
          <View style={[styles.card, styles.emptyCard, { backgroundColor: cardBg }]}>
            <Feather name="map-pin" size={36} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
              No locations yet. Add a location to configure its time slots, capacity and fee.
            </ThemedText>
          </View>
        ) : (
          locations.map((svc) => {
            const cfg = readConfig(svc);
            return (
              <View key={svc.id} style={[styles.card, { backgroundColor: cardBg }]} testID={`card-location-${svc.id}`}>
                <View style={styles.eventHeaderRow}>
                  <View style={styles.eventHeaderContent}>
                    <ThemedText type="h4" numberOfLines={2} testID={`text-location-name-${svc.id}`}>
                      {svc.name}
                    </ThemedText>
                    {svc.description ? (
                      <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        {svc.description}
                      </ThemedText>
                    ) : null}
                    <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4 }}>
                      {cfg.operatingHoursStart}–{cfg.operatingHoursEnd} · {cfg.slotDurationMinutes}min · {cfg.maxCapacityPerSlot}/slot · {"\u20B9"}{cfg.registrationFee}
                    </ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
                      {(svc.inputFields?.length || 0)} custom field{(svc.inputFields?.length || 0) === 1 ? "" : "s"}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <ActionBtn icon="sliders" label="Event settings" color={theme.primary} onPress={() => openSettings(svc)} testID={`button-loc-settings-${svc.id}`} />
                  <ActionBtn icon="edit-2" label="Edit" color={theme.primary} onPress={() => openEditDetail(svc)} testID={`button-loc-edit-${svc.id}`} />
                  <ActionBtn icon="trash-2" label="Delete" color={theme.error} onPress={() => setConfirmDelete(svc)} testID={`button-loc-delete-${svc.id}`} />
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Location details */}
      <BottomSheetModal
        visible={showDetail}
        onClose={() => setShowDetail(false)}
        title={detailNew ? "Add Location" : "Edit Location"}
        onConfirm={saveDetail}
        confirmLabel={detailNew ? "Create" : "Save"}
        confirmLoading={detailSaving}
      >
        <Field label="Location name" value={locName} onChangeText={setLocName} placeholder="Main Hall" testID="input-location-name" />
        <Field label="Description" value={locDesc} onChangeText={setLocDesc} placeholder="Optional" multiline testID="input-location-description" />
        {detailError ? (
          <ThemedText type="small" style={{ color: theme.error, marginTop: Spacing.sm }} testID="text-location-error">
            {detailError}
          </ThemedText>
        ) : null}
      </BottomSheetModal>

      {/* Event settings */}
      <BottomSheetModal
        visible={!!settingsSvc}
        onClose={() => setSettingsSvc(null)}
        title={settingsSvc ? `${settingsSvc.name} · Settings` : "Settings"}
        onConfirm={saveSettings}
        confirmLoading={settingsSaving}
      >
        <View style={[styles.twoCol, isNarrowScreen && styles.twoColNarrow]}>
          <View style={{ flex: 1 }}>
            <Field label="Opens" value={config.operatingHoursStart} onChangeText={(t) => setConfig((c) => ({ ...c, operatingHoursStart: t }))} placeholder="09:00" testID="input-cfg-open" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Closes" value={config.operatingHoursEnd} onChangeText={(t) => setConfig((c) => ({ ...c, operatingHoursEnd: t }))} placeholder="21:00" testID="input-cfg-close" />
          </View>
        </View>
        <View style={[styles.twoCol, isNarrowScreen && styles.twoColNarrow]}>
          <View style={{ flex: 1 }}>
            <Field label="Slot minutes" value={config.slotDurationMinutes} onChangeText={(t) => setConfig((c) => ({ ...c, slotDurationMinutes: t }))} keyboardType="number-pad" testID="input-cfg-slot" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Capacity / slot" value={config.maxCapacityPerSlot} onChangeText={(t) => setConfig((c) => ({ ...c, maxCapacityPerSlot: t }))} keyboardType="number-pad" testID="input-cfg-capacity" />
          </View>
        </View>
        <Field label={"Registration fee (\u20B9)"} value={config.registrationFee} onChangeText={(t) => setConfig((c) => ({ ...c, registrationFee: t }))} keyboardType="decimal-pad" testID="input-cfg-fee" />
        <Field
          label="Registration fee custom text"
          value={config.registrationFeeCustomText}
          onChangeText={(registrationFeeCustomText) => setConfig((c) => ({ ...c, registrationFeeCustomText }))}
          placeholder="Text shown below the fee on the customer review page"
          multiline
          testID="input-cfg-fee-custom-text"
        />
        <View style={[styles.refundPolicyBox, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <ThemedText type="body" style={{ color: theme.text, fontWeight: "700" }}>Refundable</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>Customer-facing guidance only.</ThemedText>
          </View>
          <View style={styles.refundToggle}>
            <Pressable
              onPress={() => setConfig((c) => ({ ...c, refundable: false }))}
              style={[styles.refundOption, { borderColor: !config.refundable ? theme.primary : theme.border, backgroundColor: !config.refundable ? theme.primary + "12" : theme.surface }]}
              testID="button-cfg-nonrefundable"
            >
              <ThemedText type="small" style={{ color: !config.refundable ? theme.primary : theme.textSecondary, fontWeight: "700" }}>No</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setConfig((c) => ({ ...c, refundable: true }))}
              style={[styles.refundOption, { borderColor: config.refundable ? theme.primary : theme.border, backgroundColor: config.refundable ? theme.primary + "12" : theme.surface }]}
              testID="button-cfg-refundable"
            >
              <ThemedText type="small" style={{ color: config.refundable ? theme.primary : theme.textSecondary, fontWeight: "700" }}>Yes</ThemedText>
            </Pressable>
          </View>
        </View>
        <Field
          label="Refund message (shown to customers)"
          value={config.refundMessage}
          onChangeText={(refundMessage) => setConfig((c) => ({ ...c, refundMessage }))}
          placeholder="e.g. Refunds are available up to 24 hours before your visit."
          multiline
          testID="input-cfg-refund-message"
        />

        <ThemedText type="body" style={{ fontWeight: "700", marginTop: Spacing.md, marginBottom: Spacing.sm }}>
          Custom registration fields
        </ThemedText>
        {fields.length === 0 ? (
          <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
            No custom fields. Guests only provide name and phone.
          </ThemedText>
        ) : (
          fields.map((f) => (
            <View key={f.id} style={[styles.fieldRow, { borderColor: theme.border }]} testID={`row-field-${f.id}`}>
              <View style={{ flex: 1 }}>
                <ThemedText type="small" style={{ fontWeight: "700", color: theme.text }}>
                  {f.label}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {f.type}{f.required ? " · required" : ""}
                </ThemedText>
              </View>
              <Pressable onPress={() => removeField(f.id)} hitSlop={8} testID={`button-remove-field-${f.id}`}>
                <Feather name="x" size={18} color={theme.error} />
              </Pressable>
            </View>
          ))
        )}

        <View style={[styles.addFieldBox, { borderColor: theme.border }]}>
          <Field label="New field label" value={newFieldLabel} onChangeText={setNewFieldLabel} placeholder="e.g. Company name" testID="input-new-field-label" />
          <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 4, fontWeight: "600" }}>
            Type
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.sm }}>
            {FIELD_TYPES.map((t) => (
              <Pressable
                key={t}
                onPress={() => setNewFieldType(t)}
                style={[
                  styles.typeChip,
                  newFieldType === t
                    ? { backgroundColor: theme.primary }
                    : { backgroundColor: theme.surfaceMuted, borderWidth: 1, borderColor: theme.border },
                ]}
                testID={`chip-field-type-${t}`}
              >
                <ThemedText type="small" style={{ color: newFieldType === t ? "#FFFFFF" : theme.text, fontWeight: "600" }}>
                  {t}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
          {newFieldType === "select" ? (
            <Field label="Options (comma separated)" value={newFieldOptions} onChangeText={setNewFieldOptions} placeholder="Small, Medium, Large" testID="input-new-field-options" />
          ) : null}
          <View style={styles.switchRow}>
            <ThemedText type="body" style={{ color: theme.text }}>
              Required
            </ThemedText>
            <Switch
              value={newFieldRequired}
              onValueChange={setNewFieldRequired}
              trackColor={{ true: theme.primary }}
              testID="switch-new-field-required"
            />
          </View>
          <Pressable onPress={addField} style={[styles.addFieldBtn, { backgroundColor: theme.primary }]} testID="button-add-field">
            <Feather name="plus" size={16} color="#FFFFFF" />
            <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "700" }}>
              Add field
            </ThemedText>
          </Pressable>
        </View>

        <View style={[styles.switchRow, { marginTop: Spacing.md }]}>
          <View style={{ flex: 1 }}>
            <ThemedText type="body" style={{ color: theme.text, fontWeight: "600" }}>
              Apply to all locations
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Copy these settings and fields to every location on this branch.
            </ThemedText>
          </View>
          <Switch
            value={applyToAll}
            onValueChange={setApplyToAll}
            trackColor={{ true: theme.primary }}
            testID="switch-apply-all"
          />
        </View>

        {settingsError ? (
          <ThemedText type="small" style={{ color: theme.error, marginTop: Spacing.sm }} testID="text-settings-error">
            {settingsError}
          </ThemedText>
        ) : null}
      </BottomSheetModal>

      {/* Confirm delete */}
      <BottomSheetModal
        visible={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Location"
        onConfirm={runDelete}
        confirmLabel="Delete"
        confirmLoading={confirmBusy}
      >
        <ThemedText type="body" style={{ color: theme.text }}>
          Delete "{confirmDelete?.name}"? Guests will no longer be able to register at this location.
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
  testID,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionBtn, { borderColor: color, opacity: pressed ? 0.7 : 1 }]}
      testID={testID}
    >
      <Feather name={icon} size={15} color={color} />
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
  eventHeaderContent: { flex: 1, minWidth: 0 },
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
  twoColNarrow: { flexDirection: "column", gap: 0 },
  refundPolicyBox: { flexDirection: "row", alignItems: "center", gap: Spacing.md, borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  refundToggle: { flexDirection: "row", gap: Spacing.xs },
  refundOption: { minWidth: 42, alignItems: "center", borderWidth: 1, borderRadius: BorderRadius.sm, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  addFieldBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  typeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  addFieldBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
});
