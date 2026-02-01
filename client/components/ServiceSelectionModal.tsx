import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors, Colors } from "@/constants/theme";
import { Organization, Service, FormField } from "@/types/queue";

interface ServiceSelectionModalProps {
  visible: boolean;
  organization: Organization | null;
  onClose: () => void;
  onJoinQueue: (organizationId: string, serviceId: string, formData: Record<string, string>) => void;
}

type ModalStep = "services" | "form";

const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

export function ServiceSelectionModal({
  visible,
  organization,
  onClose,
  onJoinQueue,
}: ServiceSelectionModalProps) {
  const { theme, isDark } = useTheme();
  const [step, setStep] = useState<ModalStep>("services");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isCheckingLocation, setIsCheckingLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!visible) {
      setStep("services");
      setSelectedService(null);
      setFormData({});
      setErrors({});
      setIsSubmitting(false);
      setIsCheckingLocation(false);
    }
  }, [visible]);

  const checkLocationForService = async (service: Service): Promise<boolean> => {
    if (!service.requiresInPersonRegistration) {
      return true;
    }

    if (!organization?.location) {
      Alert.alert(
        "Location Not Available",
        "This service requires in-person registration but the branch location is not configured."
      );
      return false;
    }

    setIsCheckingLocation(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location Required",
          "This service requires you to be at the branch location. Please enable location access to continue.",
          [{ text: "OK" }]
        );
        setIsCheckingLocation(false);
        return false;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const distance = calculateDistance(
        location.coords.latitude,
        location.coords.longitude,
        organization.location.latitude,
        organization.location.longitude
      );

      const perimeter = service.inPersonPerimeterMeters || 100;

      setIsCheckingLocation(false);

      if (distance > perimeter) {
        const distanceDisplay = distance >= 1000 
          ? `${(distance / 1000).toFixed(1)} km` 
          : `${Math.round(distance)} m`;
        
        Alert.alert(
          "Too Far from Location",
          `This service requires you to be within ${perimeter}m of the branch. You are currently ${distanceDisplay} away. Please visit the branch to join this queue.`,
          [{ text: "OK" }]
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return false;
      }

      return true;
    } catch (error) {
      setIsCheckingLocation(false);
      Alert.alert(
        "Location Error",
        "Unable to get your current location. Please try again or ensure location services are enabled."
      );
      return false;
    }
  };

  if (!organization) return null;

  const handleServiceSelect = async (service: Service) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (service.requiresInPersonRegistration) {
      const withinPerimeter = await checkLocationForService(service);
      if (!withinPerimeter) {
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    
    setSelectedService(service);
    const initialFormData: Record<string, string> = {};
    service.formFields.forEach((field) => {
      initialFormData[field.id] = "";
    });
    setFormData(initialFormData);
    setErrors({});
    setStep("form");
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("services");
    setSelectedService(null);
    setFormData({});
    setErrors({});
  };

  const handleInputChange = (fieldId: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    if (!selectedService) return false;
    const newErrors: Record<string, string> = {};
    
    selectedService.formFields.forEach((field) => {
      if (field.required && !formData[field.id]?.trim()) {
        newErrors[field.id] = `${field.label} is required`;
      }
      if (field.type === "email" && formData[field.id]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData[field.id])) {
          newErrors[field.id] = "Please enter a valid email";
        }
      }
      if (field.type === "phone" && formData[field.id]) {
        const phoneRegex = /^[\d\s+()-]{8,}$/;
        if (!phoneRegex.test(formData[field.id])) {
          newErrors[field.id] = "Please enter a valid phone number";
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleJoinQueue = async () => {
    if (!validateForm() || !selectedService) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsSubmitting(true);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    onJoinQueue(organization.id, selectedService.id, formData);
    setIsSubmitting(false);
  };

  const getKeyboardType = (fieldType: FormField["type"]) => {
    switch (fieldType) {
      case "email":
        return "email-address";
      case "phone":
        return "phone-pad";
      default:
        return "default";
    }
  };

  const renderServicesList = () => (
    <>
      <View style={styles.header}>
        <View style={styles.orgIconContainer}>
          <View style={[styles.orgIcon, { backgroundColor: theme.primary + "15" }]}>
            <Feather name="briefcase" size={24} color={theme.primary} />
          </View>
        </View>
        <ThemedText type="h4" style={styles.orgName}>
          {organization.name}
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.textSecondary }}>
          {organization.description}
        </ThemedText>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <ThemedText
        type="small"
        style={[styles.sectionLabel, { color: theme.textSecondary }]}
      >
        Select a Service
      </ThemedText>

      {isCheckingLocation ? (
        <View style={styles.locationCheckingContainer}>
          <ActivityIndicator size="large" color={BrandColors.primary} />
          <ThemedText style={styles.locationCheckingText}>
            Checking your location...
          </ThemedText>
        </View>
      ) : (
        <ScrollView
          style={styles.servicesList}
          contentContainerStyle={styles.servicesContent}
          showsVerticalScrollIndicator={false}
        >
          {organization.services.map((service) => (
            <Pressable
              key={service.id}
              onPress={() => handleServiceSelect(service)}
              style={({ pressed }) => [
                styles.serviceCard,
                { backgroundColor: theme.backgroundSecondary },
                pressed && { opacity: 0.8 },
              ]}
              testID={`button-service-${service.id}`}
            >
              <View style={styles.serviceInfo}>
                <View style={styles.serviceNameRow}>
                  <ThemedText type="body" style={styles.serviceName}>
                    {service.name}
                  </ThemedText>
                  {service.requiresInPersonRegistration ? (
                    <View style={styles.inPersonBadge}>
                      <Feather name="map-pin" size={10} color={Colors.light.success} />
                      <ThemedText style={styles.inPersonBadgeText}>In-Person</ThemedText>
                    </View>
                  ) : null}
                </View>
                <View style={styles.waitBadge}>
                  <Feather name="clock" size={12} color={theme.textSecondary} />
                  <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                    ~{service.averageWaitTime} min
                  </ThemedText>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color={theme.textSecondary} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Pressable
        onPress={onClose}
        style={[styles.cancelButton, { borderColor: theme.border }]}
        testID="button-cancel-service-selection"
      >
        <ThemedText type="body" style={{ fontWeight: "600" }}>
          Cancel
        </ThemedText>
      </Pressable>
    </>
  );

  const renderForm = () => (
    <>
      <View style={styles.formHeader}>
        <Pressable onPress={handleBack} style={styles.backButton} testID="button-back-to-services">
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.formHeaderText}>
          <ThemedText type="h4" style={styles.formTitle}>
            {selectedService?.name}
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            {organization.name}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <ThemedText
        type="small"
        style={[styles.sectionLabel, { color: theme.textSecondary }]}
      >
        Enter Your Details
      </ThemedText>

      <ScrollView
        style={styles.formScroll}
        contentContainerStyle={styles.formContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {selectedService?.formFields.map((field) => (
          <View key={field.id} style={styles.inputGroup}>
            <ThemedText type="small" style={[styles.inputLabel, { color: theme.textSecondary }]}>
              {field.label} {field.required && <ThemedText style={{ color: BrandColors.primary }}>*</ThemedText>}
            </ThemedText>
            <TextInput
              style={[
                styles.textInput,
                { 
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  borderColor: errors[field.id] ? "#EF4444" : theme.border,
                },
              ]}
              placeholder={`Enter ${field.label.toLowerCase()}`}
              placeholderTextColor={theme.textSecondary}
              value={formData[field.id] || ""}
              onChangeText={(value) => handleInputChange(field.id, value)}
              keyboardType={getKeyboardType(field.type)}
              autoCapitalize={field.type === "email" ? "none" : "words"}
              testID={`input-${field.id}`}
            />
            {errors[field.id] ? (
              <ThemedText type="caption" style={styles.errorText}>
                {errors[field.id]}
              </ThemedText>
            ) : null}
          </View>
        ))}

        <View style={styles.waitTimeInfo}>
          <Feather name="clock" size={16} color={BrandColors.accent} />
          <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.sm }}>
            Estimated wait: ~{selectedService?.averageWaitTime} minutes
          </ThemedText>
        </View>
      </ScrollView>

      <View style={styles.buttonContainer}>
        <Pressable
          onPress={handleJoinQueue}
          disabled={isSubmitting}
          style={[
            styles.joinButton,
            { backgroundColor: BrandColors.primary },
            isSubmitting && { opacity: 0.7 },
          ]}
          testID="button-join-queue"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Feather name="check-circle" size={20} color="#FFFFFF" />
              <ThemedText style={styles.joinButtonText}>Join Queue</ThemedText>
            </>
          )}
        </Pressable>
      </View>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          style={styles.overlay}
        >
          <Pressable style={styles.backdrop} onPress={step === "services" ? onClose : undefined}>
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
            {step === "services" ? renderServicesList() : renderForm()}
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modal: {
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
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  orgIconContainer: {
    marginBottom: Spacing.md,
  },
  orgIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  orgName: {
    fontWeight: "700",
    marginBottom: Spacing.xs,
    textAlign: "center",
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
  servicesList: {
    maxHeight: 300,
  },
  servicesContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  serviceCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  serviceName: {
    fontWeight: "600",
  },
  inPersonBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.success + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  inPersonBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.light.success,
  },
  locationCheckingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
    gap: Spacing.md,
  },
  locationCheckingText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  waitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  cancelButton: {
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  backButton: {
    padding: Spacing.sm,
    marginRight: Spacing.md,
  },
  formHeaderText: {
    flex: 1,
  },
  formTitle: {
    fontWeight: "700",
  },
  formScroll: {
    maxHeight: 280,
  },
  formContent: {
    gap: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  inputLabel: {
    fontWeight: "600",
  },
  textInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 16,
  },
  errorText: {
    color: "#EF4444",
    marginTop: Spacing.xs,
  },
  waitTimeInfo: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  buttonContainer: {
    marginTop: Spacing.lg,
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  joinButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
});
