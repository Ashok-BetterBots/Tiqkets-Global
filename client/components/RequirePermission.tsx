import React from "react";
import { View, StyleSheet } from "react-native";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";

export function usePermission(key: string): boolean {
  const { hasPermission } = useOrganization();
  return hasPermission(key);
}

export function useAnyPermission(keys: string[]): boolean {
  const { hasAnyPermission } = useOrganization();
  return hasAnyPermission(keys);
}

interface RequirePermissionProps {
  permission?: string;
  anyOf?: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RequirePermission({ permission, anyOf, fallback = null, children }: RequirePermissionProps) {
  const { hasPermission, hasAnyPermission } = useOrganization();
  const allowed = permission
    ? hasPermission(permission)
    : anyOf && anyOf.length > 0
      ? hasAnyPermission(anyOf)
      : true;
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

interface PermissionDeniedProps {
  message?: string;
}

export function PermissionDenied({ message = "You do not have permission to view this section." }: PermissionDeniedProps) {
  const { theme } = useTheme();
  return (
    <ThemedView style={styles.container} testID="permission-denied">
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText type="defaultSemiBold" style={styles.title}>
          Access restricted
        </ThemedText>
        <ThemedText style={[styles.message, { color: theme.mutedText }]}>{message}</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  card: {
    maxWidth: 400,
    padding: Spacing.xl,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: {
    fontSize: 18,
  },
  message: {
    textAlign: "center",
    fontSize: 14,
  },
});
