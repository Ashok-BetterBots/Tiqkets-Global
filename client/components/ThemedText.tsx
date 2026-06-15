import { Text, type TextProps } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { Typography, type FontSet } from "@/constants/theme";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?:
    | "hero"
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "body"
    | "small"
    | "caption"
    | "link";
  tone?: "default" | "secondary" | "muted" | "primary" | "error" | "success";
};

function fontFamilyForWeight(
  fonts: FontSet,
  weight?: string | number,
): string {
  const w = String(weight ?? "400");
  if (w === "700" || w === "800" || w === "900" || w === "bold") return fonts.bold;
  if (w === "600") return fonts.semibold;
  if (w === "500") return fonts.medium;
  return fonts.regular;
}

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "body",
  tone,
  ...rest
}: ThemedTextProps) {
  const { theme, isDark, fonts } = useTheme();

  const getColor = () => {
    if (isDark && darkColor) return darkColor;
    if (!isDark && lightColor) return lightColor;
    if (type === "link") return theme.link;
    if (tone === "secondary") return theme.textSecondary;
    if (tone === "muted") return theme.mutedText;
    if (tone === "primary") return theme.primary;
    if (tone === "error") return theme.error;
    if (tone === "success") return theme.success;
    if (type === "caption") return theme.textSecondary;
    return theme.text;
  };

  const getTypeStyle = () => {
    switch (type) {
      case "hero":
        return Typography.hero;
      case "h1":
        return Typography.h1;
      case "h2":
        return Typography.h2;
      case "h3":
        return Typography.h3;
      case "h4":
        return Typography.h4;
      case "body":
        return Typography.body;
      case "small":
        return Typography.small;
      case "caption":
        return Typography.caption;
      case "link":
        return Typography.link;
      default:
        return Typography.body;
    }
  };

  const typeStyle = getTypeStyle();
  const fontStyle = fonts
    ? { fontFamily: fontFamilyForWeight(fonts, typeStyle.fontWeight) }
    : null;

  return (
    <Text
      style={[{ color: getColor() }, typeStyle, fontStyle, style]}
      {...rest}
    />
  );
}
