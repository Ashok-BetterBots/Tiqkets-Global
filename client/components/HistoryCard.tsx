import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { HistoryEntry } from "@/types/queue";

interface HistoryCardProps {
  entry: HistoryEntry;
  onPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function HistoryCard({ entry, onPress }: HistoryCardProps) {
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = () => {
    switch (entry.status) {
      case "completed":
        return theme.success;
      case "cancelled":
        return theme.warning;
      case "no_show":
        return theme.error;
      default:
        return theme.textSecondary;
    }
  };

  const getStatusLabel = () => {
    switch (entry.status) {
      case "completed":
        return "Completed";
      case "cancelled":
        return "Cancelled";
      case "no_show":
        return "No Show";
      default:
        return entry.status;
    }
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.borderSubtle,
        },
        animatedStyle,
      ]}
    >
      <View style={styles.header}>
        <View
          style={[
            styles.ticketBadge,
            { backgroundColor: theme.primary + "12" },
          ]}
        >
          <ThemedText type="caption" style={{ color: theme.primary, fontWeight: "600" }}>
            {entry.ticketNumber}
          </ThemedText>
        </View>
        <View
          style={[styles.statusBadge, { backgroundColor: getStatusColor() + "20" }]}
        >
          <ThemedText
            type="caption"
            style={{ color: getStatusColor(), fontWeight: "600" }}
          >
            {getStatusLabel()}
          </ThemedText>
        </View>
      </View>

      <View style={styles.orgInfo}>
        <ThemedText type="body" style={styles.orgName}>
          {entry.organizationName}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {entry.serviceName}
        </ThemedText>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <View style={styles.details}>
        <View style={styles.detailItem}>
          <Feather name="calendar" size={14} color={theme.textSecondary} />
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            {formatDate(entry.completedAt)}
          </ThemedText>
        </View>
        <View style={styles.detailItem}>
          <Feather name="clock" size={14} color={theme.textSecondary} />
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            {entry.waitTime} min wait
          </ThemedText>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  ticketBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: "rgba(26, 115, 232, 0.1)",
    borderRadius: BorderRadius.xs,
  },
  orgInfo: {
    marginBottom: Spacing.md,
  },
  orgName: {
    fontWeight: "600",
    marginBottom: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.md,
  },
  details: {
    flexDirection: "row",
    gap: Spacing.xl,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
});
