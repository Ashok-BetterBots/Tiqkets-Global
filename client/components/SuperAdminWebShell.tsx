import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Spacing, BorderRadius } from "@/constants/theme";

interface Props {
  currentRouteName: string;
  currentTab?: string;
  onNavigate: (name: string, tab?: string) => void;
  onLogout?: () => void;
  children: React.ReactNode;
}

export default function SuperAdminWebShell({ children }: Props) {
  const { theme } = useTheme();
  const { logoutOrganization } = useOrganization();

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.borderSubtle },
        ]}
      >
        <View
          style={[styles.iconWrap, { backgroundColor: theme.primary + "18" }]}
        >
          <Feather name="monitor" size={28} color={theme.primary} />
        </View>
        <ThemedText style={[styles.title, { color: theme.text }]}>
          Super Admin Console
        </ThemedText>
        <ThemedText
          style={[styles.subtitle, { color: theme.textSecondary }]}
        >
          The Super Admin portal is designed for desktop. Please open
          TIQKETS in a web browser to manage the platform.
        </ThemedText>
        <View style={{ height: Spacing.lg }} />
        <ThemedText
          onPress={() => logoutOrganization()}
          style={[styles.signOut, { color: theme.primary }]}
        >
          Sign out
        </ThemedText>
      </View>
      <View style={{ display: "none" }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  title: { fontSize: 20, fontWeight: "700", marginBottom: Spacing.sm },
  subtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  signOut: { fontSize: 14, fontWeight: "600" },
});
