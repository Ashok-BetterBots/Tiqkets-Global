import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { ThemedText } from "@/components/ThemedText";
import { RolesPanel } from "./_components/RolesPanel";
import { PermissionsMatrix } from "./_components/PermissionsMatrix";

type Tab = "roles" | "permissions";

interface Props {
  initialTab?: Tab;
}

export default function UserControlScreen({ initialTab = "roles" }: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [matrixRoleId, setMatrixRoleId] = useState<string | null>(null);

  React.useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "roles", label: "Roles" },
    { key: "permissions", label: "Permissions" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Roles & Permissions"
          subtitle="Manage role templates and the permissions assigned to each one"
        />

        <View
          style={[
            styles.tabBar,
            { backgroundColor: theme.surface, borderColor: theme.borderSubtle },
          ]}
        >
          {tabs.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[
                  styles.tabBtn,
                  active && { backgroundColor: BrandColors.primary + "15" },
                ]}
              >
                <ThemedText
                  style={{
                    color: active ? BrandColors.primary : theme.textSecondary,
                    fontSize: 13,
                    fontWeight: active ? "700" : "500",
                  }}
                >
                  {t.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: Spacing.lg }} />

        {tab === "roles" ? (
          <RolesPanel
            onOpenMatrixForRole={(id) => {
              setMatrixRoleId(id);
              setTab("permissions");
            }}
          />
        ) : (
          <PermissionsMatrix initialRoleId={matrixRoleId} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.xl },
  content: { width: "100%", maxWidth: 1280, alignSelf: "center" },
  tabBar: {
    flexDirection: "row",
    alignSelf: "flex-start",
    padding: 4,
    gap: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  tabBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: BorderRadius.xs,
  },
});
