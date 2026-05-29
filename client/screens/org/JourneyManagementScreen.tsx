import React, { useState, useMemo } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useTheme } from "@/hooks/useTheme";
import { JourneyManager } from "@/components/org/JourneyManager";

export default function JourneyManagementScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { organization, getAccessibleBranches } = useOrganization();

  const accessibleBranches = useMemo(
    () =>
      getAccessibleBranches().filter(
        (b) =>
          (b.settings?.queueMode ?? organization?.settings?.queueMode) === "multistage"
      ),
    [getAccessibleBranches, organization?.settings?.queueMode]
  );
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    accessibleBranches[0]?.id || ""
  );

  const activeBranchId =
    accessibleBranches.find((b) => b.id === selectedBranchId)?.id ||
    accessibleBranches[0]?.id ||
    "";

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <ThemedText style={styles.title}>Customer Journeys</ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
            Define multi-stage flows that route customers through several services in order.
          </ThemedText>
        </View>

        {accessibleBranches.length > 1 ? (
          <View style={styles.branchSelector}>
            <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              BRANCH
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.branchTabs}>
                {accessibleBranches.map((branch) => {
                  const active = branch.id === activeBranchId;
                  return (
                    <Pressable
                      key={branch.id}
                      style={[
                        styles.branchTab,
                        {
                          backgroundColor: active ? colors.primary : colors.surfaceMuted,
                        },
                      ]}
                      onPress={() => setSelectedBranchId(branch.id)}
                    >
                      <ThemedText
                        style={[
                          styles.branchTabText,
                          { color: active ? "#FFFFFF" : colors.text },
                        ]}
                      >
                        {branch.name}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        ) : null}

        {activeBranchId ? (
          <JourneyManager branchId={activeBranchId} isDark={isDark} />
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.surfaceMuted }]}>
            <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
              No multi-stage branches
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: colors.textSecondary, textAlign: "center" }]}>
              Set a branch's queue mode to "Multi-stage" in Settings to define customer journeys.
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const createStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: Spacing.md,
    },
    header: {
      marginBottom: Spacing.lg,
    },
    title: {
      fontSize: 24,
      fontWeight: "700",
      marginBottom: Spacing.xs,
    },
    subtitle: {
      fontSize: 14,
    },
    branchSelector: {
      marginBottom: Spacing.lg,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.5,
      marginBottom: Spacing.sm,
    },
    branchTabs: {
      flexDirection: "row",
      gap: Spacing.sm,
    },
    branchTab: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
    },
    branchTabText: {
      fontSize: 14,
      fontWeight: "500",
    },
    emptyCard: {
      padding: Spacing.xl,
      alignItems: "center",
      gap: Spacing.md,
      borderRadius: BorderRadius.md,
    },
    emptyText: {
      fontSize: 15,
      fontWeight: "600",
    },
  });
