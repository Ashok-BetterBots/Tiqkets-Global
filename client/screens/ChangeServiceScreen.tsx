import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { EmptyState } from "@/components/EmptyState";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { Spacing, BorderRadius } from "@/constants/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type InputFieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "select"
  | "checkbox"
  | "date";

interface InputField {
  id: string;
  label: string;
  type: InputFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

interface BranchServiceFromApi {
  id: string;
  name: string;
  avgWaitTime?: number;
  inputFields?: InputField[];
  currentQueue?: number;
  queueStatus?: string;
}

interface SelectableService {
  id: string;
  name: string;
  description: string;
  averageWaitTime: number;
  inputFields: InputField[];
}

function normalizeFields(raw: any): InputField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f) => f && typeof f === "object" && f.id && f.label)
    .map((f) => ({
      id: String(f.id),
      label: String(f.label),
      type: (f.type as InputFieldType) || "text",
      required: !!f.required,
      placeholder: f.placeholder,
      options: Array.isArray(f.options) ? f.options.map((o: any) => String(o)) : undefined,
    }));
}

function ServiceCard({
  service,
  isSelected,
  onSelect,
}: {
  service: SelectableService;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const handlePressIn = () => {
    scale.value = withSpring(0.98);
  };
  const handlePressOut = () => {
    scale.value = withSpring(1);
  };
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onSelect}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.serviceCard,
        { backgroundColor: theme.backgroundDefault },
        isSelected && { borderColor: theme.primary, borderWidth: 2 },
        animatedStyle,
      ]}
      testID={`service-option-${service.id}`}
    >
      <View style={styles.serviceInfo}>
        <ThemedText type="body" style={styles.serviceName}>
          {service.name}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {service.description}
        </ThemedText>
        <View style={styles.waitInfo}>
          <Feather name="clock" size={12} color={theme.textSecondary} />
          <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: 4 }}>
            ~{service.averageWaitTime} min wait
          </ThemedText>
        </View>
      </View>
      {isSelected ? (
        <View style={[styles.checkCircle, { backgroundColor: theme.primary }]}>
          <Feather name="check" size={16} color="#FFFFFF" />
        </View>
      ) : (
        <View style={[styles.radioCircle, { borderColor: theme.border }]} />
      )}
    </AnimatedPressable>
  );
}

function getKeyboardType(type: InputFieldType) {
  if (type === "email") return "email-address" as const;
  if (type === "phone") return "phone-pad" as const;
  if (type === "number") return "number-pad" as const;
  return "default" as const;
}

