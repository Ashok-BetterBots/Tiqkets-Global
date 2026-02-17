import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  Modal,
  Animated,
  Dimensions,
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
import { useTheme } from "@/hooks/useTheme";
import { QueueMode, NotificationMode, OrgSettings, OrgService, ServiceSettings } from "@/types/organization";
import type { OrgStackParamList } from "@/navigation/OrgStackNavigator";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface QueueModeOption {
  id: QueueMode;
  title: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
}

const QUEUE_MODE_OPTIONS: QueueModeOption[] = [
  {
    id: "fifo",
    title: "FIFO (First In, First Out)",
    description: "Customers are served in the order they join the queue",
    icon: "arrow-down",
  },
  {
    id: "selective",
    title: "Selective",
    description: "Staff can choose which customer to serve next",
    icon: "target",
  },
  {
    id: "checkin",
    title: "Check-in",
    description: "Customers check in on arrival and wait to be called",
    icon: "check-circle",
  },
  {
    id: "multistage",
    title: "Multi-stage",
    description: "Customers progress through multiple service stages",
    icon: "layers",
  },
  {
    id: "dinein",
    title: "Dine In",
    description: "For customers dining at your restaurant",
    icon: "coffee",
  },
  {
    id: "takeaway",
    title: "Takeaway",
    description: "For customers picking up orders to go",
    icon: "package",
  },
];

interface NotificationModeOption {
  id: NotificationMode;
  title: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
}

const NOTIFICATION_MODE_OPTIONS: NotificationModeOption[] = [
  {
    id: "all_alerts",
    title: "All Queue Alerts",
    description: "Notify at 3rd, 2nd, next position and when it's their turn",
    icon: "bell",
  },
  {
    id: "turn_only",
    title: "Turn Alert Only",
    description: "Only notify when it's their turn to be served",
    icon: "user-check",
  },
  {
    id: "all_alerts_info",
    title: "Queue Alerts + Information",
    description: "All queue alerts plus service updates and announcements",
    icon: "message-circle",
  },
  {
    id: "turn_only_info",
    title: "Turn Alert + Information",
    description: "Turn notification plus service updates and announcements",
    icon: "info",
  },
];

type DisplayMode = "system" | "light" | "dark";

interface DisplayModeOption {
  id: DisplayMode;
  title: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
}

const DISPLAY_MODE_OPTIONS: DisplayModeOption[] = [
  {
    id: "system",
    title: "System Default",
    description: "Follow your device's display settings",
    icon: "smartphone",
  },
  {
    id: "light",
    title: "Light Mode",
    description: "Always use light appearance",
    icon: "sun",
  },
  {
    id: "dark",
    title: "Dark Mode",
    description: "Always use dark appearance",
    icon: "moon",
  },
];

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

type SettingsLevel = "organization" | "branch" | "service";

function getSettingsSourceLabel(level: SettingsLevel): string {
  switch (level) {
    case "organization": return "Organization default";
    case "branch": return "Branch override";
    case "service": return "Service override";
  }
}

function getSettingsSourceColor(level: SettingsLevel): string {
  switch (level) {
    case "organization": return "#7C3AED";
    case "branch": return "#2563EB";
    case "service": return "#059669";
  }
}

function resolveSettingsHierarchy(
  orgSettings: OrgSettings,
  branchSettings: OrgSettings | undefined,
  serviceSettings: ServiceSettings | undefined
): { resolved: OrgSettings; sources: Record<string, SettingsLevel> } {
  const resolved = { ...orgSettings };
  const sources: Record<string, SettingsLevel> = {
    queueMode: "organization",
    notificationMode: "organization",
    display: "organization",
  };

  if (branchSettings) {
    if (branchSettings.queueMode && branchSettings.queueMode !== orgSettings.queueMode) {
      resolved.queueMode = branchSettings.queueMode;
      sources.queueMode = "branch";
    }
    if (branchSettings.notificationMode && branchSettings.notificationMode !== orgSettings.notificationMode) {
      resolved.notificationMode = branchSettings.notificationMode;
      sources.notificationMode = "branch";
    }
    if (branchSettings.display) {
      resolved.display = { ...resolved.display, ...branchSettings.display };
      sources.display = "branch";
    }
    if (branchSettings.api) {
      resolved.api = { ...resolved.api, ...branchSettings.api };
    }
  }

  if (serviceSettings) {
    if (serviceSettings.queueMode) {
      resolved.queueMode = serviceSettings.queueMode;
      sources.queueMode = "service";
    }
    if (serviceSettings.notificationMode) {
      resolved.notificationMode = serviceSettings.notificationMode;
      sources.notificationMode = "service";
    }
    if (serviceSettings.display) {
      resolved.display = { ...resolved.display, ...serviceSettings.display };
      sources.display = "service";
    }
  }

  return { resolved, sources };
}

