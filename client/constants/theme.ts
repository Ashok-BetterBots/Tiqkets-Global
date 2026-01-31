import { Platform } from "react-native";

// Brand Colors
export const BrandColors = {
  primary: "#8c1867", // Magenta/Burgundy - main brand color
  primaryLight: "#a83d82", // Lighter version for dark mode
  primaryDark: "#6a1250", // Darker version for pressed states
  secondary: "#1d499b", // Blue - secondary actions
  secondaryLight: "#3366bb", // Lighter blue for dark mode
  accent: "#ffd700", // Gold - highlights and premium features
  accentDark: "#e6c200", // Darker gold for light mode
  white: "#ffffff",
  lightGray: "#f2f2f2",
  darkGray: "#272626",
  black: "#1a1a1a",
};

export const Colors = {
  light: {
    text: "#272626",
    textSecondary: "#6B7280",
    buttonText: "#FFFFFF",
    tabIconDefault: "#9CA3AF",
    tabIconSelected: BrandColors.primary,
    link: BrandColors.secondary,
    primary: BrandColors.primary,
    primaryDark: BrandColors.primaryDark,
    secondary: BrandColors.secondary,
    accent: BrandColors.accentDark,
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    border: "#E5E7EB",
    backgroundRoot: "#F8F9FA",
    backgroundDefault: "#FFFFFF",
    backgroundSecondary: BrandColors.lightGray,
    backgroundTertiary: "#E5E7EB",
    // Brand specific
    brand: BrandColors.primary,
    brandAccent: BrandColors.accent,
    gold: BrandColors.accentDark,
  },
  dark: {
    text: "#ECEDEE",
    textSecondary: "#9BA1A6",
    buttonText: "#FFFFFF",
    tabIconDefault: "#6B7280",
    tabIconSelected: BrandColors.primaryLight,
    link: BrandColors.secondaryLight,
    primary: BrandColors.primaryLight,
    primaryDark: BrandColors.primary,
    secondary: BrandColors.secondaryLight,
    accent: BrandColors.accent,
    success: "#34D399",
    warning: "#FBBF24",
    error: "#F87171",
    border: "#404244",
    backgroundRoot: "#1a1a1a",
    backgroundDefault: BrandColors.darkGray,
    backgroundSecondary: "#353739",
    backgroundTertiary: "#404244",
    // Brand specific
    brand: BrandColors.primaryLight,
    brandAccent: BrandColors.accent,
    gold: BrandColors.accent,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  inputHeight: 48,
  buttonHeight: 52,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  "2xl": 40,
  "3xl": 50,
  full: 9999,
};

export const Typography = {
  hero: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: "700" as const,
  },
  h1: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const Shadows = {
  small: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  medium: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  large: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
};
