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
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { OrgService, InputField } from "@/types/organization";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
];

interface ServiceCardProps {
  service: OrgService;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

function ServiceCard({ service, onEdit, onDelete, onToggleActive }: ServiceCardProps) {
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut}>
      <Card style={styles.serviceCard}>
        <View style={styles.serviceHeader}>
          <View style={styles.serviceInfo}>
            <ThemedText type="body" style={styles.serviceName}>
              {service.name}
            </ThemedText>
            <View style={[
              styles.activeToggle,
              { backgroundColor: service.isActive ? Colors.light.success + "15" : "#F1F5F9" }
            ]}>
              <View style={[
                styles.activeIndicator,
                { backgroundColor: service.isActive ? Colors.light.success : Colors.light.textSecondary }
              ]} />
              <ThemedText style={[
                styles.activeText,
                { color: service.isActive ? Colors.light.success : Colors.light.textSecondary }
              ]}>
                {service.isActive ? "Active" : "Inactive"}
              </ThemedText>
            </View>
          </View>
          <Pressable style={styles.toggleButton} onPress={onToggleActive}>
            <Feather
              name={service.isActive ? "toggle-right" : "toggle-left"}
              size={28}
              color={service.isActive ? Colors.light.success : Colors.light.textSecondary}
            />
          </Pressable>
        </View>

        <ThemedText style={styles.serviceDescription}>{service.description}</ThemedText>

        <View style={styles.serviceMeta}>
          <View style={styles.metaItem}>
            <Feather name="clock" size={14} color={Colors.light.textSecondary} />
            <ThemedText style={styles.metaText}>{service.averageWaitTime} min avg</ThemedText>
          </View>
          <View style={styles.metaItem}>
            <Feather name="list" size={14} color={Colors.light.textSecondary} />
            <ThemedText style={styles.metaText}>{service.inputFields.length} fields</ThemedText>
          </View>
          <View style={styles.metaItem}>
            <Feather name="zap" size={14} color={Colors.light.textSecondary} />
            <ThemedText style={styles.metaText}>{service.estimatedDuration} min duration</ThemedText>
          </View>
        </View>

        <View style={styles.serviceActions}>
          <Pressable style={styles.editButton} onPress={onEdit}>
            <Feather name="edit-2" size={16} color={Colors.light.primary} />
            <ThemedText style={styles.editText}>Edit</ThemedText>
          </Pressable>
          <Pressable style={styles.deleteButton} onPress={onDelete}>
            <Feather name="trash-2" size={16} color={Colors.light.accent} />
          </Pressable>
        </View>
      </Card>
    </Animated.View>
  );
}

