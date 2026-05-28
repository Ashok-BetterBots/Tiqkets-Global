import React from "react";
import { View, StyleSheet, Pressable, ViewStyle, StyleProp } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, AuroraColors } from "@/constants/theme";
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
  const getExpiryTime = () => {
    // Prefer the AI predictor's absolute timestamp when the server
    // supplied one — it's refreshed on every queue mutation against
    // current desk capacity, so it stays honest as people ahead are
    // served / no-show / swap out. Fall back to the historical
    // `joinedAt + estimatedWaitTime` math when the predictor is off
    // or the response is from an older server build.
    const expiryTime = queue.predictedServiceAt
      ? new Date(queue.predictedServiceAt)
      : new Date(
          new Date(queue.joinedAt).getTime() +
            queue.estimatedWaitTime * 60 * 1000,
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

  return (
    <Animated.View entering={FadeInUp.springify()} style={style}>
      {/* Subtle outer aurora halo */}
      <View pointerEvents="none" style={styles.haloWrap}>
        <LinearGradient
          colors={[AuroraColors.magenta, AuroraColors.violet, AuroraColors.magenta]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.halo}
        />
      </View>

      <Pressable
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [
          styles.container,
          { opacity: pressed ? 0.96 : 1 },
        ]}
      >
        {/* Header row */}
        <View style={styles.header}>
          <View style={styles.statusRow}>
            <View style={styles.liveDot} />
            <ThemedText style={styles.statusLabel}>ACTIVE QUEUE</ThemedText>
          </View>
          <View style={styles.calledPill}>
            <ThemedText style={styles.calledText}>
              Called ~{getExpiryTime()}
            </ThemedText>
          </View>
        </View>

        {/* Org + ticket */}
        <View style={styles.orgRow}>
          <View style={styles.orgTextWrap}>
            <ThemedText style={styles.orgName} numberOfLines={1}>
              {queue.organizationName}
            </ThemedText>
            <ThemedText style={styles.serviceName} numberOfLines={1}>
              {queue.serviceName}
            </ThemedText>
          </View>
          <LinearGradient
            colors={[AuroraColors.magenta, AuroraColors.violet]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ticketBadge}
          >
            <ThemedText style={styles.ticketBadgeText}>
              {queue.ticketNumber}
            </ThemedText>
          </LinearGradient>
        </View>

        {/* Position + ETA */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCol}>
            <ThemedText style={styles.metricLabel}>POSITION</ThemedText>
            <View style={styles.metricValueRow}>
              <ThemedText style={styles.metricValue}>
                #{queue.position}
              </ThemedText>
              <ThemedText style={styles.metricValueSub}>
                {" "}/ {queue.totalInQueue}
              </ThemedText>
            </View>
          </View>
          <View style={[styles.metricCol, { alignItems: "flex-end" }]}>
            <ThemedText style={styles.metricLabel}>EST. TIME</ThemedText>
            <View style={styles.metricValueRow}>
              <ThemedText
                style={[styles.metricValue, { color: AuroraColors.success }]}
              >
                {minutesLeft}
              </ThemedText>
              <ThemedText
                style={[
                  styles.metricValueSub,
                  { color: "rgba(0,255,148,0.7)" },
                ]}
              >
                {" "}min
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Progress */}
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={[AuroraColors.magenta, AuroraColors.success]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${progress * 100}%` }]}
          />
        </View>

        {/* CTA */}
        <View style={styles.ctaRow}>
          <ThemedText style={styles.ctaText}>View ticket details</ThemedText>
          <Feather name="chevron-right" size={16} color={AuroraColors.text} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  haloWrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.lg + 4,
    overflow: "hidden",
    opacity: 0.18,
    margin: -2,
  },
  halo: {
    flex: 1,
    borderRadius: BorderRadius.lg + 4,
  },
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: AuroraColors.borderStrong,
    backgroundColor: AuroraColors.bgGlass,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AuroraColors.success,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: AuroraColors.textMuted,
  },
  calledPill: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  calledText: {
    fontSize: 11,
    color: AuroraColors.textMuted,
    fontWeight: "500",
  },
  orgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  orgTextWrap: {
    flex: 1,
    gap: 2,
  },
  orgName: {
    fontSize: 18,
    fontWeight: "700",
    color: AuroraColors.text,
  },
  serviceName: {
    fontSize: 13,
    fontWeight: "500",
    color: AuroraColors.textMuted,
  },
  ticketBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  ticketBadgeText: {
    fontSize: 15,
    fontWeight: "900",
    color: AuroraColors.text,
    letterSpacing: 1,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  metricCol: {
    gap: 4,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.2,
    color: AuroraColors.textFaint,
  },
  metricValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  metricValue: {
    fontSize: 36,
    fontWeight: "900",
    color: AuroraColors.text,
    lineHeight: 38,
  },
  metricValueSub: {
    fontSize: 13,
    fontWeight: "500",
    color: AuroraColors.textFaint,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: AuroraColors.border,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: "600",
    color: AuroraColors.text,
  },
});
