import React from "react";
import { View, ViewStyle, StyleProp } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

export function SuperCard({ children, style, padded = true }: Props) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.surface,
          borderColor: theme.borderSubtle,
          borderWidth: 1,
          borderRadius: BorderRadius.md,
          padding: padded ? Spacing.xl : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
