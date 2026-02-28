import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import Animated, { 
  FadeInDown, 
  FadeInUp, 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withSequence, 
  withTiming,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { SnoozeModal } from "@/components/SnoozeModal";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { notificationService } from "@/services/NotificationService";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function QueueDetailsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const { activeQueue, leaveQueue, canSnooze, getRemainingSnoozes, snooze, acknowledgeCall } = useQueue();
  const [snoozeModalVisible, setSnoozeModalVisible] = useState(false);
  const [leaveModalVisible, setLeaveModalVisible] = useState(false);

  const flashOpacity = useSharedValue(1);
  const flashScale = useSharedValue(1);

  const isCalledNotAcknowledged = activeQueue?.status === "called" && !activeQueue?.acknowledged;
  const isCalledAcknowledged = activeQueue?.status === "called" && activeQueue?.acknowledged;
  const isServing = activeQueue?.status === "serving";
  const isHold = activeQueue?.status === "hold";
  const isActiveStatus = activeQueue?.status === "waiting" || activeQueue?.status === "next";

  useEffect(() => {
    if (isCalledNotAcknowledged) {
      flashOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 300, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      flashScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 300, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      
      notificationService.startAlertLoop();
    } else {
      cancelAnimation(flashOpacity);
      cancelAnimation(flashScale);
      flashOpacity.value = 1;
      flashScale.value = 1;
      notificationService.stopAlertLoop();
    }

    return () => {
      cancelAnimation(flashOpacity);
      cancelAnimation(flashScale);
      notificationService.stopAlertLoop();
    };
  }, [isCalledNotAcknowledged]);

  const flashingStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
    transform: [{ scale: flashScale.value }],
  }));

  const handleAcknowledge = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    acknowledgeCall();
  };

  if (!activeQueue) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
        <View style={styles.emptyContainer}>
          <Feather name="inbox" size={48} color={theme.textSecondary} />
          <ThemedText type="h4" style={{ marginTop: Spacing.lg, textAlign: "center" }}>
            No Active Queue
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.textSecondary, marginTop: Spacing.sm, textAlign: "center" }}>
            You're not currently in any queue
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  const handleSnooze = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSnoozeModalVisible(true);
  };

  const handleSwap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("SwapPosition");
  };

  const handleChangeService = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("ChangeService");
  };

  const handleLeave = () => {
    setLeaveModalVisible(true);
  };

  const confirmLeave = async () => {
    setLeaveModalVisible(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await leaveQueue();
    navigation.goBack();
  };

  const getExpiryTime = () => {
    const joinedAt = new Date(activeQueue.joinedAt);
    const expiryTime = new Date(joinedAt.getTime() + activeQueue.estimatedWaitTime * 60 * 1000);
    return expiryTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getProgressPercentage = () => {
    if (activeQueue.totalInQueue === 0) return 100;
    const progress = ((activeQueue.totalInQueue - activeQueue.position) / activeQueue.totalInQueue) * 100;
    return Math.min(Math.max(progress, 5), 100);
  };

  const getStatusColor = () => {
    switch (activeQueue.status) {
      case "called": return activeQueue.acknowledged ? "#10B981" : BrandColors.accent;
      case "serving": return "#3B82F6";
      case "hold": return "#F59E0B";
      case "next": return BrandColors.accent;
      default: return BrandColors.primary;
    }
  };

  const getStatusText = () => {
    switch (activeQueue.status) {
      case "called": return activeQueue.acknowledged ? "Acknowledged - Please Proceed" : "You're Being Called!";
      case "serving": return "Being Served";
      case "hold": return "On Hold";
      case "next": return "You're Next!";
      default: return "Waiting";
    }
  };

  const getTicketHeaderColor = () => {
    if (isCalledNotAcknowledged) return BrandColors.accent;
    if (isCalledAcknowledged) return "#10B981";
    if (isServing) return "#3B82F6";
    if (isHold) return "#F59E0B";
    return BrandColors.primary;
  };

  const getTicketHeaderText = () => {
    if (isCalledNotAcknowledged) return "IT'S YOUR TURN!";
    if (isCalledAcknowledged) return "ACKNOWLEDGED";
    if (isServing) return "BEING SERVED";
    if (isHold) return "ON HOLD";
    return "Your Ticket";
  };

  const isDarkTicketText = isCalledNotAcknowledged || isHold;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + "20" }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
            <ThemedText style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusText()}
            </ThemedText>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Card style={styles.ticketCard}>
            <Animated.View 
              style={[
                styles.ticketHeader, 
                { backgroundColor: getTicketHeaderColor() },
                isCalledNotAcknowledged ? flashingStyle : undefined
              ]}
            >
              <ThemedText style={[styles.ticketLabel, isDarkTicketText ? { color: "#000000" } : undefined]}>
                {getTicketHeaderText()}
              </ThemedText>
              <ThemedText style={[styles.ticketNumber, isDarkTicketText ? { color: "#000000" } : undefined]}>
                {activeQueue.ticketNumber}
              </ThemedText>
            </Animated.View>
            <View style={styles.ticketBody}>
              <View style={styles.ticketStat}>
                <Feather name="users" size={24} color={theme.primary} />
                <ThemedText type="h3" style={{ marginTop: Spacing.sm }}>
                  #{activeQueue.position}
                </ThemedText>
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                  Position
                </ThemedText>
              </View>
              <View style={[styles.ticketDivider, { backgroundColor: theme.border }]} />
              <View style={styles.ticketStat}>
                <Feather name="clock" size={24} color={BrandColors.accent} />
                <ThemedText type="h3" style={{ marginTop: Spacing.sm }}>
                  ~{activeQueue.estimatedWaitTime}
                </ThemedText>
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                  Minutes
                </ThemedText>
              </View>
            </View>
            {isActiveStatus ? (
              <View style={styles.progressSection}>
                <View style={styles.progressInfo}>
                  <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                    Est. call at {getExpiryTime()}
                  </ThemedText>
                  <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                    {activeQueue.totalInQueue} in queue
                  </ThemedText>
                </View>
                <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${getProgressPercentage()}%`, backgroundColor: BrandColors.primary }
                    ]} 
                  />
                </View>
              </View>
            ) : null}

            {activeQueue.deskName ? (
              <View style={[styles.deskInfo, { borderTopColor: theme.border }]}>
                <Feather name="map-pin" size={16} color={getStatusColor()} />
                <ThemedText type="body" style={{ fontWeight: "600", marginLeft: Spacing.sm }}>
                  Proceed to: {activeQueue.deskName}
                </ThemedText>
              </View>
            ) : null}
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Feather name="briefcase" size={18} color={theme.textSecondary} />
              <View style={styles.infoContent}>
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>Organization</ThemedText>
                <ThemedText type="body" style={styles.infoValue}>{activeQueue.organizationName}</ThemedText>
              </View>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: theme.border }]} />
            <View style={styles.infoRow}>
              <Feather name="tag" size={18} color={theme.textSecondary} />
              <View style={styles.infoContent}>
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>Service</ThemedText>
                <ThemedText type="body" style={styles.infoValue}>{activeQueue.serviceName}</ThemedText>
              </View>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: theme.border }]} />
            <View style={styles.infoRow}>
              <Feather name="calendar" size={18} color={theme.textSecondary} />
              <View style={styles.infoContent}>
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>Joined At</ThemedText>
                <ThemedText type="body" style={styles.infoValue}>
                  {new Date(activeQueue.joinedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </ThemedText>
              </View>
            </View>
          </Card>
        </Animated.View>

        {isCalledNotAcknowledged ? (
          <Animated.View entering={FadeInDown.delay(400).springify()}>
            <Pressable
              style={styles.acknowledgeButton}
              onPress={handleAcknowledge}
              testID="button-acknowledge"
            >
              <Feather name="check-circle" size={24} color="#FFFFFF" />
              <ThemedText style={styles.acknowledgeText}>I'm Here - Acknowledge</ThemedText>
            </Pressable>
            <ThemedText 
              type="caption" 
              style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.sm }}
            >
              Tap to stop the alert and confirm your presence
            </ThemedText>

            {canSnooze() ? (
              <Pressable
                style={[styles.snoozeCallButton, { borderColor: BrandColors.secondary }]}
                onPress={handleSnooze}
                testID="button-snooze-called"
              >
                <Feather name="pause-circle" size={20} color={BrandColors.secondary} />
                <ThemedText style={[styles.snoozeCallText, { color: BrandColors.secondary }]}>
                  Snooze ({getRemainingSnoozes()} left)
                </ThemedText>
              </Pressable>
            ) : null}
          </Animated.View>
        ) : isCalledAcknowledged ? (
          <Animated.View entering={FadeInDown.delay(400).springify()}>
            <View style={styles.acknowledgedInfo}>
              <Feather name="check-circle" size={32} color="#10B981" />
              <ThemedText type="h4" style={{ marginTop: Spacing.md, textAlign: "center" }}>
                Acknowledged
              </ThemedText>
              <ThemedText type="caption" style={{ color: theme.textSecondary, marginTop: Spacing.sm, textAlign: "center" }}>
                The staff has been notified. Please proceed to the counter.
              </ThemedText>
            </View>
          </Animated.View>
        ) : isServing ? (
          <Animated.View entering={FadeInDown.delay(400).springify()}>
            <View style={styles.servingInfo}>
              <Feather name="activity" size={32} color="#3B82F6" />
              <ThemedText type="h4" style={{ marginTop: Spacing.md, textAlign: "center" }}>
                Currently Being Served
              </ThemedText>
              <ThemedText type="caption" style={{ color: theme.textSecondary, marginTop: Spacing.sm, textAlign: "center" }}>
                Your service is in progress.
              </ThemedText>
            </View>
          </Animated.View>
        ) : isHold ? (
          <Animated.View entering={FadeInDown.delay(400).springify()}>
            <View style={styles.holdInfo}>
              <Feather name="pause-circle" size={32} color="#F59E0B" />
              <ThemedText type="h4" style={{ marginTop: Spacing.md, textAlign: "center" }}>
                On Hold
              </ThemedText>
              <ThemedText type="caption" style={{ color: theme.textSecondary, marginTop: Spacing.sm, textAlign: "center" }}>
                Your queue entry is on hold. You will be called again when ready.
              </ThemedText>
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.delay(400).springify()}>
            <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
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
                {getRemainingSnoozes()} left
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
                Trade spots
              </ThemedText>
            </Pressable>
          </View>

          <Pressable
            style={[styles.changeServiceButton, { backgroundColor: theme.backgroundDefault }]}
            onPress={handleChangeService}
            testID="button-change-service"
          >
            <View style={[styles.changeServiceIcon, { backgroundColor: theme.primary + "15" }]}>
              <Feather name="shuffle" size={20} color={theme.primary} />
            </View>
            <View style={styles.changeServiceContent}>
              <ThemedText type="body" style={styles.actionTitle}>Change Service</ThemedText>
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                Switch to a different service
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>

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
        )}
      </ScrollView>

      <SnoozeModal
        visible={snoozeModalVisible}
        onClose={() => setSnoozeModalVisible(false)}
        onSnooze={snooze}
        remainingSnoozes={getRemainingSnoozes()}
        maxSnooze={activeQueue.maxSnoozeAllowed}
      />

      <Modal
        visible={leaveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaveModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setLeaveModalVisible(false)}>
          <Pressable style={[styles.leaveModalContent, { backgroundColor: theme.backgroundDefault }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.leaveModalIcon}>
              <Feather name="alert-triangle" size={32} color="#EF4444" />
            </View>
            <ThemedText style={styles.leaveModalTitle}>Leave Queue?</ThemedText>
            <ThemedText style={[styles.leaveModalMessage, { color: theme.textSecondary }]}>
              You'll lose your position and will need to rejoin from the back of the line.
            </ThemedText>
            <View style={styles.leaveModalButtons}>
              <Pressable
                style={[styles.leaveModalButton, { backgroundColor: theme.backgroundSecondary }]}
                onPress={() => setLeaveModalVisible(false)}
                testID="button-cancel-leave"
              >
                <ThemedText style={styles.leaveModalButtonText}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.leaveModalButton, styles.leaveModalDestructive]}
                onPress={confirmLeave}
                testID="button-confirm-leave"
              >
                <ThemedText style={styles.leaveModalDestructiveText}>Leave</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontWeight: "600",
    fontSize: 14,
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
    paddingVertical: 32,
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
    lineHeight: 40,
    includeFontPadding: true,
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
  progressSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  progressInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  deskInfo: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  infoCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoValue: {
    fontWeight: "600",
  },
  infoDivider: {
    height: 1,
    marginVertical: Spacing.md,
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
    marginBottom: Spacing.md,
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
  changeServiceButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  changeServiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  changeServiceContent: {
    flex: 1,
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
  acknowledgeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#22C55E",
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  acknowledgeText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  snoozeCallButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  snoozeCallText: {
    fontWeight: "600",
    fontSize: 16,
  },
  acknowledgedInfo: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  servingInfo: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  holdInfo: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  leaveModalContent: {
    width: "100%",
    maxWidth: 340,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
  },
  leaveModalIcon: {
    marginBottom: Spacing.md,
  },
  leaveModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  leaveModalMessage: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  leaveModalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
  },
  leaveModalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  leaveModalButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  leaveModalDestructive: {
    backgroundColor: "#EF4444",
  },
  leaveModalDestructiveText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
