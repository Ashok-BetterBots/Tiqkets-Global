import React, { useState, useMemo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";
import { ThemedText } from "@/components/ThemedText";

type Tab = "categories" | "plans" | "currencies";

interface Props {
  initialTab?: Tab;
}

interface Category { id: string; name: string; slug: string; orgs: number; status: "active" | "inactive"; }
interface PlanType { id: string; code: string; name: string; pricePerBranch: string; trialDays: number; status: "active" | "inactive"; }
interface Currency { id: string; code: string; name: string; symbol: string; rate: string; isDefault: boolean; }

const CATEGORIES: Category[] = [
  { id: "c1", name: "Banking & Finance", slug: "banking", orgs: 38, status: "active" },
  { id: "c2", name: "Healthcare & Clinics", slug: "healthcare", orgs: 64, status: "active" },
  { id: "c3", name: "Government & Public Services", slug: "government", orgs: 22, status: "active" },
  { id: "c4", name: "Automotive Service", slug: "automotive", orgs: 12, status: "active" },
  { id: "c5", name: "Food & Beverage", slug: "fnb", orgs: 9, status: "inactive" },
  { id: "c6", name: "Legal & Notary", slug: "legal", orgs: 8, status: "active" },
];

const PLAN_TYPES: PlanType[] = [
  { id: "p1", code: "STARTER", name: "Starter", pricePerBranch: "$49", trialDays: 14, status: "active" },
  { id: "p2", code: "GROWTH", name: "Growth", pricePerBranch: "$140", trialDays: 14, status: "active" },
  { id: "p3", code: "ENTERPRISE", name: "Enterprise", pricePerBranch: "Custom", trialDays: 30, status: "active" },
];

const CURRENCIES: Currency[] = [
  { id: "u1", code: "USD", name: "US Dollar", symbol: "$", rate: "1.00", isDefault: true },
  { id: "u2", code: "EUR", name: "Euro", symbol: "€", rate: "0.92", isDefault: false },
  { id: "u3", code: "GBP", name: "Pound Sterling", symbol: "£", rate: "0.79", isDefault: false },
  { id: "u4", code: "AED", name: "UAE Dirham", symbol: "د.إ", rate: "3.67", isDefault: false },
  { id: "u5", code: "SGD", name: "Singapore Dollar", symbol: "S$", rate: "1.34", isDefault: false },
  { id: "u6", code: "INR", name: "Indian Rupee", symbol: "₹", rate: "83.20", isDefault: false },
];

export default function MasterScreen({ initialTab = "categories" }: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>(initialTab);

  React.useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "categories", label: "Categories" },
    { key: "plans", label: "Plan Types" },
    { key: "currencies", label: "Currencies" },
  ];

  const tableNode = useMemo(() => {
    if (tab === "categories") {
      const cols: Column<Category>[] = [
        { key: "name", label: "Category", flex: 1.4 },
        { key: "slug", label: "Slug", flex: 1 },
        { key: "orgs", label: "Organizations", flex: 1, align: "right" },
        { key: "status", label: "Status", flex: 0.8, render: (r) => (
          <StatusPill label={r.status} tone={r.status === "active" ? "success" : "neutral"} />
        ) },
      ];
      return <DataTable<Category> columns={cols} rows={CATEGORIES} searchKeys={["name", "slug"]} />;
    }
    if (tab === "plans") {
      const cols: Column<PlanType>[] = [
        { key: "code", label: "Code", flex: 1 },
        { key: "name", label: "Name", flex: 1.2 },
        { key: "pricePerBranch", label: "Price / branch", flex: 1, align: "right" },
        { key: "trialDays", label: "Trial days", flex: 0.8, align: "right" },
        { key: "status", label: "Status", flex: 0.8, render: (r) => (
          <StatusPill label={r.status} tone={r.status === "active" ? "success" : "neutral"} />
        ) },
      ];
      return <DataTable<PlanType> columns={cols} rows={PLAN_TYPES} searchKeys={["code", "name"]} />;
    }
    const cols: Column<Currency>[] = [
      { key: "code", label: "Code", flex: 0.7 },
      { key: "name", label: "Name", flex: 1.4 },
      { key: "symbol", label: "Symbol", flex: 0.6 },
      { key: "rate", label: "Rate vs USD", flex: 1, align: "right" },
      { key: "isDefault", label: "Default", flex: 0.8, render: (r) => (
        r.isDefault ? <StatusPill label="default" tone="info" /> : <ThemedText style={{ color: theme.mutedText, fontSize: 12 }}>—</ThemedText>
      ) },
    ];
    return <DataTable<Currency> columns={cols} rows={CURRENCIES} searchKeys={["code", "name"]} />;
  }, [tab, theme.mutedText]);

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Master Data"
          subtitle="Reference data used across the platform"
          actions={[{ label: "Add Entry", icon: "plus" }]}
        />

        <View style={[styles.tabBar, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
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
        {tableNode}
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
