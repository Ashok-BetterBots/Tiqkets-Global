import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { PREMIUM_SWAP_PRICING } from "@/types/queue";
import { apiRequest } from "@/lib/query-client";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface SwapCandidate {
  id: string;
  position: number;
  ticketNumber: string;
  priority: "normal" | "vip" | "emergency";
}

function SwapCard({
  candidate,
  onSwap,
  isPremium,
  premiumPrice,
  isSwapping,
}: {
  candidate: SwapCandidate;
  onSwap: () => void;
  isPremium: boolean;
  premiumPrice: number | null;
  isSwapping: boolean;
}) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.98);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getPriorityColor = () => {
    switch (candidate.priority) {
      case "emergency":
        return theme.error;
      case "vip":
        return theme.warning;
      default:
        return theme.primary;
    }
  };

  const getPriorityLabel = () => {
    switch (candidate.priority) {
      case "emergency":
        return "Emergency";
      case "vip":
        return "VIP";
      default:
        return null;
    }
  };

  const priorityLabel = getPriorityLabel();
  const priorityColor = getPriorityColor();

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.swapCard,
        { backgroundColor: theme.backgroundDefault },
        isPremium ? { borderWidth: 2, borderColor: Colors.light.accent } : null,
        animatedStyle,
      ]}
    >
      {isPremium ? (
        <View style={[styles.premiumBanner, { backgroundColor: Colors.light.accent }]}>
          <Feather name="star" size={12} color="#FFFFFF" />
          <ThemedText
            type="caption"
            style={{ fontWeight: "700", marginLeft: 4 }}
            lightColor="#FFFFFF"
            darkColor="#FFFFFF"
          >
            PREMIUM POSITION
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.cardHeader}>
        <View style={[styles.positionBadge, { backgroundColor: priorityColor }]}>
          <ThemedText type="caption" lightColor="#FFFFFF" darkColor="#FFFFFF" style={{ fontWeight: "600" }}>
            #{candidate.position}
          </ThemedText>
          <ThemedText type="h4" lightColor="#FFFFFF" darkColor="#FFFFFF">
            {candidate.ticketNumber}
          </ThemedText>
        </View>
        <View style={styles.cardInfo}>
          <View style={styles.cardTitleRow}>
            <ThemedText type="body" style={styles.positionLabel}>
              Position {candidate.position}
            </ThemedText>
            {priorityLabel ? (
              <View style={[styles.priorityBadge, { backgroundColor: priorityColor + "20" }]}>
                <ThemedText
                  type="caption"
                  style={{ color: priorityColor, fontWeight: "600" }}
                >
                  {priorityLabel}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {isPremium && premiumPrice !== null ? (
        <View style={styles.premiumInfo}>
          <View style={styles.priceBreakdown}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Premium swap fee:
            </ThemedText>
            <ThemedText type="h4" style={{ color: Colors.light.accent }}>
              ${premiumPrice.toFixed(2)}
            </ThemedText>
          </View>
          <View style={styles.shareInfo}>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              ${(premiumPrice * 0.8).toFixed(2)} goes to the customer
            </ThemedText>
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={onSwap}
        disabled={isSwapping}
        style={[
          styles.swapButton,
          { backgroundColor: isPremium ? Colors.light.accent : theme.primary },
          isSwapping ? { opacity: 0.6 } : null,
        ]}
      >
        {isSwapping ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Feather name="repeat" size={16} color="#FFFFFF" />
            <ThemedText
              type="small"
              style={{ fontWeight: "600" }}
              lightColor="#FFFFFF"
              darkColor="#FFFFFF"
            >
              {isPremium ? `Swap for $${premiumPrice?.toFixed(2)}` : "Request Swap"}
            </ThemedText>
          </>
        )}
      </Pressable>
    </AnimatedPressable>
  );
}

export default function SwapPositionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { activeQueue, requestSwap, getPremiumSwapPrice, outgoingSwapRequest, cancelSwapRequest } = useQueue();
  const [isSwapping, setIsSwapping] = useState(false);
  const [candidates, setCandidates] = useState<SwapCandidate[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);
  const [swapSent, setSwapSent] = useState(false);
  const [notifiedCount, setNotifiedCount] = useState(0);

  const loadCandidates = useCallback(async () => {
    if (!activeQueue?.id || !activeQueue?.organizationId) {
      setIsLoadingCandidates(false);
      return;
    }
    try {
      const response = await apiRequest(
        "GET",
        `/api/branches/${activeQueue.organizationId}/candidates-for-swap/${activeQueue.id}`
      );
      const data = await response.json();
      setCandidates(data.candidates || []);
    } catch (error) {
      console.error("Error loading swap candidates:", error);
    } finally {
      setIsLoadingCandidates(false);
    }
  }, [activeQueue?.id, activeQueue?.organizationId]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    if (outgoingSwapRequest) {
      setSwapSent(true);
    }
  }, [outgoingSwapRequest]);

  const handleSwap = async (isPremium: boolean) => {
    const premiumPricing = isPremium ? getPremiumSwapPrice(1) : null;

    setIsSwapping(true);
    try {
      const result = await requestSwap(isPremium, premiumPricing?.amount);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSwapSent(true);
      setNotifiedCount(result.notifiedCount);
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSwapping(false);
    }
  };

  const handleCancelSwap = async () => {
    await cancelSwapRequest();
    setSwapSent(false);
    setNotifiedCount(0);
  };

  if (!activeQueue) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <EmptyState
          image={require("../../assets/images/empty-queue.png")}
          title="Not in a Queue"
          description="You need to be in a queue to swap positions."
        />
      </View>
    );
  }

  if (swapSent || outgoingSwapRequest) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.sentContainer}>
          <View style={[styles.sentIcon, { backgroundColor: theme.primary + "15" }]}>
            <Feather name="send" size={48} color={theme.primary} />
          </View>
          <ThemedText type="h3" style={styles.sentTitle}>
            Swap Request Sent
          </ThemedText>
          <ThemedText type="body" style={[styles.sentDescription, { color: theme.textSecondary }]}>
            Your swap request has been sent to {notifiedCount > 0 ? `${notifiedCount} customer${notifiedCount > 1 ? "s" : ""}` : "customers"} ahead of you.
            The first person to accept will swap positions with you.
          </ThemedText>

          <Pressable
            onPress={handleCancelSwap}
            style={[styles.cancelButton, { borderColor: theme.error, borderWidth: 1.5 }]}
            testID="button-cancel-swap"
          >
            <Feather name="x" size={16} color={theme.error} />
            <ThemedText type="body" style={{ color: theme.error, fontWeight: "600", marginLeft: Spacing.sm }}>
              Cancel Request
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.doneButton, { backgroundColor: theme.primary }]}
            testID="button-done-swap"
          >
            <ThemedText type="body" lightColor="#FFFFFF" darkColor="#FFFFFF" style={{ fontWeight: "600" }}>
              Done
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isLoadingCandidates) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText type="body" style={{ marginTop: Spacing.lg, color: theme.textSecondary }}>
          Loading queue...
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        data={candidates}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const isPremium = item.position <= 3;
          const premiumPricing = isPremium ? getPremiumSwapPrice(item.position) : null;

          return (
            <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
              <SwapCard
                candidate={item}
                onSwap={() => handleSwap(isPremium)}
                isPremium={isPremium}
                premiumPrice={premiumPricing?.amount ?? null}
                isSwapping={isSwapping}
              />
            </Animated.View>
          );
        }}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.yourPosition, { backgroundColor: theme.primary + "10" }]}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>Your Position</ThemedText>
              <ThemedText type="h2" style={{ color: theme.primary }}>#{activeQueue.position}</ThemedText>
            </View>
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              Request to swap with someone ahead of you. All customers before you will receive a notification, and whoever accepts first will swap positions with you.
            </ThemedText>

            <View style={[styles.premiumNote, { backgroundColor: Colors.light.accent + "15" }]}>
              <Feather name="star" size={16} color={Colors.light.accent} />
              <ThemedText type="small" style={{ flex: 1, marginLeft: Spacing.sm }}>
                <ThemedText type="small" style={{ fontWeight: "700", color: Colors.light.accent }}>
                  Premium positions (1-3):
                </ThemedText>{" "}
                Swapping to top 3 positions requires a fee. 80% goes to the accepting customer as compensation.
              </ThemedText>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="users" size={48} color={theme.textSecondary} />
            <ThemedText
              type="body"
              style={[styles.emptyText, { color: theme.textSecondary }]}
            >
              No one ahead to swap with
            </ThemedText>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  yourPosition: {
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  premiumNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
  },
  swapCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  premiumBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xs,
    marginTop: -Spacing.lg,
    marginHorizontal: -Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  positionBadge: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flex: 1,
    marginLeft: Spacing.lg,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 2,
  },
  positionLabel: {
    fontWeight: "600",
  },
  priorityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  premiumInfo: {
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: BorderRadius.xs,
  },
  priceBreakdown: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  shareInfo: {
    alignItems: "flex-end",
  },
  swapButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xs,
    gap: Spacing.sm,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["5xl"],
  },
  emptyText: {
    marginTop: Spacing.lg,
    textAlign: "center",
  },
  sentContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["2xl"],
    gap: Spacing.lg,
  },
  sentIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  sentTitle: {
    textAlign: "center",
  },
  sentDescription: {
    textAlign: "center",
    lineHeight: 22,
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing["2xl"],
    borderRadius: BorderRadius.xs,
    marginTop: Spacing.lg,
  },
  doneButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing["3xl"],
    borderRadius: BorderRadius.xs,
  },
});
