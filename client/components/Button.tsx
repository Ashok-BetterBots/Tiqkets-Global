import React, { ReactNode } from "react";
import { StyleSheet, Pressable, ViewStyle, StyleProp } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";

export interface ButtonProps {
  onPress?: () => void;
  children?: ReactNode;
  title?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "outline" | "ghost" | "secondary";
  size?: "small" | "medium" | "large";
  icon?: ReactNode;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 150,
  overshootClamping: true,
  energyThreshold: 0.001,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  onPress,
  children,
  title,
  style,
  disabled = false,
  loading = false,
  variant = "primary",
  size = "medium",
  icon,
}: ButtonProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const content = children || title;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(0.98, springConfig);
    }
  };

  const handlePressOut = () => {
    if (!disabled) {
      scale.value = withSpring(1, springConfig);
    }
  };

  const getBackgroundColor = () => {
    if (variant === "outline" || variant === "ghost") return "transparent";
    if (variant === "secondary") return theme.primary + "15";
    return theme.link;
  };

  const getBorderStyle = () => {
    if (variant === "outline") return { borderWidth: 1, borderColor: theme.primary };
    return {};
  };

  const getTextColor = () => {
    if (variant === "outline" || variant === "ghost" || variant === "secondary") return theme.primary;
    return theme.buttonText;
  };

  const getHeight = () => {
    if (size === "small") return 36;
    if (size === "large") return 56;
    return Spacing.buttonHeight;
  };

  const getPadding = () => {
    if (size === "small") return Spacing.md;
    if (size === "large") return Spacing.xl;
    return Spacing.lg;
  };

  const isDisabled = disabled || loading;

  return (
    <AnimatedPressable
      onPress={isDisabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      style={[
        styles.button,
        {
          backgroundColor: getBackgroundColor(),
          opacity: isDisabled ? 0.5 : 1,
          height: getHeight(),
          paddingHorizontal: getPadding(),
          flexDirection: "row",
          gap: 8,
        },
        getBorderStyle(),
        style,
        animatedStyle,
      ]}
    >
      {icon}
      <ThemedText
        type={size === "small" ? "small" : "body"}
        style={[styles.buttonText, { color: getTextColor() }]}
      >
        {loading ? "Loading..." : content}
      </ThemedText>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontWeight: "600",
  },
});
