import React from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

export function Modal({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 520,
}: Props) {
  const { theme } = useTheme();
  if (!visible) return null;
  return (
    <View style={styles.overlay}>
      <Pressable style={styles.overlayBackdrop} onPress={onClose} />
      <View
        style={[
          styles.dialog,
          {
            backgroundColor: theme.surface,
            borderColor: theme.borderSubtle,
            width: width,
            maxWidth: "92%",
          },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.title, { color: theme.text }]}>{title}</ThemedText>
            {subtitle ? (
              <ThemedText style={[styles.subtitle, { color: theme.mutedText }]} numberOfLines={2}>
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={18} color={theme.mutedText} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.bodyContent} style={styles.body}>
          {children}
        </ScrollView>
        {footer ? (
          <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>{footer}</View>
        ) : null}
      </View>
    </View>
  );
}

export function PrimaryBtn({
  label,
  icon,
  onPress,
  disabled,
  tone = "primary",
}: {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}) {
  const { theme } = useTheme();
  const bg =
    tone === "primary"
      ? BrandColors.primary
      : tone === "danger"
      ? "#DC2626"
      : theme.surface;
  const fg = tone === "secondary" ? theme.text : "#FFFFFF";
  const border = tone === "secondary" ? theme.borderSubtle : bg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        btnStyles.btn,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {icon ? <Feather name={icon} size={14} color={fg} /> : null}
      <ThemedText lightColor={fg} darkColor={fg} style={btnStyles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const btnStyles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  label: { fontSize: 13, fontWeight: "600" },
});

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  overlayBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  dialog: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    maxHeight: "85%",
    overflow: "hidden",
    shadowColor: "rgba(15,23,42,0.25)",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 1,
    shadowRadius: 60,
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    gap: Spacing.md,
  },
  title: { fontSize: 16, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 4 },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.xs,
  },
  body: { maxHeight: 540 },
  bodyContent: { padding: Spacing.xl, gap: Spacing.lg },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
});
