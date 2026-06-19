import { ViewStyle } from "react-native";

// Raspberry-branded design tokens for the organisation (for-business) side of
// the app, derived from the approved Figma Make prototype. These intentionally
// live separate from the global Colors/eventhub palette so we can roll the new
// look out screen-by-screen (starting with the Home dashboard) without
// restyling every other org screen at once.
export const OrgDesign = {
  primary: "#8B1662", // P — main raspberry
  primaryMid: "#A01B76", // gradient top
  primaryDark: "#5C0F46", // PD — gradient bottom / pressed
  primaryTint: "#FDF0F8", // PL — light raspberry fill
  primaryMuted: "#F0D0E8", // PM
  pageBg: "#F8F5FF", // light lavender page background
  success: "#16A34A",
  warning: "#D97706",
  text: "#1A1028",
  muted: "#9B8AAA",
  cardRadius: 20,
  headerGradient: ["#A01B76", "#8B1662", "#5C0F46"] as const,
  cardShadow: {
    shadowColor: "#8B1662",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 2,
  } as ViewStyle,
  // Nunito family (loaded in App.tsx). RN needs an explicit family per weight,
  // so headings/numbers use the ExtraBold/Bold faces rather than fontWeight.
  fonts: {
    heavy: "Nunito_800ExtraBold",
    bold: "Nunito_700Bold",
    semibold: "Nunito_600SemiBold",
    medium: "Nunito_500Medium",
    regular: "Nunito_400Regular",
  },
};
