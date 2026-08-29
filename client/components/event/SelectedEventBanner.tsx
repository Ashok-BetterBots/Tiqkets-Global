import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useEventSelection } from "@/contexts/EventSelectionContext";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, BrandColors, Spacing } from "@/constants/theme";

export function SelectedEventBanner() {
  const { theme } = useTheme();
  const { selectedEvent } = useEventSelection();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: BrandColors.primary + "0D", borderColor: BrandColors.primary + "2E" },
      ]}
      testID="selected-event-banner"
    >
      <View style={[styles.icon, { backgroundColor: BrandColors.primary + "18" }]}>
        <Feather name="calendar" size={14} color={BrandColors.primary} />
      </View>
      <View style={styles.text}>
        <ThemedText style={[styles.label, { color: theme.textSecondary }]}>SELECTED EVENT</ThemedText>
        <ThemedText type="body" style={styles.name} numberOfLines={1}>
          {selectedEvent?.name ?? "No event selected"}
        </ThemedText>
      </View>
      {selectedEvent ? (
        <ThemedText type="small" style={{ color: BrandColors.primary, fontWeight: "700" }}>
          {selectedEvent.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 54,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0 },
  label: { fontSize: 9, fontWeight: "700", letterSpacing: 0.7 },
  name: { fontWeight: "700", marginTop: 1 },
});