import { View, type ViewProps } from "react-native";

import { useTheme } from "@/hooks/useTheme";

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  variant?: "root" | "surface" | "surfaceElevated" | "surfaceMuted" | "transparent";
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  variant = "root",
  ...otherProps
}: ThemedViewProps) {
  const { theme, isDark } = useTheme();

  let backgroundColor: string | undefined;
  if (isDark && darkColor) backgroundColor = darkColor;
  else if (!isDark && lightColor) backgroundColor = lightColor;
  else if (variant === "surface") backgroundColor = theme.surface;
  else if (variant === "surfaceElevated") backgroundColor = theme.surfaceElevated;
  else if (variant === "surfaceMuted") backgroundColor = theme.surfaceMuted;
  else if (variant === "transparent") backgroundColor = "transparent";
  else backgroundColor = theme.backgroundRoot;

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
