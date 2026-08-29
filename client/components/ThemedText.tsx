import { Text, type TextProps } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import {
  Typography,
  headingFont,
  bodyFont,
  type FontWeightToken,
} from "@/constants/theme";

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

function weightToken(weight?: string | number): FontWeightToken {
  const w = String(weight ?? "400");
  if (w === "800" || w === "900") return "heavy";
  if (w === "700" || w === "bold") return "bold";
  if (w === "600") return "semibold";
  if (w === "500") return "medium";
  return "regular";
}

// Headings, titles and links use the heading family; body / small / caption
// text uses the body family. This mirrors the global typography roles.
const BODY_TYPES = new Set(["body", "small", "caption"]);

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "body",
  tone,
  ...rest
}: ThemedTextProps) {
  const { theme, isDark } = useTheme();

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
  const token = weightToken(typeStyle.fontWeight);
  const fontFamily = BODY_TYPES.has(type) ? bodyFont(token) : headingFont(token);
  const fontStyle = { fontFamily };

  return (
    <Text
      style={[{ color: getColor() }, typeStyle, fontStyle, style]}
      {...rest}
    />
  );
}