export default function ChangeServiceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { activeQueue, changeService } = useQueue();

  const [selectedService, setSelectedService] = useState<SelectableService | null>(null);
  const [step, setStep] = useState<"select" | "form">("select");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  // The mobile joinQueue convention stores the branchId under organizationId
  // (the public /api/join/:branchId endpoint takes a branchId in the URL but
  // the client param was named organizationId). We use the same value here.
  const branchId = activeQueue?.organizationId;
  const branchInfoQuery = useQuery<{ services?: BranchServiceFromApi[] }>({
    queryKey: ["/api/join", branchId],
    enabled: !!branchId,
  });

  const availableServices = useMemo<SelectableService[]>(() => {
    const all = branchInfoQuery.data?.services || [];
    return all
      .filter((s) => s.id !== activeQueue?.serviceId && s.queueStatus !== "ended")
      .map((s) => ({
        id: s.id,
        name: s.name,
        description:
          s.queueStatus === "paused"
            ? "Paused — try later"
            : `${s.currentQueue ?? 0} waiting now`,
        averageWaitTime: s.avgWaitTime ?? 0,
        inputFields: normalizeFields(s.inputFields),
      }));
  }, [branchInfoQuery.data?.services, activeQueue?.serviceId]);

  const handleSelectService = (service: SelectableService) => {
    if (service.id === activeQueue?.serviceId) return;
    setSelectedService(service);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleFieldChange = (id: string, value: string) => {
    setFormData((p) => ({ ...p, [id]: value }));
    if (formErrors[id]) setFormErrors((p) => ({ ...p, [id]: "" }));
  };

  const validateForm = (svc: SelectableService): boolean => {
    const errs: Record<string, string> = {};
    svc.inputFields.forEach((f) => {
      const val = formData[f.id];
      if (f.required) {
        if (f.type === "checkbox") {
          if (val !== "true") errs[f.id] = `${f.label} is required`;
        } else if (!val || !val.trim()) {
          errs[f.id] = `${f.label} is required`;
        }
      }
      if (val && f.type === "email") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) errs[f.id] = "Please enter a valid email";
      }
      if (val && f.type === "phone") {
        if (!/^[\d\s+()-]{8,}$/.test(val)) errs[f.id] = "Please enter a valid phone number";
      }
      if (val && f.type === "number") {
        const n = Number(val);
        if (!Number.isFinite(n) || !/^\d+$/.test(val.trim())) {
          errs[f.id] = `${f.label} must be a number`;
        }
      }
    });
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const performChange = async (svc: SelectableService, payload: Record<string, any>) => {
    setIsChanging(true);
    try {
      await changeService(svc.id, svc.name, payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Could not change service", e?.message || "Please try again.");
    } finally {
      setIsChanging(false);
    }
  };

  const handleProceedFromSelect = () => {
    if (!selectedService) return;
    if (selectedService.inputFields.length > 0) {
      // Initialise empty values so dropdowns/checkboxes render correctly.
      const initial: Record<string, string> = {};
      selectedService.inputFields.forEach((f) => {
        initial[f.id] = "";
      });
      setFormData(initial);
      setFormErrors({});
      setStep("form");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    Alert.alert(
      "Change Service",
      `Switch to ${selectedService.name}? You'll be placed in a new queue position.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => performChange(selectedService, {}),
        },
      ],
    );
  };

  const handleSubmitForm = () => {
    if (!selectedService) return;
    if (!validateForm(selectedService)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    // Coerce checkbox values to booleans for the server payload.
    const payload: Record<string, any> = {};
    selectedService.inputFields.forEach((f) => {
      const v = formData[f.id];
      if (f.type === "checkbox") payload[f.id] = v === "true";
      else if (v !== undefined) payload[f.id] = v;
    });
    performChange(selectedService, payload);
  };

  const renderField = (field: InputField) => {
    const errorMsg = formErrors[field.id];
    const labelNode = (
      <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
        {field.label}
        {field.required ? " *" : ""}
      </ThemedText>
    );

    if (field.type === "select" && field.options && field.options.length > 0) {
      const isOpen = openDropdownId === field.id;
      const value = formData[field.id] || "";
      return (
        <View key={field.id} style={styles.fieldWrapper}>
          {labelNode}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setOpenDropdownId(isOpen ? null : field.id);
            }}
            style={[
              styles.textInput,
              styles.dropdownTrigger,
              {
                backgroundColor: theme.surface,
                borderColor: errorMsg ? "#EF4444" : isOpen ? theme.primary : theme.borderSubtle,
              },
            ]}
            testID={`dropdown-${field.id}`}
          >
            <ThemedText
              type="body"
              style={{ color: value ? theme.text : theme.textSecondary, flex: 1 }}
            >
              {value || `Select ${field.label.toLowerCase()}`}
            </ThemedText>
            <Feather
              name={isOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={theme.textSecondary}
            />
          </Pressable>
          {isOpen ? (
            <View
              style={[
                styles.dropdownList,
                { backgroundColor: theme.surface, borderColor: theme.borderSubtle },
              ]}
            >
              {field.options.map((opt, idx) => (
                <Pressable
                  key={`${field.id}-${idx}`}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleFieldChange(field.id, opt);
                    setOpenDropdownId(null);
                  }}
                  style={[
                    styles.dropdownOption,
                    value === opt ? { backgroundColor: theme.primary + "15" } : null,
                    idx < field.options!.length - 1
                      ? {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: theme.borderSubtle,
                        }
                      : null,
                  ]}
                  testID={`option-${field.id}-${idx}`}
                >
                  <ThemedText
                    type="body"
                    style={{ color: value === opt ? theme.primary : theme.text }}
                  >
                    {opt}
                  </ThemedText>
                  {value === opt ? (
                    <Feather name="check" size={16} color={theme.primary} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          {errorMsg ? (
            <ThemedText type="caption" style={styles.fieldError}>
              {errorMsg}
            </ThemedText>
          ) : null}
        </View>
      );
    }

    if (field.type === "checkbox") {
      const checked = formData[field.id] === "true";
      return (
        <View key={field.id} style={styles.fieldWrapper}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleFieldChange(field.id, checked ? "false" : "true");
            }}
            style={styles.checkboxRow}
            testID={`checkbox-${field.id}`}
          >
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: checked ? theme.primary : "transparent",
                  borderColor: errorMsg
                    ? "#EF4444"
                    : checked
                      ? theme.primary
                      : theme.borderSubtle,
                },
              ]}
            >
              {checked ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
            </View>
            <ThemedText type="body" style={{ flex: 1 }}>
              {field.label}
              {field.required ? " *" : ""}
            </ThemedText>
          </Pressable>
          {errorMsg ? (
            <ThemedText type="caption" style={styles.fieldError}>
              {errorMsg}
            </ThemedText>
          ) : null}
        </View>
      );
    }

    return (
      <View key={field.id} style={styles.fieldWrapper}>
        {labelNode}
        <TextInput
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
          placeholderTextColor={theme.textSecondary}
          value={formData[field.id] || ""}
          onChangeText={(t) => handleFieldChange(field.id, t)}
          keyboardType={getKeyboardType(field.type)}
          autoCapitalize={field.type === "email" ? "none" : "sentences"}
          style={[
            styles.textInput,
            {
              color: theme.text,
              borderColor: errorMsg ? "#EF4444" : theme.borderSubtle,
              backgroundColor: theme.surface,
            },
          ]}
          testID={`input-${field.id}`}
        />
        {errorMsg ? (
          <ThemedText type="caption" style={styles.fieldError}>
            {errorMsg}
          </ThemedText>
        ) : null}
      </View>
    );
  };

  if (!activeQueue) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <EmptyState
          image={require("../../assets/images/empty-queue.png")}
          title="Not in a Queue"
          description="You need to be in a queue to change services."
        />
      </View>
    );
  }

  if (branchInfoQuery.isLoading) {
    return (
      <View
        style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}
      >
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (branchInfoQuery.isError) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <EmptyState
          image={require("../../assets/images/empty-queue.png")}
          title="Couldn't load services"
          description="Please check your connection and try again."
        />
      </View>
    );
  }

  // Step 2 — collect input fields for the newly chosen service.
  if (step === "form" && selectedService) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <KeyboardAwareScrollViewCompat
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + Spacing["2xl"] + Spacing.buttonHeight },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => {
              setStep("select");
              setOpenDropdownId(null);
            }}
            style={styles.backRow}
            testID="button-back-to-select"
          >
            <Feather name="chevron-left" size={18} color={theme.primary} />
            <ThemedText type="body" style={{ color: theme.primary, marginLeft: 4 }}>
              Choose a different service
            </ThemedText>
          </Pressable>

          <View
            style={[styles.currentService, { backgroundColor: theme.backgroundDefault }]}
          >
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              Switching to
            </ThemedText>
            <ThemedText type="h4">{selectedService.name}</ThemedText>
            <View style={styles.waitInfo}>
              <Feather name="clock" size={12} color={theme.textSecondary} />
              <ThemedText
                type="caption"
                style={{ color: theme.textSecondary, marginLeft: 4 }}
              >
                ~{selectedService.averageWaitTime} min wait
              </ThemedText>
            </View>
          </View>

          <ThemedText
            type="body"
            style={[styles.subtitle, { color: theme.textSecondary }]}
          >
            This service needs a few details before you can join its queue.
          </ThemedText>

          {selectedService.inputFields.map((f) => renderField(f))}
        </KeyboardAwareScrollViewCompat>

        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.backgroundRoot,
              paddingBottom: insets.bottom + Spacing.lg,
            },
          ]}
        >
          <Pressable
            onPress={handleSubmitForm}
            disabled={isChanging}
            style={[
              styles.confirmButton,
              { backgroundColor: theme.primary },
              isChanging && { opacity: 0.5 },
            ]}
            testID="button-submit-change-service-form"
          >
            {isChanging ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Feather name="refresh-cw" size={18} color="#FFFFFF" />
                <ThemedText
                  type="body"
                  style={{ fontWeight: "600", marginLeft: Spacing.sm }}
                  lightColor="#FFFFFF"
                  darkColor="#FFFFFF"
                >
                  Switch to {selectedService.name}
                </ThemedText>
              </>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  if (availableServices.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <EmptyState
          image={require("../../assets/images/empty-queue.png")}
          title="No other services"
          description="There are no other services available at this branch right now."
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        data={availableServices}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
            <ServiceCard
              service={item}
              isSelected={selectedService?.id === item.id}
              onSelect={() => handleSelectService(item)}
            />
          </Animated.View>
        )}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View
              style={[styles.currentService, { backgroundColor: theme.backgroundDefault }]}
            >
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                Current Service
              </ThemedText>
              <ThemedText type="h4">{activeQueue.serviceName}</ThemedText>
            </View>
            <ThemedText
              type="body"
              style={[styles.subtitle, { color: theme.textSecondary }]}
            >
              Select a new service to join its queue:
            </ThemedText>
          </View>
        }
      />

      {selectedService ? (
        <Animated.View
          entering={FadeInDown.springify()}
          style={[
            styles.footer,
            {
              backgroundColor: theme.backgroundRoot,
              paddingBottom: insets.bottom + Spacing.lg,
            },
          ]}
        >
          <Pressable
            onPress={handleProceedFromSelect}
            disabled={isChanging}
            style={[
              styles.confirmButton,
              { backgroundColor: theme.primary },
              isChanging && { opacity: 0.5 },
            ]}
            testID="button-proceed-change-service"
          >
            <Feather
              name={selectedService.inputFields.length > 0 ? "arrow-right" : "refresh-cw"}
              size={18}
              color="#FFFFFF"
            />
            <ThemedText
              type="body"
              style={{ fontWeight: "600", marginLeft: Spacing.sm }}
              lightColor="#FFFFFF"
              darkColor="#FFFFFF"
            >
              {selectedService.inputFields.length > 0
                ? `Continue to ${selectedService.name}`
                : `Switch to ${selectedService.name}`}
            </ThemedText>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  currentService: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  subtitle: {
    marginBottom: Spacing.md,
  },
  serviceCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontWeight: "600",
    marginBottom: 2,
  },
  waitInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.sm,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  fieldWrapper: {
    marginBottom: Spacing.md,
  },
  label: {
    marginBottom: Spacing.xs,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
  },
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
  },
  dropdownList: {
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldError: {
    color: "#EF4444",
    marginTop: Spacing.xs,
  },
});
