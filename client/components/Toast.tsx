import React, {
  createContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { BorderRadius, Shadows, Spacing } from "@/constants/theme";
import {
  ROOT_TOAST_HOST,
  TOAST_ENTER_MS,
  TOAST_EXIT_MS,
  toastController,
} from "@/lib/toast-controller";

export const ToastWindowDepth = createContext(0);

function useToastSnapshot() {
  return useSyncExternalStore(
    toastController.subscribe,
    toastController.getSnapshot,
    toastController.getSnapshot,
  );
}

/** One visible renderer, in whichever native window is currently topmost. */
export function ToastHost({ modalDepth }: { modalDepth?: number }) {
  const generatedId = useId();
  const hostId = modalDepth === undefined ? ROOT_TOAST_HOST : generatedId;
  const { toast, phase, hostId: selectedHost } = useToastSnapshot();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-200)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [cardHeight, setCardHeight] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const active = !!toast && selectedHost === hostId;

  useLayoutEffect(() => {
    if (modalDepth === undefined) return;
    return toastController.registerHost(hostId, modalDepth);
  }, [hostId, modalDepth]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useLayoutEffect(() => {
    translateY.stopAnimation();
    opacity.stopAnimation();
    if (!active || cardHeight === 0) {
      opacity.setValue(0);
      return;
    }
    const exiting = phase === "exiting";
    const hiddenY = -cardHeight - insets.top - Spacing.sm;
    if (!exiting) {
      translateY.setValue(reduceMotion ? 0 : hiddenY);
      opacity.setValue(0);
    }
    const animation = Animated.parallel([
      Animated.timing(translateY, {
        toValue: exiting && !reduceMotion ? hiddenY : 0,
        duration: reduceMotion ? 0 : exiting ? TOAST_EXIT_MS : TOAST_ENTER_MS,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: exiting ? 0 : 1,
        duration: reduceMotion ? 0 : exiting ? TOAST_EXIT_MS : TOAST_ENTER_MS,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [active, toast?.id, phase, cardHeight, insets.top, reduceMotion, opacity, translateY]);

  if (!active || !toast) return null;
  const success = toast.type === "success";
  const accent = success ? "#16834A" : "#9C1A5B";

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.position, { top: insets.top + Spacing.sm }]}
    >
      <Animated.View
        pointerEvents="none"
        onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
        style={[
          styles.card,
          { borderLeftColor: accent, opacity, transform: [{ translateY }] },
        ]}
        testID="queue-toast"
      >
        <View pointerEvents="none" style={[styles.icon, { backgroundColor: success ? "#E7F5EC" : "#F8EAF1" }]}>
          <Feather name={success ? "check" : "info"} size={18} color={accent} />
        </View>
        <View pointerEvents="none" style={styles.copy}>
          <ThemedText type="body" style={styles.title}>{toast.title}</ThemedText>
          <ThemedText type="small" style={styles.message}>{toast.message}</ThemedText>
        </View>
      </Animated.View>
    </View>
  );
}

/** Mounted once. Accessibility and lifecycle are independent of host handoffs. */
export function AppToastProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToastSnapshot();
  const announcedId = useRef<number | null>(null);

  useEffect(() => {
    if (!toast || toast.id === announcedId.current) return;
    announcedId.current = toast.id;
    const text = `${toast.title}. ${toast.message}`;
    // OS announcement APIs respect whether VoiceOver/TalkBack is enabled.
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: false });
    } else {
      AccessibilityInfo.announceForAccessibility(text);
    }
  }, [toast]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") toastController.clear();
    });
    return () => {
      subscription.remove();
      toastController.clear();
    };
  }, []);

  return (
    <View style={styles.root}>
      {children}
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  position: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 10000,
    elevation: 100,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.lg,
    borderLeftWidth: 4,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadows.medium,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1 },
  title: { color: "#9C1A5B", fontWeight: "700", fontSize: 14, lineHeight: 19 },
  message: { color: "#374151", fontSize: 13, lineHeight: 18, marginTop: 2 },
});
