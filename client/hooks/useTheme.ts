import { Colors } from "@/constants/theme";
import { useThemeContext } from "@/contexts/ThemeContext";

export function useTheme() {
  const { colorScheme, isDark, themeMode, setThemeMode } = useThemeContext();
  const theme = Colors[colorScheme ?? "light"];

  return {
    theme,
    isDark,
    colorScheme,
    themeMode,
    setThemeMode,
  };
}
