import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Alert,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { QueueMode, NotificationMode } from "@/types/organization";
import type { OrgStackParamList } from "@/navigation/OrgStackNavigator";
import { useColorScheme } from "react-native";

interface SettingSectionProps {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  children: React.ReactNode;
  isDark?: boolean;
}

function SettingSection({ title, icon, children, isDark = false }: SettingSectionProps) {
  const colors = isDark ? Colors.dark : Colors.light;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Feather name={icon} size={18} color={colors.primary} />
        <ThemedText type="body" style={styles.sectionTitle}>{title}</ThemedText>
      </View>
      <Card style={styles.sectionCard}>{children}</Card>
    </View>
  );
}

interface SettingRowProps {
  label: string;
  description?: string;
  right: React.ReactNode;
  onPress?: () => void;
  isDark?: boolean;
}

function SettingRow({ label, description, right, onPress, isDark = false }: SettingRowProps) {
  const colors = isDark ? Colors.dark : Colors.light;
  const content = (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <ThemedText style={styles.settingLabel}>{label}</ThemedText>
        {description ? (
          <ThemedText style={[styles.settingDescription, { color: colors.textSecondary }]}>{description}</ThemedText>
        ) : null}
      </View>
      {right}
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}

export default function OrgSettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NativeStackNavigationProp<OrgStackParamList>>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { organization, users, branches, updateSettings, generateAPIKey, logoutOrganization } = useOrganization();

  const [showApiSecret, setShowApiSecret] = useState(false);

  if (!organization) return null;

  const { settings } = organization;

  const handleQueueModeChange = async (mode: QueueMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateSettings({ queueMode: mode });
  };

  const handleNotificationModeChange = async (mode: NotificationMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateSettings({ notificationMode: mode });
  };

  const handleToggleBluetooth = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateSettings({
      display: { ...settings.display, enableBluetoothSpeaker: !settings.display.enableBluetoothSpeaker },
    });
  };

  const handleToggleTVDisplay = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateSettings({
      display: { ...settings.display, enableTVDisplay: !settings.display.enableTVDisplay },
    });
  };

  const handleGenerateAPIKey = async () => {
    Alert.alert(
      "Generate New API Key",
      "This will invalidate your existing API key. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const { apiKey, apiSecret } = await generateAPIKey();
            Alert.alert(
              "API Key Generated",
              `Your new API key has been generated. Keep your secret safe!\n\nKey: ${apiKey.substring(0, 16)}...`
            );
          },
        },
      ]
    );
  };

  const handleCopyAPIKey = async () => {
    await Clipboard.setStringAsync(settings.api.apiKey);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", "API key copied to clipboard");
  };

  const handleCopyAPISecret = async () => {
    await Clipboard.setStringAsync(settings.api.apiSecret);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", "API secret copied to clipboard");
  };

  const handleToggleAPI = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!settings.api.apiKey) {
      const { apiKey, apiSecret } = await generateAPIKey();
      Alert.alert("API Enabled", "Your API key has been generated.");
    } else {
      await updateSettings({
        api: { ...settings.api, isEnabled: !settings.api.isEnabled },
      });
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out of the organization dashboard?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await logoutOrganization();
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight, paddingBottom: insets.bottom + 100 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SettingSection title="Queue Processing Mode" icon="layers" isDark={isDark}>
          <View style={styles.modeOptions}>
            <Pressable
              style={[
                styles.modeOption,
                { backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC" },
                settings.queueMode === "fifo" && { borderColor: colors.primary, borderWidth: 2 },
              ]}
              onPress={() => handleQueueModeChange("fifo")}
            >
              <View style={[
                styles.modeIcon,
                { backgroundColor: settings.queueMode === "fifo" ? colors.primary : (isDark ? "#3A3A3A" : "#F1F5F9") }
              ]}>
                <Feather
                  name="arrow-down"
                  size={20}
                  color={settings.queueMode === "fifo" ? "#FFFFFF" : colors.textSecondary}
                />
              </View>
              <ThemedText style={styles.modeTitle}>FIFO Mode</ThemedText>
              <ThemedText style={[styles.modeDesc, { color: colors.textSecondary }]}>First come, first served</ThemedText>
            </Pressable>

            <Pressable
              style={[
                styles.modeOption,
                { backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC" },
                settings.queueMode === "selective" && { borderColor: colors.primary, borderWidth: 2 },
              ]}
              onPress={() => handleQueueModeChange("selective")}
            >
              <View style={[
                styles.modeIcon,
                { backgroundColor: settings.queueMode === "selective" ? colors.primary : (isDark ? "#3A3A3A" : "#F1F5F9") }
              ]}>
                <Feather
                  name="target"
                  size={20}
                  color={settings.queueMode === "selective" ? "#FFFFFF" : colors.textSecondary}
                />
              </View>
              <ThemedText style={styles.modeTitle}>Selective Mode</ThemedText>
              <ThemedText style={[styles.modeDesc, { color: colors.textSecondary }]}>Choose who to call next</ThemedText>
            </Pressable>
          </View>
        </SettingSection>

        <SettingSection title="Customer Notifications" icon="bell" isDark={isDark}>
          <SettingRow
            label="Notification Mode"
            description={settings.notificationMode === "all" 
              ? "Notify at 3rd, 2nd, next, and turn" 
              : "Only notify when it's their turn"}
            isDark={isDark}
            right={
              <View style={[styles.notifToggle, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}>
                <Pressable
                  style={[
                    styles.notifOption,
                    settings.notificationMode === "all" && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => handleNotificationModeChange("all")}
                >
                  <ThemedText style={[
                    styles.notifOptionText,
                    { color: colors.textSecondary },
                    settings.notificationMode === "all" && styles.notifOptionTextActive,
                  ]}>All</ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.notifOption,
                    settings.notificationMode === "turn_only" && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => handleNotificationModeChange("turn_only")}
                >
                  <ThemedText style={[
                    styles.notifOptionText,
                    { color: colors.textSecondary },
                    settings.notificationMode === "turn_only" && styles.notifOptionTextActive,
                  ]}>Turn Only</ThemedText>
                </Pressable>
              </View>
            }
          />
        </SettingSection>

        <SettingSection title="Display & Announcements" icon="monitor" isDark={isDark}>
          <SettingRow
            label="Bluetooth Speaker"
            description="Announce ticket numbers via Bluetooth"
            isDark={isDark}
            right={
              <Switch
                value={settings.display.enableBluetoothSpeaker}
                onValueChange={handleToggleBluetooth}
                trackColor={{ false: isDark ? "#3A3A3A" : "#E5E7EB", true: colors.primary + "50" }}
                thumbColor={settings.display.enableBluetoothSpeaker ? colors.primary : (isDark ? "#666" : "#F4F4F5")}
              />
            }
          />
          <View style={[styles.divider, { backgroundColor: isDark ? "#3A3A3A" : "#F1F5F9" }]} />
          <SettingRow
            label="TV Display"
            description="Show queue status on connected TV"
            isDark={isDark}
            right={
              <Switch
                value={settings.display.enableTVDisplay}
                onValueChange={handleToggleTVDisplay}
                trackColor={{ false: isDark ? "#3A3A3A" : "#E5E7EB", true: colors.primary + "50" }}
                thumbColor={settings.display.enableTVDisplay ? colors.primary : (isDark ? "#666" : "#F4F4F5")}
              />
            }
          />
          {settings.display.enableTVDisplay ? (
            <>
              <View style={[styles.divider, { backgroundColor: isDark ? "#3A3A3A" : "#F1F5F9" }]} />
              <View style={styles.tvUrlContainer}>
                <ThemedText style={[styles.tvUrlLabel, { color: colors.textSecondary }]}>TV Display URL</ThemedText>
                <View style={[styles.tvUrlBox, { backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC" }]}>
                  <ThemedText style={styles.tvUrl} numberOfLines={1}>
                    https://tiqkets.app/tv/{organization.id}
                  </ThemedText>
                  <Pressable style={styles.copyButton}>
                    <Feather name="copy" size={16} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}
        </SettingSection>

        <SettingSection title="API Integration" icon="code" isDark={isDark}>
          <SettingRow
            label="Enable API Access"
            description="Allow third-party systems to integrate"
            isDark={isDark}
            right={
              <Switch
                value={settings.api.isEnabled}
                onValueChange={handleToggleAPI}
                trackColor={{ false: isDark ? "#3A3A3A" : "#E5E7EB", true: colors.primary + "50" }}
                thumbColor={settings.api.isEnabled ? colors.primary : (isDark ? "#666" : "#F4F4F5")}
              />
            }
          />

          {settings.api.isEnabled && settings.api.apiKey ? (
            <>
              <View style={[styles.divider, { backgroundColor: isDark ? "#3A3A3A" : "#F1F5F9" }]} />
              <View style={styles.apiKeyContainer}>
                <View style={styles.apiKeyRow}>
                  <ThemedText style={[styles.apiKeyLabel, { color: colors.textSecondary }]}>API Key</ThemedText>
                  <Pressable onPress={handleCopyAPIKey} style={[styles.apiKeyValue, { backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC" }]}>
                    <ThemedText style={styles.apiKeyText} numberOfLines={1}>
                      {settings.api.apiKey.substring(0, 24)}...
                    </ThemedText>
                    <Feather name="copy" size={14} color={colors.primary} />
                  </Pressable>
                </View>

                <View style={styles.apiKeyRow}>
                  <ThemedText style={[styles.apiKeyLabel, { color: colors.textSecondary }]}>API Secret</ThemedText>
                  <Pressable onPress={handleCopyAPISecret} style={[styles.apiKeyValue, { backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC" }]}>
                    <ThemedText style={styles.apiKeyText} numberOfLines={1}>
                      {showApiSecret ? settings.api.apiSecret.substring(0, 20) + "..." : "••••••••••••••••"}
                    </ThemedText>
                    <Pressable onPress={() => setShowApiSecret(!showApiSecret)}>
                      <Feather name={showApiSecret ? "eye-off" : "eye"} size={14} color={colors.textSecondary} />
                    </Pressable>
                  </Pressable>
                </View>

                <Button
                  title="Regenerate API Key"
                  onPress={handleGenerateAPIKey}
                  variant="secondary"
                  size="small"
                  style={styles.regenerateButton}
                />
              </View>

              <View style={[styles.divider, { backgroundColor: isDark ? "#3A3A3A" : "#F1F5F9" }]} />
              <View style={styles.apiDocs}>
                <Feather name="book-open" size={16} color={colors.primary} />
                <ThemedText style={[styles.apiDocsText, { color: colors.primary }]}>View API Documentation</ThemedText>
                <Feather name="external-link" size={14} color={colors.primary} />
              </View>
            </>
          ) : null}
        </SettingSection>

        <SettingSection title="User Access Management" icon="users" isDark={isDark}>
          <Pressable
            style={styles.userManagementRow}
            onPress={() => navigation.navigate("UserManagement")}
          >
            <View style={styles.userManagementInfo}>
              <View style={styles.userManagementHeader}>
                <ThemedText style={styles.settingLabel}>Manage Team Members</ThemedText>
                <View style={[styles.userCountBadge, { backgroundColor: colors.primary + "15" }]}>
                  <ThemedText style={[styles.userCountText, { color: colors.primary }]}>{users.length}</ThemedText>
                </View>
              </View>
              <ThemedText style={[styles.settingDescription, { color: colors.textSecondary }]}>
                Add admins, location managers, floor managers, and front desk staff
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: isDark ? "#3A3A3A" : "#F1F5F9" }]} />
          <View style={styles.rolesSummary}>
            <View style={styles.roleSummaryItem}>
              <View style={[styles.roleDot, { backgroundColor: "#7C3AED" }]} />
              <ThemedText style={styles.roleSummaryText}>
                {users.filter((u) => u.role === "admin").length} Admins
              </ThemedText>
            </View>
            <View style={styles.roleSummaryItem}>
              <View style={[styles.roleDot, { backgroundColor: "#2563EB" }]} />
              <ThemedText style={styles.roleSummaryText}>
                {users.filter((u) => u.role === "location_manager").length} Managers
              </ThemedText>
            </View>
            <View style={styles.roleSummaryItem}>
              <View style={[styles.roleDot, { backgroundColor: "#059669" }]} />
              <ThemedText style={styles.roleSummaryText}>
                {users.filter((u) => u.role === "floor_manager").length} Floor
              </ThemedText>
            </View>
            <View style={styles.roleSummaryItem}>
              <View style={[styles.roleDot, { backgroundColor: "#D97706" }]} />
              <ThemedText style={styles.roleSummaryText}>
                {users.filter((u) => u.role === "front_desk").length} Front Desk
              </ThemedText>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: isDark ? "#3A3A3A" : "#F1F5F9" }]} />
          <View style={styles.branchesSummary}>
            <Feather name="map-pin" size={14} color={colors.textSecondary} />
            <ThemedText style={[styles.branchesSummaryText, { color: colors.textSecondary }]}>
              {branches.length} Branch{branches.length !== 1 ? "es" : ""} configured
            </ThemedText>
          </View>
        </SettingSection>

        <SettingSection title="Account" icon="user" isDark={isDark}>
          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Feather name="log-out" size={18} color={colors.accent} />
            <ThemedText style={[styles.logoutText, { color: colors.accent }]}>Log Out</ThemedText>
          </Pressable>
        </SettingSection>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontWeight: "600",
    marginLeft: Spacing.sm,
  },
  sectionCard: {
    padding: Spacing.lg,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  settingInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  settingLabel: {
    fontWeight: "500",
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 12,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.sm,
  },
  modeOptions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  modeOption: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  modeIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  modeTitle: {
    fontWeight: "600",
    fontSize: 14,
    marginBottom: 2,
  },
  modeDesc: {
    fontSize: 11,
    textAlign: "center",
  },
  notifToggle: {
    flexDirection: "row",
    borderRadius: BorderRadius.full,
    padding: 2,
  },
  notifOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  notifOptionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  notifOptionTextActive: {
    color: "#FFFFFF",
  },
  tvUrlContainer: {
    marginTop: Spacing.sm,
  },
  tvUrlLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: Spacing.xs,
  },
  tvUrlBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  tvUrl: {
    flex: 1,
    fontSize: 12,
    fontFamily: "monospace",
    color: Colors.light.text,
  },
  copyButton: {
    padding: Spacing.xs,
  },
  apiKeyContainer: {
    marginTop: Spacing.sm,
  },
  apiKeyRow: {
    marginBottom: Spacing.md,
  },
  apiKeyLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: Spacing.xs,
  },
  apiKeyValue: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  apiKeyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "monospace",
    color: Colors.light.text,
  },
  regenerateButton: {
    marginTop: Spacing.sm,
  },
  apiDocs: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  apiDocsText: {
    flex: 1,
    color: Colors.light.primary,
    fontWeight: "500",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  logoutText: {
    color: Colors.light.accent,
    fontWeight: "600",
  },
  userManagementRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  userManagementInfo: {
    flex: 1,
  },
  userManagementHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 2,
  },
  userCountBadge: {
    backgroundColor: Colors.light.primary + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  userCountText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.light.primary,
  },
  rolesSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  roleSummaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  roleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  roleSummaryText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  branchesSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  branchesSummaryText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
});
