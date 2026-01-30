import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { ServiceSelectionModal } from "@/components/ServiceSelectionModal";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { useAuth } from "@/contexts/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Organization, Service } from "@/types/queue";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

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
  {
    id: "org_4",
    name: "Tech Support Center",
    description: "IT support services",
    services: [
      { id: "svc_9", name: "Hardware Repair", description: "", averageWaitTime: 20, formFields: [] },
      { id: "svc_10", name: "Software Help", description: "", averageWaitTime: 15, formFields: [] },
    ],
  },
  {
    id: "org_5",
    name: "City Utilities",
    description: "Utility services",
    services: [
      { id: "svc_11", name: "Bill Payment", description: "", averageWaitTime: 8, formFields: [] },
      { id: "svc_12", name: "New Connection", description: "", averageWaitTime: 25, formFields: [] },
    ],
  },
];

export default function JoinQueueScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const { joinQueue } = useQueue();
  const { user } = useAuth();

  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [tempOrg, setTempOrg] = useState<Organization | null>(null);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = selectedOrg && selectedService && name.trim();

  const handleOrgPress = (org: Organization) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempOrg(org);
    setShowServiceModal(true);
  };

  const handleServiceSelect = (service: Service) => {
    if (tempOrg) {
      setSelectedOrg(tempOrg);
      setSelectedService(service);
    }
    setShowServiceModal(false);
  };

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
          inApp: true,
          whatsApp: false,
          sms: false,
        },
      });
      navigation.goBack();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <KeyboardAwareScrollViewCompat
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
      >
        {selectedOrg && selectedService ? (
          <Animated.View entering={FadeInDown.springify()}>
            <View style={[styles.selectedCard, { backgroundColor: theme.backgroundDefault }]}>
              <View style={styles.selectedInfo}>
                <View style={[styles.selectedIcon, { backgroundColor: theme.primary + "15" }]}>
                  <Feather name="briefcase" size={20} color={theme.primary} />
                </View>
                <View style={styles.selectedText}>
                  <ThemedText type="body" style={styles.selectedOrg}>
                    {selectedOrg.name}
                  </ThemedText>
                  <ThemedText type="caption" style={{ color: theme.primary }}>
                    {selectedService.name}
                  </ThemedText>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  setSelectedOrg(null);
                  setSelectedService(null);
                }}
                style={[styles.changeButton, { backgroundColor: theme.backgroundSecondary }]}
              >
                <ThemedText type="caption" style={{ fontWeight: "600" }}>
                  Change
                </ThemedText>
              </Pressable>
            </View>

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
        ) : (
          <Animated.View entering={FadeInDown.springify()}>
            <ThemedText
              type="small"
              style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: 0 }]}
            >
              Select Organization
            </ThemedText>
            <View style={styles.orgList}>
              {MOCK_ORGANIZATIONS.map((org) => (
                <Pressable
                  key={org.id}
                  onPress={() => handleOrgPress(org)}
                  style={({ pressed }) => [
                    styles.orgCard,
                    { backgroundColor: theme.backgroundDefault },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <View style={[styles.orgIconSmall, { backgroundColor: theme.primary + "10" }]}>
                    <Feather name="briefcase" size={18} color={theme.primary} />
                  </View>
                  <View style={styles.orgInfo}>
                    <ThemedText type="body" style={styles.orgName}>
                      {org.name}
                    </ThemedText>
                    <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                      {org.description} • {org.services.length} services
                    </ThemedText>
                  </View>
                  <Feather name="chevron-right" size={20} color={theme.textSecondary} />
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}
      </KeyboardAwareScrollViewCompat>

      <ServiceSelectionModal
        visible={showServiceModal}
        organization={tempOrg}
        onClose={() => setShowServiceModal(false)}
        onSelectService={handleServiceSelect}
      />
    </>
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
    marginBottom: Spacing.md,
    marginTop: Spacing.xl,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  selectedInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  selectedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  selectedText: {
    flex: 1,
  },
  selectedOrg: {
    fontWeight: "600",
    marginBottom: 2,
  },
  changeButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
  orgList: {
    gap: Spacing.sm,
  },
  orgCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  orgIconSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    fontWeight: "600",
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
  submitButton: {
    marginTop: Spacing["2xl"],
  },
});
