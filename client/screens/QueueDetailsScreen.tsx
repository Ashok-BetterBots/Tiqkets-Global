import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
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

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type SectionKey = "details" | "qr" | "more";

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
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    details: false,
    qr: false,
    more: false,
  });

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

  const toggleSection = (key: SectionKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.selectionAsync();
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
  const fullDateLabel = new Date(activeQueue.joinedAt).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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
        {/* 1. PRIMARY CARD --------------------------------------------- */}
        <Animated.View entering={FadeInDown.delay(80).springify()}>
          <Animated.View
            style={[
              styles.primaryCard,
              { backgroundColor: theme.surface, borderColor: theme.borderSubtle },
              Shadows.large,
              isCalledNotAcknowledged ? flashingStyle : undefined,
            ]}
          >
            <View
              style={[
                styles.statusPill,
                { backgroundColor: statusColor + "1A" },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <ThemedText style={[styles.statusPillText, { color: statusColor }]}>
                {getStatusText()}
              </ThemedText>
            </View>

            <ThemedText
              style={[styles.ticketLabel, { color: theme.textSecondary }]}
            >
              TICKET
            </ThemedText>
            <ThemedText style={styles.ticketNumber} testID="text-ticket-number">
              {activeQueue.ticketNumber}
            </ThemedText>

            <View style={styles.primaryStatsRow}>
              <View style={styles.primaryStat}>
                <ThemedText
                  style={[styles.primaryStatLabel, { color: theme.textSecondary }]}
                >
                  Position
                </ThemedText>
                <ThemedText style={styles.primaryStatValue}>
                  #{activeQueue.position}
                </ThemedText>
              </View>
              <View
                style={[
                  styles.primaryStatDivider,
                  { backgroundColor: theme.borderSubtle },
                ]}
              />
              <View style={styles.primaryStat}>
                <ThemedText
                  style={[styles.primaryStatLabel, { color: theme.textSecondary }]}
                >
                  Estimated
                </ThemedText>
                <ThemedText style={styles.primaryStatValue}>
                  {isActiveStatus
                    ? getExpiryTime()
                    : `~${activeQueue.estimatedWaitTime}m`}
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
                        backgroundColor: statusColor,
                      },
                    ]}
                  />
                </View>
                <ThemedText
                  style={[styles.progressCaption, { color: theme.textSecondary }]}
                >
                  {Math.round(getProgressPercentage())}% through queue
                </ThemedText>
              </View>
            ) : null}

            {activeQueue.deskName ? (
              <View
                style={[
                  styles.deskBanner,
                  {
                    backgroundColor: statusColor + "12",
                    borderColor: statusColor + "33",
                  },
                ]}
              >
                <Feather name="map-pin" size={16} color={statusColor} />
                <ThemedText style={styles.deskBannerLabel}>
                  Proceed to{" "}
                  <ThemedText style={[styles.deskBannerName, { color: statusColor }]}>
                    {activeQueue.deskName}
                  </ThemedText>
                </ThemedText>
              </View>
            ) : null}
          </Animated.View>
        </Animated.View>

        {/* 2. CONTEXT SUMMARY ----------------------------------------- */}
        <Animated.View entering={FadeInDown.delay(140).springify()}>
          <View
            style={[
              styles.contextStrip,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderSubtle,
              },
            ]}
          >
            <View style={styles.contextItem}>
              <Feather name="briefcase" size={14} color={theme.textSecondary} />
              <ThemedText
                style={[styles.contextText, { color: theme.text }]}
                numberOfLines={1}
              >
                {activeQueue.organizationName}
              </ThemedText>
            </View>
            <View
              style={[styles.contextDivider, { backgroundColor: theme.borderSubtle }]}
            />
            <View style={styles.contextItem}>
              <Feather name="tag" size={14} color={theme.textSecondary} />
              <ThemedText
                style={[styles.contextText, { color: theme.text }]}
                numberOfLines={1}
              >
                {activeQueue.serviceName}
              </ThemedText>
            </View>
            <View
              style={[styles.contextDivider, { backgroundColor: theme.borderSubtle }]}
            />
            <View style={styles.contextItem}>
              <Feather name="clock" size={14} color={theme.textSecondary} />
              <ThemedText
                style={[styles.contextText, { color: theme.text }]}
                numberOfLines={1}
              >
                {joinedTimeShort}
              </ThemedText>
            </View>
          </View>
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
        ) : (
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <View style={styles.actionRow}>
              <Pressable
                style={[
                  styles.actionTile,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.borderSubtle,
                  },
                ]}
                onPress={handleSnooze}
                testID="button-snooze"
              >
                <View
                  style={[
                    styles.actionTileIcon,
                    { backgroundColor: BrandColors.secondary + "1A" },
                  ]}
                >
                  <Feather
                    name="pause-circle"
                    size={20}
                    color={BrandColors.secondary}
                  />
                </View>
                <ThemedText style={styles.actionTileTitle}>Snooze</ThemedText>
                <ThemedText
                  style={[styles.actionTileHelp, { color: theme.textSecondary }]}
                >
                  {getRemainingSnoozes()} left
                </ThemedText>
              </Pressable>

              <Pressable
                style={[
                  styles.actionTile,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.borderSubtle,
                  },
                ]}
                onPress={handleSwap}
                testID="button-swap"
              >
                <View
                  style={[
                    styles.actionTileIcon,
                    { backgroundColor: BrandColors.accent + "26" },
                  ]}
                >
                  <Feather name="repeat" size={20} color={BrandColors.accent} />
                </View>
                <ThemedText style={styles.actionTileTitle}>Swap</ThemedText>
                <ThemedText
                  style={[styles.actionTileHelp, { color: theme.textSecondary }]}
                >
                  Trade spots
                </ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* 4. EXPANDABLE SECTIONS ------------------------------------- */}
        <Animated.View entering={FadeInDown.delay(280).springify()}>
          <View
            style={[
              styles.sectionGroup,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderSubtle,
              },
            ]}
          >
            {/* Ticket Details */}
            <Pressable
              onPress={() => toggleSection("details")}
              style={styles.sectionHeader}
              testID="button-section-details"
            >
              <Feather name="file-text" size={18} color={theme.textSecondary} />
              <ThemedText style={styles.sectionTitle}>Ticket Details</ThemedText>
              <Feather
                name={expanded.details ? "chevron-up" : "chevron-down"}
                size={20}
                color={theme.textSecondary}
              />
            </Pressable>
            {expanded.details ? (
              <View
                style={[
                  styles.sectionBody,
                  { borderTopColor: theme.borderSubtle },
                ]}
              >
                <DetailRow
                  label="Ticket ID"
                  value={activeQueue.ticketNumber}
                  textColor={theme.text}
                  subColor={theme.textSecondary}
                />
                <DetailRow
                  label="Joined"
                  value={`${fullDateLabel} · ${joinedTimeShort}`}
                  textColor={theme.text}
                  subColor={theme.textSecondary}
                />
                <DetailRow
                  label="Queue size"
                  value={`${activeQueue.totalInQueue} ${
                    activeQueue.totalInQueue === 1 ? "person" : "people"
                  }`}
                  textColor={theme.text}
                  subColor={theme.textSecondary}
                />
                <DetailRow
                  label="Estimated wait"
                  value={`${activeQueue.estimatedWaitTime} min`}
                  textColor={theme.text}
                  subColor={theme.textSecondary}
                />
                {activeQueue.deskName ? (
                  <DetailRow
                    label="Counter"
                    value={activeQueue.deskName}
                    textColor={theme.text}
                    subColor={theme.textSecondary}
                  />
                ) : null}
                <DetailRow
                  label="Status"
                  value={getStatusText()}
                  textColor={theme.text}
                  subColor={theme.textSecondary}
                  isLast
                />
              </View>
            ) : null}

            {/* QR Code */}
            <View
              style={[styles.sectionBorder, { borderTopColor: theme.borderSubtle }]}
            />
            <Pressable
              onPress={() => toggleSection("qr")}
              style={styles.sectionHeader}
              testID="button-section-qr"
            >
              <Feather name="maximize" size={18} color={theme.textSecondary} />
              <ThemedText style={styles.sectionTitle}>QR Code</ThemedText>
              <View style={styles.qrPreviewWrap}>
                <Image
                  source={{ uri: qrUrl }}
                  style={styles.qrPreviewImage}
                  resizeMode="contain"
                />
              </View>
              <Feather
                name={expanded.qr ? "chevron-up" : "chevron-down"}
                size={20}
                color={theme.textSecondary}
              />
            </Pressable>
            {expanded.qr ? (
              <View
                style={[
                  styles.sectionBody,
                  styles.qrBody,
                  { borderTopColor: theme.borderSubtle },
                ]}
              >
                <View style={styles.qrLargeFrame}>
                  <Image
                    source={{ uri: qrUrl }}
                    style={styles.qrLargeImage}
                    resizeMode="contain"
                  />
                </View>
                <ThemedText
                  style={[styles.qrCaption, { color: theme.textSecondary }]}
                >
                  Show this code at the counter
                </ThemedText>
              </View>
            ) : null}

            {/* More Options */}
            <View
              style={[styles.sectionBorder, { borderTopColor: theme.borderSubtle }]}
            />
            <Pressable
              onPress={() => toggleSection("more")}
              style={styles.sectionHeader}
              testID="button-section-more"
            >
              <Feather
                name="more-horizontal"
                size={18}
                color={theme.textSecondary}
              />
              <ThemedText style={styles.sectionTitle}>More Options</ThemedText>
              <Feather
                name={expanded.more ? "chevron-up" : "chevron-down"}
                size={20}
                color={theme.textSecondary}
              />
            </Pressable>
            {expanded.more ? (
              <View
                style={[
                  styles.sectionBody,
                  { borderTopColor: theme.borderSubtle },
                ]}
              >
                <Pressable
                  style={styles.moreOption}
                  onPress={handleChangeService}
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
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* 5. DANGER ZONE --------------------------------------------- */}
        <Animated.View entering={FadeInDown.delay(360).springify()}>
          <Pressable
            style={[styles.leaveButton, { borderColor: theme.borderSubtle }]}
            onPress={handleLeave}
            testID="button-leave-queue"
          >
            <Feather name="log-out" size={18} color="#DC2626" />
            <ThemedText style={[styles.leaveText, { color: "#DC2626" }]}>
              Leave Queue
            </ThemedText>
          </Pressable>
        </Animated.View>
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

function DetailRow({
  label,
  value,
  textColor,
  subColor,
  isLast,
}: {
  label: string;
  value: string;
  textColor: string;
  subColor: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.detailRow, isLast && { marginBottom: 0 }]}>
      <ThemedText style={[styles.detailRowLabel, { color: subColor }]}>
        {label}
      </ThemedText>
      <ThemedText
        style={[styles.detailRowValue, { color: textColor }]}
        numberOfLines={2}
      >
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },

  // Primary card
  primaryCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.md,
    alignItems: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.lg,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusPillText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  ticketLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  ticketNumber: {
    fontSize: 56,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 64,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  primaryStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    paddingVertical: Spacing.md,
  },
  primaryStat: { flex: 1, alignItems: "center" },
  primaryStatDivider: { width: 1, alignSelf: "stretch", marginHorizontal: Spacing.md },
  primaryStatLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  primaryStatValue: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  progressWrap: { alignSelf: "stretch", marginTop: Spacing.lg },
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

  // Context strip
  contextStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  contextItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  contextDivider: {
    width: 1,
    height: 16,
    marginHorizontal: Spacing.sm,
  },
  contextText: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },

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

  // Action tiles (Snooze / Swap)
  actionRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  actionTile: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: "center",
  },
  actionTileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  actionTileTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  actionTileHelp: { fontSize: 12 },

  // Section group (collapsibles)
  sectionGroup: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: "600" },
  sectionBorder: { borderTopWidth: 1 },
  sectionBody: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },

  // Detail rows
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  detailRowLabel: { fontSize: 13, fontWeight: "500" },
  detailRowValue: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
  },

  // QR
  qrPreviewWrap: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    padding: 3,
    overflow: "hidden",
  },
  qrPreviewImage: { width: "100%", height: "100%" },
  qrBody: { alignItems: "center" },
  qrLargeFrame: {
    width: 220,
    height: 220,
    borderRadius: BorderRadius.md,
    backgroundColor: "#FFFFFF",
    padding: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  qrLargeImage: { width: "100%", height: "100%" },
  qrCaption: { fontSize: 12, marginTop: Spacing.md },

  // More options
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
