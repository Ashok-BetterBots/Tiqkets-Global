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
import { TicketCard } from "@/components/TicketCard";
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
            style={[styles.quickAction, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}
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
            style={[styles.quickAction, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}
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
        <Animated.View entering={FadeIn.duration(400)} style={styles.ticketContainer}>
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
            onManagePress={isYourTurn ? undefined : toggleActions}
            manageLabel="Manage Queue"
          />
        </Animated.View>

        {incomingSwapRequests.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(175).springify()}>
            {incomingSwapRequests.map((sr) => (
              <View
                key={sr.id}
                style={[styles.swapRequestCard, { backgroundColor: theme.surface, borderLeftColor: theme.warning, borderTopColor: theme.borderSubtle, borderRightColor: theme.borderSubtle, borderBottomColor: theme.borderSubtle }]}
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
    marginBottom: Spacing.lg,
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
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
