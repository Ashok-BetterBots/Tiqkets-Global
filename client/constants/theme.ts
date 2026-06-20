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

// Aurora Glow palette — premium consumer surface for the customer app
// Used by HomeScreen, ActiveQueueCard, and the floating tab bar.
export const AuroraColors = {
  bg: "#0A0A0B",
  bgElevated: "rgba(255,255,255,0.06)",
  bgGlass: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.10)",
  borderStrong: "rgba(255,255,255,0.18)",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.62)",
  textFaint: "rgba(255,255,255,0.40)",
  magenta: "#D91E8A",
  violet: "#8F00FF",
  glowMagenta: "rgba(217,30,138,0.18)",
  glowViolet: "rgba(143,0,255,0.18)",
  success: "#00FF94",
  warning: "#FFB800",
  danger: "#FF3B30",
};

export const Colors = {
  light: {
    text: "#0F172A",
    textSecondary: "#64748B",
    mutedText: "#94A3B8",
    buttonText: "#FFFFFF",
    tabIconDefault: "#94A3B8",
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
    borderSubtle: "#EEF1F5",
    backgroundRoot: "#F6F7FB",
    backgroundDefault: "#FFFFFF",
    backgroundSecondary: "#F1F3F8",
    backgroundTertiary: "#E5E7EB",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    surfaceMuted: "#F1F3F8",
    // Web shell
    topBarBg: "#0B1220",
    topBarText: "#E2E8F0",
    topBarMuted: "#94A3B8",
    sidebarBg: "#FFFFFF",
    sidebarBorder: "#EEF1F5",
    sidebarItemActiveBg: "#F1F3F8",
    sidebarItemActiveText: BrandColors.primary,
    // Brand specific
    brand: BrandColors.primary,
    brandAccent: BrandColors.accent,
    gold: BrandColors.accentDark,
  },
  dark: {
    text: "#ECEDEE",
    textSecondary: "#9BA1A6",
    mutedText: "#6B7280",
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
    border: "#2A2D31",
    borderSubtle: "#23262A",
    backgroundRoot: "#0F1115",
    backgroundDefault: "#181B20",
    backgroundSecondary: "#1F2227",
    backgroundTertiary: "#2A2D31",
    surface: "#181B20",
    surfaceElevated: "#1F2227",
    surfaceMuted: "#1F2227",
    topBarBg: "#0B0E12",
    topBarText: "#E2E8F0",
    topBarMuted: "#94A3B8",
    sidebarBg: "#181B20",
    sidebarBorder: "#23262A",
    sidebarItemActiveBg: "#23262A",
    sidebarItemActiveText: BrandColors.primaryLight,
    brand: BrandColors.primaryLight,
    brandAccent: BrandColors.accent,
    gold: BrandColors.accent,
  },
  // EventHub palette — applied to the business (org) and super-admin areas.
  // Customer screens keep the `light` palette above. This object MUST mirror
  // every key in `light` so any component reading `useTheme().theme` restyles
  // automatically when scoped to the "eventhub" variant.
  eventhub: {
    text: "#120D26",
    textSecondary: "#747688",
    mutedText: "#9C9FB0",
    buttonText: "#FFFFFF",
    tabIconDefault: "#9C9FB0",
    tabIconSelected: "#5669FF",
    link: "#5669FF",
    primary: "#5669FF",
    primaryDark: "#3F38DD",
    secondary: "#3F38DD",
    accent: "#FFCD6C",
    success: "#29D697",
    warning: "#FFB673",
    error: "#F0635A",
    border: "#E4E4F0",
    borderSubtle: "#EFEFF7",
    backgroundRoot: "#FFFFFF",
    backgroundDefault: "#FFFFFF",
    backgroundSecondary: "#F4F4FE",
    backgroundTertiary: "#ECECF7",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    surfaceMuted: "#F4F4FE",
    // Web shell
    topBarBg: "#5669FF",
    topBarText: "#FFFFFF",
    topBarMuted: "rgba(255,255,255,0.7)",
    sidebarBg: "#FFFFFF",
    sidebarBorder: "#EFEFF7",
    sidebarItemActiveBg: "#F4F4FE",
    sidebarItemActiveText: "#5669FF",
    // Brand specific
    brand: "#5669FF",
    brandAccent: "#FFCD6C",
    gold: "#FFCD6C",
  },
};

// Theme variants select which palette `useTheme()` resolves. "customer" maps
// to Colors.light (unchanged consumer look); "eventhub" maps to the EventHub
// palette used across business + super-admin areas.
export type ThemeVariant = "customer" | "eventhub";

export const VariantPalette: Record<ThemeVariant, typeof Colors.light> = {
  customer: Colors.light,
  eventhub: Colors.eventhub,
};

// ---------------------------------------------------------------------------
// App-wide typography system.
//
// Two roles, applied everywhere (mobile + web):
//   heading -> 'Sofia Pro', 'Nunito', sans-serif   (headings, titles, labels,
//              numbers, buttons)
//   body    -> 'Proxima Nova', 'Nunito Sans', sans-serif  (body, descriptions,
//              captions)
//
// React Native (native) needs an exact, pre-loaded family name per weight, so
// we use the weight-specific Nunito / Nunito Sans faces loaded in App.tsx.
// On web we emit the user's literal CSS stack with the commercial font first
// and the concrete loaded family as a guaranteed fallback, so Sofia Pro /
// Proxima Nova are honoured automatically once their webfonts are present and
// Nunito / Nunito Sans render in the meantime.
// ---------------------------------------------------------------------------
export type FontWeightToken = "regular" | "medium" | "semibold" | "bold" | "heavy";

const HEADING_FACE: Record<FontWeightToken, string> = {
  regular: "Nunito_400Regular",
  medium: "Nunito_500Medium",
  semibold: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
  heavy: "Nunito_800ExtraBold",
};

const BODY_FACE: Record<FontWeightToken, string> = {
  regular: "NunitoSans_400Regular",
  medium: "NunitoSans_500Medium",
  semibold: "NunitoSans_600SemiBold",
  bold: "NunitoSans_700Bold",
  heavy: "NunitoSans_800ExtraBold",
};

const IS_WEB = Platform.OS === "web";

export function headingFont(weight: FontWeightToken = "bold"): string {
  const face = HEADING_FACE[weight];
  return IS_WEB ? `'Sofia Pro', '${face}', sans-serif` : face;
}

export function bodyFont(weight: FontWeightToken = "regular"): string {
  const face = BODY_FACE[weight];
  return IS_WEB ? `'Proxima Nova', '${face}', sans-serif` : face;
}

// Retained for call-site compatibility. Both variants now resolve to the same
// global typography (heading family); ThemedText routes body text to bodyFont
// itself based on the text role.
export type FontSet = {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
};

const HEADING_SET: FontSet = {
  regular: headingFont("regular"),
  medium: headingFont("medium"),
  semibold: headingFont("semibold"),
  bold: headingFont("bold"),
};

export const VariantFonts: Record<ThemeVariant, FontSet | null> = {
  customer: HEADING_SET,
  eventhub: HEADING_SET,
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
  none: {
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  subtle: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  small: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  card: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  medium: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  large: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  floating: {
    shadowColor: BrandColors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
};
