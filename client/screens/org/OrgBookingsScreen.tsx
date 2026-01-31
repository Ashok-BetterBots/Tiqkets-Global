import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Branch } from "@/types/organization";

interface TimeSlot {
  time: string;
  maxCapacity: number;
  currentBookings: number;
  isBlocked: boolean;
}

const generateTimeSlots = (): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  for (let hour = 9; hour < 17; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const time = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
      slots.push({
        time,
        maxCapacity: 3,
        currentBookings: Math.floor(Math.random() * 3),
        isBlocked: false,
      });
    }
  }
  return slots;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function OrgBookingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { 
    organization, 
    updateBranchSettings, 
    getAccessibleBranches,
    selectedBookingBranchId,
    setSelectedBookingBranchId,
    canPerformAction,
  } = useOrganization();

  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(generateTimeSlots());
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null);
  const [maxCapacity, setMaxCapacity] = useState("3");
  const [showBranchPicker, setShowBranchPicker] = useState(false);

  const accessibleBranches = getAccessibleBranches();
  const selectedBranch = accessibleBranches.find((b) => b.id === selectedBookingBranchId) || accessibleBranches[0];

  useEffect(() => {
    if (!selectedBookingBranchId && accessibleBranches.length > 0) {
      setSelectedBookingBranchId(accessibleBranches[0].id);
    }
  }, [accessibleBranches, selectedBookingBranchId, setSelectedBookingBranchId]);

  if (!organization) return null;

  if (accessibleBranches.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.emptyState, { paddingTop: headerHeight + Spacing.xl }]}>
          <Feather name="alert-circle" size={48} color={Colors.light.textSecondary} />
          <ThemedText style={styles.emptyTitle}>No Branches Assigned</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            You don't have access to any branches. Please contact your administrator.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!selectedBranch) return null;

  const operatingHours = selectedBranch.settings.operatingHours;
  const todayHours = operatingHours.find((h) => h.dayOfWeek === selectedDay);

  const handleToggleDay = async (dayOfWeek: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updatedHours = operatingHours.map((h) =>
      h.dayOfWeek === dayOfWeek ? { ...h, isOpen: !h.isOpen } : h
    );
    await updateBranchSettings(selectedBranch.id, { operatingHours: updatedHours });
  };

  const handleUpdateHours = async (dayOfWeek: number, field: "openTime" | "closeTime", value: string) => {
    const updatedHours = operatingHours.map((h) =>
      h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h
    );
    await updateBranchSettings(selectedBranch.id, { operatingHours: updatedHours });
  };

  const handleToggleSlotBlock = (slotTime: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeSlots(
      timeSlots.map((s) =>
        s.time === slotTime ? { ...s, isBlocked: !s.isBlocked } : s
      )
    );
  };

  const handleUpdateSlotCapacity = () => {
    if (!editingSlot) return;
    const cap = parseInt(maxCapacity) || 3;
    setTimeSlots(
      timeSlots.map((s) =>
        s.time === editingSlot.time ? { ...s, maxCapacity: cap } : s
      )
    );
    setEditingSlot(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleSelectBranch = (branch: Branch) => {
    setSelectedBookingBranchId(branch.id);
    setShowBranchPicker(false);
    Haptics.selectionAsync();
  };

  const filteredSlots = timeSlots.filter((slot) => {
    if (!todayHours?.isOpen) return false;
    const slotHour = parseInt(slot.time.split(":")[0]);
    const openHour = parseInt(todayHours.openTime.split(":")[0]);
    const closeHour = parseInt(todayHours.closeTime.split(":")[0]);
    return slotHour >= openHour && slotHour < closeHour;
  });

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + 100 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable 
          style={styles.branchSelector}
          onPress={() => setShowBranchPicker(true)}
          testID="branch-selector"
        >
          <View style={styles.branchSelectorContent}>
            <View style={styles.branchIcon}>
              <Feather name="git-branch" size={18} color={BrandColors.primary} />
            </View>
            <View style={styles.branchInfo}>
              <ThemedText style={styles.branchLabel}>Selected Branch</ThemedText>
              <ThemedText style={styles.branchName}>{selectedBranch.name}</ThemedText>
            </View>
          </View>
          <Feather name="chevron-down" size={20} color={Colors.light.textSecondary} />
        </Pressable>

        <ThemedText type="h4" style={styles.sectionTitle}>Operating Hours</ThemedText>
        <Card style={styles.hoursCard}>
          {operatingHours.map((hours) => (
            <View key={hours.dayOfWeek} style={styles.hourRow}>
              <Pressable
                style={styles.dayToggle}
                onPress={() => handleToggleDay(hours.dayOfWeek)}
              >
                <Feather
                  name={hours.isOpen ? "check-square" : "square"}
                  size={18}
                  color={hours.isOpen ? Colors.light.success : Colors.light.textSecondary}
                />
                <ThemedText style={[
                  styles.dayName,
                  !hours.isOpen && styles.dayNameInactive,
                ]}>
                  {FULL_DAYS[hours.dayOfWeek]}
                </ThemedText>
              </Pressable>

              {hours.isOpen ? (
                <View style={styles.timeInputs}>
                  <TextInput
                    style={styles.timeInput}
                    value={hours.openTime}
                    onChangeText={(v) => handleUpdateHours(hours.dayOfWeek, "openTime", v)}
                    placeholder="09:00"
                    placeholderTextColor="#9CA3AF"
                  />
                  <ThemedText style={styles.timeSeparator}>-</ThemedText>
                  <TextInput
                    style={styles.timeInput}
                    value={hours.closeTime}
                    onChangeText={(v) => handleUpdateHours(hours.dayOfWeek, "closeTime", v)}
                    placeholder="17:00"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              ) : (
                <ThemedText style={styles.closedText}>Closed</ThemedText>
              )}
            </View>
          ))}
        </Card>

        <ThemedText type="h4" style={styles.sectionTitle}>Time Slot Management</ThemedText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.daysRow}
        >
          {DAYS.map((day, index) => (
            <Pressable
              key={day}
              style={[
                styles.dayChip,
                selectedDay === index && styles.dayChipActive,
                !operatingHours[index].isOpen && styles.dayChipClosed,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedDay(index);
              }}
            >
              <ThemedText style={[
                styles.dayChipText,
                selectedDay === index && styles.dayChipTextActive,
              ]}>
                {day}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>

        {!todayHours?.isOpen ? (
          <View style={styles.closedState}>
            <Feather name="x-circle" size={48} color={Colors.light.textSecondary} />
            <ThemedText style={styles.closedTitle}>Closed on {FULL_DAYS[selectedDay]}</ThemedText>
            <ThemedText style={styles.closedSubtitle}>
              Enable this day in operating hours to manage slots
            </ThemedText>
          </View>
        ) : (
          <View style={styles.slotsGrid}>
            {filteredSlots.map((slot) => (
              <Pressable
                key={slot.time}
                style={[
                  styles.slotCard,
                  slot.isBlocked && styles.slotCardBlocked,
                  slot.currentBookings >= slot.maxCapacity && styles.slotCardFull,
                ]}
                onPress={() => handleToggleSlotBlock(slot.time)}
                onLongPress={() => {
                  setEditingSlot(slot);
                  setMaxCapacity(slot.maxCapacity.toString());
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
              >
                <ThemedText style={[
                  styles.slotTime,
                  slot.isBlocked && styles.slotTimeBlocked,
                ]}>
                  {slot.time}
                </ThemedText>
                <View style={styles.slotMeta}>
                  <ThemedText style={[
                    styles.slotBookings,
                    slot.isBlocked && styles.slotBookingsBlocked,
                  ]}>
                    {slot.isBlocked ? "Blocked" : `${slot.currentBookings}/${slot.maxCapacity}`}
                  </ThemedText>
                </View>
                {slot.isBlocked ? (
                  <Feather name="x-circle" size={14} color={Colors.light.accent} />
                ) : (
                  <View style={[
                    styles.slotIndicator,
                    slot.currentBookings >= slot.maxCapacity && { backgroundColor: Colors.light.accent },
                    slot.currentBookings > 0 && slot.currentBookings < slot.maxCapacity && { backgroundColor: "#F59E0B" },
                    slot.currentBookings === 0 && { backgroundColor: Colors.light.success },
                  ]} />
                )}
              </Pressable>
            ))}
          </View>
        )}

        {editingSlot ? (
          <Card style={styles.editCard}>
            <ThemedText type="body" style={styles.editTitle}>
              Edit Slot: {editingSlot.time}
            </ThemedText>
            <View style={styles.editRow}>
              <ThemedText style={styles.editLabel}>Max Capacity</ThemedText>
              <View style={styles.capacityInput}>
                <Pressable
                  style={styles.capacityButton}
                  onPress={() => setMaxCapacity(Math.max(1, parseInt(maxCapacity) - 1).toString())}
                >
                  <Feather name="minus" size={18} color={BrandColors.primary} />
                </Pressable>
                <TextInput
                  style={styles.capacityValue}
                  value={maxCapacity}
                  onChangeText={setMaxCapacity}
                  keyboardType="number-pad"
                />
                <Pressable
                  style={styles.capacityButton}
                  onPress={() => setMaxCapacity((parseInt(maxCapacity) + 1).toString())}
                >
                  <Feather name="plus" size={18} color={BrandColors.primary} />
                </Pressable>
              </View>
            </View>
            <View style={styles.editActions}>
              <Pressable
                style={styles.cancelEdit}
                onPress={() => setEditingSlot(null)}
              >
                <ThemedText style={styles.cancelEditText}>Cancel</ThemedText>
              </Pressable>
              <Button title="Save Changes" onPress={handleUpdateSlotCapacity} size="small" />
            </View>
          </Card>
        ) : null}

        <Card style={styles.helpCard}>
          <Feather name="info" size={18} color={BrandColors.primary} />
          <View style={styles.helpContent}>
            <ThemedText style={styles.helpTitle}>Tips</ThemedText>
            <ThemedText style={styles.helpText}>
              Tap a slot to block/unblock it. Long press to edit capacity.
            </ThemedText>
          </View>
        </Card>
      </ScrollView>

      <Modal
        visible={showBranchPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBranchPicker(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowBranchPicker(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText type="h4">Select Branch</ThemedText>
              <Pressable onPress={() => setShowBranchPicker(false)}>
                <Feather name="x" size={24} color={Colors.light.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.branchList}>
              {accessibleBranches.map((branch) => (
                <Pressable
                  key={branch.id}
                  style={[
                    styles.branchOption,
                    branch.id === selectedBranch.id && styles.branchOptionSelected,
                  ]}
                  onPress={() => handleSelectBranch(branch)}
                >
                  <View style={styles.branchOptionContent}>
                    <Feather 
                      name="git-branch" 
                      size={18} 
                      color={branch.id === selectedBranch.id ? BrandColors.primary : Colors.light.textSecondary} 
                    />
                    <View style={styles.branchOptionInfo}>
                      <ThemedText style={[
                        styles.branchOptionName,
                        branch.id === selectedBranch.id && styles.branchOptionNameSelected,
                      ]}>
                        {branch.name}
                      </ThemedText>
                      <ThemedText style={styles.branchOptionAddress}>{branch.address}</ThemedText>
                    </View>
                  </View>
                  {branch.id === selectedBranch.id && (
                    <Feather name="check" size={20} color={BrandColors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  branchSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: BrandColors.primary + "10",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: BrandColors.primary + "30",
  },
  branchSelectorContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  branchIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: BrandColors.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  branchInfo: {
    flex: 1,
  },
  branchLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  branchName: {
    fontSize: 16,
    fontWeight: "600",
    color: BrandColors.primary,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  hoursCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  hourRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  dayToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dayName: {
    fontWeight: "500",
    width: 100,
  },
  dayNameInactive: {
    color: Colors.light.textSecondary,
  },
  timeInputs: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  timeInput: {
    backgroundColor: "#F3F4F6",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    fontSize: 14,
    width: 60,
    textAlign: "center",
  },
  timeSeparator: {
    color: Colors.light.textSecondary,
  },
  closedText: {
    color: Colors.light.textSecondary,
    fontStyle: "italic",
  },
  daysRow: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  dayChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: "#F1F5F9",
  },
  dayChipActive: {
    backgroundColor: BrandColors.primary,
  },
  dayChipClosed: {
    opacity: 0.5,
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.light.textSecondary,
  },
  dayChipTextActive: {
    color: "#FFFFFF",
  },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  slotCard: {
    width: "23%",
    backgroundColor: "#F8FAFC",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    alignItems: "center",
  },
  slotCardBlocked: {
    backgroundColor: Colors.light.accent + "15",
  },
  slotCardFull: {
    backgroundColor: "#FEE2E2",
  },
  slotTime: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  slotTimeBlocked: {
    color: Colors.light.accent,
    textDecorationLine: "line-through",
  },
  slotMeta: {
    marginBottom: Spacing.xs,
  },
  slotBookings: {
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  slotBookingsBlocked: {
    color: Colors.light.accent,
  },
  slotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  closedState: {
    alignItems: "center",
    paddingVertical: Spacing["4xl"],
  },
  closedTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: Spacing.lg,
  },
  closedSubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  editCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  editTitle: {
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  editRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  editLabel: {
    fontWeight: "500",
  },
  capacityInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  capacityButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: BrandColors.primary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  capacityValue: {
    width: 50,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.md,
  },
  cancelEdit: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  cancelEditText: {
    color: Colors.light.textSecondary,
    fontWeight: "600",
  },
  helpCard: {
    flexDirection: "row",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  helpContent: {
    flex: 1,
  },
  helpTitle: {
    fontWeight: "600",
    marginBottom: 2,
  },
  helpText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  branchList: {
    padding: Spacing.lg,
  },
  branchOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    backgroundColor: "#F8FAFC",
  },
  branchOptionSelected: {
    backgroundColor: BrandColors.primary + "15",
    borderWidth: 1,
    borderColor: BrandColors.primary,
  },
  branchOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  branchOptionInfo: {
    flex: 1,
  },
  branchOptionName: {
    fontWeight: "600",
    fontSize: 15,
  },
  branchOptionNameSelected: {
    color: BrandColors.primary,
  },
  branchOptionAddress: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
});
