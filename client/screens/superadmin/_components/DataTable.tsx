import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, TextInput, TextStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { SuperCard } from "./SuperCard";

export interface Column<T> {
  key: string;
  label: string;
  flex?: number;
  width?: number;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "center" | "right";
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  searchable?: boolean;
  searchKeys?: (keyof T)[];
  pageSize?: number;
  emptyText?: string;
  rightFilters?: React.ReactNode;
}

export function DataTable<T extends { id?: string | number }>({
  columns,
  rows,
  searchable = true,
  searchKeys,
  pageSize = 10,
  emptyText = "No records found",
  rightFilters,
}: Props<T>) {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const keys = searchKeys || (Object.keys(row as object) as (keyof T)[]);
      return keys.some((k) => {
        const v = (row as any)[k];
        return v != null && String(v).toLowerCase().includes(q);
      });
    });
  }, [rows, query, searchKeys]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const visible = filtered.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );

  return (
    <SuperCard padded={false}>
      <View
        style={[
          styles.toolbar,
          { borderBottomColor: theme.borderSubtle },
        ]}
      >
        {searchable ? (
          <View
            style={[
              styles.search,
              {
                backgroundColor: theme.surfaceMuted,
                borderColor: theme.borderSubtle,
              },
            ]}
          >
            <Feather name="search" size={14} color={theme.mutedText} />
            <TextInput
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                setPage(0);
              }}
              placeholder="Search..."
              placeholderTextColor={theme.mutedText}
              style={
                [
                  styles.searchInput,
                  { color: theme.text, outlineWidth: 0 },
                ] as TextStyle[]
              }
            />
          </View>
        ) : (
          <View />
        )}
        <View style={styles.toolbarRight}>{rightFilters}</View>
      </View>

      <View style={[styles.headRow, { borderBottomColor: theme.borderSubtle }]}>
        {columns.map((c) => (
          <View
            key={c.key}
            style={[
              styles.headCell,
              c.flex != null ? { flex: c.flex } : undefined,
              c.width != null ? { width: c.width } : undefined,
              c.align === "right"
                ? { alignItems: "flex-end" }
                : c.align === "center"
                ? { alignItems: "center" }
                : undefined,
            ]}
          >
            <ThemedText style={[styles.headText, { color: theme.mutedText }]}>
              {c.label.toUpperCase()}
            </ThemedText>
          </View>
        ))}
      </View>

      {visible.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="inbox" size={28} color={theme.mutedText} />
          <ThemedText
            style={[styles.emptyText, { color: theme.textSecondary }]}
          >
            {emptyText}
          </ThemedText>
        </View>
      ) : (
        visible.map((row, idx) => (
          <View
            key={(row.id as any) ?? idx}
            style={[styles.dataRow, { borderBottomColor: theme.borderSubtle }]}
          >
            {columns.map((c) => (
              <View
                key={c.key}
                style={[
                  styles.dataCell,
                  c.flex != null ? { flex: c.flex } : undefined,
                  c.width != null ? { width: c.width } : undefined,
                  c.align === "right"
                    ? { alignItems: "flex-end" }
                    : c.align === "center"
                    ? { alignItems: "center" }
                    : undefined,
                ]}
              >
                {c.render ? (
                  c.render(row)
                ) : (
                  <ThemedText
                    style={[styles.cellText, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {String((row as any)[c.key] ?? "")}
                  </ThemedText>
                )}
              </View>
            ))}
          </View>
        ))
      )}

      <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>
        <ThemedText style={[styles.footerInfo, { color: theme.textSecondary }]}>
          Showing {visible.length === 0 ? 0 : safePage * pageSize + 1}–
          {safePage * pageSize + visible.length} of {filtered.length}
        </ThemedText>
        <View style={styles.pager}>
          <Pressable
            onPress={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            style={[
              styles.pagerBtn,
              {
                borderColor: theme.borderSubtle,
                opacity: safePage === 0 ? 0.4 : 1,
              },
            ]}
          >
            <Feather name="chevron-left" size={14} color={theme.text} />
          </Pressable>
          <ThemedText style={[styles.pageText, { color: theme.text }]}>
            {safePage + 1} / {totalPages}
          </ThemedText>
          <Pressable
            onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            style={[
              styles.pagerBtn,
              {
                borderColor: theme.borderSubtle,
                opacity: safePage >= totalPages - 1 ? 0.4 : 1,
              },
            ]}
          >
            <Feather name="chevron-right" size={14} color={theme.text} />
          </Pressable>
        </View>
      </View>
    </SuperCard>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "success" | "warning" | "error" | "info" | "neutral";
}) {
  const palette = {
    success: { bg: "#DCFCE7", fg: "#166534" },
    warning: { bg: "#FEF3C7", fg: "#92400E" },
    error: { bg: "#FEE2E2", fg: "#991B1B" },
    info: { bg: "#DBEAFE", fg: "#1E40AF" },
    neutral: { bg: "#E5E7EB", fg: "#374151" },
  }[tone];
  return (
    <View style={[pillStyles.pill, { backgroundColor: palette.bg }]}>
      <ThemedText
        lightColor={palette.fg}
        darkColor={palette.fg}
        style={pillStyles.pillText}
      >
        {label}
      </ThemedText>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  pillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
});

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.md,
  },
  toolbarRight: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    height: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    minWidth: 280,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 13, height: "100%" },
  headRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headCell: { flex: 1, paddingHorizontal: Spacing.sm },
  headText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  dataRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderBottomWidth: 1,
  },
  dataCell: { flex: 1, paddingHorizontal: Spacing.sm },
  cellText: { fontSize: 13 },
  emptyState: { alignItems: "center", padding: Spacing["3xl"], gap: Spacing.sm },
  emptyText: { fontSize: 13 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  footerInfo: { fontSize: 12 },
  pager: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  pagerBtn: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  pageText: { fontSize: 12, fontWeight: "600" },
});

export default DataTable;
