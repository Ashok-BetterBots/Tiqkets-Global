import React from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Keyboard,
  Modal,
  useColorScheme,
} from "react-native";
import Animated, { SlideInDown, SlideOutDown, FadeIn, FadeOut } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { BrandColors, Spacing } from "@/constants/theme";

export interface SubSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmLoading?: boolean;
  children: React.ReactNode;
}

export interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmLoading?: boolean;
  subSheet?: SubSheetProps;
}

export function BottomSheetModal({
  visible,
  onClose,
  title,
  children,
  onConfirm,
  confirmLabel = "Save",
  confirmLoading = false,
  subSheet,
}: BottomSheetModalProps) {
  const isDark = useColorScheme() === "dark";
  const primary = isDark ? BrandColors.primaryLight : BrandColors.primary;
  const surface = isDark ? "#1C1C1E" : "#FFFFFF";
  const subSurface = isDark ? "#2A2A2E" : "#F7F5FE";
  const textColor = isDark ? "#F5F5F5" : "#1A1A2E";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {
        Keyboard.dismiss();
        if (subSheet?.visible) {
          subSheet.onClose();
        } else {
          onClose();
        }
      }}
    >
      {/* Backdrop — tap closes the top-most sheet */}
      <Pressable
        style={styles.overlay}
        onPress={() => {
          Keyboard.dismiss();
          if (subSheet?.visible) {
            subSheet.onClose();
          } else {
            onClose();
          }
        }}
      >
        {/* ── Main card ────────────────────────────────────────────────── */}
        <Animated.View
          entering={SlideInDown.duration(300).springify()}
          exiting={SlideOutDown.duration(220)}
          style={[styles.card, { backgroundColor: surface }]}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <ThemedText style={[styles.title, { color: textColor }]}>{title}</ThemedText>
            </View>
            <KeyboardAwareScrollViewCompat
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.body}
              style={styles.scroll}
            >
              {children}
            </KeyboardAwareScrollViewCompat>
            <Footer
              primary={primary}
              cancelLabel="Cancel"
              confirmLabel={confirmLoading ? "Saving…" : confirmLabel}
              onCancel={() => { Keyboard.dismiss(); onClose(); }}
              onConfirm={onConfirm}
              disabled={confirmLoading}
            />
          </Pressable>
        </Animated.View>

        {/* ── Sub-sheet overlay (inside the same Modal portal) ─────────── */}
        {subSheet?.visible ? (
          <>
            {/* Dimmed backdrop over the main card */}
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(120)}
              style={styles.subBackdrop}
              pointerEvents="none"
            />
            {/* Sub-sheet card slides up over the main card */}
            <Animated.View
              entering={SlideInDown.duration(280).springify()}
              exiting={SlideOutDown.duration(200)}
              style={[styles.subCard, { backgroundColor: subSurface }]}
            >
              <Pressable onPress={(e) => e.stopPropagation()}>
                <View style={styles.handle} />
                <View style={styles.header}>
                  <ThemedText style={[styles.title, { color: textColor }]}>
                    {subSheet.title}
                  </ThemedText>
                </View>
                <KeyboardAwareScrollViewCompat
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.body}
                  style={styles.scroll}
                >
                  {subSheet.children}
                </KeyboardAwareScrollViewCompat>
                <Footer
                  primary={primary}
                  cancelLabel="Cancel"
                  confirmLabel={subSheet.confirmLoading ? "Saving…" : (subSheet.confirmLabel ?? "Save")}
                  onCancel={() => { Keyboard.dismiss(); subSheet.onClose(); }}
                  onConfirm={subSheet.onConfirm}
                  disabled={subSheet.confirmLoading}
                />
              </Pressable>
            </Animated.View>
          </>
        ) : null}
      </Pressable>
    </Modal>
  );
}

function Footer({
  primary,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  disabled,
}: {
  primary: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.footer}>
      <Pressable
        style={[styles.btn, { borderWidth: 1.5, borderColor: primary }]}
        onPress={onCancel}
      >
        <ThemedText style={[styles.btnText, { color: primary }]}>
          {cancelLabel}
        </ThemedText>
      </Pressable>
      <Pressable
        style={[styles.btn, { backgroundColor: primary }, disabled && { opacity: 0.7 }]}
        onPress={onConfirm}
        disabled={disabled}
      >
        <ThemedText style={[styles.btnText, { color: "#FFFFFF" }]}>
          {confirmLabel}
        </ThemedText>
      </Pressable>
    </View>
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
  btnText: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Nunito_700Bold",
  },
  subBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  subCard: {
    borderRadius: 28,
    overflow: "hidden",
    maxHeight: "80%",
    marginTop: "auto",
  },
});
