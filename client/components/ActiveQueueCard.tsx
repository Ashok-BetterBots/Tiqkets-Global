import React from "react";
import { View, StyleSheet, Pressable, ViewStyle, StyleProp } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { QueueEntry } from "@/types/queue";

interface ActiveQueueCardProps {
  queue: QueueEntry;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ActiveQueueCard({
  queue,
  onPress,
  style,
  testID = "card-active-queue",
}: ActiveQueueCardProps) {
  const { theme } = useTheme();

  const getExpiryTime = () => {
    const joinedAt = new Date(queue.joinedAt);
    const expiryTime = new Date(
      joinedAt.getTime() + queue.estimatedWaitTime * 60 * 1000,
    );
    return expiryTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const progress = (() => {
    if (queue.totalInQueue === 0) return 1;
    const p = (queue.totalInQueue - queue.position) / queue.totalInQueue;
    return Math.min(Math.max(p, 0.05), 1);
  })();

  const minutesLeft = Math.max(0, queue.estimatedWaitTime);

  const onSurface = "#FFFFFF";
  const onSurfaceMuted = "rgba(255,255,255,0.78)";
  const onSurfaceFaint = "rgba(255,255,255,0.18)";
  const onSurfaceTrack = "rgba(255,255,255,0.22)";

  return (
    <Animated.View entering={FadeInUp.springify()} style={style}>
      <Pressable
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [
          styles.container,
          {
            backgroundColor: BrandColors.primary,
            borderColor: BrandColors.primary,
            opacity: pressed ? 0.96 : 1,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <ThemedText
              style={[styles.orgName, { color: onSurface }]}
              numberOfLines={1}
            >
              {queue.organizationName}
            </ThemedText>
            <ThemedText
              style={[styles.serviceName, { color: onSurfaceMuted }]}
              numberOfLines={1}
            >
              {queue.serviceName}
            </ThemedText>
          </View>
          <View
            style={[
              styles.ticketPill,
              { backgroundColor: onSurfaceFaint },
            ]}
          >
            <ThemedText
              style={[styles.ticketPillText, { color: onSurface }]}
            >
              {queue.ticketNumber}
            </ThemedText>
          </View>
        </View>

        {/* Hero metric */}
        <View style={styles.heroRow}>
          <View style={styles.heroTextWrap}>
            <ThemedText style={[styles.heroNumber, { color: onSurface }]}>
              {minutesLeft}
              <ThemedText
                style={[styles.heroUnit, { color: onSurfaceMuted }]}
              >
                {" "}
                min left
              </ThemedText>
            </ThemedText>
            <ThemedText
              style={[styles.heroSub, { color: onSurfaceMuted }]}
            >
              Estimated call at {getExpiryTime()}
            </ThemedText>
          </View>
          <View
            style={[
              styles.positionPill,
              { backgroundColor: onSurfaceFaint },
            ]}
          >
            <ThemedText
              style={[styles.positionLabel, { color: onSurfaceMuted }]}
            >
              Position
            </ThemedText>
            <ThemedText style={[styles.positionValue, { color: onSurface }]}>
              #{queue.position}
            </ThemedText>
          </View>
        </View>

        {/* Progress */}
        <View style={styles.progressRow}>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: onSurfaceTrack },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress * 100}%`,
                  backgroundColor: onSurface,
                },
              ]}
            />
          </View>
          <View style={styles.progressMeta}>
            <Feather name="users" size={12} color={onSurfaceMuted} />
            <ThemedText
              style={[styles.progressMetaText, { color: onSurfaceMuted }]}
            >
              {queue.totalInQueue} in queue
            </ThemedText>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  orgName: {
    fontSize: 15,
    fontWeight: "700",
  },
  serviceName: {
    fontSize: 13,
    fontWeight: "500",
  },
  ticketPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  ticketPillText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  heroTextWrap: {
    flex: 1,
    gap: 2,
  },
  heroNumber: {
    fontSize: 32,
    fontWeight: "700",
    lineHeight: 38,
  },
  heroUnit: {
    fontSize: 14,
    fontWeight: "500",
  },
  heroSub: {
    fontSize: 12,
    fontWeight: "500",
  },
  positionPill: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    minWidth: 76,
  },
  positionLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  positionValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  progressRow: {
    gap: Spacing.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  progressMetaText: {
    fontSize: 11,
    fontWeight: "500",
  },
});
