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
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
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
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const { activeQueue, leaveQueue, snooze, refreshQueue, canSnooze, getRemainingSnoozes } = useQueue();
  const [refreshing, setRefreshing] = useState(false);
  const [showSnoozeModal, setShowSnoozeModal] = useState(false);

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
            style={[styles.quickAction, { backgroundColor: theme.backgroundDefault }]}
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
            style={[styles.quickAction, { backgroundColor: theme.backgroundDefault }]}
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

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={[
          styles.activeContent,
          {
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <Animated.View entering={FadeIn.duration(400)} style={styles.ticketContainer}>
          <TicketBadge
            ticketNumber={activeQueue.ticketNumber}
            position={activeQueue.position}
            status={activeQueue.status}
          />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(150).springify()}
          style={[styles.orgCard, { backgroundColor: theme.backgroundDefault }]}
        >
          <ThemedText type="h4" style={styles.orgName}>
            {activeQueue.organizationName}
          </ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>
            {activeQueue.serviceName}
          </ThemedText>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.waitTimeContainer}
        >
          <View style={[styles.waitTimeCard, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="clock" size={20} color={theme.primary} />
            <View style={styles.waitTimeText}>
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                Estimated Wait
              </ThemedText>
              <ThemedText type="h4">
                {formatWaitTime(activeQueue.estimatedWaitTime)}
              </ThemedText>
            </View>
          </View>

          <View style={[styles.waitTimeCard, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="users" size={20} color={theme.primary} />
            <View style={styles.waitTimeText}>
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                People Ahead
              </ThemedText>
              <ThemedText type="h4">
                {activeQueue.position - 1}
              </ThemedText>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <QueueVisualization
            currentPosition={activeQueue.position}
            totalInQueue={activeQueue.totalInQueue}
          />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(300).springify()}
          style={styles.actions}
        >
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
              label="Change Service"
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
        </Animated.View>
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
  orgCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  orgName: {
    marginBottom: Spacing.xs,
    textAlign: "center",
  },
  waitTimeContainer: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  waitTimeCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.md,
  },
  waitTimeText: {
    flex: 1,
  },
  actions: {
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
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
});
