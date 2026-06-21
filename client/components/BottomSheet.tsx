import React from "react";
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Animated, {
  SlideInDown,
  SlideOutDown,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, headingFont } from "@/constants/theme";

export const SHEET_RADIUS = 38;

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  detent?: "medium" | "large";
  children: React.ReactNode;
  footer?: React.ReactNode;
  hasInput?: boolean;
  testID?: string;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  detent = "large",
  children,
  footer,
  hasInput = false,
  testID,
}: BottomSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const maxHeight = detent === "medium" ? "55%" : "90%";

  const sheet = (
    <Animated.View
      entering={SlideInDown.duration(300)}
      exiting={SlideOutDown.duration(220)}
      style={[
        styles.sheet,
        {
          backgroundColor: theme.backgroundDefault,
          maxHeight,
          paddingBottom: insets.bottom + Spacing.md,
        },
      ]}
    >
      <View style={styles.handleRow}>
        <View style={styles.handle} />
      </View>

      <View style={styles.header}>
        <ThemedText style={[styles.title, { color: theme.text }]}>
          {title ?? ""}
        </ThemedText>
        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, { backgroundColor: theme.backgroundSecondary }]}
          hitSlop={12}
          testID={testID ? `${testID}-close` : "button-close-sheet"}
        >
          <Feather name="x" size={18} color={theme.text} />
        </Pressable>
      </View>

      {children}

      {footer ? (
        <View style={styles.footer}>{footer}</View>
      ) : null}
    </Animated.View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={styles.scrim}
        pointerEvents="box-none"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {hasInput ? (
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          pointerEvents="box-none"
        >
          {sheet}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.overlay} pointerEvents="box-none">
          {sheet}
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderRadius: SHEET_RADIUS,
    overflow: "hidden",
  },
  handleRow: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.xs,
  },
  title: {
    fontFamily: headingFont("bold"),
    fontSize: 17,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
});
