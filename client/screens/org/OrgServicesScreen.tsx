import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { OrgService, InputField, Branch } from "@/types/organization";
import { QRCodeModal } from "@/components/QRCodeModal";

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
  canShowQRCode: boolean;
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
  canShowQRCode,
}: BranchCardProps) {
  return (
    <Animated.View entering={FadeIn} layout={Layout.springify()}>
      <Card style={styles.branchCard}>
        <Pressable style={styles.branchHeader} onPress={onToggle}>
          <View style={styles.branchIconContainer}>
            <Feather name="map-pin" size={20} color={Colors.light.primary} />
          </View>
          <View style={styles.branchInfo}>
            <ThemedText type="body" style={styles.branchName}>{branch.name}</ThemedText>
            <ThemedText style={styles.branchAddress}>{branch.address}</ThemedText>
            <View style={styles.branchMeta}>
              <View style={styles.metaChip}>
                <Feather name="layers" size={12} color={Colors.light.textSecondary} />
                <ThemedText style={styles.metaChipText}>
                  {branch.services.length} service{branch.services.length !== 1 ? "s" : ""}
                </ThemedText>
              </View>
              {branch.phone ? (
                <View style={styles.metaChip}>
                  <Feather name="phone" size={12} color={Colors.light.textSecondary} />
                  <ThemedText style={styles.metaChipText}>{branch.phone}</ThemedText>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.branchActions}>
            {canShowQRCode ? (
              <Pressable style={styles.branchActionBtn} onPress={onShowQRCode}>
                <Feather name="grid" size={16} color={Colors.light.success} />
              </Pressable>
            ) : null}
            <Pressable style={styles.branchActionBtn} onPress={onEdit}>
              <Feather name="edit-2" size={16} color={Colors.light.primary} />
            </Pressable>
            <Pressable style={styles.branchActionBtn} onPress={onDelete}>
              <Feather name="trash-2" size={16} color={Colors.light.accent} />
            </Pressable>
            <Feather
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={Colors.light.textSecondary}
            />
          </View>
        </Pressable>

        {isExpanded ? (
          <Animated.View entering={FadeIn} style={styles.servicesSection}>
            <View style={styles.servicesSectionHeader}>
              <ThemedText style={styles.servicesSectionTitle}>Services</ThemedText>
              <Pressable style={styles.addServiceBtn} onPress={onAddService}>
                <Feather name="plus" size={14} color={Colors.light.primary} />
                <ThemedText style={styles.addServiceText}>Add Service</ThemedText>
              </Pressable>
            </View>

            {branch.services.length === 0 ? (
              <View style={styles.noServicesState}>
                <ThemedText style={styles.noServicesText}>
                  No services in this branch yet
                </ThemedText>
              </View>
            ) : (
              <View style={styles.servicesList}>
                {branch.services.map((service) => (
                  <View key={service.id} style={styles.serviceItem}>
                    <View style={styles.serviceItemInfo}>
                      <View style={styles.serviceItemHeader}>
                        <ThemedText style={styles.serviceItemName}>{service.name}</ThemedText>
                        <View style={[
                          styles.serviceStatusBadge,
                          { backgroundColor: service.isActive ? Colors.light.success + "15" : "#F1F5F9" }
                        ]}>
                          <View style={[
                            styles.serviceStatusDot,
                            { backgroundColor: service.isActive ? Colors.light.success : Colors.light.textSecondary }
                          ]} />
                          <ThemedText style={[
                            styles.serviceStatusText,
                            { color: service.isActive ? Colors.light.success : Colors.light.textSecondary }
                          ]}>
                            {service.isActive ? "Active" : "Inactive"}
                          </ThemedText>
                        </View>
                      </View>
                      <ThemedText style={styles.serviceItemDesc} numberOfLines={1}>
                        {service.description}
                      </ThemedText>
                      <View style={styles.serviceItemMeta}>
                        <ThemedText style={styles.serviceMetaText}>
                          {service.averageWaitTime} min wait
                        </ThemedText>
                        <ThemedText style={styles.serviceMetaDot}>•</ThemedText>
                        <ThemedText style={styles.serviceMetaText}>
                          {service.estimatedDuration} min duration
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.serviceItemActions}>
                      <Pressable
                        style={styles.serviceActionBtn}
                        onPress={() => onToggleServiceActive(service)}
                      >
                        <Feather
                          name={service.isActive ? "toggle-right" : "toggle-left"}
                          size={22}
                          color={service.isActive ? Colors.light.success : Colors.light.textSecondary}
                        />
                      </Pressable>
                      <Pressable
                        style={styles.serviceActionBtn}
                        onPress={() => onEditService(service)}
                      >
                        <Feather name="edit-2" size={14} color={Colors.light.primary} />
                      </Pressable>
                      <Pressable
                        style={styles.serviceActionBtn}
                        onPress={() => onDeleteService(service.id, service.name)}
                      >
                        <Feather name="trash-2" size={14} color={Colors.light.accent} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

export default function OrgServicesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { organization, branches, currentUser, addBranch, updateBranch, deleteBranch, addService, updateService, deleteService } = useOrganization();

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

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

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

    setShowBranchModal(false);
    resetBranchForm();
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
        <View style={styles.headerRow}>
          <View>
            <ThemedText type="h4">Branches</ThemedText>
            <ThemedText style={styles.headerSubtitle}>
              {branches.length} branch{branches.length !== 1 ? "es" : ""}
            </ThemedText>
          </View>
          <Button
            title="Add Branch"
            onPress={openAddBranchModal}
            size="small"
            icon={<Feather name="plus" size={16} color="#FFFFFF" />}
          />
        </View>

        {branches.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="map-pin" size={48} color={Colors.light.textSecondary} />
            <ThemedText style={styles.emptyTitle}>No branches yet</ThemedText>
            <ThemedText style={styles.emptySubtitle}>
              Add branches to organize your services by location
            </ThemedText>
          </View>
        ) : (
          <View style={styles.branchesList}>
            {branches.map((branch) => (
              <BranchCard
                key={branch.id}
                branch={branch}
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
                canShowQRCode={
                  !currentUser ||
                  currentUser.role === "admin" ||
                  (currentUser.role === "location_manager" && currentUser.branchId === branch.id)
                }
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showBranchModal} animationType="slide" presentationStyle="pageSheet">
        <ThemedView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => { setShowBranchModal(false); resetBranchForm(); }}>
              <ThemedText style={styles.modalCancel}>Cancel</ThemedText>
            </Pressable>
            <ThemedText type="body" style={styles.modalTitle}>
              {editingBranch ? "Edit Branch" : "Add Branch"}
            </ThemedText>
            <Pressable onPress={handleSaveBranch}>
              <ThemedText style={styles.modalSave}>Save</ThemedText>
            </Pressable>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Branch Name *</ThemedText>
              <TextInput
                style={styles.input}
                value={branchName}
                onChangeText={setBranchName}
                placeholder="e.g., Main Branch - Downtown"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Address *</ThemedText>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={branchAddress}
                onChangeText={setBranchAddress}
                placeholder="Full address of this branch"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={2}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Phone (Optional)</ThemedText>
              <TextInput
                style={styles.input}
                value={branchPhone}
                onChangeText={setBranchPhone}
                placeholder="Contact phone number"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />
            </View>
          </ScrollView>
        </ThemedView>
      </Modal>

      <Modal visible={showServiceModal} animationType="slide" presentationStyle="pageSheet">
        <ThemedView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => { setShowServiceModal(false); resetServiceForm(); }}>
              <ThemedText style={styles.modalCancel}>Cancel</ThemedText>
            </Pressable>
            <ThemedText type="body" style={styles.modalTitle}>
              {editingService ? "Edit Service" : "Add Service"}
            </ThemedText>
            <Pressable onPress={handleSaveService}>
              <ThemedText style={styles.modalSave}>Save</ThemedText>
            </Pressable>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Service Name *</ThemedText>
              <TextInput
                style={styles.input}
                value={serviceName}
                onChangeText={setServiceName}
                placeholder="e.g., General Consultation"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Description</ThemedText>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={serviceDesc}
                onChangeText={setServiceDesc}
                placeholder="Describe what this service includes"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: Spacing.sm }]}>
                <ThemedText style={styles.inputLabel}>Avg Wait (min)</ThemedText>
                <TextInput
                  style={styles.input}
                  value={avgWait}
                  onChangeText={setAvgWait}
                  placeholder="15"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <ThemedText style={styles.inputLabel}>Duration (min)</ThemedText>
                <TextInput
                  style={styles.input}
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="20"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={styles.fieldsSection}>
              <View style={styles.fieldsSectionHeader}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>Customer Input Fields</ThemedText>
                <Pressable style={styles.addFieldButton} onPress={() => setShowFieldModal(true)}>
                  <Feather name="plus" size={16} color={Colors.light.primary} />
                  <ThemedText style={styles.addFieldText}>Add Field</ThemedText>
                </Pressable>
              </View>

              {inputFields.length === 0 ? (
                <ThemedText style={styles.noFieldsText}>
                  No input fields added. Add fields to collect customer information.
                </ThemedText>
              ) : (
                <View style={styles.fieldsList}>
                  {inputFields.map((field) => (
                    <View key={field.id} style={styles.fieldItem}>
                      <View style={styles.fieldInfo}>
                        <ThemedText style={styles.fieldLabel}>{field.label}</ThemedText>
                        <View style={styles.fieldMeta}>
                          <ThemedText style={styles.fieldType}>{field.type}</ThemedText>
                          {field.required ? (
                            <ThemedText style={styles.requiredBadge}>Required</ThemedText>
                          ) : null}
                        </View>
                      </View>
                      <Pressable onPress={() => removeInputField(field.id)}>
                        <Feather name="x" size={18} color={Colors.light.accent} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        </ThemedView>
      </Modal>

      <Modal visible={showFieldModal} animationType="fade" transparent>
        <View style={styles.fieldModalOverlay}>
          <View style={styles.fieldModalContent}>
            <ThemedText type="body" style={styles.fieldModalTitle}>Add Input Field</ThemedText>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Field Label *</ThemedText>
              <TextInput
                style={styles.input}
                value={newFieldLabel}
                onChangeText={setNewFieldLabel}
                placeholder="e.g., Phone Number"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Field Type</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.typeOptions}>
                  {FIELD_TYPES.map((type) => (
                    <Pressable
                      key={type.value}
                      style={[
                        styles.typeOption,
                        newFieldType === type.value && styles.typeOptionActive,
                      ]}
                      onPress={() => setNewFieldType(type.value as InputField["type"])}
                    >
                      <ThemedText
                        style={[
                          styles.typeOptionText,
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
                <ThemedText style={styles.inputLabel}>Options (comma separated)</ThemedText>
                <TextInput
                  style={styles.input}
                  value={newFieldOptions}
                  onChangeText={setNewFieldOptions}
                  placeholder="Option 1, Option 2, Option 3"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            ) : null}

            <View style={styles.requiredRow}>
              <ThemedText style={styles.inputLabel}>Required field</ThemedText>
              <Pressable
                style={[styles.toggleBtn, newFieldRequired && styles.toggleBtnActive]}
                onPress={() => setNewFieldRequired(!newFieldRequired)}
              >
                <ThemedText style={[styles.toggleBtnText, newFieldRequired && styles.toggleBtnTextActive]}>
                  {newFieldRequired ? "Yes" : "No"}
                </ThemedText>
              </Pressable>
            </View>

            <View style={styles.fieldModalActions}>
              <Pressable
                style={styles.fieldModalCancel}
                onPress={() => {
                  setShowFieldModal(false);
                  setNewFieldLabel("");
                  setNewFieldType("text");
                  setNewFieldRequired(true);
                  setNewFieldOptions("");
                }}
              >
                <ThemedText style={styles.fieldModalCancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable style={styles.fieldModalAdd} onPress={handleAddField}>
                <ThemedText style={styles.fieldModalAddText}>Add Field</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
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
    color: Colors.light.textSecondary,
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
  branchIconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.light.primary + "10",
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
    color: Colors.light.textSecondary,
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
    backgroundColor: "#F1F5F9",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  metaChipText: {
    fontSize: 11,
    color: Colors.light.textSecondary,
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
    borderTopColor: "#F1F5F9",
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
    color: Colors.light.textSecondary,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addServiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.light.primary + "10",
  },
  addServiceText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.light.primary,
  },
  noServicesState: {
    padding: Spacing.lg,
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: BorderRadius.md,
  },
  noServicesText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  servicesList: {
    gap: Spacing.sm,
  },
  serviceItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
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
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  serviceItemMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  serviceMetaText: {
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  serviceMetaDot: {
    marginHorizontal: 6,
    color: Colors.light.textSecondary,
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
    backgroundColor: "#FFFFFF",
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
    borderBottomColor: "#F1F5F9",
  },
  modalCancel: {
    color: Colors.light.textSecondary,
    fontSize: 16,
  },
  modalTitle: {
    fontWeight: "600",
  },
  modalSave: {
    color: Colors.light.primary,
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
    borderColor: "#E5E7EB",
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
  fieldsSection: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: "#F8FAFC",
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
    color: Colors.light.primary,
    fontWeight: "500",
    fontSize: 14,
  },
  noFieldsText: {
    color: Colors.light.textSecondary,
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
    backgroundColor: "#FFFFFF",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
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
    color: Colors.light.textSecondary,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  requiredBadge: {
    fontSize: 12,
    color: Colors.light.accent,
    backgroundColor: Colors.light.accent + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  fieldModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  fieldModalContent: {
    backgroundColor: "#FFFFFF",
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
    backgroundColor: "#F1F5F9",
  },
  typeOptionActive: {
    backgroundColor: Colors.light.primary,
  },
  typeOptionText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  typeOptionTextActive: {
    color: "#FFFFFF",
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
    backgroundColor: "#F1F5F9",
  },
  toggleBtnActive: {
    backgroundColor: Colors.light.primary,
  },
  toggleBtnText: {
    fontWeight: "600",
    color: Colors.light.textSecondary,
  },
  toggleBtnTextActive: {
    color: "#FFFFFF",
  },
  fieldModalActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  fieldModalCancel: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  fieldModalCancelText: {
    fontWeight: "600",
    color: Colors.light.textSecondary,
  },
  fieldModalAdd: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
  },
  fieldModalAddText: {
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
