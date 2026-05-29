import { logHandledError } from "@/lib/logger";
import { getApiUrl, getErrorMessage } from "@/lib/query-client";
import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Modal,
  useColorScheme,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { RequirePermission } from "@/components/RequirePermission";
import { OrgService, InputField, Branch, Desk } from "@/types/organization";
import { QRCodeModal } from "@/components/QRCodeModal";
import { JourneyManager } from "@/components/org/JourneyManager";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
];

interface BranchCardProps {
  branch: Branch;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddService: () => void;
  onEditService: (service: OrgService) => void;
  onDeleteService: (serviceId: string, serviceName: string) => void;
  onToggleServiceActive: (service: OrgService) => void;
  onShowQRCode: () => void;
  onCopyReservationLink: () => void;
  canShowQRCode: boolean;
  isDark?: boolean;
  onAddDesk: (serviceId: string, branchId: string) => void;
  onDeleteDesk: (deskId: string, serviceId: string, deskName: string) => void;
  onToggleDeskActive: (desk: Desk) => void;
  onEditDeskName: (desk: Desk) => void;
  addingDeskForServiceId: string | null;
  newDeskName: string;
  onNewDeskNameChange: (text: string) => void;
  onSubmitNewDesk: (serviceId: string, branchId: string) => void;
  onCancelAddDesk: () => void;
  editingDeskId: string | null;
  editingDeskName: string;
  onEditingDeskNameChange: (text: string) => void;
  onSubmitDeskEdit: (deskId: string) => void;
  onCancelDeskEdit: () => void;
  branchId: string;
  isMultiStage?: boolean;
}

