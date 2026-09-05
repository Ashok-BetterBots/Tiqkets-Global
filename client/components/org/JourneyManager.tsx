import React, { useState, useCallback, useMemo, useImperativeHandle, forwardRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { RequirePermission } from "@/components/RequirePermission";
import { Journey, JourneyStage } from "@/types/organization";

const generateId = () => Math.random().toString(36).substr(2, 9);

export interface JourneyManagerHandle {
  openCreate: () => void;
}

interface JourneyManagerProps {
  branchId: string;
  isDark?: boolean;
}

export const JourneyManager = forwardRef<JourneyManagerHandle, JourneyManagerProps>(
function JourneyManager({ branchId, isDark = false }: JourneyManagerProps, ref) {
  const colors = isDark ? Colors.dark : Colors.light;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { branches, addJourney, updateJourney, deleteJourney } = useOrganization();

  const branch = branches.find((b) => b.id === branchId);
  const journeys = branch?.journeys || [];
  const services = branch?.services || [];

  const [showJourneyModal, setShowJourneyModal] = useState(false);
  const [showStageModal, setShowStageModal] = useState(false);
  const [editingJourney, setEditingJourney] = useState<Journey | null>(null);
  const [editingStageIndex, setEditingStageIndex] = useState<number | null>(null);

  const [journeyName, setJourneyName] = useState("");
  const [journeyDescription, setJourneyDescription] = useState("");
  const [journeyStages, setJourneyStages] = useState<JourneyStage[]>([]);
  const [isJourneyActive, setIsJourneyActive] = useState(true);

  const [stageServiceId, setStageServiceId] = useState("");
  const [stageIsOptional, setStageIsOptional] = useState(false);
  const [stageDuration, setStageDuration] = useState("15");
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);

  const [stageError, setStageError] = useState("");
  const [journeyError, setJourneyError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Journey | null>(null);
  const [showRemoveStageConfirm, setShowRemoveStageConfirm] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setShowJourneyModal(false);
        setShowStageModal(false);
        setShowDeleteConfirm(null);
        setShowRemoveStageConfirm(null);
        resetJourneyForm();
        resetStageForm();
      };
    }, [])
  );

  const resetJourneyForm = () => {
    setJourneyName("");
    setJourneyDescription("");
    setJourneyStages([]);
    setIsJourneyActive(true);
    setEditingJourney(null);
    setJourneyError("");
  };

  const resetStageForm = () => {
    setStageServiceId("");
    setStageIsOptional(false);
    setStageDuration("15");
    setEditingStageIndex(null);
    setStageError("");
    setServiceDropdownOpen(false);
  };

  const handleOpenJourneyModal = (journey?: Journey) => {
    if (journey) {
      setEditingJourney(journey);
      setJourneyName(journey.name);
      setJourneyDescription(journey.description);
      setJourneyStages([...journey.stages]);
      setIsJourneyActive(journey.isActive);
    } else {
      resetJourneyForm();
    }
    setShowJourneyModal(true);
  };

  const handleCloseJourneyModal = () => {
    setShowJourneyModal(false);
    resetJourneyForm();
  };

  const handleOpenStageModal = (stageIndex?: number) => {
    if (stageIndex !== undefined && journeyStages[stageIndex]) {
      const stage = journeyStages[stageIndex];
      setEditingStageIndex(stageIndex);
      setStageServiceId(stage.serviceId);
      setStageIsOptional(stage.isOptional);
      setStageDuration(stage.estimatedDuration.toString());
    } else {
      resetStageForm();
    }
    setShowStageModal(true);
  };

  const handleCloseStageModal = () => {
    setShowStageModal(false);
    resetStageForm();
  };

  const handleAddStage = () => {
    if (!stageServiceId) {
      setStageError("Please select a service for this stage");
      return;
    }
    setStageError("");

    const service = services.find((s) => s.id === stageServiceId);
    if (!service) return;

    const newStage: JourneyStage = {
      id: generateId(),
      serviceId: stageServiceId,
      serviceName: service.name,
      order: editingStageIndex !== null ? editingStageIndex : journeyStages.length,
      isOptional: stageIsOptional,
      estimatedDuration: parseInt(stageDuration) || 15,
    };

    if (editingStageIndex !== null) {
      const updatedStages = [...journeyStages];
      updatedStages[editingStageIndex] = newStage;
      setJourneyStages(updatedStages);
    } else {
      setJourneyStages([...journeyStages, newStage]);
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleCloseStageModal();
  };

  const handleRemoveStage = (index: number) => {
    setShowRemoveStageConfirm(index);
  };

  const confirmRemoveStage = () => {
    if (showRemoveStageConfirm === null) return;
    const updatedStages = journeyStages.filter((_, i) => i !== showRemoveStageConfirm);
    updatedStages.forEach((stage, i) => (stage.order = i));
    setJourneyStages(updatedStages);
    setShowRemoveStageConfirm(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleMoveStage = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= journeyStages.length) return;

    const updatedStages = [...journeyStages];
    [updatedStages[index], updatedStages[newIndex]] = [
      updatedStages[newIndex],
      updatedStages[index],
    ];
    updatedStages.forEach((stage, i) => (stage.order = i));
    setJourneyStages(updatedStages);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveJourney = async () => {
    if (!journeyName.trim()) {
      setJourneyError("Please enter a journey name");
      return;
    }

    if (journeyStages.length < 2) {
      setJourneyError("A journey must have at least 2 stages");
      return;
    }
    setJourneyError("");

    try {
      if (editingJourney) {
        await updateJourney(branchId, editingJourney.id, {
          name: journeyName,
          description: journeyDescription,
          stages: journeyStages,
          isActive: isJourneyActive,
        });
      } else {
        await addJourney(branchId, {
          name: journeyName,
          description: journeyDescription,
          stages: journeyStages,
          isActive: isJourneyActive,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleCloseJourneyModal();
    } catch (error) {
      setJourneyError("Failed to save journey");
    }
  };

  const handleDeleteJourney = (journey: Journey) => {
    setShowDeleteConfirm(journey);
  };

  const confirmDeleteJourney = async () => {
    if (!showDeleteConfirm) return;
    await deleteJourney(branchId, showDeleteConfirm.id);
    setShowDeleteConfirm(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const selectedStageService = services.find((s) => s.id === stageServiceId);

  useImperativeHandle(ref, () => ({
    openCreate: () => handleOpenJourneyModal(),
  }));

  return (
    <View style={styles.container}>
      {journeys.length === 0 ? (
        <View style={[styles.emptyState, { borderColor: colors.borderSubtle }]}>
          <Feather name="git-branch" size={28} color={colors.textSecondary} />
          <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
            No journeys defined yet
          </ThemedText>
          <ThemedText style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Create a journey to define how customers flow through multiple services
          </ThemedText>
          <RequirePermission permission="org.journeys.create">
            <Pressable
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => handleOpenJourneyModal()}
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <ThemedText style={styles.addButtonText}>Create Journey</ThemedText>
            </Pressable>
          </RequirePermission>
        </View>
      ) : (
        <View style={styles.journeyList}>
          {journeys.map((journey) => (
            <Card key={journey.id} variant="outlined" style={styles.journeyCard}>
              <View style={styles.journeyHeader}>
                <View style={styles.journeyInfo}>
                  <View style={styles.journeyTitleRow}>
                    <ThemedText style={styles.journeyName}>{journey.name}</ThemedText>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: journey.isActive ? colors.success : colors.textSecondary },
                      ]}
                    >
                      <ThemedText style={styles.badgeText}>
                        {journey.isActive ? "Active" : "Inactive"}
                      </ThemedText>
                    </View>
                  </View>
                  {journey.description ? (
                    <ThemedText style={[styles.journeyDescription, { color: colors.textSecondary }]}>
                      {journey.description}
                    </ThemedText>
                  ) : null}
                </View>
                <View style={styles.journeyActions}>
                  <RequirePermission permission="org.journeys.edit">
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: colors.surfaceMuted }]}
                      onPress={() => handleOpenJourneyModal(journey)}
                    >
                      <Feather name="edit-2" size={16} color={colors.primary} />
                    </Pressable>
                  </RequirePermission>
                  <RequirePermission permission="org.journeys.delete">
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: isDark ? "#2A2A2A" : "#FEE2E2" }]}
                      onPress={() => handleDeleteJourney(journey)}
                    >
                      <Feather name="trash-2" size={16} color={colors.error} />
                    </Pressable>
                  </RequirePermission>
                </View>
              </View>

              <View style={[styles.stagesContainer, { borderTopColor: colors.borderSubtle }]}>
                <ThemedText style={[styles.stagesLabel, { color: colors.textSecondary }]}>
                  Stages ({journey.stages.length})
                </ThemedText>
                <View style={styles.stagesFlow}>
                  {journey.stages.map((stage, index) => (
                    <React.Fragment key={stage.id}>
                      <View
                        style={[
                          styles.stageChip,
                          {
                            backgroundColor: stage.isOptional
                              ? isDark
                                ? "#3D3D00"
                                : "#FEF3C7"
                              : isDark
                              ? "#1E3A5F"
                              : "#DBEAFE",
                          },
                        ]}
                      >
                        <ThemedText style={styles.stageChipText}>
                          {index + 1}. {stage.serviceName}
                        </ThemedText>
                        {stage.isOptional ? (
                          <ThemedText style={[styles.optionalTag, { color: colors.warning }]}>
                            (Optional)
                          </ThemedText>
                        ) : null}
                      </View>
                      {index < journey.stages.length - 1 ? (
                        <Feather name="arrow-right" size={16} color={colors.textSecondary} />
                      ) : null}
                    </React.Fragment>
                  ))}
                </View>
              </View>
            </Card>
          ))}

          <RequirePermission permission="org.journeys.create">
            <Pressable
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => handleOpenJourneyModal()}
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <ThemedText style={styles.addButtonText}>Create New Journey</ThemedText>
            </Pressable>
          </RequirePermission>
        </View>
      )}

      <Modal
        visible={showJourneyModal}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseJourneyModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.surface, flexShrink: 1 }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>
                {editingJourney ? "Edit Journey" : "Create Journey"}
              </ThemedText>
              <Pressable onPress={handleCloseJourneyModal}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              style={[styles.modalScroll, { flexGrow: 1, flexShrink: 1 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Journey Name *</ThemedText>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.surfaceMuted,
                      color: colors.text,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                  value={journeyName}
                  onChangeText={setJourneyName}
                  placeholder="e.g., Gynecology Visit"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Description</ThemedText>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    {
                      backgroundColor: colors.surfaceMuted,
                      color: colors.text,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                  value={journeyDescription}
                  onChangeText={setJourneyDescription}
                  placeholder="Describe this customer journey..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.switchRow}>
                <ThemedText style={styles.label}>Active</ThemedText>
                <Switch
                  value={isJourneyActive}
                  onValueChange={setIsJourneyActive}
                  trackColor={{ true: colors.primary, false: "#767577" }}
                />
              </View>

              <View style={styles.stagesSection}>
                <View style={styles.stagesSectionHeader}>
                  <ThemedText style={styles.label}>Stages *</ThemedText>
                  <Pressable
                    style={[styles.addStageButton, { backgroundColor: colors.primary }]}
                    onPress={() => handleOpenStageModal()}
                  >
                    <Feather name="plus" size={16} color="#FFFFFF" />
                    <ThemedText style={styles.addStageText}>Add Stage</ThemedText>
                  </Pressable>
                </View>

                {journeyStages.length === 0 ? (
                  <View style={[styles.noStages, { borderColor: colors.borderSubtle }]}>
                    <ThemedText style={[styles.noStagesText, { color: colors.textSecondary }]}>
                      Add at least 2 stages to create a journey
                    </ThemedText>
                  </View>
                ) : (
                  <View style={styles.stagesList}>
                    {journeyStages.map((stage, index) => (
                      <View
                        key={stage.id}
                        style={[styles.stageItem, { backgroundColor: colors.surfaceMuted }]}
                      >
                        <View style={styles.stageItemLeft}>
                          <View style={[styles.stageNumber, { backgroundColor: colors.primary }]}>
                            <ThemedText style={styles.stageNumberText}>{index + 1}</ThemedText>
                          </View>
                          <View>
                            <ThemedText style={styles.stageName}>{stage.serviceName}</ThemedText>
                            <ThemedText style={[styles.stageDuration, { color: colors.textSecondary }]}>
                              ~{stage.estimatedDuration} min
                              {stage.isOptional ? " · Optional" : ""}
                            </ThemedText>
                          </View>
                        </View>
                        <View style={styles.stageItemActions}>
                          <Pressable
                            style={styles.stageActionButton}
                            onPress={() => handleMoveStage(index, "up")}
                            disabled={index === 0}
                          >
                            <Feather
                              name="chevron-up"
                              size={18}
                              color={index === 0 ? colors.textSecondary : colors.text}
                            />
                          </Pressable>
                          <Pressable
                            style={styles.stageActionButton}
                            onPress={() => handleMoveStage(index, "down")}
                            disabled={index === journeyStages.length - 1}
                          >
                            <Feather
                              name="chevron-down"
                              size={18}
                              color={
                                index === journeyStages.length - 1
                                  ? colors.textSecondary
                                  : colors.text
                              }
                            />
                          </Pressable>
                          <Pressable
                            style={styles.stageActionButton}
                            onPress={() => handleOpenStageModal(index)}
                          >
                            <Feather name="edit-2" size={16} color={colors.primary} />
                          </Pressable>
                          <Pressable
                            style={styles.stageActionButton}
                            onPress={() => handleRemoveStage(index)}
                          >
                            <Feather name="trash-2" size={16} color={colors.error} />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            {journeyError ? (
              <View style={styles.errorContainer}>
                <ThemedText style={styles.errorText}>{journeyError}</ThemedText>
              </View>
            ) : null}

            <View style={[styles.modalFooter, { borderTopColor: colors.borderSubtle }]}>
              <Button
                title="Cancel"
                onPress={handleCloseJourneyModal}
                variant="outline"
                style={styles.footerButton}
              />
              <Button
                title={editingJourney ? "Update Journey" : "Create Journey"}
                onPress={handleSaveJourney}
                style={[styles.footerButton, { backgroundColor: colors.primary }]}
              />
            </View>

            {showStageModal ? (
              <Pressable style={styles.inlineOverlay} onPress={handleCloseStageModal}>
                <Pressable
                  style={[styles.inlineStageModal, { backgroundColor: colors.surface }]}
                  onPress={(e) => e.stopPropagation()}
                >
                  <View style={styles.modalHeader}>
                    <ThemedText style={styles.modalTitle}>
                      {editingStageIndex !== null ? "Edit Stage" : "Add Stage"}
                    </ThemedText>
                    <Pressable onPress={handleCloseStageModal} hitSlop={8}>
                      <Feather name="x" size={24} color={colors.text} />
                    </Pressable>
                  </View>

                  <ScrollView
                    style={styles.inlineStageScrollView}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={styles.formGroup}>
                      <ThemedText style={styles.label}>Service *</ThemedText>
                      {services.length === 0 ? (
                        <View
                          style={[
                            styles.noServicesMessage,
                            {
                              backgroundColor: isDark ? "#2A2A2A" : "#FEF3C7",
                              borderColor: isDark ? "#444" : "#F59E0B",
                            },
                          ]}
                        >
                          <Feather name="alert-circle" size={16} color={isDark ? "#FBBF24" : "#D97706"} />
                          <ThemedText style={[styles.noServicesText, { color: isDark ? "#FBBF24" : "#D97706" }]}>
                            No services available. Please add services first.
                          </ThemedText>
                        </View>
                      ) : (
                        <View>
                          <Pressable
                            style={[
                              styles.dropdownTrigger,
                              {
                                backgroundColor: colors.surfaceMuted,
                                borderColor: serviceDropdownOpen ? colors.primary : colors.borderSubtle,
                              },
                            ]}
                            onPress={() => setServiceDropdownOpen((o) => !o)}
                          >
                            <ThemedText
                              style={[
                                styles.dropdownTriggerText,
                                { color: selectedStageService ? colors.text : colors.textSecondary },
                              ]}
                            >
                              {selectedStageService ? selectedStageService.name : "Select a service"}
                            </ThemedText>
                            <Feather
                              name={serviceDropdownOpen ? "chevron-up" : "chevron-down"}
                              size={18}
                              color={colors.textSecondary}
                            />
                          </Pressable>
                          {serviceDropdownOpen ? (
                            <View
                              style={[
                                styles.dropdownList,
                                { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
                              ]}
                            >
                              <ScrollView
                                style={styles.dropdownScroll}
                                nestedScrollEnabled
                                keyboardShouldPersistTaps="handled"
                              >
                                {services.map((service) => (
                                  <Pressable
                                    key={service.id}
                                    style={[
                                      styles.dropdownOption,
                                      stageServiceId === service.id && {
                                        backgroundColor: colors.primary + "15",
                                      },
                                    ]}
                                    onPress={() => {
                                      setStageServiceId(service.id);
                                      setStageError("");
                                      setServiceDropdownOpen(false);
                                    }}
                                  >
                                    <ThemedText
                                      style={[
                                        styles.dropdownOptionText,
                                        {
                                          color:
                                            stageServiceId === service.id ? colors.primary : colors.text,
                                          fontWeight: stageServiceId === service.id ? "600" : "500",
                                        },
                                      ]}
                                    >
                                      {service.name}
                                    </ThemedText>
                                    {stageServiceId === service.id ? (
                                      <Feather name="check" size={16} color={colors.primary} />
                                    ) : null}
                                  </Pressable>
                                ))}
                              </ScrollView>
                            </View>
                          ) : null}
                        </View>
                      )}
                      {stageError ? (
                        <ThemedText style={styles.errorText}>{stageError}</ThemedText>
                      ) : null}
                    </View>

                    <View style={styles.formGroup}>
                      <ThemedText style={styles.label}>Estimated Duration (minutes)</ThemedText>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            backgroundColor: colors.surfaceMuted,
                            color: colors.text,
                            borderColor: colors.borderSubtle,
                          },
                        ]}
                        value={stageDuration}
                        onChangeText={setStageDuration}
                        placeholder="15"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="number-pad"
                      />
                    </View>

                    <View style={styles.switchRow}>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.label}>Optional Stage</ThemedText>
                        <ThemedText style={[styles.switchHint, { color: colors.textSecondary }]}>
                          Customers can skip this stage
                        </ThemedText>
                      </View>
                      <Switch
                        value={stageIsOptional}
                        onValueChange={setStageIsOptional}
                        trackColor={{ true: colors.primary, false: "#767577" }}
                      />
                    </View>
                  </ScrollView>

                  <View style={[styles.inlineStageFooter, { borderTopColor: colors.borderSubtle }]}>
                    <Button
                      title="Cancel"
                      onPress={handleCloseStageModal}
                      variant="outline"
                      style={styles.footerButton}
                    />
                    <Button
                      title={editingStageIndex !== null ? "Update Stage" : "Add Stage"}
                      onPress={handleAddStage}
                      style={[styles.footerButton, { backgroundColor: colors.primary }]}
                      disabled={services.length === 0}
                    />
                  </View>
                </Pressable>
              </Pressable>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showDeleteConfirm !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowDeleteConfirm(null)}
      >
        <Pressable style={styles.stageModalOverlay} onPress={() => setShowDeleteConfirm(null)}>
          <Pressable
            style={[styles.confirmModalContent, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Feather name="alert-triangle" size={32} color={colors.error} style={{ marginBottom: Spacing.md }} />
            <ThemedText style={styles.confirmTitle}>Delete Journey</ThemedText>
            <ThemedText style={[styles.confirmText, { color: colors.textSecondary }]}>
              Are you sure you want to delete "{showDeleteConfirm?.name}"? This cannot be undone.
            </ThemedText>
            <View style={styles.confirmButtons}>
              <Button
                title="Cancel"
                onPress={() => setShowDeleteConfirm(null)}
                variant="outline"
                style={styles.confirmButton}
              />
              <Button
                title="Delete"
                onPress={confirmDeleteJourney}
                style={[styles.confirmButton, { backgroundColor: colors.error }]}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showRemoveStageConfirm !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowRemoveStageConfirm(null)}
      >
        <Pressable style={styles.stageModalOverlay} onPress={() => setShowRemoveStageConfirm(null)}>
          <Pressable
            style={[styles.confirmModalContent, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Feather name="trash-2" size={32} color={colors.error} style={{ marginBottom: Spacing.md }} />
            <ThemedText style={styles.confirmTitle}>Remove Stage</ThemedText>
            <ThemedText style={[styles.confirmText, { color: colors.textSecondary }]}>
              Are you sure you want to remove this stage from the journey?
            </ThemedText>
            <View style={styles.confirmButtons}>
              <Button
                title="Cancel"
                onPress={() => setShowRemoveStageConfirm(null)}
                variant="outline"
                style={styles.confirmButton}
              />
              <Button
                title="Remove"
                onPress={confirmRemoveStage}
                style={[styles.confirmButton, { backgroundColor: colors.error }]}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
});

const createStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      width: "100%",
    },
    emptyState: {
      padding: Spacing.lg,
      borderWidth: 1,
      borderStyle: "dashed",
      borderRadius: BorderRadius.md,
      alignItems: "center",
      gap: Spacing.sm,
    },
    emptyText: {
      fontSize: 15,
      fontWeight: "600",
      marginTop: Spacing.xs,
    },
    emptySubtext: {
      fontSize: 13,
      textAlign: "center",
    },
    journeyList: {
      gap: Spacing.md,
    },
    journeyCard: {
      padding: Spacing.md,
    },
    journeyHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    journeyInfo: {
      flex: 1,
    },
    journeyTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    journeyName: {
      fontSize: 16,
      fontWeight: "600",
    },
    badge: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: "600",
      color: "#FFFFFF",
    },
    journeyDescription: {
      fontSize: 13,
      marginTop: 4,
    },
    journeyActions: {
      flexDirection: "row",
      gap: Spacing.xs,
    },
    actionButton: {
      width: 32,
      height: 32,
      borderRadius: BorderRadius.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    stagesContainer: {
      marginTop: Spacing.md,
      paddingTop: Spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    stagesLabel: {
      fontSize: 12,
      fontWeight: "600",
      marginBottom: Spacing.sm,
    },
    stagesFlow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: Spacing.xs,
    },
    stageChip: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: BorderRadius.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    stageChipText: {
      fontSize: 12,
      fontWeight: "500",
    },
    optionalTag: {
      fontSize: 10,
    },
    addButton: {
      marginTop: Spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.sm,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      borderRadius: BorderRadius.md,
    },
    addButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: "#FFFFFF",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
      paddingHorizontal: 10,
      paddingBottom: 20,
    },
    stageModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    modalContent: {
      borderRadius: 32,
      maxHeight: "90%",
      flexShrink: 1,
      flexDirection: "column",
    },
    modalHandle: {
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: "rgba(0,0,0,0.12)",
      alignSelf: "center",
      marginTop: 12,
      marginBottom: 4,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: Spacing.lg,
      paddingBottom: Spacing.md,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "600",
    },
    modalScroll: {
      paddingHorizontal: Spacing.lg,
    },
    formGroup: {
      marginBottom: Spacing.lg,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      marginBottom: Spacing.xs,
    },
    input: {
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      fontSize: 16,
    },
    textArea: {
      height: 80,
      textAlignVertical: "top",
    },
    switchRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: Spacing.lg,
    },
    switchHint: {
      fontSize: 12,
      marginTop: 2,
    },
    stagesSection: {
      marginBottom: Spacing.lg,
    },
    stagesSectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: Spacing.sm,
    },
    addStageButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
      borderRadius: BorderRadius.sm,
    },
    addStageText: {
      fontSize: 13,
      fontWeight: "600",
      color: "#FFFFFF",
    },
    noStages: {
      padding: Spacing.lg,
      borderWidth: 1,
      borderStyle: "dashed",
      borderRadius: BorderRadius.md,
      alignItems: "center",
    },
    noStagesText: {
      fontSize: 13,
      textAlign: "center",
    },
    stagesList: {
      gap: Spacing.sm,
    },
    stageItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: Spacing.sm,
      borderRadius: BorderRadius.md,
    },
    stageItemLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      flex: 1,
    },
    stageNumber: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    stageNumberText: {
      fontSize: 12,
      fontWeight: "600",
      color: "#FFFFFF",
    },
    stageName: {
      fontSize: 14,
      fontWeight: "500",
    },
    stageDuration: {
      fontSize: 12,
    },
    stageItemActions: {
      flexDirection: "row",
      gap: 4,
    },
    stageActionButton: {
      padding: 4,
    },
    dropdownTrigger: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      minHeight: 44,
    },
    dropdownTriggerText: {
      fontSize: 16,
    },
    dropdownList: {
      marginTop: Spacing.xs,
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      overflow: "hidden",
    },
    dropdownScroll: {
      maxHeight: 180,
    },
    dropdownOption: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    dropdownOptionText: {
      fontSize: 15,
    },
    modalFooter: {
      flexDirection: "row",
      gap: Spacing.sm,
      padding: Spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    footerButton: {
      flex: 1,
    },
    errorContainer: {
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.sm,
    },
    errorText: {
      color: "#DC2626",
      fontSize: 13,
      marginTop: Spacing.xs,
    },
    noServicesMessage: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      marginTop: Spacing.xs,
    },
    noServicesText: {
      fontSize: 13,
      flex: 1,
    },
    confirmModalContent: {
      width: "85%",
      maxWidth: 340,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      alignItems: "center",
    },
    confirmTitle: {
      fontSize: 16,
      fontWeight: "600",
      marginBottom: Spacing.sm,
      textAlign: "center",
    },
    confirmText: {
      fontSize: 14,
      textAlign: "center",
      marginBottom: Spacing.lg,
    },
    confirmButtons: {
      flexDirection: "row",
      gap: Spacing.sm,
      width: "100%",
    },
    confirmButton: {
      flex: 1,
    },
    inlineOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 100,
    },
    inlineStageModal: {
      width: "90%",
      maxWidth: 400,
      maxHeight: "80%",
      borderRadius: BorderRadius.lg,
      overflow: "hidden",
    },
    inlineStageScrollView: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      maxHeight: 360,
    },
    inlineStageFooter: {
      flexDirection: "row",
      gap: Spacing.sm,
      padding: Spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
  });
