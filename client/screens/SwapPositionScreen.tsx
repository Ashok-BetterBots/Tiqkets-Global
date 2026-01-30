import React, { useState } from "react";
import { View, StyleSheet, FlatList, Pressable, Alert } from "react-native";
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface SwapCandidate {
  id: string;
  position: number;
  ticketNumber: string;
  reason?: string;
  priority: "normal" | "vip" | "emergency";
}

const MOCK_CANDIDATES: SwapCandidate[] = [
  { id: "1", position: 1, ticketNumber: "AB123", reason: "Medical Emergency", priority: "emergency" },
  { id: "2", position: 2, ticketNumber: "CD456", reason: "VIP Customer", priority: "vip" },
  { id: "3", position: 3, ticketNumber: "EF789", priority: "normal" },
  { id: "4", position: 4, ticketNumber: "GH012", reason: "Elderly", priority: "normal" },
  { id: "5", position: 5, ticketNumber: "IJ345", priority: "normal" },
  { id: "6", position: 6, ticketNumber: "KL678", priority: "normal" },
];

function SwapCard({
  candidate,
  onSwap,
  isPremium,
  premiumPrice,
}: {
  candidate: SwapCandidate;
  onSwap: () => void;
  isPremium: boolean;
  premiumPrice: number | null;
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
        isPremium && { borderWidth: 2, borderColor: Colors.light.accent },
        animatedStyle,
      ]}
    >
      {isPremium && (
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
      )}

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
          {candidate.reason ? (
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {candidate.reason}
            </ThemedText>
          ) : null}
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
        style={[
          styles.swapButton,
          { backgroundColor: isPremium ? Colors.light.accent : theme.primary },
        ]}
      >
        <Feather name="repeat" size={16} color="#FFFFFF" />
        <ThemedText
          type="small"
          style={{ fontWeight: "600" }}
          lightColor="#FFFFFF"
          darkColor="#FFFFFF"
        >
          {isPremium ? `Swap for $${premiumPrice?.toFixed(2)}` : "Request Swap"}
        </ThemedText>
      </Pressable>
    </AnimatedPressable>
  );
}

export default function SwapPositionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { activeQueue, requestSwap, getPremiumSwapPrice } = useQueue();
  const [isSwapping, setIsSwapping] = useState(false);

  const handleSwap = (candidate: SwapCandidate, isPremium: boolean) => {
    const premiumPrice = isPremium ? getPremiumSwapPrice(candidate.position) : null;

    if (isPremium && premiumPrice) {
      Alert.alert(
        "Premium Swap",
        `Swap to position #${candidate.position} for $${premiumPrice.amount.toFixed(2)}?\n\n$${premiumPrice.customerShare.toFixed(2)} will go to the customer accepting the swap.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: `Pay $${premiumPrice.amount.toFixed(2)}`,
            onPress: async () => {
              setIsSwapping(true);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await requestSwap(candidate.position, candidate.ticketNumber, true);
              setIsSwapping(false);
              Alert.alert(
                "Swap Requested",
                "Your premium swap request has been sent to all customers ahead of you. You'll be notified when someone accepts.",
                [{ text: "OK", onPress: () => navigation.goBack() }]
              );
            },
          },
        ]
      );
    } else {
      Alert.alert(
        "Request Swap",
        `Request to swap with position #${candidate.position} (${candidate.ticketNumber})?\n\nThis request will be sent to all customers ahead of you. The first one to accept will swap positions and ticket numbers with you.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Send Request",
            onPress: async () => {
              setIsSwapping(true);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await requestSwap(candidate.position, candidate.ticketNumber, false);
              setIsSwapping(false);
              Alert.alert(
                "Swap Requested",
                "Your swap request has been sent to all customers ahead of you. You'll be notified when someone accepts.",
                [{ text: "OK", onPress: () => navigation.goBack() }]
              );
            },
          },
        ]
      );
    }
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

  const candidates = MOCK_CANDIDATES.filter((c) => c.position < activeQueue.position);

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
                onSwap={() => handleSwap(item, isPremium)}
                isPremium={isPremium}
                premiumPrice={premiumPricing?.amount ?? null}
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
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              Request to swap with someone ahead of you. All customers before you will receive a notification, and whoever accepts first will swap both position and ticket number with you.
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
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.xl,
    gap: Spacing.lg,
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
});
