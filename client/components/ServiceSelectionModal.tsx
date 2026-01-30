import React from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, SlideInUp, SlideOutDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Organization, Service } from "@/types/queue";

interface ServiceSelectionModalProps {
  visible: boolean;
  organization: Organization | null;
  onClose: () => void;
  onSelectService: (service: Service) => void;
}

export function ServiceSelectionModal({
  visible,
  organization,
  onClose,
  onSelectService,
}: ServiceSelectionModalProps) {
  const { theme, isDark } = useTheme();

  if (!organization) return null;

  const handleServiceSelect = (service: Service) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelectService(service);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(150)}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <BlurView
            intensity={20}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
        </Pressable>

        <Animated.View
          entering={SlideInUp.duration(250)}
          exiting={SlideOutDown.duration(200)}
          style={[styles.modal, { backgroundColor: theme.backgroundDefault }]}
        >
          <View style={styles.handle} />

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

          <ScrollView
            style={styles.servicesList}
            contentContainerStyle={styles.servicesContent}
            showsVerticalScrollIndicator={false}
          >
            {organization.services.map((service, index) => (
              <Pressable
                key={service.id}
                onPress={() => handleServiceSelect(service)}
                style={({ pressed }) => [
                  styles.serviceCard,
                  { backgroundColor: theme.backgroundSecondary },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={styles.serviceInfo}>
                  <ThemedText type="body" style={styles.serviceName}>
                    {service.name}
                  </ThemedText>
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

          <Pressable
            onPress={onClose}
            style={[styles.cancelButton, { borderColor: theme.border }]}
          >
            <ThemedText type="body" style={{ fontWeight: "600" }}>
              Cancel
            </ThemedText>
          </Pressable>
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
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing["3xl"],
    maxHeight: "80%",
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
  serviceName: {
    fontWeight: "600",
    marginBottom: Spacing.xs,
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
});
