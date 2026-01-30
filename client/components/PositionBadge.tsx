import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing } from "@/constants/theme";

interface PositionBadgeProps {
  position: number;
  size?: "small" | "large";
  status?: "waiting" | "next" | "called";
}

export function PositionBadge({ position, size = "large", status = "waiting" }: PositionBadgeProps) {
  const { isDark } = useTheme();
  const scale = useSharedValue(1);

  React.useEffect(() => {
    if (status === "next" || status === "called") {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 800 }),
          withTiming(1, { duration: 800 })
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

  const badgeSize = size === "large" ? 140 : 60;
  const fontSize = size === "large" ? 56 : 24;
  const hashSize = size === "large" ? 28 : 14;

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
        style={[
          styles.badge,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
          },
        ]}
      >
        <View style={styles.inner}>
          <ThemedText
            style={[styles.hash, { fontSize: hashSize }]}
            lightColor="#FFFFFF"
            darkColor="#FFFFFF"
          >
            #
          </ThemedText>
          <ThemedText
            style={[styles.position, { fontSize }]}
            lightColor="#FFFFFF"
            darkColor="#FFFFFF"
          >
            {position}
          </ThemedText>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1A73E8",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  inner: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  hash: {
    fontWeight: "600",
    marginTop: 4,
    marginRight: 2,
  },
  position: {
    fontWeight: "700",
  },
});
