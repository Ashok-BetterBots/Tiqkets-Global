import React from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Keyboard,
  Modal,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
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
  const { height: screenHeight } = useWindowDimensions();
  const primary = isDark ? BrandColors.primaryLight : BrandColors.primary;
  const surface = isDark ? "#1C1C1E" : "#FFFFFF";
  const textColor = isDark ? "#F5F5F5" : "#1A1A2E";

  // When sub-page is active we show it as a page inside the same card.
  const showSub = subSheet?.visible === true;

  // Explicit scroll max-height keeps the footer always visible regardless of
  // how much content is inside. Footer + header + handle together ~140 px.
  const scrollMaxHeight = screenHeight * 0.62;

  const handleBackdropPress = () => {
    Keyboard.dismiss();
    if (showSub) {
      subSheet?.onClose();
    } else {
      onClose();
    }
  };

  const handleHardwareBack = () => {
    Keyboard.dismiss();
    if (showSub) {
      subSheet?.onClose();
    } else {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleHardwareBack}
    >
      {/* Semi-transparent backdrop — tapping closes the active page */}
      <Pressable style={styles.overlay} onPress={handleBackdropPress}>
        {/* Card — slides up once; content inside swaps between pages */}
        <Animated.View
          entering={SlideInDown.duration(300).springify()}
          exiting={SlideOutDown.duration(220)}
          style={[styles.card, { backgroundColor: surface }]}
        >
          {/*
            Inner Pressable absorbs taps so they don't reach the backdrop.
            It must NOT have flex:1 or the card height becomes unconstrained.
          */}
          <Pressable onPress={(e) => e.stopPropagation()}>

            {/* ── Drag handle ───────────────────────────────────────────── */}
            <View style={styles.handle} />

            {/* ── Header — shows back arrow when on sub-page ────────────── */}
            <View style={styles.header}>
              {showSub ? (
                <Pressable
                  onPress={() => { Keyboard.dismiss(); subSheet?.onClose(); }}
                  style={styles.backBtn}
                  hitSlop={12}
                >
                  <Feather name="arrow-left" size={22} color={primary} />
                </Pressable>
              ) : null}
              <ThemedText style={[styles.title, { color: textColor }]}>
                {showSub ? subSheet?.title : title}
              </ThemedText>
            </View>

            {/*
              ── Scrollable body ─────────────────────────────────────────
              maxHeight is set explicitly in px so the footer is NEVER
              pushed off-screen by tall content (e.g. in-person section).
            */}
            <KeyboardAwareScrollViewCompat
              showsVerticalScrollIndicator={true}
              scrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.body}
              style={{ maxHeight: scrollMaxHeight }}
            >
              {showSub ? subSheet?.children : children}
            </KeyboardAwareScrollViewCompat>

            {/* ── Footer — always rendered outside the scroll ───────────── */}
            {showSub ? (
              <Footer
                primary={primary}
                cancelLabel="Back"
                confirmLabel={subSheet?.confirmLoading ? "Saving…" : (subSheet?.confirmLabel ?? "Save")}
                onCancel={() => { Keyboard.dismiss(); subSheet?.onClose(); }}
                onConfirm={() => subSheet?.onConfirm()}
                disabled={subSheet?.confirmLoading}
              />
            ) : (
              <Footer
                primary={primary}
                cancelLabel="Cancel"
                confirmLabel={confirmLoading ? "Saving…" : confirmLabel}
                onCancel={() => { Keyboard.dismiss(); onClose(); }}
                onConfirm={onConfirm}
                disabled={confirmLoading}
              />
            )}

          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ─── Shared footer ──────────────────────────────────────────────────────────

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
        style={[
          styles.btn,
          { backgroundColor: primary },
          disabled ? { opacity: 0.65 } : null,
        ]}
        onPress={onConfirm}
        disabled={!!disabled}
      >
        <ThemedText style={[styles.btnText, { color: "#FFFFFF" }]}>
          {confirmLabel}
        </ThemedText>
      </Pressable>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  backBtn: {
    marginRight: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    fontFamily: "Nunito_800ExtraBold",
    flex: 1,
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
});
