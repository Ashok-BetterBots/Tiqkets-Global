import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { QueueStats } from "@/types/queue";

interface StatsCardProps {
  stats: QueueStats;
}

export function StatsCard({ stats }: StatsCardProps) {
  const { theme, isDark } = useTheme();

  return (
    <LinearGradient
      colors={isDark ? [Colors.dark.primary, "#0052CC"] : [Colors.light.primary, Colors.light.primaryDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <ThemedText
        type="body"
        style={styles.title}
        lightColor="#FFFFFF"
        darkColor="#FFFFFF"
      >
        Your Queue Stats
      </ThemedText>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <ThemedText
            type="h2"
            style={styles.statValue}
            lightColor="#FFFFFF"
            darkColor="#FFFFFF"
          >
            {stats.totalQueuesJoined}
          </ThemedText>
          <ThemedText
            type="caption"
            style={styles.statLabel}
            lightColor="rgba(255,255,255,0.8)"
            darkColor="rgba(255,255,255,0.8)"
          >
            Queues Joined
          </ThemedText>
        </View>

        <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.3)" }]} />

        <View style={styles.statItem}>
          <ThemedText
            type="h2"
            style={styles.statValue}
            lightColor="#FFFFFF"
            darkColor="#FFFFFF"
          >
            {stats.averageWaitTime}
          </ThemedText>
          <ThemedText
            type="caption"
            style={styles.statLabel}
            lightColor="rgba(255,255,255,0.8)"
            darkColor="rgba(255,255,255,0.8)"
          >
            Avg. Wait (min)
          </ThemedText>
        </View>

        <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.3)" }]} />

        <View style={styles.statItem}>
          <ThemedText
            type="h2"
            style={styles.statValue}
            lightColor="#FFFFFF"
            darkColor="#FFFFFF"
          >
            {stats.organizationsVisited}
          </ThemedText>
          <ThemedText
            type="caption"
            style={styles.statLabel}
            lightColor="rgba(255,255,255,0.8)"
            darkColor="rgba(255,255,255,0.8)"
          >
            Organizations
          </ThemedText>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  title: {
    fontWeight: "600",
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    marginBottom: Spacing.xs,
  },
  statLabel: {
    textAlign: "center",
  },
  divider: {
    width: 1,
    height: 40,
    marginHorizontal: Spacing.md,
  },
});
