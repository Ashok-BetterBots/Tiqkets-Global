import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Switch,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Organization, Service } from "@/types/queue";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, "JoinQueue">;

const MOCK_ORGANIZATIONS: Organization[] = [
  {
    id: "org_1",
    name: "City Hospital",
    description: "Healthcare services",
    services: [
      { id: "svc_1", name: "General Consultation", description: "", averageWaitTime: 15, formFields: [] },
      { id: "svc_2", name: "Lab Tests", description: "", averageWaitTime: 10, formFields: [] },
      { id: "svc_3", name: "Pharmacy", description: "", averageWaitTime: 5, formFields: [] },
    ],
  },
  {
    id: "org_2",
    name: "National Bank",
    description: "Banking services",
    services: [
      { id: "svc_4", name: "Account Services", description: "", averageWaitTime: 12, formFields: [] },
      { id: "svc_5", name: "Loans", description: "", averageWaitTime: 20, formFields: [] },
      { id: "svc_6", name: "Customer Support", description: "", averageWaitTime: 8, formFields: [] },
    ],
  },
  {
    id: "org_3",
    name: "DMV Office",
    description: "Government services",
    services: [
      { id: "svc_7", name: "License Renewal", description: "", averageWaitTime: 25, formFields: [] },
      { id: "svc_8", name: "Vehicle Registration", description: "", averageWaitTime: 30, formFields: [] },
    ],
  },
];

export default function JoinQueueScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { theme } = useTheme();
  const { joinQueue } = useQueue();

  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [inAppNotif, setInAppNotif] = useState(true);
  const [whatsAppNotif, setWhatsAppNotif] = useState(false);
  const [smsNotif, setSmsNotif] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = selectedOrg && selectedService && name.trim();

  const handleJoin = async () => {
    if (!canSubmit || !selectedOrg || !selectedService) return;

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await joinQueue({
        organizationId: selectedOrg.id,
        organizationName: selectedOrg.name,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        formData: { name, phone, reason },
        notificationPreferences: {
          inApp: inAppNotif,
          whatsApp: whatsAppNotif,
          sms: smsNotif,
        },
      });
      navigation.goBack();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + Spacing.xl },
      ]}
    >
      <Animated.View entering={FadeInDown.springify()}>
        <ThemedText
          type="small"
          style={[styles.sectionLabel, { color: theme.textSecondary }]}
        >
          Select Organization
        </ThemedText>
        <View style={styles.orgList}>
          {MOCK_ORGANIZATIONS.map((org) => (
            <Pressable
              key={org.id}
              onPress={() => {
                setSelectedOrg(org);
                setSelectedService(null);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={[
                styles.orgCard,
                { backgroundColor: theme.backgroundDefault },
                selectedOrg?.id === org.id && { borderColor: theme.primary, borderWidth: 2 },
              ]}
            >
              <ThemedText type="body" style={styles.orgName}>
                {org.name}
              </ThemedText>
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                {org.description}
              </ThemedText>
              {selectedOrg?.id === org.id && (
                <View style={[styles.checkmark, { backgroundColor: theme.primary }]}>
                  <Feather name="check" size={14} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </Animated.View>

      {selectedOrg ? (
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <ThemedText
            type="small"
            style={[styles.sectionLabel, { color: theme.textSecondary }]}
          >
            Select Service
          </ThemedText>
          <View style={styles.serviceList}>
            {selectedOrg.services.map((service) => (
              <Pressable
                key={service.id}
                onPress={() => {
                  setSelectedService(service);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={[
                  styles.serviceCard,
                  { backgroundColor: theme.backgroundDefault },
                  selectedService?.id === service.id && { borderColor: theme.primary, borderWidth: 2 },
                ]}
              >
                <View style={styles.serviceInfo}>
                  <ThemedText type="body" style={styles.serviceName}>
                    {service.name}
                  </ThemedText>
                  <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                    ~{service.averageWaitTime} min avg wait
                  </ThemedText>
                </View>
                {selectedService?.id === service.id && (
                  <Feather name="check-circle" size={20} color={theme.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </Animated.View>
      ) : null}

      {selectedService ? (
        <Animated.View entering={FadeInDown.delay(150).springify()}>
          <ThemedText
            type="small"
            style={[styles.sectionLabel, { color: theme.textSecondary }]}
          >
            Your Details
          </ThemedText>
          <View style={[styles.formSection, { backgroundColor: theme.backgroundDefault }]}>
            <TextInput
              placeholder="Full Name *"
              placeholderTextColor={theme.textSecondary}
              value={name}
              onChangeText={setName}
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            />
            <TextInput
              placeholder="Phone Number"
              placeholderTextColor={theme.textSecondary}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            />
            <TextInput
              placeholder="Reason for Visit (Optional)"
              placeholderTextColor={theme.textSecondary}
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
              style={[
                styles.input,
                styles.textArea,
                { color: theme.text, borderColor: theme.border },
              ]}
            />
          </View>

          <ThemedText
            type="small"
            style={[styles.sectionLabel, { color: theme.textSecondary }]}
          >
            Notification Preferences
          </ThemedText>
          <View style={[styles.formSection, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.toggleRow}>
              <ThemedText type="body">In-App Notifications</ThemedText>
              <Switch
                value={inAppNotif}
                onValueChange={setInAppNotif}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={styles.toggleRow}>
              <ThemedText type="body">WhatsApp Notifications</ThemedText>
              <Switch
                value={whatsAppNotif}
                onValueChange={setWhatsAppNotif}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={styles.toggleRow}>
              <ThemedText type="body">SMS Notifications</ThemedText>
              <Switch
                value={smsNotif}
                onValueChange={setSmsNotif}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          <Button
            onPress={handleJoin}
            disabled={!canSubmit || isSubmitting}
            style={styles.submitButton}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              "Join Queue"
            )}
          </Button>
        </Animated.View>
      ) : null}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  sectionLabel: {
    fontWeight: "600",
    marginBottom: Spacing.sm,
    marginTop: Spacing.xl,
  },
  orgList: {
    gap: Spacing.md,
  },
  orgCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    position: "relative",
  },
  orgName: {
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  checkmark: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceList: {
    gap: Spacing.sm,
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
  serviceName: {
    fontWeight: "500",
    marginBottom: 2,
  },
  formSection: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  input: {
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    paddingTop: Spacing.md,
    textAlignVertical: "top",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  submitButton: {
    marginTop: Spacing["2xl"],
  },
});
