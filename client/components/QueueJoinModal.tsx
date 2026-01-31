import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import Animated, { 
  FadeIn, 
  FadeOut, 
  SlideInDown, 
  SlideOutDown,
  FadeInUp,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { Organization, Service, FormField } from "@/types/queue";

interface QueueJoinModalProps {
  visible: boolean;
  organization: Organization | null;
  service: Service | null;
  onClose: () => void;
  onBack: () => void;
  onSuccess: (ticketNumber: string, position: number, waitTime: number) => void;
  onTrackQueue: () => void;
}

interface ConfirmationData {
  ticketNumber: string;
  position: number;
  waitTime: number;
}

export function QueueJoinModal({
  visible,
  organization,
  service,
  onClose,
  onBack,
  onSuccess,
  onTrackQueue,
}: QueueJoinModalProps) {
  const { theme, isDark } = useTheme();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible && service) {
      const initialData: Record<string, any> = {};
      service.formFields.forEach((field) => {
        if (field.type === "checkbox") {
          initialData[field.id] = false;
        } else if (field.type === "select" && field.options?.length) {
          initialData[field.id] = "";
        } else {
          initialData[field.id] = "";
        }
      });
      setFormData(initialData);
      setErrors({});
      setConfirmation(null);
    }
  }, [visible, service]);

  if (!organization || !service) return null;

  const updateField = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    service.formFields.forEach((field) => {
      if (field.required) {
        const value = formData[field.id];
        if (field.type === "checkbox") {
          if (!value) {
            newErrors[field.id] = `${field.label} is required`;
          }
        } else if (!value || (typeof value === "string" && !value.trim())) {
          newErrors[field.id] = `${field.label} is required`;
        }
      }
      if (field.type === "email" && formData[field.id]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData[field.id])) {
          newErrors[field.id] = "Please enter a valid email";
        }
      }
      if (field.type === "phone" && formData[field.id]) {
        const phoneRegex = /^[+]?[\d\s-]{7,}$/;
        if (!phoneRegex.test(formData[field.id])) {
          newErrors[field.id] = "Please enter a valid phone number";
        }
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const ticketNumber = `TQ-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const position = Math.floor(Math.random() * 8) + 1;
      const waitTime = position * service.averageWaitTime;

      setConfirmation({ ticketNumber, position, waitTime });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDone = () => {
    if (confirmation) {
      onSuccess(confirmation.ticketNumber, confirmation.position, confirmation.waitTime);
    }
    onClose();
  };

  const renderFormField = (field: FormField) => {
    const hasError = !!errors[field.id];

    switch (field.type) {
      case "text":
      case "email":
      case "phone":
        return (
          <View key={field.id} style={styles.fieldContainer}>
            <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              {field.label} {field.required && <ThemedText style={{ color: BrandColors.primary }}>*</ThemedText>}
            </ThemedText>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  borderColor: hasError ? "#EF4444" : theme.border,
                },
              ]}
              value={formData[field.id] || ""}
              onChangeText={(value) => updateField(field.id, value)}
              placeholder={`Enter ${field.label.toLowerCase()}`}
              placeholderTextColor={theme.textSecondary}
              keyboardType={
                field.type === "email" ? "email-address" : 
                field.type === "phone" ? "phone-pad" : "default"
              }
              autoCapitalize={field.type === "email" ? "none" : "sentences"}
              autoComplete={
                field.type === "email" ? "email" : 
                field.type === "phone" ? "tel" : "off"
              }
              testID={`input-${field.id}`}
            />
            {hasError ? (
              <ThemedText type="caption" style={styles.errorText}>
                {errors[field.id]}
              </ThemedText>
            ) : null}
          </View>
        );

      case "select":
        return (
          <View key={field.id} style={styles.fieldContainer}>
            <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              {field.label} {field.required && <ThemedText style={{ color: BrandColors.primary }}>*</ThemedText>}
            </ThemedText>
            <View style={styles.selectContainer}>
              {field.options?.map((option) => (
                <Pressable
                  key={option}
                  style={[
                    styles.selectOption,
                    {
                      backgroundColor: formData[field.id] === option 
                        ? BrandColors.primary + "20" 
                        : theme.backgroundSecondary,
                      borderColor: formData[field.id] === option 
                        ? BrandColors.primary 
                        : theme.border,
                    },
                  ]}
                  onPress={() => updateField(field.id, option)}
                >
                  <ThemedText
                    type="small"
                    style={{
                      color: formData[field.id] === option ? BrandColors.primary : theme.text,
                      fontWeight: formData[field.id] === option ? "600" : "400",
                    }}
                  >
                    {option}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            {hasError ? (
              <ThemedText type="caption" style={styles.errorText}>
                {errors[field.id]}
              </ThemedText>
            ) : null}
          </View>
        );

      case "checkbox":
        return (
          <Pressable
            key={field.id}
            style={styles.checkboxContainer}
            onPress={() => updateField(field.id, !formData[field.id])}
          >
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: formData[field.id] ? BrandColors.primary : "transparent",
                  borderColor: hasError ? "#EF4444" : (formData[field.id] ? BrandColors.primary : theme.border),
                },
              ]}
            >
              {formData[field.id] ? (
                <Feather name="check" size={14} color="#FFFFFF" />
              ) : null}
            </View>
            <ThemedText type="small" style={{ flex: 1, color: theme.text }}>
              {field.label} {field.required && <ThemedText style={{ color: BrandColors.primary }}>*</ThemedText>}
            </ThemedText>
          </Pressable>
        );

      default:
        return null;
    }
  };

  const renderConfirmation = () => (
    <Animated.View entering={FadeInUp.duration(300)} style={styles.confirmationContainer}>
      <View style={[styles.successIcon, { backgroundColor: "#10B981" + "20" }]}>
        <Feather name="check-circle" size={48} color="#10B981" />
      </View>
      
      <ThemedText type="h3" style={styles.confirmationTitle}>
        You're in the Queue!
      </ThemedText>
      
      <View style={[styles.ticketCard, { backgroundColor: theme.backgroundSecondary }]}>
        <ThemedText type="caption" style={{ color: theme.textSecondary }}>
          Your Ticket Number
        </ThemedText>
        <ThemedText type="h2" style={[styles.ticketNumber, { color: BrandColors.primary }]}>
          {confirmation?.ticketNumber}
        </ThemedText>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="users" size={20} color={BrandColors.secondary} />
          <ThemedText type="h4" style={styles.statValue}>
            #{confirmation?.position}
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            Position
          </ThemedText>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="clock" size={20} color={BrandColors.accent} />
          <ThemedText type="h4" style={styles.statValue}>
            ~{confirmation?.waitTime} min
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            Est. Wait
          </ThemedText>
        </View>
      </View>

      <ThemedText type="small" style={[styles.confirmationNote, { color: theme.textSecondary }]}>
        We'll notify you when it's almost your turn
      </ThemedText>

      <Pressable
        style={[styles.trackButton, { backgroundColor: BrandColors.primary }]}
        onPress={() => {
          if (confirmation) {
            onSuccess(confirmation.ticketNumber, confirmation.position, confirmation.waitTime);
          }
          onTrackQueue();
        }}
        testID="button-track-queue"
      >
        <Feather name="activity" size={20} color="#FFFFFF" />
        <ThemedText type="body" style={styles.trackButtonText}>
          Track Queue
        </ThemedText>
      </Pressable>

      <Pressable
        style={[styles.doneButton, { borderColor: theme.border }]}
        onPress={handleDone}
        testID="button-done"
      >
        <ThemedText type="body" style={{ fontWeight: "600" }}>
          Close
        </ThemedText>
      </Pressable>
    </Animated.View>
  );

  const renderForm = () => (
    <>
      <View style={styles.header}>
        <Pressable 
          onPress={onBack} 
          style={styles.backButton}
          testID="button-back"
        >
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.headerInfo}>
          <ThemedText type="h4" style={styles.serviceName}>
            {service.name}
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            {organization.name}
          </ThemedText>
        </View>
        <View style={styles.waitBadge}>
          <Feather name="clock" size={14} color={BrandColors.accent} />
          <ThemedText type="small" style={{ color: BrandColors.accent, fontWeight: "600" }}>
            ~{service.averageWaitTime} min
          </ThemedText>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <ThemedText
        type="small"
        style={[styles.sectionLabel, { color: theme.textSecondary }]}
      >
        Your Details
      </ThemedText>

      <ScrollView
        style={styles.formScroll}
        contentContainerStyle={styles.formContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {service.formFields.map(renderFormField)}
      </ScrollView>

      <Pressable
        style={[
          styles.joinButton,
          { backgroundColor: BrandColors.primary },
          isSubmitting && styles.joinButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={isSubmitting}
        testID="button-join-queue"
      >
        {isSubmitting ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <Feather name="check-circle" size={20} color="#FFFFFF" />
            <ThemedText type="body" style={styles.joinButtonText}>
              Join Queue
            </ThemedText>
          </>
        )}
      </Pressable>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={confirmation ? handleDone : onBack}
    >
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(150)}
        style={styles.overlay}
      >
        <Pressable 
          style={styles.backdrop} 
          onPress={confirmation ? handleDone : onClose}
        >
          <BlurView
            intensity={20}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
        </Pressable>

        <Animated.View
          entering={SlideInDown.duration(250)}
          exiting={SlideOutDown.duration(200)}
          style={[styles.modal, { backgroundColor: theme.backgroundDefault }]}
        >
          <View style={styles.handle} />
          
          {confirmation ? renderConfirmation() : renderForm()}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modal: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing["3xl"],
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  backButton: {
    padding: Spacing.xs,
    marginRight: Spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  serviceName: {
    fontWeight: "700",
  },
  waitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: BrandColors.accent + "15",
  },
  divider: {
    height: 1,
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontWeight: "600",
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  formScroll: {
    maxHeight: 350,
  },
  formContent: {
    gap: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  fieldContainer: {
    gap: Spacing.xs,
  },
  fieldLabel: {
    fontWeight: "500",
  },
  textInput: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    fontSize: 16,
  },
  selectContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  selectOption: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#EF4444",
    marginTop: Spacing.xs,
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.lg,
  },
  joinButtonDisabled: {
    opacity: 0.7,
  },
  joinButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  confirmationContainer: {
    alignItems: "center",
    paddingTop: Spacing.lg,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  confirmationTitle: {
    fontWeight: "700",
    marginBottom: Spacing.xl,
    textAlign: "center",
  },
  ticketCard: {
    alignItems: "center",
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    width: "100%",
    marginBottom: Spacing.lg,
  },
  ticketNumber: {
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: Spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  statValue: {
    fontWeight: "700",
  },
  confirmationNote: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  trackButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    width: "100%",
  },
  trackButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  doneButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    width: "100%",
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  doneButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
