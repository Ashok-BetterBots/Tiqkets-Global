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
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { Spacing, BorderRadius } from "@/constants/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface SwapCandidate {
  id: string;
  position: number;
  reason?: string;
  priority: "normal" | "vip" | "emergency";
}

const MOCK_CANDIDATES: SwapCandidate[] = [
  { id: "1", position: 2, reason: "Medical Emergency", priority: "emergency" },
  { id: "2", position: 3, reason: "VIP Customer", priority: "vip" },
  { id: "3", position: 4, priority: "normal" },
  { id: "4", position: 5, reason: "Elderly", priority: "normal" },
];

function SwapCard({ candidate, onSwap }: { candidate: SwapCandidate; onSwap: () => void }) {
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
        animatedStyle,
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.positionBadge, { backgroundColor: priorityColor }]}>
          <ThemedText
            type="h4"
            lightColor="#FFFFFF"
            darkColor="#FFFFFF"
          >
            #{candidate.position}
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
      <Pressable
        onPress={onSwap}
        style={[styles.swapButton, { backgroundColor: theme.primary }]}
      >
        <Feather name="repeat" size={16} color="#FFFFFF" />
        <ThemedText
          type="small"
          style={{ fontWeight: "600" }}
          lightColor="#FFFFFF"
          darkColor="#FFFFFF"
        >
          Swap
        </ThemedText>
      </Pressable>
    </AnimatedPressable>
  );
}

export default function SwapPositionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { activeQueue, requestSwap } = useQueue();
  const [isSwapping, setIsSwapping] = useState(false);

  const handleSwap = (candidate: SwapCandidate) => {
    Alert.alert(
      "Confirm Swap",
      `Swap your position with #${candidate.position}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Swap",
          onPress: async () => {
            setIsSwapping(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await requestSwap(candidate.position);
            setIsSwapping(false);
            navigation.goBack();
          },
        },
      ]
    );
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
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
            <SwapCard candidate={item} onSwap={() => handleSwap(item)} />
          </Animated.View>
        )}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              Request to swap with someone ahead of you. They will be notified and can accept or decline.
            </ThemedText>
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
  },
  swapCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  positionBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
