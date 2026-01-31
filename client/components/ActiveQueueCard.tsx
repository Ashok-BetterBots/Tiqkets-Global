import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { QueueEntry } from "@/types/queue";

interface ActiveQueueCardProps {
  queue: QueueEntry;
  onPress: () => void;
}

export function ActiveQueueCard({ queue, onPress }: ActiveQueueCardProps) {
  const { theme } = useTheme();

  const getExpiryTime = () => {
    const joinedAt = new Date(queue.joinedAt);
    const expiryTime = new Date(joinedAt.getTime() + queue.estimatedWaitTime * 60 * 1000);
    return expiryTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getProgressPercentage = () => {
    if (queue.totalInQueue === 0) return 100;
    const progress = ((queue.totalInQueue - queue.position) / queue.totalInQueue) * 100;
    return Math.min(Math.max(progress, 5), 100);
  };

  return (
    <Animated.View entering={FadeInUp.springify()}>
      <Pressable
        style={[styles.container, { backgroundColor: theme.backgroundDefault }]}
        onPress={onPress}
        testID="card-active-queue"
      >
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: BrandColors.primary + "15" }]}>
            <Feather name="clipboard" size={20} color={BrandColors.primary} />
          </View>
          <View style={styles.headerRight}>
            <ThemedText style={[styles.ticketNumber, { color: theme.text }]}>
              {queue.ticketNumber}
            </ThemedText>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              {queue.organizationName}
            </ThemedText>
          </View>
          <View style={styles.notificationIcon}>
            <Feather name="bell" size={18} color={BrandColors.accent} />
          </View>
        </View>

        <View style={styles.mainContent}>
          <View style={styles.timeContainer}>
            <ThemedText style={[styles.timeLeft, { color: theme.text }]}>
              {queue.estimatedWaitTime} minutes left
            </ThemedText>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              Est. call at: {getExpiryTime()}
            </ThemedText>
          </View>
        </View>

        <View style={styles.details}>
          <View style={styles.detailItem}>
            <Feather name="map-pin" size={12} color={theme.textSecondary} />
            <ThemedText type="caption" style={[styles.detailText, { color: theme.textSecondary }]} numberOfLines={1}>
              {queue.serviceName}
            </ThemedText>
          </View>
          <View style={styles.detailItem}>
            <Feather name="hash" size={12} color={theme.textSecondary} />
            <ThemedText type="caption" style={[styles.detailText, { color: theme.textSecondary }]}>
              Position #{queue.position}
            </ThemedText>
          </View>
        </View>

        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  width: `${getProgressPercentage()}%`,
                  backgroundColor: BrandColors.primary,
                }
              ]} 
            />
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  headerRight: {
    flex: 1,
  },
  ticketNumber: {
    fontSize: 18,
    fontWeight: "700",
  },
  notificationIcon: {
    padding: Spacing.xs,
  },
  mainContent: {
    marginBottom: Spacing.sm,
  },
  timeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  timeLeft: {
    fontSize: 20,
    fontWeight: "700",
  },
  details: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flex: 1,
  },
  detailText: {
    flex: 1,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
});
