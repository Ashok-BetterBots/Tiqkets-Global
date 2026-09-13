import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";

interface Action {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  variant?: "primary" | "secondary";
}

interface Props {
  title: string;
  subtitle?: string;
  actions?: Action[];
}

export function PageHeader({ title, subtitle, actions }: Props) {
  const { theme } = useTheme();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.title, { color: theme.text }]}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText
            style={[styles.subtitle, { color: theme.textSecondary }]}
          >
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {actions && actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((a) => {
            const isPrimary = a.variant !== "secondary";
            return (
              <Pressable
                key={a.label}
                onPress={a.onPress}
                style={[
                  styles.btn,
                  {
                    backgroundColor: isPrimary
                      ? BrandColors.primary
                      : theme.surface,
                    borderColor: isPrimary
                      ? BrandColors.primary
                      : theme.borderSubtle,
                  },
                ]}
              >
                {a.icon ? (
                  <Feather
                    name={a.icon}
                    size={14}
                    color={isPrimary ? "#FFFFFF" : theme.text}
                  />
                ) : null}
                <ThemedText
                  lightColor={isPrimary ? "#FFFFFF" : theme.text}
                  darkColor={isPrimary ? "#FFFFFF" : theme.text}
                  style={styles.btnLabel}
                >
                  {a.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xl,
  },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 4 },
  actions: { flexDirection: "row", gap: Spacing.sm },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  btnLabel: { fontSize: 13, fontWeight: "600" },
});