function BranchCard({
  branch,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onAddService,
  onEditService,
  onDeleteService,
  onToggleServiceActive,
  onShowQRCode,
  onCopyReservationLink,
  canShowQRCode,
  isDark = false,
  onAddDesk,
  onDeleteDesk,
  onToggleDeskActive,
  onEditDeskName,
  addingDeskForServiceId,
  newDeskName,
  onNewDeskNameChange,
  onSubmitNewDesk,
  onCancelAddDesk,
  editingDeskId,
  editingDeskName,
  onEditingDeskNameChange,
  onSubmitDeskEdit,
  onCancelDeskEdit,
  branchId,
  isMultiStage = false,
}: BranchCardProps) {
  const colors = isDark ? Colors.dark : Colors.light;
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Animated.View entering={FadeIn}>
      <Card variant="outlined" style={styles.branchCard}>
        <View style={styles.branchHeader}>
          <Pressable style={styles.branchToggleArea} onPress={onToggle}>
            <View style={[styles.branchIconContainer, { backgroundColor: colors.primary + "15" }]}>
              <Feather name="map-pin" size={20} color={colors.primary} />
            </View>
            <View style={styles.branchInfo}>
              <ThemedText type="body" style={styles.branchName}>{branch.name}</ThemedText>
              <ThemedText style={[styles.branchAddress, { color: colors.textSecondary }]}>{branch.address}</ThemedText>
              <View style={styles.branchMeta}>
                <View style={[styles.metaChip, { backgroundColor: colors.surfaceMuted }]}>
                  <Feather name="layers" size={12} color={colors.textSecondary} />
                  <ThemedText style={[styles.metaChipText, { color: colors.textSecondary }]}>
                    {branch.services.length} service{branch.services.length !== 1 ? "s" : ""}
                  </ThemedText>
                </View>
                {branch.phone ? (
                  <View style={[styles.metaChip, { backgroundColor: colors.surfaceMuted }]}>
                    <Feather name="phone" size={12} color={colors.textSecondary} />
                    <ThemedText style={[styles.metaChipText, { color: colors.textSecondary }]}>{branch.phone}</ThemedText>
                  </View>
                ) : null}
              </View>
            </View>
            <Feather
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
          <View style={styles.branchActions}>
            {canShowQRCode ? (
              <>
                <Pressable style={styles.branchActionBtn} onPress={onCopyReservationLink}>
                  <Feather name="link" size={16} color={colors.secondary} />
                </Pressable>
                <Pressable style={styles.branchActionBtn} onPress={onShowQRCode}>
                  <Feather name="grid" size={16} color={colors.success} />
                </Pressable>
              </>
            ) : null}
            <RequirePermission permission="org.branches.edit">
              <Pressable style={styles.branchActionBtn} onPress={onEdit}>
                <Feather name="edit-2" size={16} color={colors.primary} />
              </Pressable>
            </RequirePermission>
            <RequirePermission permission="org.branches.delete">
              <Pressable style={styles.branchActionBtn} onPress={onDelete}>
                <Feather name="trash-2" size={16} color={colors.accent} />
              </Pressable>
            </RequirePermission>
          </View>
        </View>

        {isExpanded ? (
          <Animated.View entering={FadeIn} style={[styles.servicesSection, { borderTopColor: colors.border }]}>
            <View style={styles.servicesSectionHeader}>
              <ThemedText style={styles.servicesSectionTitle}>Services</ThemedText>
              <RequirePermission permission="org.services.create">
                <Pressable style={styles.addServiceBtn} onPress={onAddService}>
                  <Feather name="plus" size={14} color={colors.primary} />
                  <ThemedText style={[styles.addServiceText, { color: colors.primary }]}>Add Service</ThemedText>
                </Pressable>
              </RequirePermission>
            </View>

            {branch.services.length === 0 ? (
              <View style={[styles.noServicesState, { backgroundColor: colors.surfaceMuted }]}>
                <ThemedText style={[styles.noServicesText, { color: colors.textSecondary }]}>
                  No services in this branch yet
                </ThemedText>
              </View>
            ) : (
              <View style={styles.servicesList}>
                {branch.services.map((service) => (
                  <View key={service.id} style={[styles.serviceItem, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
                    <View style={styles.serviceItemRow}>
                      <View style={styles.serviceItemInfo}>
                        <View style={styles.serviceItemHeader}>
                          <ThemedText style={styles.serviceItemName}>{service.name}</ThemedText>
                          <View style={[
                            styles.serviceStatusBadge,
                            { backgroundColor: service.isActive ? colors.success + "15" : (colors.border) }
                          ]}>
                            <View style={[
                              styles.serviceStatusDot,
                              { backgroundColor: service.isActive ? colors.success : colors.textSecondary }
                            ]} />
                            <ThemedText style={[
                              styles.serviceStatusText,
                              { color: service.isActive ? colors.success : colors.textSecondary }
                            ]}>
                              {service.isActive ? "Active" : "Inactive"}
                            </ThemedText>
                          </View>
                        </View>
                        <ThemedText style={[styles.serviceItemDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                          {service.description}
                        </ThemedText>
                        <View style={styles.serviceItemMeta}>
                          <ThemedText style={[styles.serviceMetaText, { color: colors.textSecondary }]}>
                            {service.averageWaitTime} min wait
                          </ThemedText>
                          <ThemedText style={[styles.serviceMetaDot, { color: colors.textSecondary }]}>•</ThemedText>
                          <ThemedText style={[styles.serviceMetaText, { color: colors.textSecondary }]}>
                            {service.estimatedDuration} min duration
                          </ThemedText>
                          {service.requiresInPersonRegistration ? (
                            <>
                              <ThemedText style={[styles.serviceMetaDot, { color: colors.textSecondary }]}>•</ThemedText>
                              <View style={[styles.inPersonMetaBadge, { backgroundColor: colors.success + "15" }]}>
                                <Feather name="map-pin" size={10} color={colors.success} />
                                <ThemedText style={[styles.inPersonMetaText, { color: colors.success }]}>
                                  {service.inPersonPerimeterMeters || 100}m
                                </ThemedText>
                              </View>
                            </>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.serviceItemActions}>
                        <Pressable
                          style={[styles.serviceActionBtn, { backgroundColor: colors.surface }]}
                          onPress={() => onToggleServiceActive(service)}
                        >
                          <Feather
                            name={service.isActive ? "toggle-right" : "toggle-left"}
                            size={22}
                            color={service.isActive ? colors.success : colors.textSecondary}
                          />
                        </Pressable>
                        <RequirePermission permission="org.services.edit">
                          <Pressable
                            style={[styles.serviceActionBtn, { backgroundColor: colors.surface }]}
                            onPress={() => onEditService(service)}
                          >
                            <Feather name="edit-2" size={14} color={colors.primary} />
                          </Pressable>
                        </RequirePermission>
                        <RequirePermission permission="org.services.delete">
                          <Pressable
                            style={[styles.serviceActionBtn, { backgroundColor: colors.surface }]}
                            onPress={() => onDeleteService(service.id, service.name)}
                          >
                            <Feather name="trash-2" size={14} color={colors.accent} />
                          </Pressable>
                        </RequirePermission>
                      </View>
                    </View>

                    <View style={[styles.desksSection, { borderTopColor: colors.border }]}>
                      <View style={styles.desksSectionHeader}>
                        <View style={styles.desksTitleRow}>
                          <Feather name="monitor" size={13} color={colors.textSecondary} />
                          <ThemedText style={[styles.desksSectionTitle, { color: colors.textSecondary }]}>
                            Desks ({(service.desks || []).length})
                          </ThemedText>
                        </View>
                        <Pressable
                          style={styles.addDeskBtn}
                          onPress={() => onAddDesk(service.id, branchId)}
                        >
                          <Feather name="plus" size={12} color={colors.primary} />
                          <ThemedText style={[styles.addDeskText, { color: colors.primary }]}>Add</ThemedText>
                        </Pressable>
                      </View>

                      {addingDeskForServiceId === service.id ? (
                        <View style={[styles.addDeskForm, { backgroundColor: colors.surface }]}>
                          <TextInput
                            style={[styles.deskNameInput, { color: colors.text, borderColor: colors.borderSubtle }]}
                            value={newDeskName}
                            onChangeText={onNewDeskNameChange}
                            placeholder="Desk name (e.g. Counter 1)"
                            placeholderTextColor={colors.textSecondary}
                            autoFocus
                            onSubmitEditing={() => onSubmitNewDesk(service.id, branchId)}
                          />
                          <View style={styles.addDeskFormActions}>
                            <Pressable style={styles.deskFormCancel} onPress={onCancelAddDesk}>
                              <Feather name="x" size={16} color={colors.textSecondary} />
                            </Pressable>
                            <Pressable style={[styles.deskFormSubmit, { backgroundColor: colors.primary }]} onPress={() => onSubmitNewDesk(service.id, branchId)}>
                              <Feather name="check" size={16} color="#FFFFFF" />
                            </Pressable>
                          </View>
                        </View>
                      ) : null}

                      {(service.desks || []).map((desk) => (
                        <View key={desk.id} style={[styles.deskItem, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                          {editingDeskId === desk.id ? (
                            <View style={styles.deskEditRow}>
                              <TextInput
                                style={[styles.deskEditInput, { color: colors.text, borderColor: colors.borderSubtle }]}
                                value={editingDeskName}
                                onChangeText={onEditingDeskNameChange}
                                autoFocus
                                onSubmitEditing={() => onSubmitDeskEdit(desk.id)}
                              />
                              <Pressable style={styles.deskFormCancel} onPress={onCancelDeskEdit}>
                                <Feather name="x" size={14} color={colors.textSecondary} />
                              </Pressable>
                              <Pressable style={[styles.deskFormSubmit, { backgroundColor: colors.primary }]} onPress={() => onSubmitDeskEdit(desk.id)}>
                                <Feather name="check" size={14} color="#FFFFFF" />
                              </Pressable>
                            </View>
                          ) : (
                            <View style={styles.deskRow}>
                              <View style={styles.deskInfo}>
                                <View style={[styles.deskDot, { backgroundColor: desk.isActive ? colors.success : colors.textSecondary }]} />
                                <ThemedText style={[styles.deskName, !desk.isActive && { opacity: 0.5 }]}>{desk.name}</ThemedText>
                              </View>
                              <View style={styles.deskActions}>
                                <Pressable style={styles.deskActionBtn} onPress={() => onToggleDeskActive(desk)}>
                                  <Feather name={desk.isActive ? 'toggle-right' : 'toggle-left'} size={18} color={desk.isActive ? colors.success : colors.textSecondary} />
                                </Pressable>
                                <Pressable style={styles.deskActionBtn} onPress={() => onEditDeskName(desk)}>
                                  <Feather name="edit-2" size={12} color={colors.primary} />
                                </Pressable>
                                <Pressable style={styles.deskActionBtn} onPress={() => onDeleteDesk(desk.id, service.id, desk.name)}>
                                  <Feather name="trash-2" size={12} color={colors.accent} />
                                </Pressable>
                              </View>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {isMultiStage ? (
              <RequirePermission permission="org.journeys.view">
                <View style={[styles.journeySection, { borderTopColor: colors.border }]}>
                  <View style={styles.servicesSectionHeader}>
                    <View style={styles.journeyTitleRow}>
                      <Feather name="git-branch" size={15} color={colors.secondary} />
                      <ThemedText style={styles.servicesSectionTitle}>Customer Journeys</ThemedText>
                    </View>
                  </View>
                  <ThemedText style={[styles.journeyHint, { color: colors.textSecondary }]}>
                    Define multi-stage flows that route customers through several services in order.
                  </ThemedText>
                  <JourneyManager branchId={branchId} isDark={isDark} />
                </View>
              </RequirePermission>
            ) : null}
          </Animated.View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

export default function OrgServicesScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { organization, branches, currentUser, addBranch, updateBranch, deleteBranch, addService, updateService, deleteService, addDesk, updateDesk, deleteDesk } = useOrganization();

  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrBranch, setQRBranch] = useState<Branch | null>(null);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [branchPhone, setBranchPhone] = useState("");

  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<OrgService | null>(null);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("");
  const [serviceDesc, setServiceDesc] = useState("");
  const [avgWait, setAvgWait] = useState("15");
  const [duration, setDuration] = useState("20");
  const [inputFields, setInputFields] = useState<InputField[]>([]);
  const [requiresInPerson, setRequiresInPerson] = useState(false);
  const [inPersonPerimeter, setInPersonPerimeter] = useState("100");

  const [addingDeskForServiceId, setAddingDeskForServiceId] = useState<string | null>(null);
  const [newDeskName, setNewDeskName] = useState("");
  const [editingDeskId, setEditingDeskId] = useState<string | null>(null);
  const [editingDeskName, setEditingDeskName] = useState("");

  const [showFieldModal, setShowFieldModal] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<InputField["type"]>("text");
  const [newFieldRequired, setNewFieldRequired] = useState(true);
  const [newFieldOptions, setNewFieldOptions] = useState("");

  const resetBranchForm = () => {
    setBranchName("");
    setBranchAddress("");
    setBranchPhone("");
    setEditingBranch(null);
  };

  const resetServiceForm = () => {
    setServiceName("");
    setServiceDesc("");
    setAvgWait("15");
    setDuration("20");
    setInputFields([]);
    setEditingService(null);
    setCurrentBranchId(null);
    setRequiresInPerson(false);
    setInPersonPerimeter("100");
  };

  const openAddBranchModal = () => {
    resetBranchForm();
    setShowBranchModal(true);
  };

  const openEditBranchModal = (branch: Branch) => {
    setEditingBranch(branch);
    setBranchName(branch.name);
    setBranchAddress(branch.address);
    setBranchPhone(branch.phone || "");
    setShowBranchModal(true);
  };

  const handleSaveBranch = async () => {
    if (!branchName.trim()) {
      Alert.alert("Error", "Please enter a branch name");
      return;
    }
    if (!branchAddress.trim()) {
      Alert.alert("Error", "Please enter a branch address");
      return;
    }

    try {
      if (editingBranch) {
        await updateBranch(editingBranch.id, {
          name: branchName.trim(),
          address: branchAddress.trim(),
          phone: branchPhone.trim() || undefined,
        });
      } else {
        await addBranch({
          name: branchName.trim(),
          address: branchAddress.trim(),
          phone: branchPhone.trim() || undefined,
          isActive: true,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowBranchModal(false);
      resetBranchForm();
    } catch (error) {
      logHandledError("Error saving branch", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Couldn't save branch",
        getErrorMessage(error, "Failed to save branch. Please try again."),
      );
    }
  };

  const handleDeleteBranch = (branchId: string, branchName: string) => {
    Alert.alert(
      "Delete Branch",
      `Are you sure you want to delete "${branchName}"? All services in this branch will also be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await deleteBranch(branchId);
          },
        },
      ]
    );
  };

  const openAddServiceModal = (branchId: string) => {
    resetServiceForm();
    setCurrentBranchId(branchId);
    setShowServiceModal(true);
  };

  const openEditServiceModal = (service: OrgService, branchId: string) => {
    setEditingService(service);
    setCurrentBranchId(branchId);
    setServiceName(service.name);
    setServiceDesc(service.description);
    setAvgWait(service.averageWaitTime.toString());
    setDuration(service.estimatedDuration.toString());
    setInputFields([...service.inputFields]);
    setRequiresInPerson(service.requiresInPersonRegistration ?? false);
    setInPersonPerimeter((service.inPersonPerimeterMeters ?? 100).toString());
    setShowServiceModal(true);
  };

  const handleSaveService = async () => {
    if (!serviceName.trim()) {
      Alert.alert("Error", "Please enter a service name");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const serviceData = {
      name: serviceName.trim(),
      description: serviceDesc.trim(),
      averageWaitTime: parseInt(avgWait) || 15,
      estimatedDuration: parseInt(duration) || 20,
      inputFields,
      isActive: editingService?.isActive ?? true,
      branchId: currentBranchId || undefined,
      requiresInPersonRegistration: requiresInPerson,
      inPersonPerimeterMeters: requiresInPerson ? (parseInt(inPersonPerimeter) || 100) : undefined,
    };

    if (editingService) {
      await updateService(editingService.id, serviceData);
      const branch = branches.find((b) => b.id === currentBranchId);
      if (branch) {
        const updatedServices = branch.services.map((s) =>
          s.id === editingService.id ? { ...s, ...serviceData } : s
        );
        await updateBranch(branch.id, { services: updatedServices });
      }
    } else {
      const newService = await addService(serviceData);
      if (currentBranchId && newService) {
        const branch = branches.find((b) => b.id === currentBranchId);
        if (branch) {
          await updateBranch(branch.id, {
            services: [...branch.services, newService],
          });
        }
      }
    }

    setShowServiceModal(false);
    resetServiceForm();
  };

  const handleDeleteService = (branchId: string, serviceId: string, serviceName: string) => {
    Alert.alert(
      "Delete Service",
      `Are you sure you want to delete "${serviceName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await deleteService(serviceId);
            const branch = branches.find((b) => b.id === branchId);
            if (branch) {
              await updateBranch(branch.id, {
                services: branch.services.filter((s) => s.id !== serviceId),
              });
            }
          },
        },
      ]
    );
  };

  const handleToggleServiceActive = async (branchId: string, service: OrgService) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const updatedService = { ...service, isActive: !service.isActive };
    await updateService(service.id, { isActive: !service.isActive });
    const branch = branches.find((b) => b.id === branchId);
    if (branch) {
      await updateBranch(branch.id, {
        services: branch.services.map((s) => (s.id === service.id ? updatedService : s)),
      });
    }
  };

  const handleAddField = () => {
    if (!newFieldLabel.trim()) {
      Alert.alert("Error", "Please enter a field label");
      return;
    }

    const newField: InputField = {
      id: Math.random().toString(36).substr(2, 9),
      label: newFieldLabel,
      type: newFieldType,
      required: newFieldRequired,
      options: newFieldType === "select" ? newFieldOptions.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
    };

    setInputFields([...inputFields, newField]);
    setNewFieldLabel("");
    setNewFieldType("text");
    setNewFieldRequired(true);
    setNewFieldOptions("");
    setShowFieldModal(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const removeInputField = (fieldId: string) => {
    setInputFields(inputFields.filter((f) => f.id !== fieldId));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleAddDesk = async (serviceId: string, branchId: string) => {
    if (!newDeskName.trim()) return;
    await addDesk(serviceId, branchId, newDeskName.trim());
    setNewDeskName("");
    setAddingDeskForServiceId(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleUpdateDeskName = async (deskId: string) => {
    if (!editingDeskName.trim()) return;
    await updateDesk(deskId, { name: editingDeskName.trim() });
    setEditingDeskId(null);
    setEditingDeskName("");
  };

  const handleDeleteDesk = async (deskId: string, serviceId: string, deskName: string) => {
    Alert.alert("Delete Desk", `Are you sure you want to delete "${deskName}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await deleteDesk(deskId, serviceId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }},
    ]);
  };

  const handleToggleDeskActive = async (desk: Desk) => {
    await updateDesk(desk.id, { isActive: !desk.isActive });
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <ThemedText type="h4">Branches</ThemedText>
            <ThemedText style={styles.headerSubtitle}>
              {branches.length} branch{branches.length !== 1 ? "es" : ""}
            </ThemedText>
          </View>
          <RequirePermission permission="org.branches.create">
            <Button
              title="Add Branch"
              onPress={openAddBranchModal}
              size="small"
              icon={<Feather name="plus" size={16} color="#FFFFFF" />}
            />
          </RequirePermission>
        </View>

        {branches.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="map-pin" size={48} color={colors.textSecondary} />
            <ThemedText style={styles.emptyTitle}>No branches yet</ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Add branches to organize your services by location
            </ThemedText>
          </View>
        ) : (
          <View style={styles.branchesList}>
            {branches.map((branch) => (
              <BranchCard
                key={branch.id}
                branch={branch}
                branchId={branch.id}
                isMultiStage={
                  (branch.settings?.queueMode ?? organization?.settings?.queueMode) === "multistage"
                }
                isExpanded={expandedBranchId === branch.id}
                onToggle={() => setExpandedBranchId(expandedBranchId === branch.id ? null : branch.id)}
                onEdit={() => openEditBranchModal(branch)}
                onDelete={() => handleDeleteBranch(branch.id, branch.name)}
                onAddService={() => openAddServiceModal(branch.id)}
                onEditService={(service) => openEditServiceModal(service, branch.id)}
                onDeleteService={(serviceId, serviceName) => handleDeleteService(branch.id, serviceId, serviceName)}
                onToggleServiceActive={(service) => handleToggleServiceActive(branch.id, service)}
                onShowQRCode={() => {
                  setQRBranch(branch);
                  setShowQRModal(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
                onCopyReservationLink={async () => {
                  // Use getApiUrl() so the link uses the public HTTPS URL on
                  // Replit-hosted dev domains (port 5000 isn't externally
                  // routable; only :443 is).
                  const reservationLink = new URL(`/reserve/${branch.id}`, getApiUrl()).toString();
                  await Clipboard.setStringAsync(reservationLink);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert("Copied!", "Reservation link copied to clipboard");
                }}
                canShowQRCode={
                  !currentUser ||
                  currentUser.role === "admin" ||
                  (currentUser.role === "location_manager" && currentUser.branchId === branch.id)
                }
                isDark={isDark}
                onAddDesk={(serviceId) => {
                  setAddingDeskForServiceId(serviceId);
                  setNewDeskName("");
                }}
                onDeleteDesk={handleDeleteDesk}
                onToggleDeskActive={handleToggleDeskActive}
                onEditDeskName={(desk) => {
                  setEditingDeskId(desk.id);
                  setEditingDeskName(desk.name);
                }}
                addingDeskForServiceId={addingDeskForServiceId}
                newDeskName={newDeskName}
                onNewDeskNameChange={setNewDeskName}
                onSubmitNewDesk={handleAddDesk}
                onCancelAddDesk={() => {
                  setAddingDeskForServiceId(null);
                  setNewDeskName("");
                }}
                editingDeskId={editingDeskId}
                editingDeskName={editingDeskName}
                onEditingDeskNameChange={setEditingDeskName}
                onSubmitDeskEdit={handleUpdateDeskName}
                onCancelDeskEdit={() => {
                  setEditingDeskId(null);
                  setEditingDeskName("");
                }}
              />
            ))}
          </View>
        )}
      </KeyboardAwareScrollViewCompat>

      <Modal visible={showBranchModal} animationType="slide" presentationStyle="formSheet" transparent={false} onRequestClose={() => { setShowBranchModal(false); resetBranchForm(); }}>
        <ThemedView style={styles.modalContainer}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => { setShowBranchModal(false); resetBranchForm(); }}>
              <ThemedText style={[styles.modalCancel, { color: colors.textSecondary }]}>Cancel</ThemedText>
            </Pressable>
            <ThemedText type="body" style={styles.modalTitle}>
              {editingBranch ? "Edit Branch" : "Add Branch"}
            </ThemedText>
            <Pressable onPress={handleSaveBranch}>
              <ThemedText style={[styles.modalSave, { color: colors.primary }]}>Save</ThemedText>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Branch Name *</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, color: colors.text }]}
                value={branchName}
                onChangeText={setBranchName}
                placeholder="e.g., Main Branch - Downtown"
                placeholderTextColor={colors.mutedText}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Address *</ThemedText>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, color: colors.text }]}
                value={branchAddress}
                onChangeText={setBranchAddress}
                placeholder="Full address of this branch"
                placeholderTextColor={colors.mutedText}
                multiline
                numberOfLines={2}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Phone (Optional)</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, color: colors.text }]}
                value={branchPhone}
                onChangeText={setBranchPhone}
                placeholder="Contact phone number"
                placeholderTextColor={colors.mutedText}
                keyboardType="phone-pad"
              />
            </View>
          </KeyboardAwareScrollViewCompat>
        </ThemedView>
      </Modal>

      <Modal visible={showServiceModal} animationType="slide" presentationStyle="formSheet" transparent={false} onRequestClose={() => {}}>
        <ThemedView style={styles.modalContainer}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => { setShowServiceModal(false); resetServiceForm(); }}>
              <ThemedText style={[styles.modalCancel, { color: colors.textSecondary }]}>Cancel</ThemedText>
            </Pressable>
            <ThemedText type="body" style={styles.modalTitle}>
              {editingService ? "Edit Service" : "Add Service"}
            </ThemedText>
            <Pressable onPress={handleSaveService}>
              <ThemedText style={[styles.modalSave, { color: colors.primary }]}>Save</ThemedText>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Service Name *</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, color: colors.text }]}
                value={serviceName}
                onChangeText={setServiceName}
                placeholder="e.g., General Consultation"
                placeholderTextColor={colors.mutedText}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Description</ThemedText>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, color: colors.text }]}
                value={serviceDesc}
                onChangeText={setServiceDesc}
                placeholder="Describe what this service includes"
                placeholderTextColor={colors.mutedText}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: Spacing.sm }]}>
                <ThemedText style={styles.inputLabel}>Avg Wait (min)</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, color: colors.text }]}
                  value={avgWait}
                  onChangeText={setAvgWait}
                  placeholder="15"
                  placeholderTextColor={colors.mutedText}
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <ThemedText style={styles.inputLabel}>Duration (min)</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, color: colors.text }]}
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="20"
                  placeholderTextColor={colors.mutedText}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={[styles.inPersonSection, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}>
              <View style={styles.inPersonHeader}>
                <View style={styles.inPersonInfo}>
                  <Feather name="map-pin" size={20} color={colors.primary} />
                  <View style={styles.inPersonTextContainer}>
                    <ThemedText style={[styles.inPersonTitle, { color: colors.text }]}>In-Person Registration Only</ThemedText>
                    <ThemedText style={[styles.inPersonDesc, { color: colors.textSecondary }]}>
                      Customers must be at the branch location to join this queue
                    </ThemedText>
                  </View>
                </View>
                <Switch
                  value={requiresInPerson}
                  onValueChange={() => {
                    setRequiresInPerson(!requiresInPerson);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  trackColor={{ false: colors.border, true: colors.primary + "50" }}
                  thumbColor={requiresInPerson ? colors.primary : (isDark ? "#666" : "#F4F4F5")}
                />
              </View>

              {requiresInPerson ? (
                <View style={styles.perimeterContainer}>
                  <ThemedText style={styles.inputLabel}>Detection Perimeter (meters)</ThemedText>
                  <View style={styles.perimeterRow}>
                    <TextInput
                      style={[styles.input, styles.perimeterInput, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, color: colors.text }]}
                      value={inPersonPerimeter}
                      onChangeText={setInPersonPerimeter}
                      placeholder="100"
                      placeholderTextColor={colors.mutedText}
                      keyboardType="number-pad"
                    />
                    <ThemedText style={[styles.perimeterUnit, { color: colors.textSecondary }]}>m</ThemedText>
                  </View>
                  <ThemedText style={[styles.perimeterHint, { color: colors.textSecondary }]}>
                    Customers within {inPersonPerimeter || "100"}m of the branch can register
                  </ThemedText>
                </View>
              ) : null}
            </View>

            <View style={[styles.fieldsSection, { backgroundColor: colors.surfaceMuted }]}>
              <View style={styles.fieldsSectionHeader}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>Customer Input Fields</ThemedText>
                <Pressable style={styles.addFieldButton} onPress={() => setShowFieldModal(true)}>
                  <Feather name="plus" size={16} color={colors.primary} />
                  <ThemedText style={[styles.addFieldText, { color: colors.primary }]}>Add Field</ThemedText>
                </Pressable>
              </View>

              {inputFields.length === 0 ? (
                <ThemedText style={[styles.noFieldsText, { color: colors.textSecondary }]}>
                  No input fields added. Add fields to collect customer information.
                </ThemedText>
              ) : (
                <View style={styles.fieldsList}>
                  {inputFields.map((field) => (
                    <View key={field.id} style={[styles.fieldItem, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                      <View style={styles.fieldInfo}>
                        <ThemedText style={styles.fieldLabel}>{field.label}</ThemedText>
                        <View style={styles.fieldMeta}>
                          <ThemedText style={[styles.fieldType, { color: colors.textSecondary, backgroundColor: colors.border }]}>{field.type}</ThemedText>
                          {field.required ? (
                            <ThemedText style={[styles.requiredBadge, { backgroundColor: colors.primary + "15", color: colors.primary }]}>Required</ThemedText>
                          ) : null}
                        </View>
                      </View>
                      <Pressable onPress={() => removeInputField(field.id)}>
                        <Feather name="x" size={18} color={colors.accent} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </KeyboardAwareScrollViewCompat>

          {showFieldModal ? (
            <KeyboardAvoidingView
              style={styles.fieldModalOverlay}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
              <Pressable 
                style={styles.fieldModalBackdrop} 
                onPress={() => {
                  setShowFieldModal(false);
                  setNewFieldLabel("");
                  setNewFieldType("text");
                  setNewFieldRequired(true);
                  setNewFieldOptions("");
                }}
              />
              <Animated.View 
                entering={FadeIn.duration(200)} 
                style={[styles.fieldModalContent, { backgroundColor: colors.surface }]}
              >
                <ThemedText type="body" style={styles.fieldModalTitle}>Add Input Field</ThemedText>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.text }]}>Field Label *</ThemedText>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, color: colors.text }]}
                    value={newFieldLabel}
                    onChangeText={setNewFieldLabel}
                    placeholder="e.g., Phone Number"
                    placeholderTextColor={colors.mutedText}
                    autoFocus
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.text }]}>Field Type</ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.typeOptions}>
                      {FIELD_TYPES.map((type) => (
                        <Pressable
                          key={type.value}
                          style={[
                            styles.typeOption,
                            { backgroundColor: colors.surfaceMuted },
                            newFieldType === type.value && styles.typeOptionActive,
                          ]}
                          onPress={() => setNewFieldType(type.value as InputField["type"])}
                        >
                          <ThemedText
                            style={[
                              styles.typeOptionText,
                              { color: colors.textSecondary },
                              newFieldType === type.value && styles.typeOptionTextActive,
                            ]}
                          >
                            {type.label}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                {newFieldType === "select" ? (
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.inputLabel, { color: colors.text }]}>Options (comma separated)</ThemedText>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, color: colors.text }]}
                      value={newFieldOptions}
                      onChangeText={setNewFieldOptions}
                      placeholder="Option 1, Option 2, Option 3"
                      placeholderTextColor={colors.mutedText}
                    />
                  </View>
                ) : null}

                <View style={styles.requiredRow}>
                  <ThemedText style={[styles.inputLabel, { color: colors.text }]}>Required field</ThemedText>
                  <Pressable
                    style={[styles.toggleBtn, { backgroundColor: colors.surfaceMuted }, newFieldRequired && styles.toggleBtnActive]}
                    onPress={() => setNewFieldRequired(!newFieldRequired)}
                  >
                    <ThemedText style={[styles.toggleBtnText, { color: colors.textSecondary }, newFieldRequired && styles.toggleBtnTextActive]}>
                      {newFieldRequired ? "Yes" : "No"}
                    </ThemedText>
                  </Pressable>
                </View>

                <View style={styles.fieldModalActions}>
                  <Pressable
                    style={[styles.fieldModalCancel, { backgroundColor: colors.surfaceMuted }]}
                    onPress={() => {
                      setShowFieldModal(false);
                      setNewFieldLabel("");
                      setNewFieldType("text");
                      setNewFieldRequired(true);
                      setNewFieldOptions("");
                    }}
                  >
                    <ThemedText style={[styles.fieldModalCancelText, { color: colors.textSecondary }]}>Cancel</ThemedText>
                  </Pressable>
                  <Pressable style={styles.fieldModalAdd} onPress={handleAddField}>
                    <ThemedText style={styles.fieldModalAddText}>Add Field</ThemedText>
                  </Pressable>
                </View>
              </Animated.View>
            </KeyboardAvoidingView>
          ) : null}
        </ThemedView>
      </Modal>

      {qrBranch ? (
        <QRCodeModal
          visible={showQRModal}
          onClose={() => {
            setShowQRModal(false);
            setQRBranch(null);
          }}
          branchId={qrBranch.id}
          branchName={qrBranch.name}
          organizationName={organization?.name || "TIQKETS"}
        />
      ) : null}
    </ThemedView>
  );
}

const createStyles = (colors: typeof Colors.light) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["4xl"],
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  branchesList: {
    gap: Spacing.md,
  },
  branchCard: {
    padding: 0,
    overflow: "hidden",
  },
  branchHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.lg,
  },
  branchToggleArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  branchIconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: colors.primary + "10",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  branchInfo: {
    flex: 1,
  },
  branchName: {
    fontWeight: "600",
    marginBottom: 2,
  },
  branchAddress: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  branchMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  metaChipText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  branchActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  branchActionBtn: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  servicesSection: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    padding: Spacing.lg,
  },
  servicesSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  servicesSectionTitle: {
    fontWeight: "600",
    color: colors.textSecondary,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  journeySection: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  journeyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  journeyHint: {
    fontSize: 12,
    marginBottom: Spacing.md,
    marginTop: -Spacing.xs,
  },
  addServiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.primary + "10",
  },
  addServiceText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  noServicesState: {
    padding: Spacing.lg,
    alignItems: "center",
    backgroundColor: colors.backgroundRoot,
    borderRadius: BorderRadius.md,
  },
  noServicesText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  servicesList: {
    gap: Spacing.sm,
  },
  serviceItem: {
    backgroundColor: colors.backgroundRoot,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  serviceItemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  serviceItemInfo: {
    flex: 1,
  },
  serviceItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 2,
  },
  serviceItemName: {
    fontWeight: "600",
    fontSize: 14,
  },
  serviceStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  serviceStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  serviceStatusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  serviceItemDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  serviceItemMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  serviceMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  serviceMetaDot: {
    marginHorizontal: 6,
    color: colors.textSecondary,
  },
  inPersonMetaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  inPersonMetaText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: "500",
  },
  serviceItemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  serviceActionBtn: {
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.surface,
  },
  desksSection: {
    borderTopWidth: 1,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  desksSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  desksTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  desksSectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addDeskBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  addDeskText: {
    fontSize: 12,
    fontWeight: "500",
  },
  addDeskForm: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
    padding: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  deskNameInput: {
    flex: 1,
    fontSize: 13,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
  },
  addDeskFormActions: {
    flexDirection: "row",
    gap: 4,
  },
  deskFormCancel: {
    padding: 6,
    borderRadius: BorderRadius.sm,
  },
  deskFormSubmit: {
    padding: 6,
    borderRadius: BorderRadius.sm,
  },
  deskItem: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    marginBottom: 4,
  },
  deskRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deskEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  deskEditInput: {
    flex: 1,
    fontSize: 13,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
  },
  deskInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  deskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  deskName: {
    fontSize: 13,
    fontWeight: "500",
  },
  deskActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  deskActionBtn: {
    padding: 4,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  modalCancel: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  modalTitle: {
    fontWeight: "600",
  },
  modalSave: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 16,
  },
  modalContent: {
    flex: 1,
    padding: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontWeight: "500",
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
  },
  inPersonSection: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: colors.success + "12",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: colors.success + "33",
  },
  inPersonHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  inPersonInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  inPersonTextContainer: {
    flex: 1,
  },
  inPersonTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  inPersonDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  inPersonToggle: {
    padding: 4,
  },
  inPersonToggleActive: {},
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleTrackActive: {
    backgroundColor: colors.success,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  toggleThumbActive: {
    alignSelf: "flex-end",
  },
  perimeterContainer: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.success + "33",
  },
  perimeterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  perimeterInput: {
    flex: 1,
    maxWidth: 120,
  },
  perimeterUnit: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  perimeterHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: Spacing.xs,
    fontStyle: "italic",
  },
  fieldsSection: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: colors.backgroundRoot,
    borderRadius: BorderRadius.lg,
  },
  fieldsSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  addFieldButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addFieldText: {
    color: colors.primary,
    fontWeight: "500",
    fontSize: 14,
  },
  noFieldsText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    padding: Spacing.md,
  },
  fieldsList: {
    gap: Spacing.sm,
  },
  fieldItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  fieldInfo: {
    flex: 1,
  },
  fieldLabel: {
    fontWeight: "500",
    marginBottom: 2,
  },
  fieldMeta: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  fieldType: {
    fontSize: 12,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  requiredBadge: {
    fontSize: 12,
    color: colors.accent,
    backgroundColor: colors.accent + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  fieldModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  fieldModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  fieldModalContent: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: "100%",
  },
  fieldModalTitle: {
    fontWeight: "600",
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  typeOptions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  typeOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: colors.surfaceMuted,
  },
  typeOptionActive: {
    backgroundColor: colors.primary,
  },
  typeOptionText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  typeOptionTextActive: {
    color: colors.buttonText,
    fontWeight: "600",
  },
  requiredRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  toggleBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: colors.surfaceMuted,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
  },
  toggleBtnText: {
    fontWeight: "600",
    color: colors.textSecondary,
  },
  toggleBtnTextActive: {
    color: colors.buttonText,
  },
  fieldModalActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  fieldModalCancel: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
  },
  fieldModalCancelText: {
    fontWeight: "600",
    color: colors.textSecondary,
  },
  fieldModalAdd: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  fieldModalAddText: {
    fontWeight: "600",
    color: colors.buttonText,
  },
});
