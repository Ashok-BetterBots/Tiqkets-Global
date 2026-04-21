import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import Animated, { 
  FadeInDown, 
  FadeIn, 
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { TicketBadge } from "@/components/TicketBadge";
import { QueueVisualization } from "@/components/QueueVisualization";
import { ActionButton } from "@/components/ActionButton";
import { SnoozeModal } from "@/components/SnoozeModal";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { useQueueNotifications } from "@/hooks/useNotifications";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const { activeQueue, leaveQueue, snooze, refreshQueue, canSnooze, getRemainingSnoozes, acknowledgeCall, incomingSwapRequests, acceptSwapRequest, declineSwapRequest } = useQueue();
  const [refreshing, setRefreshing] = useState(false);
  const [showSnoozeModal, setShowSnoozeModal] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  
  const expandProgress = useSharedValue(0);

  useQueueNotifications(activeQueue);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshQueue();
    setRefreshing(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [refreshQueue]);

  const handleJoinQueue = () => {
    navigation.navigate("JoinQueue");
  };

  const handleScanQR = () => {
    navigation.navigate("QRScanner");
  };

  const handleLeaveQueue = async () => {
    await leaveQueue();
  };

  const handleSnooze = async (positions: number): Promise<boolean> => {
    return await snooze(positions);
  };

  const handleSwap = () => {
    navigation.navigate("SwapPosition");
  };

  const handleChangeService = () => {
    navigation.navigate("ChangeService");
  };

  const handleAcknowledge = () => {
    if (activeQueue?.status === "called") {
      acknowledgeCall();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const toggleActions = () => {
    setActionsExpanded(!actionsExpanded);
    expandProgress.value = withTiming(actionsExpanded ? 0 : 1, { duration: 300 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(expandProgress.value, [0, 1], [0, 180])}deg` }],
  }));

  const actionsContainerStyle = useAnimatedStyle(() => ({
    height: interpolate(expandProgress.value, [0, 1], [0, 140]),
    opacity: expandProgress.value,
    overflow: "hidden" as const,
  }));

  if (!activeQueue) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={[
          styles.emptyContent,
          {
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <EmptyState
          image={require("../../assets/images/empty-queue.png")}
          title="Not in a Queue"
          description="Join a queue to skip the physical wait. Scan a QR code or browse organizations to get started."
          buttonLabel="Join a Queue"
          onButtonPress={handleJoinQueue}
        />

        <View style={styles.quickActions}>
          <Pressable
            onPress={handleScanQR}
            style={[styles.quickAction, { backgroundColor: theme.surface }]}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: theme.primary + "15" }]}>
              <Feather name="camera" size={24} color={theme.primary} />
            </View>
            <ThemedText type="small" style={styles.quickActionLabel}>
              Scan QR Code
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={handleJoinQueue}
            style={[styles.quickAction, { backgroundColor: theme.surface }]}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: theme.primary + "15" }]}>
              <Feather name="search" size={24} color={theme.primary} />
            </View>
            <ThemedText type="small" style={styles.quickActionLabel}>
              Browse
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const formatWaitTime = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const remainingSnoozes = getRemainingSnoozes();
  const isYourTurn = activeQueue.status === "called";

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={[
          styles.activeContent,
          {
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <Pressable 
          onPress={handleAcknowledge}
          disabled={!isYourTurn}
        >
          <Animated.View entering={FadeIn.duration(400)} style={styles.ticketContainer}>
            <TicketBadge
              ticketNumber={activeQueue.ticketNumber}
              position={activeQueue.position}
              estimatedWaitTime={activeQueue.estimatedWaitTime}
              status={activeQueue.status}
              deskName={activeQueue.deskName}
              tableNumber={activeQueue.tableNumber}
              onAcknowledge={handleAcknowledge}
            />
          </Animated.View>
        </Pressable>

        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <QueueVisualization
            currentPosition={activeQueue.position}
            totalInQueue={activeQueue.totalInQueue}
          />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(150).springify()}
          style={[styles.infoCard, { backgroundColor: theme.surface }]}
        >
          <View style={styles.orgInfo}>
            <ThemedText type="body" style={styles.orgName}>
              {activeQueue.organizationName}
            </ThemedText>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              {activeQueue.serviceName}
            </ThemedText>
          </View>
          <View style={styles.waitStats}>
            <View style={styles.statItem}>
              <Feather name="clock" size={16} color={theme.primary} />
              <ThemedText type="caption" style={styles.statValue}>
                {formatWaitTime(activeQueue.estimatedWaitTime)}
              </ThemedText>
            </View>
            <View style={styles.statItem}>
              <Feather name="users" size={16} color={theme.primary} />
              <ThemedText type="caption" style={styles.statValue}>
                {Math.max(0, activeQueue.position - 1)} ahead
              </ThemedText>
            </View>
          </View>
        </Animated.View>

        {incomingSwapRequests.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(175).springify()}>
            {incomingSwapRequests.map((sr) => (
              <View
                key={sr.id}
                style={[styles.swapRequestCard, { backgroundColor: theme.surface, borderLeftColor: theme.warning }]}
              >
                <View style={styles.swapRequestHeader}>
                  <Feather name="repeat" size={18} color={theme.warning} />
                  <ThemedText type="body" style={{ fontWeight: "600", flex: 1, marginLeft: Spacing.sm }}>
                    Swap Request
                  </ThemedText>
                </View>
                <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
                  {sr.requesterTicketNumber} (Position #{sr.requesterPosition}) wants to swap.
                  {sr.isPremium ? " Premium swap - you'll earn compensation!" : " Accept to help them out."}
                </ThemedText>
                <View style={styles.swapRequestActions}>
                  <Pressable
                    onPress={() => declineSwapRequest(sr.id)}
                    style={[styles.swapDeclineBtn, { borderColor: theme.error }]}
                    testID={`button-decline-swap-${sr.id}`}
                  >
                    <Feather name="x" size={14} color={theme.error} />
                    <ThemedText type="small" style={{ color: theme.error, fontWeight: "600", marginLeft: 4 }}>
                      Decline
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => acceptSwapRequest(sr.id)}
                    style={[styles.swapAcceptBtn, { backgroundColor: theme.primary }]}
                    testID={`button-accept-swap-${sr.id}`}
                  >
                    <Feather name="check" size={14} color="#FFFFFF" />
                    <ThemedText type="small" lightColor="#FFFFFF" darkColor="#FFFFFF" style={{ fontWeight: "600", marginLeft: 4 }}>
                      Accept Swap
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            ))}
          </Animated.View>
        ) : null}

        {!isYourTurn ? (
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Pressable
              onPress={toggleActions}
              style={[styles.actionsToggle, { backgroundColor: theme.surface }]}
            >
              <ThemedText type="body" style={{ fontWeight: "600" }}>
                Queue Options
              </ThemedText>
              <Animated.View style={chevronStyle}>
                <Feather name="chevron-down" size={20} color={theme.textSecondary} />
              </Animated.View>
            </Pressable>

            <Animated.View style={actionsContainerStyle}>
              <View style={styles.actions}>
                <View style={styles.actionRow}>
                  <ActionButton
                    icon="clock"
                    label={`Snooze (${remainingSnoozes})`}
                    onPress={() => setShowSnoozeModal(true)}
                    style={styles.actionButton}
                    testID="button-snooze"
                  />
                  <ActionButton
                    icon="repeat"
                    label="Swap"
                    onPress={handleSwap}
                    style={styles.actionButton}
                    testID="button-swap"
                  />
                </View>
                <View style={styles.actionRow}>
                  <ActionButton
                    icon="refresh-cw"
                    label="Change"
                    onPress={handleChangeService}
                    style={styles.actionButton}
                    testID="button-change-service"
                  />
                  <ActionButton
                    icon="x"
                    label="Exit"
                    onPress={handleLeaveQueue}
                    variant="danger"
                    style={styles.actionButton}
                    testID="button-exit"
                  />
                </View>
              </View>
            </Animated.View>
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            style={styles.yourTurnActions}
          >
            <Button onPress={handleAcknowledge} style={styles.acknowledgeButton}>
              I'm Here - Acknowledge
            </Button>
          </Animated.View>
        )}
      </ScrollView>

      <SnoozeModal
        visible={showSnoozeModal}
        onClose={() => setShowSnoozeModal(false)}
        onSnooze={handleSnooze}
        remainingSnoozes={remainingSnoozes}
        maxSnooze={activeQueue.maxSnoozeAllowed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
  },
  activeContent: {
    paddingHorizontal: Spacing.lg,
  },
  ticketContainer: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  infoCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xl,
  },
  orgInfo: {
    marginBottom: Spacing.md,
  },
  orgName: {
    fontWeight: "600",
    marginBottom: 2,
  },
  waitStats: {
    flexDirection: "row",
    gap: Spacing.xl,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statValue: {
    fontWeight: "600",
  },
  actionsToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  actions: {
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  yourTurnActions: {
    marginTop: Spacing.lg,
  },
  acknowledgeButton: {
    paddingVertical: Spacing.lg,
  },
  quickActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing["2xl"],
    paddingHorizontal: Spacing.lg,
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.xl,
    borderRadius: BorderRadius.sm,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  quickActionLabel: {
    fontWeight: "600",
  },
  swapRequestCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
  },
  swapRequestHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  swapRequestActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  swapDeclineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
    borderWidth: 1.5,
  },
  swapAcceptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
});
