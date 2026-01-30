import React from "react";
import { View, StyleSheet, Modal, Pressable } from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface SnoozeModalProps {
  visible: boolean;
  onClose: () => void;
  onSnooze: (levels: 1 | 2 | 3) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function SnoozeOption({
  levels,
  onPress,
}: {
  levels: 1 | 2 | 3;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const description = levels === 1
    ? "Move back 1 position"
    : levels === 2
    ? "Move back 2 positions"
    : "Move back 3 positions";

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.option,
        { backgroundColor: theme.backgroundSecondary },
        animatedStyle,
      ]}
    >
      <View style={[styles.levelBadge, { backgroundColor: theme.primary }]}>
        <ThemedText
          type="h4"
          lightColor="#FFFFFF"
          darkColor="#FFFFFF"
        >
          +{levels}
        </ThemedText>
      </View>
      <View style={styles.optionText}>
        <ThemedText type="body" style={styles.optionTitle}>
          Snooze {levels}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {description}
        </ThemedText>
      </View>
      <Feather name="chevron-right" size={20} color={theme.textSecondary} />
    </AnimatedPressable>
  );
}

export function SnoozeModal({ visible, onClose, onSnooze }: SnoozeModalProps) {
  const { theme, isDark } = useTheme();

  const handleSnooze = (levels: 1 | 2 | 3) => {
    onSnooze(levels);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <BlurView
          intensity={30}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
      </Pressable>

      <View style={styles.modalContainer}>
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={[styles.modal, { backgroundColor: theme.backgroundDefault }]}
        >
          <View style={styles.header}>
            <ThemedText type="h4">Snooze Your Turn</ThemedText>
            <Pressable onPress={onClose} hitSlop={12}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>

          <ThemedText
            type="small"
            style={[styles.subtitle, { color: theme.textSecondary }]}
          >
            Need more time? Move back in the queue temporarily.
          </ThemedText>

          <View style={styles.options}>
            <SnoozeOption levels={1} onPress={() => handleSnooze(1)} />
            <SnoozeOption levels={2} onPress={() => handleSnooze(2)} />
            <SnoozeOption levels={3} onPress={() => handleSnooze(3)} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["4xl"],
  },
  modal: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    marginBottom: Spacing.xl,
  },
  options: {
    gap: Spacing.md,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.lg,
  },
  levelBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontWeight: "600",
    marginBottom: 2,
  },
});
