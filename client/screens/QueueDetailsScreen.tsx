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
import { useHeaderHeight } from "@react-navigation/elements";
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
import { TicketCard } from "@/components/TicketCard";
import { SnoozeModal } from "@/components/SnoozeModal";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { notificationService } from "@/services/NotificationService";
import { Spacing, BorderRadius, BrandColors, Shadows } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function QueueDetailsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
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

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. PRIMARY CARD — premium ticket ----------------------------- */}
        <Animated.View
          entering={FadeInDown.delay(80).springify()}
          style={isCalledNotAcknowledged ? flashingStyle : undefined}
        >
          <TicketCard
            ticketId={activeQueue.id}
            ticketNumber={activeQueue.ticketNumber}
            position={activeQueue.position}
            totalInQueue={activeQueue.totalInQueue}
            estimatedWaitTime={activeQueue.estimatedWaitTime}
            status={activeQueue.status}
            organizationName={activeQueue.organizationName}
            serviceName={activeQueue.serviceName}
            joinedAt={activeQueue.joinedAt}
            deskName={activeQueue.deskName}
            tableNumber={activeQueue.tableNumber}
            onAcknowledge={handleAcknowledge}
            onManagePress={
              isCalledNotAcknowledged
                ? undefined
                : () => {
                    Haptics.selectionAsync();
                    setMoreOptionsVisible(true);
                  }
            }
            manageLabel="Manage Queue"
          />
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

      </ScrollView>

      {/* Bottom sheet options menu */}
      <Modal
        visible={moreOptionsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMoreOptionsVisible(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setMoreOptionsVisible(false)}
        >
          <Pressable
            style={[
              styles.sheetContainer,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderSubtle,
                paddingBottom: insets.bottom + Spacing.md,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetTopBar}>
              <View style={styles.sheetHandle}>
                <View style={styles.sheetHandlePill} />
              </View>
              <Pressable
                onPress={() => setMoreOptionsVisible(false)}
                style={[styles.sheetCloseBtn, { backgroundColor: theme.backgroundSecondary }]}
                hitSlop={12}
                testID="button-close-options-sheet"
              >
                <Feather name="x" size={16} color={theme.text} />
              </Pressable>
            </View>

            {isActiveStatus ? (
              <>
                <DropdownItem
                  icon="pause-circle"
                  iconColor={BrandColors.secondary}
                  iconBg={BrandColors.secondary + "1A"}
                  label="Snooze"
                  helper={`${getRemainingSnoozes()} snooze${getRemainingSnoozes() === 1 ? "" : "s"} left`}
                  onPress={() => {
                    setMoreOptionsVisible(false);
                    handleSnooze();
                  }}
                  textColor={theme.text}
                  helperColor={theme.textSecondary}
                  dividerColor={theme.borderSubtle}
                  showDivider
                  testID="button-snooze"
                />
                <DropdownItem
                  icon="repeat"
                  iconColor={BrandColors.accent}
                  iconBg={BrandColors.accent + "26"}
                  label="Swap Position"
                  helper="Trade your spot"
                  onPress={() => {
                    setMoreOptionsVisible(false);
                    handleSwap();
                  }}
                  textColor={theme.text}
                  helperColor={theme.textSecondary}
                  dividerColor={theme.borderSubtle}
                  showDivider
                  testID="button-swap"
                />
              </>
            ) : null}

            <DropdownItem
              icon="shuffle"
              iconColor={theme.primary}
              iconBg={theme.primary + "15"}
              label="Change Service"
              helper="Switch to another"
              onPress={() => {
                setMoreOptionsVisible(false);
                handleChangeService();
              }}
              textColor={theme.text}
              helperColor={theme.textSecondary}
              dividerColor={theme.borderSubtle}
              showDivider
              testID="button-change-service"
            />

            <DropdownItem
              icon="log-out"
              iconColor="#DC2626"
              iconBg="#DC262615"
              label="Leave Queue"
              helper="Exit and lose your spot"
              onPress={() => {
                setMoreOptionsVisible(false);
                handleLeave();
              }}
              textColor="#DC2626"
              helperColor={theme.textSecondary}
              dividerColor={theme.borderSubtle}
              testID="button-leave-queue"
            />
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

function DropdownItem({
  icon,
  iconColor,
  iconBg,
  label,
  helper,
  onPress,
  textColor,
  helperColor,
  dividerColor,
  showDivider,
  testID,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  iconColor: string;
  iconBg: string;
  label: string;
  helper: string;
  onPress: () => void;
  textColor: string;
  helperColor: string;
  dividerColor: string;
  showDivider?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.dropdownItem,
        showDivider && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: dividerColor,
        },
        pressed && { backgroundColor: dividerColor + "55" },
      ]}
    >
      <View style={[styles.dropdownItemIcon, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <ThemedText
          style={[styles.dropdownItemLabel, { color: textColor }]}
          numberOfLines={1}
        >
          {label}
        </ThemedText>
        <ThemedText
          style={[styles.dropdownItemHelper, { color: helperColor }]}
          numberOfLines={1}
        >
          {helper}
        </ThemedText>
      </View>
    </Pressable>
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

  // Options trigger button (theme color, opens bottom sheet)
  optionsTriggerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.lg,
  },
  optionsTriggerText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Bottom sheet options menu
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    borderTopLeftRadius: 38,
    borderTopRightRadius: 38,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  sheetTopBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: Spacing.md,
  },
  sheetHandle: {
    flex: 1,
    alignItems: "center",
  },
  sheetHandlePill: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  dropdownItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownItemLabel: { fontSize: 14, fontWeight: "600" },
  dropdownItemHelper: { fontSize: 11, marginTop: 1 },

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
