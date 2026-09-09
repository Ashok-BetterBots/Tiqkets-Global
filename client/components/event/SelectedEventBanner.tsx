import React from "react";
import { StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useEventSelection } from "@/contexts/EventSelectionContext";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";

export function SelectedEventBanner() {
  const { theme } = useTheme();
  const { selectedEvent } = useEventSelection();

  return (
    <View style={styles.container} testID="selected-event-banner">
      <ThemedText style={[styles.name, { color: theme.textSecondary }]} numberOfLines={1}>
        {selectedEvent?.name ?? "No event selected"}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-end",
    transform: [{ translateY: -Spacing.md }],
    marginBottom: Spacing.xs,
  },
  name: {
    maxWidth: "75%",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    textAlign: "right",
  },
});