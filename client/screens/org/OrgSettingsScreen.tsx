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
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { setStringAsync } from "expo-clipboard";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { QueueMode, NotificationMode } from "@/types/organization";

interface SettingSectionProps {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  children: React.ReactNode;
}

function SettingSection({ title, icon, children }: SettingSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Feather name={icon} size={18} color={Colors.light.primary} />
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
}

function SettingRow({ label, description, right, onPress }: SettingRowProps) {
  const content = (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <ThemedText style={styles.settingLabel}>{label}</ThemedText>
        {description ? (
          <ThemedText style={styles.settingDescription}>{description}</ThemedText>
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
  const { organization, updateSettings, generateAPIKey, logoutOrganization } = useOrganization();

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
    await setStringAsync(settings.api.apiKey);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", "API key copied to clipboard");
  };

  const handleCopyAPISecret = async () => {
    await setStringAsync(settings.api.apiSecret);
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
          { paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + 100 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SettingSection title="Queue Processing Mode" icon="layers">
          <View style={styles.modeOptions}>
            <Pressable
              style={[
                styles.modeOption,
                settings.queueMode === "fifo" && styles.modeOptionActive,
              ]}
              onPress={() => handleQueueModeChange("fifo")}
            >
              <View style={[
                styles.modeIcon,
                { backgroundColor: settings.queueMode === "fifo" ? Colors.light.primary : "#F1F5F9" }
              ]}>
                <Feather
                  name="arrow-down"
                  size={20}
                  color={settings.queueMode === "fifo" ? "#FFFFFF" : Colors.light.textSecondary}
                />
              </View>
              <ThemedText style={styles.modeTitle}>FIFO Mode</ThemedText>
              <ThemedText style={styles.modeDesc}>First come, first served</ThemedText>
            </Pressable>

            <Pressable
              style={[
                styles.modeOption,
                settings.queueMode === "selective" && styles.modeOptionActive,
              ]}
              onPress={() => handleQueueModeChange("selective")}
            >
              <View style={[
                styles.modeIcon,
                { backgroundColor: settings.queueMode === "selective" ? Colors.light.primary : "#F1F5F9" }
              ]}>
                <Feather
                  name="target"
                  size={20}
                  color={settings.queueMode === "selective" ? "#FFFFFF" : Colors.light.textSecondary}
                />
              </View>
              <ThemedText style={styles.modeTitle}>Selective Mode</ThemedText>
              <ThemedText style={styles.modeDesc}>Choose who to call next</ThemedText>
            </Pressable>
          </View>
        </SettingSection>

        <SettingSection title="Customer Notifications" icon="bell">
          <SettingRow
            label="Notification Mode"
            description={settings.notificationMode === "all" 
              ? "Notify at 3rd, 2nd, next, and turn" 
              : "Only notify when it's their turn"}
            right={
              <View style={styles.notifToggle}>
                <Pressable
                  style={[
                    styles.notifOption,
                    settings.notificationMode === "all" && styles.notifOptionActive,
                  ]}
                  onPress={() => handleNotificationModeChange("all")}
                >
                  <ThemedText style={[
                    styles.notifOptionText,
                    settings.notificationMode === "all" && styles.notifOptionTextActive,
                  ]}>All</ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.notifOption,
                    settings.notificationMode === "turn_only" && styles.notifOptionActive,
                  ]}
                  onPress={() => handleNotificationModeChange("turn_only")}
                >
                  <ThemedText style={[
                    styles.notifOptionText,
                    settings.notificationMode === "turn_only" && styles.notifOptionTextActive,
                  ]}>Turn Only</ThemedText>
                </Pressable>
              </View>
            }
          />
        </SettingSection>

        <SettingSection title="Display & Announcements" icon="monitor">
          <SettingRow
            label="Bluetooth Speaker"
            description="Announce ticket numbers via Bluetooth"
            right={
              <Switch
                value={settings.display.enableBluetoothSpeaker}
                onValueChange={handleToggleBluetooth}
                trackColor={{ false: "#E5E7EB", true: Colors.light.primary + "50" }}
                thumbColor={settings.display.enableBluetoothSpeaker ? Colors.light.primary : "#F4F4F5"}
              />
            }
          />
          <View style={styles.divider} />
          <SettingRow
            label="TV Display"
            description="Show queue status on connected TV"
            right={
              <Switch
                value={settings.display.enableTVDisplay}
                onValueChange={handleToggleTVDisplay}
                trackColor={{ false: "#E5E7EB", true: Colors.light.primary + "50" }}
                thumbColor={settings.display.enableTVDisplay ? Colors.light.primary : "#F4F4F5"}
              />
            }
          />
          {settings.display.enableTVDisplay ? (
            <>
              <View style={styles.divider} />
              <View style={styles.tvUrlContainer}>
                <ThemedText style={styles.tvUrlLabel}>TV Display URL</ThemedText>
                <View style={styles.tvUrlBox}>
                  <ThemedText style={styles.tvUrl} numberOfLines={1}>
                    https://tiqkets.app/tv/{organization.id}
                  </ThemedText>
                  <Pressable style={styles.copyButton}>
                    <Feather name="copy" size={16} color={Colors.light.primary} />
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}
        </SettingSection>

        <SettingSection title="API Integration" icon="code">
          <SettingRow
            label="Enable API Access"
            description="Allow third-party systems to integrate"
            right={
              <Switch
                value={settings.api.isEnabled}
                onValueChange={handleToggleAPI}
                trackColor={{ false: "#E5E7EB", true: Colors.light.primary + "50" }}
                thumbColor={settings.api.isEnabled ? Colors.light.primary : "#F4F4F5"}
              />
            }
          />

          {settings.api.isEnabled && settings.api.apiKey ? (
            <>
              <View style={styles.divider} />
              <View style={styles.apiKeyContainer}>
                <View style={styles.apiKeyRow}>
                  <ThemedText style={styles.apiKeyLabel}>API Key</ThemedText>
                  <Pressable onPress={handleCopyAPIKey} style={styles.apiKeyValue}>
                    <ThemedText style={styles.apiKeyText} numberOfLines={1}>
                      {settings.api.apiKey.substring(0, 24)}...
                    </ThemedText>
                    <Feather name="copy" size={14} color={Colors.light.primary} />
                  </Pressable>
                </View>

                <View style={styles.apiKeyRow}>
                  <ThemedText style={styles.apiKeyLabel}>API Secret</ThemedText>
                  <Pressable onPress={handleCopyAPISecret} style={styles.apiKeyValue}>
                    <ThemedText style={styles.apiKeyText} numberOfLines={1}>
                      {showApiSecret ? settings.api.apiSecret.substring(0, 20) + "..." : "••••••••••••••••"}
                    </ThemedText>
                    <Pressable onPress={() => setShowApiSecret(!showApiSecret)}>
                      <Feather name={showApiSecret ? "eye-off" : "eye"} size={14} color={Colors.light.textSecondary} />
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

              <View style={styles.divider} />
              <View style={styles.apiDocs}>
                <Feather name="book-open" size={16} color={Colors.light.primary} />
                <ThemedText style={styles.apiDocsText}>View API Documentation</ThemedText>
                <Feather name="external-link" size={14} color={Colors.light.primary} />
              </View>
            </>
          ) : null}
        </SettingSection>

        <SettingSection title="Account" icon="user">
          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Feather name="log-out" size={18} color={Colors.light.accent} />
            <ThemedText style={styles.logoutText}>Log Out</ThemedText>
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
    padding: Spacing.lg,
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
    color: Colors.light.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
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
    borderWidth: 2,
    borderColor: "#F1F5F9",
    alignItems: "center",
  },
  modeOptionActive: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary + "08",
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
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  notifToggle: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: BorderRadius.full,
    padding: 2,
  },
  notifOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  notifOptionActive: {
    backgroundColor: Colors.light.primary,
  },
  notifOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.light.textSecondary,
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
});
