import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest } from "@/lib/query-client";
import { BorderRadius, BrandColors, Spacing } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";

interface PublicSettings {
  customerAppLoginEnabled: boolean;
}

export default function SystemSettingsScreen() {
  const { theme } = useTheme();
  const qc = useQueryClient();

  const query = useQuery<PublicSettings>({
    queryKey: ["/api/system-settings/public"],
  });

  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>("");

  useEffect(() => {
    if (query.data) setOptimistic(null);
  }, [query.data?.customerAppLoginEnabled]);

  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PUT", "/api/superadmin/system-settings/customer-app-login", { enabled });
      return (await res.json()) as PublicSettings;
    },
    onMutate: (enabled: boolean) => {
      setOptimistic(enabled);
      setStatusMsg("Saving…");
    },
    onSuccess: (data) => {
      qc.setQueryData(["/api/system-settings/public"], data);
      setOptimistic(null);
      setStatusMsg("Saved");
      setTimeout(() => setStatusMsg(""), 2000);
    },
    onError: (err: any) => {
      setOptimistic(null);
      setStatusMsg(err?.message ? `Failed: ${err.message}` : "Failed to save");
    },
  });

  const value = optimistic ?? query.data?.customerAppLoginEnabled ?? true;
  const loading = query.isLoading;
  const isWeb = Platform.OS === "web";

  return (
    <ScrollView style={[styles.root, { backgroundColor: theme.backgroundRoot }]} contentContainerStyle={styles.content}>
      <PageHeader
        title="System Settings"
        subtitle="Platform-wide flags that affect every customer device"
      />

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Feather name="smartphone" size={20} color={BrandColors.primary} />
          </View>
          <View style={{ flex: 1, paddingHorizontal: Spacing.md }}>
            <ThemedText style={[styles.title, { color: theme.text }]} testID="text-customer-login-title">
              Customer mobile app login
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
              When ON, the mobile app shows the customer WhatsApp-OTP login screen.
              When OFF, the mobile app skips the customer flow and shows the
              organisation login screen instead. Changes take effect on the next
              app launch (or immediately when an app comes back to the foreground).
            </ThemedText>
          </View>
          <View style={{ alignItems: "flex-end", justifyContent: "center" }}>
            {loading ? (
              <ActivityIndicator color={BrandColors.primary} />
            ) : query.isError ? (
              <Pressable
                onPress={() => query.refetch()}
                style={{
                  paddingHorizontal: Spacing.sm,
                  paddingVertical: 6,
                  borderRadius: BorderRadius.md,
                  backgroundColor: BrandColors.primary + "15",
                }}
                testID="button-retry-system-settings"
              >
                <ThemedText style={{ color: BrandColors.primary, fontSize: 12, fontWeight: "700" }}>
                  Retry
                </ThemedText>
              </Pressable>
            ) : (
              <Switch
                value={value}
                disabled={mutation.isPending}
                onValueChange={(next) => mutation.mutate(next)}
                trackColor={{ true: BrandColors.primary, false: theme.border }}
                thumbColor={isWeb ? undefined : "#FFFFFF"}
                testID="switch-customer-app-login"
              />
            )}
          </View>
        </View>

        <View style={[styles.statusRow, { borderTopColor: theme.borderSubtle }]}>
          {query.isError ? (
            <View
              style={[
                styles.pill,
                { backgroundColor: "#FEECEC", borderColor: "#E5484D33" },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: "#E5484D" }]} />
              <ThemedText
                style={{ color: "#A4262C", fontSize: 12, fontWeight: "700" }}
                testID="text-customer-login-status"
              >
                Unable to load current setting — tap Retry
              </ThemedText>
            </View>
          ) : (
            <View
              style={[
                styles.pill,
                {
                  backgroundColor: value ? "#E6F7EE" : "#FEECEC",
                  borderColor: value ? "#34C77433" : "#E5484D33",
                },
              ]}
            >
              <View
                style={[styles.dot, { backgroundColor: value ? "#1AA76A" : "#E5484D" }]}
              />
              <ThemedText
                style={{
                  color: value ? "#0F7A4D" : "#A4262C",
                  fontSize: 12,
                  fontWeight: "700",
                }}
                testID="text-customer-login-status"
              >
                {value ? "Customer login: ENABLED" : "Customer login: DISABLED — org login shown"}
              </ThemedText>
            </View>
          )}
          {statusMsg ? (
            <ThemedText style={{ color: theme.textSecondary, fontSize: 12 }}>
              {statusMsg}
            </ThemedText>
          ) : null}
        </View>
      </View>

      <View style={[styles.note, { borderColor: theme.borderSubtle }]}>
        <Feather name="info" size={14} color={theme.textSecondary} />
        <ThemedText style={[styles.noteText, { color: theme.textSecondary }]}>
          When customer login is disabled, the &quot;back to customer&quot; button on the
          organisation login screen is also hidden so end-users can&apos;t switch
          back to the unavailable flow.
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xl * 2 },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "flex-start" },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: BrandColors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 13, lineHeight: 19 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
    borderTopWidth: 1,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  note: {
    marginTop: Spacing.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  noteText: { flex: 1, marginLeft: Spacing.sm, fontSize: 12, lineHeight: 18 },
});
