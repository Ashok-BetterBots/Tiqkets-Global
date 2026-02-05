import React, { useState, useCallback } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useTheme } from "@/hooks/useTheme";
import { Journey, JourneyStage, OrgService, Branch } from "@/types/organization";

const generateId = () => Math.random().toString(36).substr(2, 9);

export default function JourneyManagementScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;
  const {
    branches,
    getAccessibleBranches,
    addJourney,
    updateJourney,
    deleteJourney,
  } = useOrganization();

  const accessibleBranches = getAccessibleBranches();
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    accessibleBranches[0]?.id || ""
  );

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  const journeys = selectedBranch?.journeys || [];
  const services = selectedBranch?.services || [];

  const [showJourneyModal, setShowJourneyModal] = useState(false);
  const [showStageModal, setShowStageModal] = useState(false);
  const [editingJourney, setEditingJourney] = useState<Journey | null>(null);
  const [editingStageIndex, setEditingStageIndex] = useState<number | null>(null);

  const [journeyName, setJourneyName] = useState("");
  const [journeyDescription, setJourneyDescription] = useState("");
  const [journeyStages, setJourneyStages] = useState<JourneyStage[]>([]);
  const [isJourneyActive, setIsJourneyActive] = useState(true);

  const [stageServiceId, setStageServiceId] = useState("");
  const [stageName, setStageName] = useState("");
  const [stageIsOptional, setStageIsOptional] = useState(false);
  const [stageDuration, setStageDuration] = useState("15");

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
    setStageName("");
    setStageIsOptional(false);
    setStageDuration("15");
    setEditingStageIndex(null);
    setStageError("");
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
      setStageName(stage.serviceName);
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
      serviceName: stageName || service.name,
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
        await updateJourney(selectedBranchId, editingJourney.id, {
          name: journeyName,
          description: journeyDescription,
          stages: journeyStages,
          isActive: isJourneyActive,
        });
      } else {
        await addJourney(selectedBranchId, {
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
    await deleteJourney(selectedBranchId, showDeleteConfirm.id);
    setShowDeleteConfirm(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {accessibleBranches.length > 1 ? (
          <View style={styles.branchSelector}>
            <ThemedText style={styles.sectionTitle}>Select Branch</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.branchTabs}>
                {accessibleBranches.map((branch) => (
                  <Pressable
                    key={branch.id}
                    style={[
                      styles.branchTab,
                      {
                        backgroundColor:
                          selectedBranchId === branch.id
                            ? colors.primary
                            : isDark
                            ? "#2A2A2A"
                            : "#F1F5F9",
                      },
                    ]}
                    onPress={() => setSelectedBranchId(branch.id)}
                  >
                    <ThemedText
                      style={[
                        styles.branchTabText,
                        {
                          color:
                            selectedBranchId === branch.id
                              ? "#FFFFFF"
                              : colors.text,
                        },
                      ]}
                    >
                      {branch.name}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.header}>
          <ThemedText style={styles.title}>Customer Journeys</ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
            Define multi-stage flows for customers to progress through services
          </ThemedText>
        </View>

        {journeys.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Feather name="layers" size={48} color={colors.textSecondary} />
            <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
              No journeys defined yet
            </ThemedText>
            <ThemedText style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Create a journey to define how customers flow through multiple services
            </ThemedText>
            <Button
              title="Create Journey"
              onPress={() => handleOpenJourneyModal()}
              style={styles.createButton}
            />
          </Card>
        ) : (
          <>
            {journeys.map((journey) => (
              <Card key={journey.id} style={styles.journeyCard}>
                <View style={styles.journeyHeader}>
                  <View style={styles.journeyInfo}>
                    <View style={styles.journeyTitleRow}>
                      <ThemedText style={styles.journeyName}>{journey.name}</ThemedText>
                      {journey.isActive ? (
                        <View style={[styles.activeBadge, { backgroundColor: colors.success }]}>
                          <ThemedText style={styles.badgeText}>Active</ThemedText>
                        </View>
                      ) : (
                        <View style={[styles.inactiveBadge, { backgroundColor: colors.textSecondary }]}>
                          <ThemedText style={styles.badgeText}>Inactive</ThemedText>
                        </View>
                      )}
                    </View>
                    {journey.description ? (
                      <ThemedText style={[styles.journeyDescription, { color: colors.textSecondary }]}>
                        {journey.description}
                      </ThemedText>
                    ) : null}
                  </View>
                  <View style={styles.journeyActions}>
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}
                      onPress={() => handleOpenJourneyModal(journey)}
                    >
                      <Feather name="edit-2" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: isDark ? "#2A2A2A" : "#FEE2E2" }]}
                      onPress={() => handleDeleteJourney(journey)}
                    >
                      <Feather name="trash-2" size={16} color={colors.error} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.stagesContainer}>
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

            <Pressable
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => handleOpenJourneyModal()}
            >
              <Feather name="plus" size={18} color="#FFFFFF" />
              <ThemedText style={styles.addButtonText}>Create New Journey</ThemedText>
            </Pressable>
          </>
        )}
      </ScrollView>

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
          <View style={[styles.modalContent, { backgroundColor: isDark ? "#1A1A1A" : "#FFFFFF" }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>
                {editingJourney ? "Edit Journey" : "Create Journey"}
              </ThemedText>
              <Pressable onPress={handleCloseJourneyModal}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Journey Name *</ThemedText>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? "#1A1A1A" : "#F8F9FA",
                      color: colors.text,
                      borderColor: isDark ? "#333" : "#E5E7EB",
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
                      backgroundColor: isDark ? "#1A1A1A" : "#F8F9FA",
                      color: colors.text,
                      borderColor: isDark ? "#333" : "#E5E7EB",
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
                  <View style={[styles.noStages, { borderColor: isDark ? "#333" : "#E5E7EB" }]}>
                    <ThemedText style={[styles.noStagesText, { color: colors.textSecondary }]}>
                      Add at least 2 stages to create a journey
                    </ThemedText>
                  </View>
                ) : (
                  <View style={styles.stagesList}>
                    {journeyStages.map((stage, index) => (
                      <View
                        key={stage.id}
                        style={[
                          styles.stageItem,
                          { backgroundColor: isDark ? "#1A1A1A" : "#F8F9FA" },
                        ]}
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

            <View style={styles.modalFooter}>
              <Button
                title="Cancel"
                onPress={handleCloseJourneyModal}
                variant="outline"
                style={styles.footerButton}
              />
              <Button
                title={editingJourney ? "Update Journey" : "Create Journey"}
                onPress={handleSaveJourney}
                style={styles.footerButton}
              />
            </View>

            {showStageModal ? (
              <Pressable 
                style={styles.inlineOverlay} 
                onPress={handleCloseStageModal}
              >
                <Pressable 
                  style={[styles.inlineStageModal, { backgroundColor: isDark ? "#1A1A1A" : "#FFFFFF" }]} 
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

                  <ScrollView style={styles.inlineStageScrollView} showsVerticalScrollIndicator={false}>
                    <View style={styles.formGroup}>
                      <ThemedText style={styles.label}>Service *</ThemedText>
                      {services.length === 0 ? (
                        <View style={[styles.noServicesMessage, { backgroundColor: isDark ? "#2A2A2A" : "#FEF3C7", borderColor: isDark ? "#444" : "#F59E0B" }]}>
                          <Feather name="alert-circle" size={16} color={isDark ? "#FBBF24" : "#D97706"} />
                          <ThemedText style={[styles.noServicesText, { color: isDark ? "#FBBF24" : "#D97706" }]}>
                            No services available. Please add services first.
                          </ThemedText>
                        </View>
                      ) : (
                        <View style={styles.servicesGrid}>
                          {services.map((service) => (
                            <Pressable
                              key={service.id}
                              style={[
                                styles.serviceOption,
                                {
                                  backgroundColor:
                                    stageServiceId === service.id
                                      ? colors.primary
                                      : isDark
                                      ? "#2A2A2A"
                                      : "#F8F9FA",
                                  borderColor:
                                    stageServiceId === service.id
                                      ? colors.primary
                                      : isDark
                                      ? "#444"
                                      : "#E5E7EB",
                                },
                              ]}
                              onPress={() => {
                                setStageServiceId(service.id);
                                setStageError("");
                                if (!stageName) setStageName(service.name);
                              }}
                            >
                              <ThemedText
                                style={[
                                  styles.serviceOptionText,
                                  { color: stageServiceId === service.id ? "#FFFFFF" : colors.text },
                                ]}
                              >
                                {service.name}
                              </ThemedText>
                            </Pressable>
                          ))}
                        </View>
                      )}
                      {stageError ? (
                        <ThemedText style={styles.errorText}>{stageError}</ThemedText>
                      ) : null}
                    </View>

                    <View style={styles.formGroup}>
                      <ThemedText style={styles.label}>Stage Name (Override)</ThemedText>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            backgroundColor: isDark ? "#2A2A2A" : "#F8F9FA",
                            color: colors.text,
                            borderColor: isDark ? "#444" : "#E5E7EB",
                          },
                        ]}
                        value={stageName}
                        onChangeText={setStageName}
                        placeholder="Optional custom name"
                        placeholderTextColor={colors.textSecondary}
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <ThemedText style={styles.label}>Estimated Duration (minutes)</ThemedText>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            backgroundColor: isDark ? "#2A2A2A" : "#F8F9FA",
                            color: colors.text,
                            borderColor: isDark ? "#444" : "#E5E7EB",
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

                  <View style={styles.inlineStageFooter}>
                    <Button
                      title="Cancel"
                      onPress={handleCloseStageModal}
                      variant="outline"
                      style={styles.footerButton}
                    />
                    <Button
                      title={editingStageIndex !== null ? "Update Stage" : "Add Stage"}
                      onPress={handleAddStage}
                      style={styles.footerButton}
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
          <Pressable style={[styles.confirmModalContent, { backgroundColor: isDark ? "#1A1A1A" : "#FFFFFF" }]} onPress={(e) => e.stopPropagation()}>
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
          <Pressable style={[styles.confirmModalContent, { backgroundColor: isDark ? "#1A1A1A" : "#FFFFFF" }]} onPress={(e) => e.stopPropagation()}>
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
    paddingHorizontal: Spacing.md,
  },
  branchSelector: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  branchTabs: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  branchTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  branchTabText: {
    fontSize: 14,
    fontWeight: "500",
  },
  header: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 14,
  },
  emptyCard: {
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: Spacing.sm,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
  },
  createButton: {
    marginTop: Spacing.md,
  },
  journeyCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
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
  activeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  inactiveBadge: {
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
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
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
    marginTop: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  stageModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "90%",
  },
  stageModalContent: {
    width: "90%",
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 18,
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
  serviceSelector: {
    marginTop: Spacing.xs,
  },
  serviceOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  serviceOptionText: {
    fontSize: 14,
    fontWeight: "500",
  },
  modalFooter: {
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
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
    fontSize: 18,
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
    maxHeight: 300,
  },
  inlineStageFooter: {
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  servicesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
