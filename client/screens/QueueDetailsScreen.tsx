import React, { useState, useEffect } from "react";
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
  const {
    activeQueue,
    leaveQueue,
    canSnooze,
    getRemainingSnoozes,
    snooze,
    acknowledgeCall,
  } = useQueue();
  const [snoozeModalVisible, setSnoozeModalVisible] = useState(false);
  const [leaveModalVisible, setLeaveModalVisible] = useState(false);
  const [moreOptionsVisible, setMoreOptionsVisible] = useState(false);

  const flashOpacity = useSharedValue(1);

  const isCalledNotAcknowledged =
    activeQueue?.status === "called" && !activeQueue?.acknowledged;
  const isCalledAcknowledged =
    activeQueue?.status === "called" && activeQueue?.acknowledged;
  const isServing = activeQueue?.status === "serving";
  const isHold = activeQueue?.status === "hold";
  const isActiveStatus =
    activeQueue?.status === "waiting" || activeQueue?.status === "next";

  useEffect(() => {
    if (isCalledNotAcknowledged) {
      flashOpacity.value = withRepeat(
        withSequence(
          withTiming(0.55, {
            duration: 500,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
      notificationService.startAlertLoop();
    } else {
      cancelAnimation(flashOpacity);
      flashOpacity.value = 1;
      notificationService.stopAlertLoop();
    }
    return () => {
      cancelAnimation(flashOpacity);
      notificationService.stopAlertLoop();
    };
  }, [isCalledNotAcknowledged]);

  const flashingStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  const handleAcknowledge = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    acknowledgeCall();
  };

  if (!activeQueue) {
    return (
      <ThemedView
        style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}
      >
        <View style={styles.emptyContainer}>
          <Feather name="inbox" size={48} color={theme.textSecondary} />
          <ThemedText
            type="h4"
            style={{ marginTop: Spacing.lg, textAlign: "center" }}
          >
            No Active Queue
          </ThemedText>
          <ThemedText
            type="caption"
            style={{
              color: theme.textSecondary,
              marginTop: Spacing.sm,
              textAlign: "center",
            }}
          >
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
    const expiryTime = new Date(
      joinedAt.getTime() + activeQueue.estimatedWaitTime * 60 * 1000,
    );
    return expiryTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getProgressPercentage = () => {
    if (activeQueue.totalInQueue === 0) return 100;
    const progress =
      ((activeQueue.totalInQueue - activeQueue.position) /
        activeQueue.totalInQueue) *
      100;
    return Math.min(Math.max(progress, 5), 100);
  };

  const getStatusColor = () => {
    switch (activeQueue.status) {
      case "called":
        return activeQueue.acknowledged ? "#10B981" : BrandColors.accent;
      case "serving":
        return "#3B82F6";
      case "hold":
        return "#F59E0B";
      case "next":
        return BrandColors.accent;
      default:
        return BrandColors.primary;
    }
  };

  const getStatusText = () => {
    switch (activeQueue.status) {
      case "called":
        return activeQueue.acknowledged
          ? "Acknowledged · Please proceed"
          : "You're being called!";
      case "serving":
        return "Being served";
      case "hold":
        return "On hold";
      case "next":
        return "You're next";
      default:
        return activeQueue.totalInQueue > 1
          ? `${activeQueue.totalInQueue - 1} ahead of you`
          : "You're up soon";
    }
  };

  const statusColor = getStatusColor();
  const joinedTimeShort = new Date(activeQueue.joinedAt).toLocaleTimeString(
    [],
    { hour: "2-digit", minute: "2-digit" },
  );
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(
    activeQueue.ticketNumber ?? "",
  )}`;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. PRIMARY CARD — boarding-pass style ----------------------- */}
        <Animated.View entering={FadeInDown.delay(80).springify()}>
          <Animated.View
            style={[
              styles.passCard,
              { backgroundColor: theme.surface, borderColor: theme.borderSubtle },
              Shadows.large,
              isCalledNotAcknowledged ? flashingStyle : undefined,
            ]}
          >
            {/* Magenta header band */}
            <View style={[styles.passHeader, { backgroundColor: BrandColors.primary }]}>
              <View style={styles.passHeaderTopRow}>
                <ThemedText style={styles.passEyebrow}>QUEUE TICKET</ThemedText>
                <View style={styles.passTicketChip}>
                  <ThemedText style={styles.passTicketChipText}>
                    {activeQueue.ticketNumber}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.passRoute}>
                <View style={styles.passRouteSide}>
                  <ThemedText style={styles.passRouteLabel}>POSITION</ThemedText>
                  <ThemedText style={styles.passRouteValue}>
                    #{activeQueue.position}
                  </ThemedText>
                  <ThemedText style={styles.passRouteSub}>
                    of {activeQueue.totalInQueue}
                  </ThemedText>
                </View>

                <View style={styles.passRouteCenter}>
                  <View style={styles.passRouteLine} />
                  <View style={styles.passRouteIcon}>
                    <Feather name="bookmark" size={16} color={BrandColors.primary} />
                  </View>
                  <View style={styles.passRouteLine} />
                </View>

                <View style={[styles.passRouteSide, { alignItems: "flex-end" }]}>
                  <ThemedText style={styles.passRouteLabel}>ESTIMATED</ThemedText>
                  <ThemedText style={styles.passRouteValue}>
                    {isActiveStatus
                      ? getExpiryTime()
                      : `~${activeQueue.estimatedWaitTime}m`}
                  </ThemedText>
                  <ThemedText style={styles.passRouteSub}>
                    {isActiveStatus
                      ? `~${activeQueue.estimatedWaitTime} min wait`
                      : getStatusText()}
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* Notched perforation */}
            <View style={styles.passNotchRow}>
              <View
                style={[
                  styles.passNotch,
                  styles.passNotchLeft,
                  { backgroundColor: theme.backgroundRoot },
                ]}
              />
              <View style={styles.passNotchDashRow}>
                {Array.from({ length: 22 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.passNotchDash,
                      { backgroundColor: theme.borderSubtle },
                    ]}
                  />
                ))}
              </View>
              <View
                style={[
                  styles.passNotch,
                  styles.passNotchRight,
                  { backgroundColor: theme.backgroundRoot },
                ]}
              />
            </View>

            {/* White body */}
            <View style={styles.passBody}>
              <View style={styles.passOrgRow}>
                <View
                  style={[
                    styles.passOrgIcon,
                    { backgroundColor: BrandColors.primary + "15" },
                  ]}
                >
                  <Feather name="briefcase" size={14} color={BrandColors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ThemedText
                    style={[styles.passBodyLabel, { color: theme.textSecondary }]}
                  >
                    Organization
                  </ThemedText>
                  <ThemedText style={styles.passOrgName} numberOfLines={1}>
                    {activeQueue.organizationName}
                  </ThemedText>
                </View>
              </View>

              <View
                style={[
                  styles.passBodyDivider,
                  { borderTopColor: theme.borderSubtle, marginTop: Spacing.xs },
                ]}
              />

              <View style={styles.passBodyGrid}>
                <View style={styles.passBodyCell}>
                  <ThemedText
                    style={[styles.passBodyLabel, { color: theme.textSecondary }]}
                  >
                    Service
                  </ThemedText>
                  <ThemedText style={styles.passBodyValue} numberOfLines={1}>
                    {activeQueue.serviceName}
                  </ThemedText>
                </View>
                <View style={styles.passBodyCell}>
                  <ThemedText
                    style={[styles.passBodyLabel, { color: theme.textSecondary }]}
                  >
                    Joined
                  </ThemedText>
                  <ThemedText style={styles.passBodyValue}>
                    {joinedTimeShort}
                  </ThemedText>
                </View>
                <View style={styles.passBodyCell}>
                  <ThemedText
                    style={[styles.passBodyLabel, { color: theme.textSecondary }]}
                  >
                    Queue
                  </ThemedText>
                  <ThemedText style={styles.passBodyValue}>
                    {activeQueue.totalInQueue}
                  </ThemedText>
                </View>
              </View>

              {isActiveStatus ? (
                <View style={styles.progressWrap}>
                  <View
                    style={[
                      styles.progressTrack,
                      { backgroundColor: theme.borderSubtle },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${getProgressPercentage()}%`,
                          backgroundColor: BrandColors.primary,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.progressInfoRow}>
                    <ThemedText
                      style={[styles.progressCaption, { color: theme.textSecondary }]}
                    >
                      {Math.round(getProgressPercentage())}% through queue
                    </ThemedText>
                    <ThemedText
                      style={[styles.progressCaption, { color: theme.textSecondary }]}
                    >
                      {Math.max(activeQueue.totalInQueue - activeQueue.position, 0)} ahead
                    </ThemedText>
                  </View>
                </View>
              ) : null}

              {activeQueue.deskName ? (
                <View
                  style={[
                    styles.deskBanner,
                    {
                      backgroundColor: BrandColors.primary + "12",
                      borderColor: BrandColors.primary + "33",
                    },
                  ]}
                >
                  <Feather name="map-pin" size={16} color={BrandColors.primary} />
                  <ThemedText style={styles.deskBannerLabel}>
                    Proceed to{" "}
                    <ThemedText
                      style={[styles.deskBannerName, { color: BrandColors.primary }]}
                    >
                      {activeQueue.deskName}
                    </ThemedText>
                  </ThemedText>
                </View>
              ) : null}

              <View
                style={[styles.passBodyDivider, { borderTopColor: theme.borderSubtle }]}
              />

              <View style={styles.passFooterRow}>
                <View style={{ flex: 1, paddingRight: Spacing.md }}>
                  <ThemedText
                    style={[styles.passBodyLabel, { color: theme.textSecondary }]}
                  >
                    Status
                  </ThemedText>
                  <View style={styles.passStatusInline}>
                    <View
                      style={[styles.statusDot, { backgroundColor: statusColor }]}
                    />
                    <ThemedText
                      style={[styles.passStatusText, { color: statusColor }]}
                      numberOfLines={2}
                    >
                      {getStatusText()}
                    </ThemedText>
                  </View>
                </View>
                <View
                  style={[
                    styles.passQrFrame,
                    { borderColor: theme.borderSubtle },
                  ]}
                >
                  <Image
                    source={{ uri: qrUrl }}
                    style={styles.passQrImage}
                    resizeMode="contain"
                  />
                </View>
              </View>
            </View>
          </Animated.View>
        </Animated.View>

        {/* 3. STATUS-SPECIFIC ACTIONS ---------------------------------- */}
        {isCalledNotAcknowledged ? (
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Pressable
              style={styles.acknowledgeButton}
              onPress={handleAcknowledge}
              testID="button-acknowledge"
            >
              <Feather name="check-circle" size={22} color="#FFFFFF" />
              <ThemedText style={styles.acknowledgeText}>
                I'm Here · Acknowledge
              </ThemedText>
            </Pressable>
            <ThemedText
              type="caption"
              style={{
                color: theme.textSecondary,
                textAlign: "center",
                marginTop: Spacing.sm,
              }}
            >
              Tap to silence the alert and confirm your presence
            </ThemedText>

            {canSnooze() ? (
              <Pressable
                style={[
                  styles.outlineButton,
                  { borderColor: BrandColors.secondary, marginTop: Spacing.lg },
                ]}
                onPress={handleSnooze}
                testID="button-snooze-called"
              >
                <Feather
                  name="pause-circle"
                  size={18}
                  color={BrandColors.secondary}
                />
                <ThemedText
                  style={[
                    styles.outlineButtonText,
                    { color: BrandColors.secondary },
                  ]}
                >
                  Snooze ({getRemainingSnoozes()} left)
                </ThemedText>
              </Pressable>
            ) : null}
          </Animated.View>
        ) : isCalledAcknowledged ? (
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <View
              style={[
                styles.statusInfoCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.borderSubtle,
                },
              ]}
            >
              <Feather name="check-circle" size={28} color="#10B981" />
              <ThemedText type="h4" style={styles.statusInfoTitle}>
                Acknowledged
              </ThemedText>
              <ThemedText
                type="caption"
                style={{ color: theme.textSecondary, textAlign: "center" }}
              >
                The staff has been notified. Please proceed to the counter.
              </ThemedText>
            </View>
          </Animated.View>
        ) : isServing ? (
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <View
              style={[
                styles.statusInfoCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.borderSubtle,
                },
              ]}
            >
              <Feather name="activity" size={28} color="#3B82F6" />
              <ThemedText type="h4" style={styles.statusInfoTitle}>
                Currently Being Served
              </ThemedText>
              <ThemedText
                type="caption"
                style={{ color: theme.textSecondary, textAlign: "center" }}
              >
                Your service is in progress.
              </ThemedText>
            </View>
          </Animated.View>
        ) : isHold ? (
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <View
              style={[
                styles.statusInfoCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.borderSubtle,
                },
              ]}
            >
              <Feather name="pause-circle" size={28} color="#F59E0B" />
              <ThemedText type="h4" style={styles.statusInfoTitle}>
                On Hold
              </ThemedText>
              <ThemedText
                type="caption"
                style={{ color: theme.textSecondary, textAlign: "center" }}
              >
                Your queue entry is on hold. You'll be called again when ready.
              </ThemedText>
            </View>
          </Animated.View>
        ) : null}

        {/* 4. MORE OPTIONS BUTTON ------------------------------------- */}
        <Animated.View
          entering={FadeInDown.delay(280).springify()}
          style={{ marginTop: Spacing.lg }}
        >
          <Pressable
            style={[
              styles.moreOptionsButton,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderSubtle,
              },
            ]}
            onPress={() => setMoreOptionsVisible(true)}
            testID="button-more-options"
          >
            <Feather
              name="more-horizontal"
              size={18}
              color={theme.text}
            />
            <ThemedText style={styles.moreOptionsButtonText}>
              More Options
            </ThemedText>
            <Feather name="chevron-up" size={18} color={theme.textSecondary} />
          </Pressable>
        </Animated.View>
      </ScrollView>

      {/* More Options Modal */}
      <Modal
        visible={moreOptionsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMoreOptionsVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setMoreOptionsVisible(false)}
        >
          <Pressable
            style={[
              styles.moreOptionsSheet,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderSubtle,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={[
                styles.sheetHandle,
                { backgroundColor: theme.borderSubtle },
              ]}
            />
            <ThemedText style={styles.sheetTitle}>More Options</ThemedText>

            {isActiveStatus ? (
              <>
                <Pressable
                  style={styles.moreOption}
                  onPress={() => {
                    setMoreOptionsVisible(false);
                    handleSnooze();
                  }}
                  testID="button-snooze"
                >
                  <View
                    style={[
                      styles.moreOptionIcon,
                      { backgroundColor: BrandColors.secondary + "1A" },
                    ]}
                  >
                    <Feather
                      name="pause-circle"
                      size={18}
                      color={BrandColors.secondary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.moreOptionTitle}>
                      Snooze
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.moreOptionHelp,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {getRemainingSnoozes()} snooze
                      {getRemainingSnoozes() === 1 ? "" : "s"} left
                    </ThemedText>
                  </View>
                  <Feather
                    name="chevron-right"
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable>

                <Pressable
                  style={styles.moreOption}
                  onPress={() => {
                    setMoreOptionsVisible(false);
                    handleSwap();
                  }}
                  testID="button-swap"
                >
                  <View
                    style={[
                      styles.moreOptionIcon,
                      { backgroundColor: BrandColors.accent + "26" },
                    ]}
                  >
                    <Feather
                      name="repeat"
                      size={18}
                      color={BrandColors.accent}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.moreOptionTitle}>
                      Swap Position
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.moreOptionHelp,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Trade your spot with another customer
                    </ThemedText>
                  </View>
                  <Feather
                    name="chevron-right"
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable>
              </>
            ) : null}

            <Pressable
              style={styles.moreOption}
              onPress={() => {
                setMoreOptionsVisible(false);
                handleChangeService();
              }}
              testID="button-change-service"
            >
              <View
                style={[
                  styles.moreOptionIcon,
                  { backgroundColor: theme.primary + "15" },
                ]}
              >
                <Feather name="shuffle" size={18} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.moreOptionTitle}>
                  Change Service
                </ThemedText>
                <ThemedText
                  style={[
                    styles.moreOptionHelp,
                    { color: theme.textSecondary },
                  ]}
                >
                  Switch to a different service
                </ThemedText>
              </View>
              <Feather
                name="chevron-right"
                size={18}
                color={theme.textSecondary}
              />
            </Pressable>

            <Pressable
              style={styles.moreOption}
              onPress={() => {
                setMoreOptionsVisible(false);
                handleLeave();
              }}
              testID="button-leave-queue"
            >
              <View
                style={[
                  styles.moreOptionIcon,
                  { backgroundColor: "#DC262615" },
                ]}
              >
                <Feather name="log-out" size={18} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText
                  style={[styles.moreOptionTitle, { color: "#DC2626" }]}
                >
                  Leave Queue
                </ThemedText>
                <ThemedText
                  style={[
                    styles.moreOptionHelp,
                    { color: theme.textSecondary },
                  ]}
                >
                  Exit and lose your spot
                </ThemedText>
              </View>
              <Feather
                name="chevron-right"
                size={18}
                color={theme.textSecondary}
              />
            </Pressable>

            <Pressable
              style={[
                styles.sheetCancelButton,
                { borderTopColor: theme.borderSubtle },
              ]}
              onPress={() => setMoreOptionsVisible(false)}
              testID="button-close-more-options"
            >
              <ThemedText
                style={[styles.sheetCancelText, { color: theme.textSecondary }]}
              >
                Close
              </ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setLeaveModalVisible(false)}
        >
          <Pressable
            style={[
              styles.leaveModalContent,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderSubtle,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.leaveModalIcon}>
              <Feather name="alert-triangle" size={28} color="#DC2626" />
            </View>
            <ThemedText style={styles.leaveModalTitle}>Leave Queue?</ThemedText>
            <ThemedText
              style={[styles.leaveModalMessage, { color: theme.textSecondary }]}
            >
              You'll lose your position and need to rejoin from the back of the
              line.
            </ThemedText>
            <View style={styles.leaveModalButtons}>
              <Pressable
                style={[
                  styles.leaveModalButton,
                  { backgroundColor: theme.surfaceMuted },
                ]}
                onPress={() => setLeaveModalVisible(false)}
                testID="button-cancel-leave"
              >
                <ThemedText style={styles.leaveModalButtonText}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.leaveModalButton, styles.leaveModalDestructive]}
                onPress={confirmLeave}
                testID="button-confirm-leave"
              >
                <ThemedText style={styles.leaveModalDestructiveText}>
                  Leave
                </ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingTop: Spacing["5xl"] },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },

  // Boarding-pass primary card
  passCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  passHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  passHeaderTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  passEyebrow: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
  passTicketChip: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  passTicketChipText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  passRoute: {
    flexDirection: "row",
    alignItems: "center",
  },
  passRouteSide: {
    flex: 1,
    minWidth: 0,
  },
  passRouteLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  passRouteValue: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  passRouteSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
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
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  passRouteIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
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
  passNotchLeft: { marginLeft: -11 },
  passNotchRight: { marginRight: -11 },
  passNotchDashRow: {
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
  passBody: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  passBodyGrid: {
    flexDirection: "row",
    paddingVertical: Spacing.sm,
  },
  passBodyCell: {
    flex: 1,
    minWidth: 0,
  },
  passBodyLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  passBodyValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  passOrgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  passOrgIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  passOrgName: {
    fontSize: 16,
    fontWeight: "700",
  },
  passBodyDivider: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    marginVertical: Spacing.md,
  },
  passFooterRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  passStatusInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  passStatusText: {
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  passQrFrame: {
    width: 86,
    height: 86,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: 5,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  passQrImage: { width: "100%", height: "100%" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  progressWrap: { alignSelf: "stretch", marginTop: Spacing.md },
  progressInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  progressCaption: {
    marginTop: Spacing.sm,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  deskBanner: {
    alignSelf: "stretch",
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    justifyContent: "center",
  },
  deskBannerLabel: { fontSize: 13, fontWeight: "500" },
  deskBannerName: { fontWeight: "700" },

  // Acknowledge / status info
  acknowledgeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#22C55E",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  acknowledgeText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  outlineButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  outlineButtonText: { fontSize: 15, fontWeight: "600" },
  statusInfoCard: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  statusInfoTitle: { marginTop: Spacing.md, marginBottom: 6, textAlign: "center" },

  // More options bottom button
  moreOptionsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  moreOptionsButtonText: { flex: 1, fontSize: 15, fontWeight: "600" },

  // More options bottom sheet
  moreOptionsSheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.lg,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: Spacing.md,
  },
  sheetCancelButton: {
    paddingTop: Spacing.lg,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    alignItems: "center",
  },
  sheetCancelText: { fontSize: 15, fontWeight: "600" },

  // More options rows
  moreOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  moreOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  moreOptionTitle: { fontSize: 15, fontWeight: "600" },
  moreOptionHelp: { fontSize: 12, marginTop: 2 },

  // Leave
  leaveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  leaveText: { fontSize: 15, fontWeight: "600" },

  // Modal
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
  leaveModalIcon: { marginBottom: Spacing.md },
  leaveModalTitle: { fontSize: 20, fontWeight: "700", marginBottom: Spacing.sm },
  leaveModalMessage: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  leaveModalButtons: { flexDirection: "row", gap: Spacing.md, width: "100%" },
  leaveModalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  leaveModalButtonText: { fontSize: 16, fontWeight: "600" },
  leaveModalDestructive: { backgroundColor: "#DC2626" },
  leaveModalDestructiveText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
