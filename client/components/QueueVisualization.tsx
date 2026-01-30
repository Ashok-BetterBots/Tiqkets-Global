import React from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface QueueVisualizationProps {
  currentPosition: number;
  totalInQueue: number;
}

export function QueueVisualization({ currentPosition, totalInQueue }: QueueVisualizationProps) {
  const { theme } = useTheme();

  const positions = React.useMemo(() => {
    const items: Array<{ position: number; isCurrent: boolean; isPast: boolean }> = [];
    const start = Math.max(1, currentPosition - 2);
    const end = Math.min(totalInQueue, currentPosition + 2);
    
    for (let i = start; i <= end; i++) {
      items.push({ 
        position: i, 
        isCurrent: i === currentPosition,
        isPast: i < currentPosition,
      });
    }
    
    return items;
  }, [currentPosition, totalInQueue]);

  return (
    <View style={styles.container}>
      <View style={[styles.line, { backgroundColor: theme.border }]} />
      <View style={styles.positions}>
        {positions.map((item, index) => (
          <AnimatedDot
            key={item.position}
            isCurrent={item.isCurrent}
            isPast={item.isPast}
            index={index}
            theme={theme}
          />
        ))}
      </View>
    </View>
  );
}

interface AnimatedDotProps {
  isCurrent: boolean;
  isPast: boolean;
  index: number;
  theme: any;
}

function AnimatedDot({ isCurrent, isPast, index, theme }: AnimatedDotProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(isCurrent ? 1 : 0.6);

  React.useEffect(() => {
    if (isCurrent) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      scale.value = withDelay(
        index * 100,
        withTiming(1, { duration: 300 })
      );
    }
  }, [isCurrent, index]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: isCurrent ? 1 : opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        isCurrent && styles.currentDot,
        isPast && styles.pastDot,
        { 
          backgroundColor: isCurrent 
            ? theme.primary 
            : isPast 
              ? theme.success + "60"
              : theme.backgroundSecondary,
        },
        animatedStyle,
      ]}
    >
      {isCurrent ? (
        <View style={styles.innerDot} />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  line: {
    position: "absolute",
    top: "50%",
    left: Spacing["3xl"],
    right: Spacing["3xl"],
    height: 2,
    borderRadius: 1,
  },
  positions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  currentDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    shadowColor: "#1A73E8",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  pastDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  innerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },
});
