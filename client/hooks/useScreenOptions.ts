import { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { isLiquidGlassAvailable } from "expo-glass-effect";

import { useTheme } from "@/hooks/useTheme";

interface UseScreenOptionsParams {
  transparent?: boolean;
}

export function useScreenOptions({
  transparent = true,
}: UseScreenOptionsParams = {}): NativeStackNavigationOptions {
  const { theme } = useTheme();

  return {
    headerTitleAlign: "center",
    headerTransparent: transparent,
    // No frosted/white banner behind the title — the header blends into the
    // page by painting it with the page background and dropping the shadow.
    // The header still paints solid (so scrolled content is hidden cleanly),
    // it just no longer reads as a distinct band/banner.
    headerShadowVisible: false,
    headerTintColor: theme.text,
    headerStyle: {
      backgroundColor: theme.backgroundRoot,
    },
    gestureEnabled: true,
    gestureDirection: "horizontal",
    fullScreenGestureEnabled: isLiquidGlassAvailable() ? false : true,
    contentStyle: {
      backgroundColor: theme.backgroundRoot,
    },
  };
}
