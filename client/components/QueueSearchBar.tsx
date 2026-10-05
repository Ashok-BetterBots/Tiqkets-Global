import React, { useState } from "react";
import { Keyboard, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";

export function QueueSearchBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const close = () => { onChange(""); setOpen(false); Keyboard.dismiss(); };
  return (
    <View style={styles.container}>
      <Pressable
        onPress={open ? close : () => setOpen(true)}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={open ? "Close queue search" : "Search current queue tab"}
        testID="queue-search-button"
      >
        <Feather name={open ? "x" : "search"} size={18} color={theme.primary} />
        <ThemedText style={{ color: theme.primary, fontWeight: "700" }}>{open ? "Close search" : "Search"}</ThemedText>
      </Pressable>
      {open ? (
        <>
          <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
            <Feather name="search" size={17} color={theme.textSecondary} />
            <TextInput
              autoFocus
              value={value}
              onChangeText={onChange}
              placeholder="Name, Booking ID or phone number"
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Search by name, booking ID or phone number"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
              style={[styles.input, { color: theme.text }]}
              testID="queue-search-input"
            />
            {value ? (
              <Pressable onPress={() => onChange("")} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
                <Feather name="x-circle" size={18} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>Searches the current tab only.</ThemedText>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  button: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 8 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  input: { flex: 1, minWidth: 0, height: 46, fontSize: 14 },
  hint: { fontSize: 12 },
});
