import React, { useState } from "react";
import { Keyboard, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";

export function QueueSearchBar({ value, onChange, compact = false }: { value: string; onChange: (value: string) => void; compact?: boolean }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const close = () => { onChange(""); setOpen(false); Keyboard.dismiss(); };
  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      {!(compact && open) ? (
        <Pressable
          onPress={open ? close : () => setOpen(true)}
          style={[styles.button, compact && styles.compactButton]}
          accessibilityRole="button"
          accessibilityLabel={open ? "Close queue search" : "Search current queue tab"}
          testID="queue-search-button"
        >
          <Feather name={open ? "x" : "search"} size={18} color={compact ? "#4B4BC8" : theme.primary} />
          <ThemedText numberOfLines={compact ? 1 : undefined} style={[{ color: theme.primary, fontWeight: "700" }, compact && styles.compactLabel, compact && !open && styles.compactPlaceholder]}>
            {compact && !open ? "Search name or token" : open ? "Close search" : "Search"}
          </ThemedText>
        </Pressable>
      ) : null}
      {open ? (
        <>
          <View style={[styles.inputRow, compact && styles.compactInputRow, { backgroundColor: compact ? "#FFFFFF" : theme.surface, borderColor: compact ? "#DDD8E8" : theme.borderSubtle }]}>
            <Feather name="search" size={17} color={compact ? "#4B4BC8" : theme.textSecondary} />
            <TextInput
              autoFocus
              value={value}
              onChangeText={onChange}
              placeholder={compact ? "Search name or token" : "Name, Booking ID or phone number"}
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Search by name, booking ID or phone number"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
              style={[styles.input, compact && styles.compactInput, { color: theme.text }]}
              testID="queue-search-input"
            />
            {value ? (
              <Pressable onPress={() => onChange("")} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
                <Feather name="x-circle" size={18} color={theme.textSecondary} />
              </Pressable>
            ) : null}
            {compact ? (
              <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close queue search" hitSlop={6}>
                <Feather name="x" size={18} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          {!compact ? <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>Searches the current tab only.</ThemedText> : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  button: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 8 },
  compactContainer: { flex: 1, minWidth: 0, paddingHorizontal: 0, paddingVertical: 0, gap: 0 },
  compactButton: { alignSelf: "stretch", minHeight: 44, height: 44, borderWidth: 1, borderColor: "#DDD8E8", borderRadius: 12, backgroundColor: "#FFFFFF", paddingHorizontal: 14 },
  compactLabel: { flex: 1, fontSize: 14, fontWeight: "500" },
  compactPlaceholder: { color: "#6C6878" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  compactInputRow: { height: 44, flex: 1 },
  compactInput: { height: 44 },
  input: { flex: 1, minWidth: 0, height: 46, fontSize: 14 },
  hint: { fontSize: 12 },
});
