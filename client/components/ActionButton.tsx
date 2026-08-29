import React from "react";
import { StyleSheet, Pressable, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface ActionButtonProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  variant?: "default" | "primary" | "danger" | "success";
  style?: ViewStyle;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ActionButton({
  icon,
  label,
  onPress,
  variant = "default",
  style,
  testID,
}: ActionButtonProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getColors = () => {
    switch (variant) {
      case "primary":
        return { bg: theme.primary, text: "#FFFFFF", icon: "#FFFFFF" };
      case "danger":
        return { bg: theme.error, text: "#FFFFFF", icon: "#FFFFFF" };
      case "success":
        return { bg: theme.success, text: "#FFFFFF", icon: "#FFFFFF" };
      default:
        return { bg: theme.backgroundSecondary, text: theme.text, icon: theme.primary };
    }
  };

  const colors = getColors();

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.button,
        { backgroundColor: colors.bg },
        animatedStyle,
        style,
      ]}
      testID={testID}
    >
      <Feather name={icon} size={20} color={colors.icon} />
      <ThemedText
        type="small"
        style={styles.label}
        lightColor={colors.text}
        darkColor={colors.text}
      >
        {label}
      </ThemedText>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
    minWidth: 100,
  },
  label: {
    fontWeight: "600",
  },
});