function SettingsSourceBadge({ level, isDark }: { level: SettingsLevel; isDark: boolean }) {
  const color = getSettingsSourceColor(level);
  const label = getSettingsSourceLabel(level);
  return (
    <View style={[hierStyles.badge, { backgroundColor: color + "18" }]}>
      <View style={[hierStyles.badgeDot, { backgroundColor: color }]} />
      <ThemedText style={[hierStyles.badgeText, { color }]}>{label}</ThemedText>
    </View>
  );
}

const hierStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

export default function OrgSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<OrgStackParamList>>();
  const { isDark, themeMode, setThemeMode } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;
  const { organization, users, branches, updateSettings, updateBranchSettings, updateServiceSettings, generateAPIKey, getAccessibleBranches } = useOrganization();

  const [showApiSecret, setShowApiSecret] = useState(false);
  const [showQueueModeModal, setShowQueueModeModal] = useState(false);
  const [showNotificationModeModal, setShowNotificationModeModal] = useState(false);
  const [showDisplayModeModal, setShowDisplayModeModal] = useState(false);
  const [queueModalAnimation] = useState(new Animated.Value(0));
  const [notificationModalAnimation] = useState(new Animated.Value(0));
  const [displayModeModalAnimation] = useState(new Animated.Value(0));

  const accessibleBranches = getAccessibleBranches();
  const [selectedSettingsBranchId, setSelectedSettingsBranchId] = useState<string>(accessibleBranches[0]?.id || "");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  const selectedBranch = branches.find(b => b.id === selectedSettingsBranchId) || accessibleBranches[0];
  const branchServices = selectedBranch?.services?.filter(s => s.isActive) || [];
  const selectedService = selectedServiceId ? branchServices.find(s => s.id === selectedServiceId) : null;

  if (!organization) return null;

  const { resolved: settings, sources } = resolveSettingsHierarchy(
    organization.settings,
    selectedBranch?.settings,
    selectedService?.serviceSettings
  );

  const currentSettingsLevel: SettingsLevel = selectedService ? "service" : "branch";

  const openQueueModeModal = () => {
    setShowQueueModeModal(true);
    Animated.spring(queueModalAnimation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeQueueModeModal = () => {
    Animated.timing(queueModalAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowQueueModeModal(false);
    });
  };

  const openNotificationModeModal = () => {
    setShowNotificationModeModal(true);
    Animated.spring(notificationModalAnimation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeNotificationModeModal = () => {
    Animated.timing(notificationModalAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowNotificationModeModal(false);
    });
  };

  const openDisplayModeModal = () => {
    setShowDisplayModeModal(true);
    Animated.spring(displayModeModalAnimation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeDisplayModeModal = () => {
    Animated.timing(displayModeModalAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowDisplayModeModal(false);
    });
  };

  const currentQueueMode = QUEUE_MODE_OPTIONS.find(opt => opt.id === settings.queueMode) || QUEUE_MODE_OPTIONS[0];
  const currentNotificationMode = NOTIFICATION_MODE_OPTIONS.find(opt => opt.id === settings.notificationMode) || NOTIFICATION_MODE_OPTIONS[0];
  const currentDisplayMode = DISPLAY_MODE_OPTIONS.find(opt => opt.id === themeMode) || DISPLAY_MODE_OPTIONS[0];

  const saveSetting = async (partialSettings: Partial<OrgSettings>) => {
    if (selectedService && selectedBranch) {
      const svcSettings: ServiceSettings = {};
      if (partialSettings.queueMode) svcSettings.queueMode = partialSettings.queueMode;
      if (partialSettings.notificationMode) svcSettings.notificationMode = partialSettings.notificationMode;
      if (partialSettings.display) svcSettings.display = partialSettings.display;
      await updateServiceSettings(selectedBranch.id, selectedService.id, svcSettings);
    } else if (selectedBranch) {
      await updateBranchSettings(selectedBranch.id, partialSettings);
    } else {
      await updateSettings(partialSettings);
    }
  };

  const handleResetToParent = async (settingKey: string) => {
    if (!selectedService || !selectedBranch) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentSvcSettings = { ...(selectedService.serviceSettings || {}) };
    delete (currentSvcSettings as any)[settingKey];
    await updateServiceSettings(selectedBranch.id, selectedService.id, currentSvcSettings as ServiceSettings);
  };

  const handleQueueModeChange = async (mode: QueueMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await saveSetting({ queueMode: mode });
    closeQueueModeModal();
  };

  const handleNotificationModeChange = async (mode: NotificationMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await saveSetting({ notificationMode: mode });
    closeNotificationModeModal();
  };

  const handleDisplayModeChange = (mode: DisplayMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setThemeMode(mode);
    closeDisplayModeModal();
  };

  const handleToggleBluetooth = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await saveSetting({
      display: { ...settings.display, enableBluetoothSpeaker: !settings.display.enableBluetoothSpeaker },
    });
  };

  const handleToggleTVDisplay = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await saveSetting({
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
      await saveSetting({
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
        {/* Hierarchy Selector */}
        <View style={styles.hierarchyContainer}>
          {/* Branch Selector */}
          <View style={styles.hierarchyLevel}>
            <View style={styles.hierarchyLabelRow}>
              <View style={[styles.hierarchyDot, { backgroundColor: "#2563EB" }]} />
              <ThemedText style={[styles.hierarchyLabel, { color: colors.textSecondary }]}>Branch</ThemedText>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {accessibleBranches.map((branch) => (
                  <Pressable
                    key={branch.id}
                    style={[
                      styles.branchChip,
                      {
                        backgroundColor: selectedSettingsBranchId === branch.id ? BrandColors.primary : (isDark ? "#2A2A2A" : "#F1F5F9"),
                        borderColor: selectedSettingsBranchId === branch.id ? BrandColors.primary : (isDark ? "#333" : "#E2E8F0"),
                      },
                    ]}
                    onPress={() => {
                      setSelectedSettingsBranchId(branch.id);
                      setSelectedServiceId(null);
                    }}
                  >
                    <Feather name="map-pin" size={12} color={selectedSettingsBranchId === branch.id ? "#FFFFFF" : colors.textSecondary} />
                    <ThemedText style={[styles.branchChipText, { color: selectedSettingsBranchId === branch.id ? "#FFFFFF" : colors.text }]}>
                      {branch.name}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Service Selector */}
          {branchServices.length > 0 ? (
            <View style={styles.hierarchyLevel}>
              <View style={styles.hierarchyLabelRow}>
                <View style={[styles.hierarchyDot, { backgroundColor: "#059669" }]} />
                <ThemedText style={[styles.hierarchyLabel, { color: colors.textSecondary }]}>Service (optional override)</ThemedText>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    style={[
                      styles.branchChip,
                      {
                        backgroundColor: !selectedServiceId ? (isDark ? "#374151" : "#E5E7EB") : (isDark ? "#2A2A2A" : "#F1F5F9"),
                        borderColor: !selectedServiceId ? (isDark ? "#6B7280" : "#9CA3AF") : (isDark ? "#333" : "#E2E8F0"),
                        borderStyle: "dashed",
                      },
                    ]}
                    onPress={() => setSelectedServiceId(null)}
                  >
                    <Feather name="sliders" size={12} color={!selectedServiceId ? colors.text : colors.textSecondary} />
                    <ThemedText style={[styles.branchChipText, { color: !selectedServiceId ? colors.text : colors.textSecondary }]}>
                      All Services
                    </ThemedText>
                  </Pressable>
                  {branchServices.map((service) => {
                    const hasOverrides = service.serviceSettings && Object.keys(service.serviceSettings).length > 0;
                    return (
                      <Pressable
                        key={service.id}
                        style={[
                          styles.branchChip,
                          {
                            backgroundColor: selectedServiceId === service.id ? "#059669" : (isDark ? "#2A2A2A" : "#F1F5F9"),
                            borderColor: selectedServiceId === service.id ? "#059669" : (isDark ? "#333" : "#E2E8F0"),
                          },
                        ]}
                        onPress={() => setSelectedServiceId(service.id)}
                      >
                        <Feather name="tag" size={12} color={selectedServiceId === service.id ? "#FFFFFF" : colors.textSecondary} />
                        <ThemedText style={[styles.branchChipText, { color: selectedServiceId === service.id ? "#FFFFFF" : colors.text }]}>
                          {service.name}
                        </ThemedText>
                        {hasOverrides ? (
                          <View style={[styles.overrideDot, { backgroundColor: "#059669" }]} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          ) : null}

          {/* Hierarchy Breadcrumb */}
          <View style={[styles.hierarchyBreadcrumb, { backgroundColor: isDark ? "#1A1A2E" : "#F0F4FF" }]}>
            <Feather name="layers" size={14} color={colors.textSecondary} />
            <ThemedText style={[styles.hierarchyBreadcrumbText, { color: colors.textSecondary }]}>
              {selectedBranch?.name || "Organization"}
              {selectedService ? ` / ${selectedService.name}` : ""}
            </ThemedText>
            {selectedService ? (
              <View style={[styles.hierarchyEditingBadge, { backgroundColor: "#05966918" }]}>
                <ThemedText style={{ fontSize: 10, fontWeight: "600", color: "#059669" }}>Editing service</ThemedText>
              </View>
            ) : (
              <View style={[styles.hierarchyEditingBadge, { backgroundColor: "#2563EB18" }]}>
                <ThemedText style={{ fontSize: 10, fontWeight: "600", color: "#2563EB" }}>Editing branch</ThemedText>
              </View>
            )}
          </View>
        </View>

        <SettingSection title="QUEUE PROCESSING">
          <View style={styles.settingHeaderRow}>
            <SettingsSourceBadge level={sources.queueMode} isDark={isDark} />
            {selectedService && sources.queueMode === "service" ? (
              <Pressable onPress={() => handleResetToParent("queueMode")} style={styles.resetButton}>
                <Feather name="rotate-ccw" size={12} color={colors.textSecondary} />
                <ThemedText style={[styles.resetText, { color: colors.textSecondary }]}>Reset</ThemedText>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            style={({ pressed }) => [styles.queueModeSelector, pressed && styles.pressed]}
            onPress={openQueueModeModal}
          >
            <View style={[styles.queueModeIcon, { backgroundColor: BrandColors.primary }]}>
              <Feather name={currentQueueMode.icon} size={20} color="#FFFFFF" />
            </View>
            <View style={styles.queueModeInfo}>
              <ThemedText style={styles.queueModeTitle}>{currentQueueMode.title}</ThemedText>
              <ThemedText style={[styles.queueModeDesc, { color: colors.textSecondary }]}>
                {currentQueueMode.description}
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </Pressable>
          {settings.queueMode === "multistage" ? (
            <>
              <View style={[styles.divider, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]} />
              <Pressable
                style={({ pressed }) => [styles.queueModeSelector, pressed && styles.pressed]}
                onPress={() => navigation.navigate("JourneyManagement")}
              >
                <View style={[styles.queueModeIcon, { backgroundColor: colors.secondary }]}>
                  <Feather name="git-branch" size={20} color="#FFFFFF" />
                </View>
                <View style={styles.queueModeInfo}>
                  <ThemedText style={styles.queueModeTitle}>Manage Customer Journeys</ThemedText>
                  <ThemedText style={[styles.queueModeDesc, { color: colors.textSecondary }]}>
                    Define multi-stage service flows
                  </ThemedText>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textSecondary} />
              </Pressable>
            </>
          ) : null}
        </SettingSection>

        <SettingSection title="NOTIFICATIONS">
          <View style={styles.settingHeaderRow}>
            <SettingsSourceBadge level={sources.notificationMode} isDark={isDark} />
            {selectedService && sources.notificationMode === "service" ? (
              <Pressable onPress={() => handleResetToParent("notificationMode")} style={styles.resetButton}>
                <Feather name="rotate-ccw" size={12} color={colors.textSecondary} />
                <ThemedText style={[styles.resetText, { color: colors.textSecondary }]}>Reset</ThemedText>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            style={({ pressed }) => [styles.queueModeSelector, pressed && styles.pressed]}
            onPress={openNotificationModeModal}
          >
            <View style={[styles.queueModeIcon, { backgroundColor: BrandColors.primary }]}>
              <Feather name={currentNotificationMode.icon} size={20} color="#FFFFFF" />
            </View>
            <View style={styles.queueModeInfo}>
              <ThemedText style={styles.queueModeTitle}>{currentNotificationMode.title}</ThemedText>
              <ThemedText style={[styles.queueModeDesc, { color: colors.textSecondary }]}>
                {currentNotificationMode.description}
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </Pressable>
        </SettingSection>

        <SettingSection title="DISPLAY & HARDWARE">
          <View style={styles.settingHeaderRow}>
            <SettingsSourceBadge level={sources.display} isDark={isDark} />
            {selectedService && sources.display === "service" ? (
              <Pressable onPress={() => handleResetToParent("display")} style={styles.resetButton}>
                <Feather name="rotate-ccw" size={12} color={colors.textSecondary} />
                <ThemedText style={[styles.resetText, { color: colors.textSecondary }]}>Reset</ThemedText>
              </Pressable>
            ) : null}
          </View>
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

        <SettingSection title="APPEARANCE">
          <Pressable
            style={({ pressed }) => pressed && styles.pressed}
            onPress={openDisplayModeModal}
          >
            <View style={styles.settingRow}>
              <View style={[styles.settingIcon, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}>
                <Feather name={currentDisplayMode.icon} size={18} color={colors.primary} />
              </View>
              <View style={styles.settingInfo}>
                <ThemedText style={styles.settingLabel}>Display Mode</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: colors.textSecondary }]}>
                  {currentDisplayMode.title}
                </ThemedText>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textSecondary} />
            </View>
          </Pressable>
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

      <Modal
        visible={showQueueModeModal}
        transparent
        animationType="none"
        onRequestClose={closeQueueModeModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeQueueModeModal}>
          <Animated.View
            style={[
              styles.modalContent,
              { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" },
              {
                transform: [
                  {
                    translateY: queueModalAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [SCREEN_HEIGHT, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View onStartShouldSetResponder={() => true}>
              <View style={styles.modalHandle} />
              <ThemedText style={styles.modalTitle}>Queue Processing Mode</ThemedText>
              <ThemedText style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Choose how customers are called from the queue
              </ThemedText>

              <ScrollView style={styles.modalScrollArea} showsVerticalScrollIndicator={false}>
                <View style={styles.modalOptions}>
                  {QUEUE_MODE_OPTIONS.map((option) => (
                    <Pressable
                      key={option.id}
                      style={[
                        styles.modalOption,
                        { 
                          backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC",
                          borderColor: settings.queueMode === option.id ? BrandColors.primary : "transparent",
                          borderWidth: settings.queueMode === option.id ? 2 : 0,
                        },
                      ]}
                      onPress={() => handleQueueModeChange(option.id)}
                    >
                      <View style={[
                        styles.modalOptionIcon,
                        { backgroundColor: settings.queueMode === option.id ? BrandColors.primary : (isDark ? "#3A3A3A" : "#E2E8F0") }
                      ]}>
                        <Feather
                          name={option.icon}
                          size={24}
                          color={settings.queueMode === option.id ? "#FFFFFF" : colors.textSecondary}
                        />
                      </View>
                      <View style={styles.modalOptionInfo}>
                        <ThemedText style={styles.modalOptionTitle}>{option.title}</ThemedText>
                        <ThemedText style={[styles.modalOptionDesc, { color: colors.textSecondary }]}>
                          {option.description}
                        </ThemedText>
                      </View>
                      {settings.queueMode === option.id ? (
                        <View style={[styles.checkIcon, { backgroundColor: BrandColors.primary }]}>
                          <Feather name="check" size={14} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              <Pressable
                style={[styles.modalCloseButton, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}
                onPress={closeQueueModeModal}
              >
                <ThemedText style={styles.modalCloseText}>Cancel</ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal
        visible={showNotificationModeModal}
        transparent
        animationType="none"
        onRequestClose={closeNotificationModeModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeNotificationModeModal}>
          <Animated.View
            style={[
              styles.modalContent,
              { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" },
              {
                transform: [
                  {
                    translateY: notificationModalAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [SCREEN_HEIGHT, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View onStartShouldSetResponder={() => true}>
              <View style={styles.modalHandle} />
              <ThemedText style={styles.modalTitle}>Notification Mode</ThemedText>
              <ThemedText style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Choose how customers receive notifications
              </ThemedText>

              <ScrollView style={styles.modalScrollArea} showsVerticalScrollIndicator={false}>
                <View style={styles.modalOptions}>
                  {NOTIFICATION_MODE_OPTIONS.map((option) => (
                    <Pressable
                      key={option.id}
                      style={[
                        styles.modalOption,
                        { 
                          backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC",
                          borderColor: settings.notificationMode === option.id ? BrandColors.primary : "transparent",
                          borderWidth: settings.notificationMode === option.id ? 2 : 0,
                        },
                      ]}
                      onPress={() => handleNotificationModeChange(option.id)}
                    >
                      <View style={[
                        styles.modalOptionIcon,
                        { backgroundColor: settings.notificationMode === option.id ? BrandColors.primary : (isDark ? "#3A3A3A" : "#E2E8F0") }
                      ]}>
                        <Feather
                          name={option.icon}
                          size={24}
                          color={settings.notificationMode === option.id ? "#FFFFFF" : colors.textSecondary}
                        />
                      </View>
                      <View style={styles.modalOptionInfo}>
                        <ThemedText style={styles.modalOptionTitle}>{option.title}</ThemedText>
                        <ThemedText style={[styles.modalOptionDesc, { color: colors.textSecondary }]}>
                          {option.description}
                        </ThemedText>
                      </View>
                      {settings.notificationMode === option.id ? (
                        <View style={[styles.checkIcon, { backgroundColor: BrandColors.primary }]}>
                          <Feather name="check" size={14} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              <Pressable
                style={[styles.modalCloseButton, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}
                onPress={closeNotificationModeModal}
              >
                <ThemedText style={styles.modalCloseText}>Cancel</ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal
        visible={showDisplayModeModal}
        transparent
        animationType="none"
        onRequestClose={closeDisplayModeModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeDisplayModeModal}>
          <Animated.View
            style={[
              styles.modalContent,
              { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" },
              {
                transform: [
                  {
                    translateY: displayModeModalAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [SCREEN_HEIGHT, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View onStartShouldSetResponder={() => true}>
              <View style={styles.modalHandle} />
              <ThemedText style={styles.modalTitle}>Display Mode</ThemedText>
              <ThemedText style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Choose how the app appears
              </ThemedText>

              <ScrollView style={styles.modalScrollArea} showsVerticalScrollIndicator={false}>
                <View style={styles.modalOptions}>
                  {DISPLAY_MODE_OPTIONS.map((option) => (
                    <Pressable
                      key={option.id}
                      style={[
                        styles.modalOption,
                        { 
                          backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC",
                          borderColor: themeMode === option.id ? BrandColors.primary : "transparent",
                          borderWidth: themeMode === option.id ? 2 : 0,
                        },
                      ]}
                      onPress={() => handleDisplayModeChange(option.id)}
                    >
                      <View style={[
                        styles.modalOptionIcon,
                        { backgroundColor: themeMode === option.id ? BrandColors.primary : (isDark ? "#3A3A3A" : "#E2E8F0") }
                      ]}>
                        <Feather
                          name={option.icon}
                          size={24}
                          color={themeMode === option.id ? "#FFFFFF" : colors.textSecondary}
                        />
                      </View>
                      <View style={styles.modalOptionInfo}>
                        <ThemedText style={styles.modalOptionTitle}>{option.title}</ThemedText>
                        <ThemedText style={[styles.modalOptionDesc, { color: colors.textSecondary }]}>
                          {option.description}
                        </ThemedText>
                      </View>
                      {themeMode === option.id ? (
                        <View style={[styles.checkIcon, { backgroundColor: BrandColors.primary }]}>
                          <Feather name="check" size={14} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              <Pressable
                style={[styles.modalCloseButton, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}
                onPress={closeDisplayModeModal}
              >
                <ThemedText style={styles.modalCloseText}>Cancel</ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>
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
  hierarchyContainer: {
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  hierarchyLevel: {
    gap: 6,
  },
  hierarchyLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  hierarchyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hierarchyLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  hierarchyBreadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  hierarchyBreadcrumbText: {
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  hierarchyEditingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  overrideDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 2,
  },
  settingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  resetText: {
    fontSize: 11,
    fontWeight: "500",
  },
  branchChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  branchChipText: {
    fontSize: 13,
    fontWeight: "600",
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
  queueModeSelector: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  queueModeIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  queueModeInfo: {
    flex: 1,
  },
  queueModeTitle: {
    fontWeight: "600",
    fontSize: 15,
  },
  queueModeDesc: {
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  modalScrollArea: {
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: Spacing.lg,
  },
  modalOptions: {
    gap: Spacing.md,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  modalOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  modalOptionInfo: {
    flex: 1,
  },
  modalOptionTitle: {
    fontWeight: "600",
    fontSize: 15,
  },
  modalOptionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseButton: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  modalCloseText: {
    fontWeight: "600",
    fontSize: 16,
  },
});
