import React from "react";
import { View, Pressable, StyleSheet, Keyboard, Modal } from "react-native";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";

export interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmLoading?: boolean;
}

export function BottomSheetModal({
  visible,
  onClose,
  title,
  children,
  onConfirm,
  confirmLabel = "Save",
  confirmLoading = false,
}: BottomSheetModalProps) {
  const { theme: colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {
        Keyboard.dismiss();
        onClose();
      }}
    >
      <Pressable
        style={styles.overlay}
        onPress={() => {
          Keyboard.dismiss();
          onClose();
        }}
      >
        <Animated.View
          entering={SlideInDown.duration(300).springify()}
          exiting={SlideOutDown.duration(220)}
          style={[styles.card, { backgroundColor: colors.surface }]}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <ThemedText style={styles.title}>{title}</ThemedText>
            </View>
            <KeyboardAwareScrollViewCompat
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.body}
              style={styles.scroll}
            >
              {children}
            </KeyboardAwareScrollViewCompat>
            <View style={styles.footer}>
              <Pressable
                style={[styles.btn, { borderWidth: 1.5, borderColor: colors.primary }]}
                onPress={() => {
                  Keyboard.dismiss();
                  onClose();
                }}
              >
                <ThemedText style={[styles.cancelText, { color: colors.primary }]}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.btn,
                  { backgroundColor: colors.primary },
                  confirmLoading && { opacity: 0.7 },
                ]}
                onPress={onConfirm}
                disabled={confirmLoading}
              >
                <ThemedText style={styles.confirmText}>
                  {confirmLoading ? "Saving…" : confirmLabel}
                </ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  card: {
    borderRadius: 32,
    overflow: "hidden",
    maxHeight: "88%",
  },
  scroll: {
    flexShrink: 1,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.12)",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    fontFamily: "Nunito_800ExtraBold",
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  footer: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Nunito_600SemiBold",
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Nunito_700Bold",
    color: "#FFFFFF",
  },
});
