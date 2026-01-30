import React from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  FadeInUp,
  FadeOutDown,
  Layout,
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

  const positions = React.useMemo(() => {
    const items: Array<{ position: number; isCurrent: boolean }> = [];
    
    for (let i = Math.max(1, currentPosition - 2); i <= Math.min(totalInQueue, currentPosition + 2); i++) {
      items.push({ position: i, isCurrent: i === currentPosition });
    }
    
    return items;
  }, [currentPosition, totalInQueue]);

  return (
    <View style={styles.container}>
      <View style={[styles.line, { backgroundColor: theme.border }]} />
      <View style={styles.positions}>
        {positions.map((item, index) => (
          <Animated.View
            key={item.position}
            entering={FadeInUp.delay(index * 50)}
            layout={Layout.springify()}
            style={[
              styles.positionItem,
              item.isCurrent && styles.currentItem,
              item.isCurrent && { backgroundColor: theme.primary },
              !item.isCurrent && { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <ThemedText
              type="small"
              style={[
                styles.positionText,
                item.isCurrent && styles.currentText,
              ]}
              lightColor={item.isCurrent ? "#FFFFFF" : theme.textSecondary}
              darkColor={item.isCurrent ? "#FFFFFF" : theme.textSecondary}
            >
              #{item.position}
            </ThemedText>
            {item.isCurrent && (
              <ThemedText
                type="caption"
                style={styles.youLabel}
                lightColor="#FFFFFF"
                darkColor="#FFFFFF"
              >
                You
              </ThemedText>
            )}
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  line: {
    position: "absolute",
    top: "50%",
    left: Spacing["2xl"],
    right: Spacing["2xl"],
    height: 2,
    borderRadius: 1,
  },
  positions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  positionItem: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  currentItem: {
    width: 72,
    height: 72,
    borderRadius: 36,
    shadowColor: "#1A73E8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  positionText: {
    fontWeight: "600",
  },
  currentText: {
    fontWeight: "700",
    fontSize: 16,
  },
  youLabel: {
    fontWeight: "600",
    marginTop: 2,
  },
});
