import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { SnoozeModal } from "@/components/SnoozeModal";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type JoinQueueRouteProp = RouteProp<RootStackParamList, "JoinQueue">;

const MOCK_ORG_NAMES: Record<string, string> = {
  "org-1": "City Hospital",
  "org-2": "National Bank",
  "org-3": "Government Services Center",
  "org-4": "Tech Hub Mall",
  "org-5": "Wellness Clinic",
};

const MOCK_SERVICE_NAMES: Record<string, string> = {
  "s1": "General Consultation",
  "s2": "Lab Tests",
  "s3": "Pharmacy Pickup",
};

export default function JoinQueueScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<JoinQueueRouteProp>();
  const { theme } = useTheme();
  const { joinQueue, activeQueue, snooze, canSnooze, getRemainingSnoozes } = useQueue();
  const [snoozeModalVisible, setSnoozeModalVisible] = useState(false);

  const { organizationId, serviceId, formData } = route.params || {};
  
  const [ticketNumber, setTicketNumber] = useState<string>("");
  const [position, setPosition] = useState<number>(0);
  const [estimatedWait, setEstimatedWait] = useState<number>(0);
  const [totalInQueue, setTotalInQueue] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  const organizationName = organizationId ? MOCK_ORG_NAMES[organizationId] || "Organization" : "Organization";
  const serviceName = serviceId ? MOCK_SERVICE_NAMES[serviceId] || "Service" : "Service";

  useEffect(() => {
    const registerQueue = async () => {
      if (!organizationId || !serviceId) {
        navigation.goBack();
        return;
      }

      setIsLoading(true);
      
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      const ticketNum = `T${Math.floor(1000 + Math.random() * 9000)}`;
      const pos = Math.floor(3 + Math.random() * 8);
      const wait = pos * 5;
      const total = pos + Math.floor(Math.random() * 5);
      
      setTicketNumber(ticketNum);
      setPosition(pos);
      setEstimatedWait(wait);
      setTotalInQueue(total);
      
      await joinQueue({
        organizationId,
        organizationName,
        serviceId,
        serviceName,
        formData: formData || {},
        notificationPreferences: {
          inApp: true,
          whatsApp: false,
          sms: false,
        },
      });
      
      setIsLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    registerQueue();
  }, [organizationId, serviceId]);

  const handleSnooze = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSnoozeModalVisible(true);
  };

  const handleSwap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("SwapPosition");
  };

  const handleLeave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    navigation.goBack();
  };

  if (isLoading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
        <View style={styles.loadingContainer}>
          <Animated.View
            entering={FadeInUp.springify()}
            style={[styles.loadingIcon, { backgroundColor: theme.primary + "15" }]}
          >
            <Feather name="loader" size={48} color={theme.primary} />
          </Animated.View>
          <ThemedText type="h4" style={{ marginTop: Spacing.xl, textAlign: "center" }}>
            Joining Queue...
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.textSecondary, marginTop: Spacing.sm, textAlign: "center" }}>
            Please wait while we register you
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
      <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <View style={styles.successHeader}>
            <View style={[styles.checkIcon, { backgroundColor: "#10B981" + "20" }]}>
              <Feather name="check-circle" size={40} color="#10B981" />
            </View>
            <ThemedText type="h4" style={{ marginTop: Spacing.lg, textAlign: "center" }}>
              You're in the Queue!
            </ThemedText>
            <ThemedText type="caption" style={{ color: theme.textSecondary, marginTop: Spacing.xs, textAlign: "center" }}>
              {organizationName} - {serviceName}
            </ThemedText>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Card style={styles.ticketCard}>
            <View style={[styles.ticketHeader, { backgroundColor: BrandColors.primary }]}>
              <ThemedText style={styles.ticketLabel}>Your Ticket</ThemedText>
              <ThemedText style={styles.ticketNumber}>{ticketNumber}</ThemedText>
            </View>
            <View style={styles.ticketBody}>
              <View style={styles.ticketStat}>
                <Feather name="users" size={24} color={theme.primary} />
                <ThemedText type="h3" style={{ marginTop: Spacing.sm }}>
                  #{position}
                </ThemedText>
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                  Position in Queue
                </ThemedText>
              </View>
              <View style={[styles.ticketDivider, { backgroundColor: theme.border }]} />
              <View style={styles.ticketStat}>
                <Feather name="clock" size={24} color={BrandColors.accent} />
                <ThemedText type="h3" style={{ marginTop: Spacing.sm }}>
                  ~{estimatedWait}
                </ThemedText>
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                  Minutes Wait
                </ThemedText>
              </View>
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <View style={styles.infoRow}>
            <Feather name="info" size={16} color={theme.textSecondary} />
            <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.sm, flex: 1 }}>
              {totalInQueue} people are currently in the queue. You'll receive a notification when it's your turn.
            </ThemedText>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.actions}>
          <ThemedText
            type="small"
            style={[styles.sectionLabel, { color: theme.textSecondary }]}
          >
            Queue Options
          </ThemedText>

          <View style={styles.actionGrid}>
            <Pressable
              style={[styles.actionCard, { backgroundColor: theme.backgroundDefault }]}
              onPress={handleSnooze}
              testID="button-snooze"
            >
              <View style={[styles.actionIcon, { backgroundColor: BrandColors.secondary + "15" }]}>
                <Feather name="pause-circle" size={24} color={BrandColors.secondary} />
              </View>
              <ThemedText type="body" style={styles.actionTitle}>Snooze</ThemedText>
              <ThemedText type="caption" style={{ color: theme.textSecondary, textAlign: "center" }}>
                Skip your turn once
              </ThemedText>
            </Pressable>

            <Pressable
              style={[styles.actionCard, { backgroundColor: theme.backgroundDefault }]}
              onPress={handleSwap}
              testID="button-swap"
            >
              <View style={[styles.actionIcon, { backgroundColor: BrandColors.accent + "20" }]}>
                <Feather name="repeat" size={24} color={BrandColors.accent} />
              </View>
              <ThemedText type="body" style={styles.actionTitle}>Swap</ThemedText>
              <ThemedText type="caption" style={{ color: theme.textSecondary, textAlign: "center" }}>
                Trade positions
              </ThemedText>
            </Pressable>
          </View>

          <Pressable
            style={[styles.leaveButton, { borderColor: "#EF4444" }]}
            onPress={handleLeave}
            testID="button-leave-queue"
          >
            <Feather name="x-circle" size={20} color="#EF4444" />
            <ThemedText style={[styles.leaveText, { color: "#EF4444" }]}>
              Leave Queue
            </ThemedText>
          </Pressable>
        </Animated.View>
      </View>

      {activeQueue ? (
        <SnoozeModal
          visible={snoozeModalVisible}
          onClose={() => setSnoozeModalVisible(false)}
          onSnooze={snooze}
          remainingSnoozes={getRemainingSnoozes()}
          maxSnooze={activeQueue.maxSnoozeAllowed}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  loadingIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  successHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  checkIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  ticketCard: {
    overflow: "hidden",
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: 16,
  },
  ticketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  ticketLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    opacity: 0.9,
  },
  ticketNumber: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "800",
  },
  ticketBody: {
    flexDirection: "row",
    padding: Spacing.xl,
  },
  ticketStat: {
    flex: 1,
    alignItems: "center",
  },
  ticketDivider: {
    width: 1,
    height: "100%",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  actions: {
    flex: 1,
  },
  sectionLabel: {
    fontWeight: "600",
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  actionGrid: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  actionCard: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  actionTitle: {
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  leaveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  leaveText: {
    fontWeight: "600",
    fontSize: 16,
  },
});
