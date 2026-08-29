import { VariantPalette, VariantFonts } from "@/constants/theme";
import { useThemeContext, useThemeVariant } from "@/contexts/ThemeContext";

export function useTheme() {
  const { colorScheme, isDark, themeMode, setThemeMode } = useThemeContext();
  const variant = useThemeVariant();
  // The app is locked to light mode, so the palette is driven entirely by the
  // active variant: "customer" -> consumer light look, "eventhub" -> business
  // + super-admin EventHub look. `colorScheme` is retained for call-site
  // compatibility but no longer selects a dark palette.
  const theme = VariantPalette[variant];
  const fonts = VariantFonts[variant];

  return {
    theme,
    fonts,
    variant,
    isDark,
    colorScheme,
    themeMode,
    setThemeMode,
  };
}
