import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

interface TicketBadgeProps {
  ticketNumber: string;
  position: number;
  status?: "waiting" | "next" | "called";
}

export function TicketBadge({ ticketNumber, position, status = "waiting" }: TicketBadgeProps) {
  const scale = useSharedValue(1);

  React.useEffect(() => {
    if (status === "next" || status === "called") {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 1000 }),
          withTiming(1, { duration: 1000 })
        ),
        -1,
        true
      );
    } else {
      scale.value = 1;
    }
  }, [status]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const gradientColors = status === "called"
    ? [Colors.light.accent, "#FF8F5E"]
    : status === "next"
    ? [Colors.light.success, "#34D399"]
    : [Colors.light.primary, Colors.light.primaryDark];

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <LinearGradient
        colors={gradientColors as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.badge}
      >
        <ThemedText
          type="caption"
          style={styles.label}
          lightColor="rgba(255,255,255,0.8)"
          darkColor="rgba(255,255,255,0.8)"
        >
          TICKET
        </ThemedText>
        <ThemedText
          style={styles.ticketNumber}
          lightColor="#FFFFFF"
          darkColor="#FFFFFF"
        >
          {ticketNumber}
        </ThemedText>
      </LinearGradient>

      <View style={styles.positionContainer}>
        <ThemedText type="caption" style={styles.positionLabel}>
          Position in Queue
        </ThemedText>
        <View style={styles.positionRow}>
          <ThemedText type="h2" style={styles.positionNumber}>
            #{position}
          </ThemedText>
          {status === "next" && (
            <View style={[styles.statusBadge, { backgroundColor: Colors.light.success + "20" }]}>
              <ThemedText
                type="caption"
                style={{ color: Colors.light.success, fontWeight: "700" }}
              >
                NEXT
              </ThemedText>
            </View>
          )}
          {status === "called" && (
            <View style={[styles.statusBadge, { backgroundColor: Colors.light.accent + "20" }]}>
              <ThemedText
                type="caption"
                style={{ color: Colors.light.accent, fontWeight: "700" }}
              >
                YOUR TURN
              </ThemedText>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  badge: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing["3xl"],
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    minWidth: 160,
    shadowColor: "#1A73E8",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  label: {
    fontWeight: "600",
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  ticketNumber: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: 2,
  },
  positionContainer: {
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  positionLabel: {
    opacity: 0.6,
    marginBottom: Spacing.xs,
  },
  positionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  positionNumber: {
    fontWeight: "700",
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
});
