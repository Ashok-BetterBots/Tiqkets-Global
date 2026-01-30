import React, { useState } from "react";
import { View, StyleSheet, Modal, Pressable } from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface SnoozeModalProps {
  visible: boolean;
  onClose: () => void;
  onSnooze: (positions: number) => Promise<boolean>;
  remainingSnoozes: number;
  maxSnooze: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function CounterButton({
  icon,
  onPress,
  disabled,
}: {
  icon: "plus" | "minus";
  onPress: () => void;
  disabled: boolean;
}) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(0.9);
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const handlePress = () => {
    if (!disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        styles.counterButton,
        { backgroundColor: disabled ? theme.border : theme.primary },
        animatedStyle,
      ]}
    >
      <Feather name={icon} size={24} color="#FFFFFF" />
    </AnimatedPressable>
  );
}

export function SnoozeModal({
  visible,
  onClose,
  onSnooze,
  remainingSnoozes,
  maxSnooze,
}: SnoozeModalProps) {
  const { theme, isDark } = useTheme();
  const [positions, setPositions] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canDecrease = positions > 1;
  const canIncrease = positions < 5;
  const canSnooze = remainingSnoozes > 0;

  const handleIncrease = () => {
    if (canIncrease) {
      setPositions((p) => p + 1);
    }
  };

  const handleDecrease = () => {
    if (canDecrease) {
      setPositions((p) => p - 1);
    }
  };

  const handleSnooze = async () => {
    if (!canSnooze || isSubmitting) return;
    
    setIsSubmitting(true);
    const success = await onSnooze(positions);
    setIsSubmitting(false);
    
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPositions(1);
      onClose();
    }
  };

  const handleClose = () => {
    setPositions(1);
    onClose();
  };

  const usedSnoozes = maxSnooze - remainingSnoozes;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
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
            <Pressable onPress={handleClose} hitSlop={12}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>

          <ThemedText
            type="small"
            style={[styles.subtitle, { color: theme.textSecondary }]}
          >
            Need more time? Move back in the queue temporarily.
          </ThemedText>

          <View style={[styles.usageIndicator, { backgroundColor: theme.backgroundSecondary }]}>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              Snooze Usage
            </ThemedText>
            <View style={styles.usageDots}>
              {Array.from({ length: maxSnooze }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.usageDot,
                    {
                      backgroundColor: i < usedSnoozes ? theme.error : theme.success,
                    },
                  ]}
                />
              ))}
            </View>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              {remainingSnoozes} of {maxSnooze} remaining
            </ThemedText>
          </View>

          {canSnooze ? (
            <>
              <View style={styles.counterContainer}>
                <CounterButton
                  icon="minus"
                  onPress={handleDecrease}
                  disabled={!canDecrease}
                />
                <View style={styles.counterValue}>
                  <ThemedText type="h1" style={styles.counterNumber}>
                    {positions}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    {positions === 1 ? "position" : "positions"}
                  </ThemedText>
                </View>
                <CounterButton
                  icon="plus"
                  onPress={handleIncrease}
                  disabled={!canIncrease}
                />
              </View>

              <ThemedText
                type="caption"
                style={[styles.impact, { color: theme.textSecondary }]}
              >
                You will move back {positions} {positions === 1 ? "position" : "positions"} in the queue.
                {"\n"}Estimated additional wait: ~{positions * 5} minutes
              </ThemedText>

              <Button
                onPress={handleSnooze}
                disabled={isSubmitting}
                style={styles.snoozeButton}
              >
                {isSubmitting ? "Snoozing..." : "Confirm Snooze"}
              </Button>
            </>
          ) : (
            <View style={styles.limitReached}>
              <Feather name="alert-circle" size={48} color={theme.warning} />
              <ThemedText type="h4" style={styles.limitTitle}>
                Snooze Limit Reached
              </ThemedText>
              <ThemedText
                type="body"
                style={[styles.limitText, { color: theme.textSecondary }]}
              >
                You've used all {maxSnooze} snoozes for this visit. This ensures fair queue management for everyone.
              </ThemedText>
            </View>
          )}
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
  usageIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
    marginBottom: Spacing.xl,
  },
  usageDots: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  usageDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  counterContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing["2xl"],
    marginBottom: Spacing.xl,
  },
  counterButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: {
    alignItems: "center",
    minWidth: 80,
  },
  counterNumber: {
    fontSize: 48,
    lineHeight: 56,
  },
  impact: {
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  snoozeButton: {
    marginTop: Spacing.sm,
  },
  limitReached: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  limitTitle: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  limitText: {
    textAlign: "center",
  },
});
