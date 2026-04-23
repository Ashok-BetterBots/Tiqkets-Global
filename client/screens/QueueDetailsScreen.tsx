import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  Image,
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
import { Spacing, BorderRadius, BrandColors, Shadows } from "@/constants/theme";
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

  const getInitials = (name: string) =>
    (name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 4) || "•";

  const orgInitials = useMemo(() => getInitials(activeQueue?.organizationName ?? ""), [activeQueue?.organizationName]);
  const serviceInitials = useMemo(() => getInitials(activeQueue?.serviceName ?? ""), [activeQueue?.serviceName]);

  const heroColor = getTicketHeaderColor();
  const heroTextColor = isDarkTicketText ? "#0F0F0F" : "#FFFFFF";
  const heroMutedColor = isDarkTicketText ? "rgba(15,15,15,0.65)" : "rgba(255,255,255,0.7)";
  const heroDividerColor = isDarkTicketText ? "rgba(15,15,15,0.18)" : "rgba(255,255,255,0.22)";
  const passBg = theme.surface;
  const screenBg = theme.backgroundRoot;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(activeQueue?.ticketNumber ?? "")}`;
  const joinedDate = activeQueue ? new Date(activeQueue.joinedAt) : null;
  const joinedDateLabel = joinedDate
    ? joinedDate.toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase()
    : "";
  const joinedTimeLabel = joinedDate
    ? joinedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

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
          <View style={[styles.passWrapper, { backgroundColor: passBg }, Shadows.large]}>
            <Animated.View
              style={[
                styles.passHero,
                { backgroundColor: heroColor },
                isCalledNotAcknowledged ? flashingStyle : undefined,
              ]}
            >
              <View style={styles.passHeroTopRow}>
                <ThemedText style={[styles.passHeroEyebrow, { color: heroMutedColor }]}>
                  {getTicketHeaderText()}
                </ThemedText>
                <View style={[styles.passHeroBadge, { backgroundColor: heroDividerColor }]}>
                  <ThemedText style={[styles.passHeroBadgeText, { color: heroTextColor }]}>
                    #{activeQueue.position}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.passRoute}>
                <View style={styles.passRouteSide}>
                  <ThemedText style={[styles.passRouteLabel, { color: heroMutedColor }]}>AT</ThemedText>
                  <ThemedText style={[styles.passRouteCode, { color: heroTextColor }]} numberOfLines={1}>
                    {orgInitials}
                  </ThemedText>
                  <ThemedText style={[styles.passRouteName, { color: heroMutedColor }]} numberOfLines={1}>
                    {activeQueue.organizationName}
                  </ThemedText>
                </View>

                <View style={styles.passRouteCenter}>
                  <View style={[styles.passRouteLine, { backgroundColor: heroDividerColor }]} />
                  <View style={[styles.passRouteIcon, { backgroundColor: heroDividerColor }]}>
                    <Feather name="chevron-right" size={18} color={heroTextColor} />
                  </View>
                  <View style={[styles.passRouteLine, { backgroundColor: heroDividerColor }]} />
                </View>

                <View style={[styles.passRouteSide, { alignItems: "flex-end" }]}>
                  <ThemedText style={[styles.passRouteLabel, { color: heroMutedColor }]}>FOR</ThemedText>
                  <ThemedText style={[styles.passRouteCode, { color: heroTextColor }]} numberOfLines={1}>
                    {serviceInitials}
                  </ThemedText>
                  <ThemedText
                    style={[styles.passRouteName, { color: heroMutedColor, textAlign: "right" }]}
                    numberOfLines={1}
                  >
                    {activeQueue.serviceName}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.passHeroFooter}>
                <View>
                  <ThemedText style={[styles.passMetaLabel, { color: heroMutedColor }]}>JOINED</ThemedText>
                  <ThemedText style={[styles.passMetaValue, { color: heroTextColor }]}>{joinedDateLabel}</ThemedText>
                  <ThemedText style={[styles.passMetaValueLarge, { color: heroTextColor }]}>{joinedTimeLabel}</ThemedText>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <ThemedText style={[styles.passMetaLabel, { color: heroMutedColor }]}>
                    {isActiveStatus ? "EST. CALL" : "STATUS"}
                  </ThemedText>
                  <ThemedText style={[styles.passMetaValue, { color: heroTextColor }]}>
                    {isActiveStatus ? "TODAY" : getStatusText().toUpperCase()}
                  </ThemedText>
                  <ThemedText style={[styles.passMetaValueLarge, { color: heroTextColor }]}>
                    {isActiveStatus ? getExpiryTime() : `~${activeQueue.estimatedWaitTime}m`}
                  </ThemedText>
                </View>
              </View>
            </Animated.View>

            <View style={styles.passNotchRow}>
              <View style={[styles.passNotch, styles.passNotchLeft, { backgroundColor: screenBg }]} />
              <View style={styles.passNotchDashed}>
                {Array.from({ length: 22 }).map((_, i) => (
                  <View key={i} style={[styles.passNotchDash, { backgroundColor: theme.borderSubtle }]} />
                ))}
              </View>
              <View style={[styles.passNotch, styles.passNotchRight, { backgroundColor: screenBg }]} />
            </View>

            <View style={styles.passDetailGrid}>
              <View style={styles.passDetailCell}>
                <ThemedText style={[styles.passDetailLabel, { color: theme.textSecondary }]}>POSITION</ThemedText>
                <ThemedText style={styles.passDetailValue}>#{activeQueue.position}</ThemedText>
              </View>
              <View style={styles.passDetailCell}>
                <ThemedText style={[styles.passDetailLabel, { color: theme.textSecondary }]}>WAIT</ThemedText>
                <ThemedText style={styles.passDetailValue}>~{activeQueue.estimatedWaitTime}m</ThemedText>
              </View>
              <View style={styles.passDetailCell}>
                <ThemedText style={[styles.passDetailLabel, { color: theme.textSecondary }]}>QUEUE</ThemedText>
                <ThemedText style={styles.passDetailValue}>{activeQueue.totalInQueue}</ThemedText>
              </View>
            </View>

            {isActiveStatus ? (
              <View style={styles.passProgressSection}>
                <View style={[styles.passProgressBar, { backgroundColor: theme.borderSubtle }]}>
                  <View
                    style={[
                      styles.passProgressFill,
                      { width: `${getProgressPercentage()}%`, backgroundColor: heroColor },
                    ]}
                  />
                </View>
                <View style={styles.passProgressInfo}>
                  <ThemedText style={[styles.passProgressText, { color: theme.textSecondary }]}>
                    {Math.round(getProgressPercentage())}% through queue
                  </ThemedText>
                  <ThemedText style={[styles.passProgressText, { color: theme.textSecondary }]}>
                    {activeQueue.totalInQueue - activeQueue.position} ahead
                  </ThemedText>
                </View>
              </View>
            ) : null}

            {activeQueue.deskName ? (
              <View style={[styles.passDeskRow, { borderTopColor: theme.borderSubtle }]}>
                <View style={[styles.passDeskIcon, { backgroundColor: heroColor + "15" }]}>
                  <Feather name="map-pin" size={16} color={heroColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.passDetailLabel, { color: theme.textSecondary }]}>PROCEED TO</ThemedText>
                  <ThemedText style={styles.passDeskName}>{activeQueue.deskName}</ThemedText>
                </View>
              </View>
            ) : null}

            <View style={styles.passNotchRow}>
              <View style={[styles.passNotch, styles.passNotchLeft, { backgroundColor: screenBg }]} />
              <View style={styles.passNotchDashed}>
                {Array.from({ length: 22 }).map((_, i) => (
                  <View key={`b-${i}`} style={[styles.passNotchDash, { backgroundColor: theme.borderSubtle }]} />
                ))}
              </View>
              <View style={[styles.passNotch, styles.passNotchRight, { backgroundColor: screenBg }]} />
            </View>

            <View style={styles.passFooter}>
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.passDetailLabel, { color: theme.textSecondary }]}>TICKET No.</ThemedText>
                <ThemedText style={styles.passTicketNumber} numberOfLines={1}>
                  {activeQueue.ticketNumber}
                </ThemedText>
                <ThemedText style={[styles.passDetailLabel, { color: theme.textSecondary, marginTop: Spacing.md }]}>
                  ORGANIZATION
                </ThemedText>
                <ThemedText style={styles.passFooterValue} numberOfLines={2}>
                  {activeQueue.organizationName}
                </ThemedText>
              </View>
              <View style={[styles.passQrFrame, { borderColor: theme.borderSubtle }]}>
                <Image source={{ uri: qrUrl }} style={styles.passQrImage} resizeMode="contain" />
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <Card variant="outlined" style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Feather name="briefcase" size={18} color={theme.textSecondary} />
              <View style={styles.infoContent}>
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>Organization</ThemedText>
                <ThemedText type="body" style={styles.infoValue}>{activeQueue.organizationName}</ThemedText>
              </View>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: theme.borderSubtle }]} />
            <View style={styles.infoRow}>
              <Feather name="tag" size={18} color={theme.textSecondary} />
              <View style={styles.infoContent}>
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>Service</ThemedText>
                <ThemedText type="body" style={styles.infoValue}>{activeQueue.serviceName}</ThemedText>
              </View>
            </View>
            <View style={[styles.infoDivider, { backgroundColor: theme.borderSubtle }]} />
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
              style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}
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
              style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}
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
            style={[styles.changeServiceButton, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}
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
          <Pressable style={[styles.leaveModalContent, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.leaveModalIcon}>
              <Feather name="alert-triangle" size={32} color="#EF4444" />
            </View>
            <ThemedText style={styles.leaveModalTitle}>Leave Queue?</ThemedText>
            <ThemedText style={[styles.leaveModalMessage, { color: theme.textSecondary }]}>
              You'll lose your position and will need to rejoin from the back of the line.
            </ThemedText>
            <View style={styles.leaveModalButtons}>
              <Pressable
                style={[styles.leaveModalButton, { backgroundColor: theme.surfaceMuted }]}
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
  passWrapper: {
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: 24,
    overflow: "hidden",
  },
  passHero: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  passHeroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  passHeroEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  passHeroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  passHeroBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  passRoute: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  passRouteSide: {
    flex: 1,
    minWidth: 0,
  },
  passRouteLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  passRouteCode: {
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  passRouteName: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
    letterSpacing: 0.2,
  },
  passRouteCenter: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
  },
  passRouteLine: {
    width: 14,
    height: 1.5,
    borderRadius: 1,
  },
  passRouteIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  passHeroFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  passMetaLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  passMetaValue: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
    letterSpacing: 0.4,
  },
  passMetaValueLarge: {
    fontSize: 22,
    fontWeight: "800",
    marginTop: 2,
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  passNotchRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 22,
  },
  passNotch: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  passNotchLeft: {
    marginLeft: -11,
  },
  passNotchRight: {
    marginRight: -11,
  },
  passNotchDashed: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.sm,
  },
  passNotchDash: {
    width: 6,
    height: 1.5,
    borderRadius: 1,
  },
  passDetailGrid: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  passDetailCell: {
    flex: 1,
  },
  passDetailLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  passDetailValue: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  passProgressSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  passProgressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  passProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  passProgressInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  passProgressText: {
    fontSize: 11,
    fontWeight: "500",
  },
  passDeskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  passDeskIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  passDeskName: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  passFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  passTicketNumber: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  passFooterValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  passQrFrame: {
    width: 96,
    height: 96,
    borderRadius: 12,
    borderWidth: 1,
    padding: 6,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  passQrImage: {
    width: "100%",
    height: "100%",
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
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    borderWidth: 1,
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
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
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
    borderRadius: BorderRadius.lg,
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
    borderRadius: BorderRadius.lg,
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
    borderWidth: 1,
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