export default function OrgServicesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { organization, addService, updateService, deleteService } = useOrganization();

  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<OrgService | null>(null);
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

  const resetForm = () => {
    setServiceName("");
    setServiceDesc("");
    setAvgWait("15");
    setDuration("20");
    setInputFields([]);
    setEditingService(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (service: OrgService) => {
    setEditingService(service);
    setServiceName(service.name);
    setServiceDesc(service.description);
    setAvgWait(service.averageWaitTime.toString());
    setDuration(service.estimatedDuration.toString());
    setInputFields([...service.inputFields]);
    setShowModal(true);
  };

  const handleSaveService = async () => {
    if (!serviceName.trim()) {
      Alert.alert("Error", "Please enter a service name");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const serviceData = {
      name: serviceName,
      description: serviceDesc,
      averageWaitTime: parseInt(avgWait) || 15,
      estimatedDuration: parseInt(duration) || 20,
      isActive: editingService?.isActive ?? true,
      inputFields,
    };

    if (editingService) {
      await updateService(editingService.id, serviceData);
    } else {
      await addService(serviceData);
    }

    setShowModal(false);
    resetForm();
  };

  const handleDeleteService = (serviceId: string, serviceName: string) => {
    Alert.alert(
      "Delete Service",
      `Are you sure you want to delete "${serviceName}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await deleteService(serviceId);
          },
        },
      ]
    );
  };

  const handleToggleActive = async (service: OrgService) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateService(service.id, { isActive: !service.isActive });
  };

  const addInputField = () => {
    if (!newFieldLabel.trim()) {
      Alert.alert("Error", "Please enter a field label");
      return;
    }

    const newField: InputField = {
      id: Math.random().toString(36).substr(2, 9),
      label: newFieldLabel,
      type: newFieldType,
      required: newFieldRequired,
      options: newFieldType === "select" ? newFieldOptions.split(",").map(o => o.trim()).filter(Boolean) : undefined,
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
    setInputFields(inputFields.filter(f => f.id !== fieldId));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

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
        <View style={styles.headerRow}>
          <ThemedText type="h4">Your Services</ThemedText>
          <Button
            title="Add Service"
            onPress={openAddModal}
            size="small"
            icon={<Feather name="plus" size={16} color="#FFFFFF" />}
          />
        </View>

        {organization?.services.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="layers" size={48} color={Colors.light.textSecondary} />
            <ThemedText style={styles.emptyTitle}>No services yet</ThemedText>
            <ThemedText style={styles.emptySubtitle}>
              Add services that your customers can join the queue for
            </ThemedText>
          </View>
        ) : (
          <View style={styles.servicesList}>
            {organization?.services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onEdit={() => openEditModal(service)}
                onDelete={() => handleDeleteService(service.id, service.name)}
                onToggleActive={() => handleToggleActive(service)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <ThemedView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => { setShowModal(false); resetForm(); }}>
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

            <Pressable
              style={styles.requiredToggle}
              onPress={() => setNewFieldRequired(!newFieldRequired)}
            >
              <Feather
                name={newFieldRequired ? "check-square" : "square"}
                size={20}
                color={Colors.light.primary}
              />
              <ThemedText style={styles.requiredToggleText}>Required field</ThemedText>
            </Pressable>

            <View style={styles.fieldModalActions}>
              <Pressable
                style={styles.fieldModalCancel}
                onPress={() => setShowFieldModal(false)}
              >
                <ThemedText style={styles.fieldModalCancelText}>Cancel</ThemedText>
              </Pressable>
              <Button title="Add Field" onPress={addInputField} size="small" />
            </View>
          </View>
        </View>
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  servicesList: {
    gap: Spacing.md,
  },
  serviceCard: {
    padding: Spacing.lg,
  },
  serviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  activeToggle: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    alignSelf: "flex-start",
  },
  activeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  activeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  toggleButton: {
    padding: Spacing.xs,
  },
  serviceDescription: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: Spacing.md,
  },
  serviceMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  serviceActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: Spacing.md,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  editText: {
    color: Colors.light.primary,
    fontWeight: "600",
    fontSize: 14,
  },
  deleteButton: {
    padding: Spacing.sm,
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
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
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
    fontSize: 16,
    fontWeight: "600",
  },
  modalContent: {
    flex: 1,
    padding: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.xs,
    color: Colors.light.textSecondary,
  },
  input: {
    backgroundColor: "#F3F4F6",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 16,
    color: Colors.light.text,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
  },
  fieldsSection: {
    marginTop: Spacing.lg,
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
    fontWeight: "600",
    fontSize: 14,
  },
  noFieldsText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontStyle: "italic",
  },
  fieldsList: {
    gap: Spacing.sm,
  },
  fieldItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
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
  },
  requiredBadge: {
    fontSize: 11,
    color: Colors.light.accent,
    fontWeight: "600",
  },
  fieldModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  fieldModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: "100%",
  },
  fieldModalTitle: {
    fontWeight: "600",
    marginBottom: Spacing.lg,
    textAlign: "center",
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
  requiredToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  requiredToggleText: {
    fontSize: 14,
  },
  fieldModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.md,
  },
  fieldModalCancel: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  fieldModalCancelText: {
    color: Colors.light.textSecondary,
    fontWeight: "600",
  },
});
