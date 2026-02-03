import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { QueueMode, NotificationMode } from "@/types/organization";
import type { OrgStackParamList } from "@/navigation/OrgStackNavigator";
import { useColorScheme } from "react-native";

interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
}

function SettingSection({ title, children }: SettingSectionProps) {
  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      <Card style={styles.sectionCard}>{children}</Card>
    </View>
  );
}

interface SettingRowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  description?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  isDark?: boolean;
}

function SettingRow({ icon, label, description, right, onPress, showChevron, isDark = false }: SettingRowProps) {
  const colors = isDark ? Colors.dark : Colors.light;
  const content = (
    <View style={styles.settingRow}>
      <View style={[styles.settingIcon, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.settingInfo}>
        <ThemedText style={styles.settingLabel}>{label}</ThemedText>
        {description ? (
          <ThemedText style={[styles.settingDescription, { color: colors.textSecondary }]}>{description}</ThemedText>
        ) : null}
      </View>
      {right}
      {showChevron ? <Feather name="chevron-right" size={20} color={colors.textSecondary} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        {content}
      </Pressable>
    );
  }
  return content;
}

export default function OrgSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<OrgStackParamList>>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { organization, users, branches, updateSettings, generateAPIKey } = useOrganization();

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
            const { apiKey } = await generateAPIKey();
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
      await generateAPIKey();
      Alert.alert("API Enabled", "Your API key has been generated.");
    } else {
      await updateSettings({
        api: { ...settings.api, isEnabled: !settings.api.isEnabled },
      });
    }
  };

  const handleCopyTVUrl = async () => {
    await Clipboard.setStringAsync(`https://tiqkets.app/tv/${organization.id}`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", "TV display URL copied to clipboard");
  };

  const switchTrackColor = {
    false: isDark ? "#4A4A4A" : "#D1D5DB",
    true: BrandColors.primary,
  };
  
  const switchThumbColor = "#FFFFFF";

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SettingSection title="QUEUE PROCESSING">
          <View style={styles.modeOptions}>
            <Pressable
              style={[
                styles.modeOption,
                { backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC" },
                settings.queueMode === "fifo" && { 
                  backgroundColor: isDark ? BrandColors.primary + "20" : BrandColors.primary + "10",
                  borderColor: BrandColors.primary, 
                  borderWidth: 2 
                },
              ]}
              onPress={() => handleQueueModeChange("fifo")}
            >
              <View style={[
                styles.modeIcon,
                { backgroundColor: settings.queueMode === "fifo" ? BrandColors.primary : (isDark ? "#3A3A3A" : "#E2E8F0") }
              ]}>
                <Feather
                  name="arrow-down"
                  size={20}
                  color={settings.queueMode === "fifo" ? "#FFFFFF" : colors.textSecondary}
                />
              </View>
              <ThemedText style={styles.modeTitle}>FIFO</ThemedText>
              <ThemedText style={[styles.modeDesc, { color: colors.textSecondary }]}>First in, first out</ThemedText>
            </Pressable>

            <Pressable
              style={[
                styles.modeOption,
                { backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC" },
                settings.queueMode === "selective" && { 
                  backgroundColor: isDark ? BrandColors.primary + "20" : BrandColors.primary + "10",
                  borderColor: BrandColors.primary, 
                  borderWidth: 2 
                },
              ]}
              onPress={() => handleQueueModeChange("selective")}
            >
              <View style={[
                styles.modeIcon,
                { backgroundColor: settings.queueMode === "selective" ? BrandColors.primary : (isDark ? "#3A3A3A" : "#E2E8F0") }
              ]}>
                <Feather
                  name="target"
                  size={20}
                  color={settings.queueMode === "selective" ? "#FFFFFF" : colors.textSecondary}
                />
              </View>
              <ThemedText style={styles.modeTitle}>Selective</ThemedText>
              <ThemedText style={[styles.modeDesc, { color: colors.textSecondary }]}>Choose next</ThemedText>
            </Pressable>
          </View>
        </SettingSection>

        <SettingSection title="NOTIFICATIONS">
          <View style={styles.notificationModes}>
            <Pressable
              style={[
                styles.notifModeOption,
                { borderColor: isDark ? "#3A3A3A" : "#E2E8F0" },
                settings.notificationMode === "all" && { 
                  borderColor: BrandColors.primary,
                  backgroundColor: isDark ? BrandColors.primary + "15" : BrandColors.primary + "08"
                },
              ]}
              onPress={() => handleNotificationModeChange("all")}
            >
              <View style={[
                styles.radioOuter, 
                { borderColor: settings.notificationMode === "all" ? BrandColors.primary : (isDark ? "#555" : "#CCC") }
              ]}>
                {settings.notificationMode === "all" ? (
                  <View style={[styles.radioInner, { backgroundColor: BrandColors.primary }]} />
                ) : null}
              </View>
              <View style={styles.notifModeInfo}>
                <ThemedText style={styles.notifModeTitle}>All Updates</ThemedText>
                <ThemedText style={[styles.notifModeDesc, { color: colors.textSecondary }]}>
                  Notify at 3rd, 2nd, next position & turn
                </ThemedText>
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.notifModeOption,
                { borderColor: isDark ? "#3A3A3A" : "#E2E8F0" },
                settings.notificationMode === "turn_only" && { 
                  borderColor: BrandColors.primary,
                  backgroundColor: isDark ? BrandColors.primary + "15" : BrandColors.primary + "08"
                },
              ]}
              onPress={() => handleNotificationModeChange("turn_only")}
            >
              <View style={[
                styles.radioOuter, 
                { borderColor: settings.notificationMode === "turn_only" ? BrandColors.primary : (isDark ? "#555" : "#CCC") }
              ]}>
                {settings.notificationMode === "turn_only" ? (
                  <View style={[styles.radioInner, { backgroundColor: BrandColors.primary }]} />
                ) : null}
              </View>
              <View style={styles.notifModeInfo}>
                <ThemedText style={styles.notifModeTitle}>Turn Only</ThemedText>
                <ThemedText style={[styles.notifModeDesc, { color: colors.textSecondary }]}>
                  Only notify when it's their turn
                </ThemedText>
              </View>
            </Pressable>
          </View>
        </SettingSection>

        <SettingSection title="DISPLAY & HARDWARE">
          <SettingRow
            icon="speaker"
            label="Bluetooth Speaker"
            description="Announce ticket numbers"
            isDark={isDark}
            right={
              <Switch
                value={settings.display.enableBluetoothSpeaker}
                onValueChange={handleToggleBluetooth}
                trackColor={switchTrackColor}
                thumbColor={switchThumbColor}
              />
            }
          />
          <View style={[styles.divider, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]} />
          <SettingRow
            icon="tv"
            label="TV Display"
            description="Show queue on screen"
            isDark={isDark}
            right={
              <Switch
                value={settings.display.enableTVDisplay}
                onValueChange={handleToggleTVDisplay}
                trackColor={switchTrackColor}
                thumbColor={switchThumbColor}
              />
            }
          />
          {settings.display.enableTVDisplay ? (
            <Pressable 
              style={[styles.tvUrlBox, { backgroundColor: isDark ? "#1A1A1A" : "#F8FAFC" }]}
              onPress={handleCopyTVUrl}
            >
              <ThemedText style={[styles.tvUrl, { color: colors.textSecondary }]} numberOfLines={1}>
                tiqkets.app/tv/{organization.id}
              </ThemedText>
              <Feather name="copy" size={16} color={BrandColors.primary} />
            </Pressable>
          ) : null}
        </SettingSection>

        <SettingSection title="TEAM & ACCESS">
          <SettingRow
            icon="users"
            label="Manage Team"
            isDark={isDark}
            onPress={() => navigation.navigate("UserManagement")}
            showChevron
            right={
              <View style={[styles.badge, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}>
                <ThemedText style={[styles.badgeText, { color: colors.text }]}>{users.length}</ThemedText>
              </View>
            }
          />
          <View style={[styles.divider, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]} />
          <View style={styles.teamSummary}>
            {[
              { role: "admin", color: "#7C3AED", label: "Admins" },
              { role: "location_manager", color: "#2563EB", label: "Managers" },
              { role: "floor_manager", color: "#059669", label: "Floor" },
              { role: "front_desk", color: "#D97706", label: "Desk" },
            ].map((item) => (
              <View key={item.role} style={styles.teamItem}>
                <View style={[styles.teamDot, { backgroundColor: item.color }]} />
                <ThemedText style={[styles.teamCount, { color: colors.textSecondary }]}>
                  {users.filter((u) => u.role === item.role).length} {item.label}
                </ThemedText>
              </View>
            ))}
          </View>
          <View style={[styles.divider, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]} />
          <View style={styles.branchInfo}>
            <Feather name="map-pin" size={14} color={colors.textSecondary} />
            <ThemedText style={[styles.branchText, { color: colors.textSecondary }]}>
              {branches.length} branch{branches.length !== 1 ? "es" : ""} configured
            </ThemedText>
          </View>
        </SettingSection>

        <SettingSection title="API INTEGRATION">
          <SettingRow
            icon="code"
            label="API Access"
            description="Third-party integration"
            isDark={isDark}
            right={
              <Switch
                value={settings.api.isEnabled}
                onValueChange={handleToggleAPI}
                trackColor={switchTrackColor}
                thumbColor={switchThumbColor}
              />
            }
          />

          {settings.api.isEnabled && settings.api.apiKey ? (
            <>
              <View style={[styles.divider, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]} />
              <View style={styles.apiContainer}>
                <View style={styles.apiRow}>
                  <ThemedText style={[styles.apiLabel, { color: colors.textSecondary }]}>API Key</ThemedText>
                  <Pressable 
                    onPress={handleCopyAPIKey} 
                    style={[styles.apiValue, { backgroundColor: isDark ? "#1A1A1A" : "#F8FAFC" }]}
                  >
                    <ThemedText style={[styles.apiText, { color: colors.text }]} numberOfLines={1}>
                      {settings.api.apiKey.substring(0, 20)}...
                    </ThemedText>
                    <Feather name="copy" size={14} color={BrandColors.primary} />
                  </Pressable>
                </View>

                <View style={styles.apiRow}>
                  <ThemedText style={[styles.apiLabel, { color: colors.textSecondary }]}>Secret</ThemedText>
                  <Pressable 
                    onPress={handleCopyAPISecret} 
                    style={[styles.apiValue, { backgroundColor: isDark ? "#1A1A1A" : "#F8FAFC" }]}
                  >
                    <ThemedText style={[styles.apiText, { color: colors.text }]} numberOfLines={1}>
                      {showApiSecret ? settings.api.apiSecret.substring(0, 16) + "..." : "••••••••••••••••"}
                    </ThemedText>
                    <Pressable onPress={() => setShowApiSecret(!showApiSecret)} hitSlop={8}>
                      <Feather name={showApiSecret ? "eye-off" : "eye"} size={14} color={colors.textSecondary} />
                    </Pressable>
                  </Pressable>
                </View>

                <View style={styles.apiActions}>
                  <Button
                    title="Regenerate Key"
                    onPress={handleGenerateAPIKey}
                    variant="secondary"
                    size="small"
                  />
                  <Pressable style={styles.docsLink}>
                    <Feather name="book-open" size={14} color={BrandColors.primary} />
                    <ThemedText style={[styles.docsText, { color: BrandColors.primary }]}>Docs</ThemedText>
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}
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
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
    opacity: 0.6,
  },
  sectionCard: {
    padding: Spacing.md,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontWeight: "500",
    fontSize: 15,
  },
  settingDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.xs,
    marginLeft: 52,
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
    borderWidth: 1,
    borderColor: "transparent",
  },
  modeIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  modeTitle: {
    fontWeight: "600",
    fontSize: 14,
  },
  modeDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  notificationModes: {
    gap: Spacing.sm,
  },
  notifModeOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    gap: Spacing.md,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  notifModeInfo: {
    flex: 1,
  },
  notifModeTitle: {
    fontWeight: "600",
    fontSize: 14,
  },
  notifModeDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  tvUrlBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
    marginLeft: 52,
    gap: Spacing.sm,
  },
  tvUrl: {
    flex: 1,
    fontSize: 12,
    fontFamily: "monospace",
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.xs,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  teamSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingLeft: 52,
  },
  teamItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  teamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  teamCount: {
    fontSize: 12,
  },
  branchInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingLeft: 52,
  },
  branchText: {
    fontSize: 12,
  },
  apiContainer: {
    paddingLeft: 52,
    paddingTop: Spacing.sm,
  },
  apiRow: {
    marginBottom: Spacing.md,
  },
  apiLabel: {
    fontSize: 11,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  apiValue: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  apiText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "monospace",
  },
  apiActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  docsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.xs,
  },
  docsText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
