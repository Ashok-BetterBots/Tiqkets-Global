import React, { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface QueueVisualizationProps {
  currentPosition: number;
  totalInQueue: number;
}

export function QueueVisualization({ currentPosition, totalInQueue }: QueueVisualizationProps) {
  const { theme } = useTheme();
  const prevPositionRef = useRef(currentPosition);
  const slideOffset = useSharedValue(0);

  const positions = React.useMemo(() => {
    const items: Array<{ position: number; isCurrent: boolean; isBehind: boolean }> = [];
    const start = Math.max(1, currentPosition - 2);
    const end = Math.min(totalInQueue, currentPosition + 2);
    
    for (let i = start; i <= end; i++) {
      items.push({ 
        position: i, 
        isCurrent: i === currentPosition,
        isBehind: i > currentPosition,
      });
    }
    
    return items;
  }, [currentPosition, totalInQueue]);

  useEffect(() => {
    if (prevPositionRef.current !== currentPosition) {
      const direction = currentPosition < prevPositionRef.current ? 1 : -1;
      slideOffset.value = direction * 60;
      slideOffset.value = withSpring(0, {
        damping: 15,
        stiffness: 120,
        mass: 0.8,
      });
      prevPositionRef.current = currentPosition;
    }
  }, [currentPosition]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideOffset.value }],
  }));

  return (
    <View style={styles.container}>
      <View style={[styles.timelineLine, { backgroundColor: theme.border }]}>
        <View style={[styles.progressLine, { backgroundColor: theme.primary, width: `${Math.min(100, (currentPosition / totalInQueue) * 100)}%` }]} />
      </View>
      
      <Animated.View style={[styles.positions, containerAnimatedStyle]}>
        {positions.map((item) => (
          <TimelineNode
            key={item.position}
            position={item.position}
            isCurrent={item.isCurrent}
            isBehind={item.isBehind}
            theme={theme}
          />
        ))}
      </Animated.View>
      
      <View style={styles.labels}>
        <ThemedText type="caption" style={{ color: theme.textSecondary }}>
          Front
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.textSecondary }}>
          Back
        </ThemedText>
      </View>
    </View>
  );
}

interface TimelineNodeProps {
  position: number;
  isCurrent: boolean;
  isBehind: boolean;
  theme: any;
}

function TimelineNode({ position, isCurrent, isBehind, theme }: TimelineNodeProps) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (isCurrent) {
      scale.value = withSpring(1, { damping: 12, stiffness: 150 });
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.2, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      scale.value = withSpring(1, { damping: 15, stiffness: 120 });
      glowOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isCurrent]);

  const nodeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const nodeColor = isCurrent 
    ? theme.primary 
    : isBehind 
      ? theme.border
      : theme.success;

  const textColor = isCurrent 
    ? "#FFFFFF" 
    : isBehind 
      ? theme.textSecondary
      : theme.success;

  return (
    <View style={styles.nodeWrapper}>
      {isCurrent ? (
        <Animated.View style={[styles.glow, { backgroundColor: theme.primary }, glowStyle]} />
      ) : null}
      
      <Animated.View
        style={[
          styles.node,
          isCurrent && styles.currentNode,
          { 
            backgroundColor: isCurrent ? theme.primary : theme.backgroundDefault,
            borderColor: nodeColor,
            borderWidth: isCurrent ? 0 : 2,
          },
          nodeStyle,
        ]}
      >
        <ThemedText
          type={isCurrent ? "body" : "small"}
          style={[
            styles.positionText,
            { color: textColor },
            isCurrent && styles.currentPositionText,
          ]}
          lightColor={textColor}
          darkColor={textColor}
        >
          {position}
        </ThemedText>
      </Animated.View>
      
      {isCurrent ? (
        <View style={[styles.youIndicator, { backgroundColor: theme.primary }]}>
          <ThemedText
            type="caption"
            style={styles.youText}
            lightColor="#FFFFFF"
            darkColor="#FFFFFF"
          >
            YOU
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  timelineLine: {
    position: "absolute",
    top: 38,
    left: Spacing["2xl"],
    right: Spacing["2xl"],
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressLine: {
    height: "100%",
    borderRadius: 2,
  },
  positions: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  nodeWrapper: {
    alignItems: "center",
    width: 44,
  },
  glow: {
    position: "absolute",
    top: -4,
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  node: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  currentNode: {
    width: 52,
    height: 52,
    borderRadius: 26,
    shadowColor: "#1A73E8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  positionText: {
    fontWeight: "600",
    fontSize: 12,
  },
  currentPositionText: {
    fontWeight: "700",
    fontSize: 18,
  },
  youIndicator: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  youText: {
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 1,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
});
