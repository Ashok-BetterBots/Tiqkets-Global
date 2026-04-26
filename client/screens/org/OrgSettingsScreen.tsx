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
  TextInput,
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
import { QueueMode, NotificationMode, OrgSettings, OrgService, ServiceSettings, AnnouncementDevice } from "@/types/organization";
import { apiRequest, getApiUrl } from "@/lib/query-client";
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
    <View style={sectionStyles.section}>
      <ThemedText style={sectionStyles.sectionTitle}>{title}</ThemedText>
      <Card variant="outlined" style={sectionStyles.sectionCard}>{children}</Card>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
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
    textTransform: "uppercase" as const,
  },
  sectionCard: {
    padding: Spacing.md,
  },
});

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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const content = (
    <View style={styles.settingRow}>
      <View style={[styles.settingIcon, { backgroundColor: colors.surfaceMuted }]}>
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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { organization, users, branches, updateSettings, updateBranchSettings, updateServiceSettings, generateAPIKey, getAccessibleBranches, hasPermission } = useOrganization();

  const [showApiSecret, setShowApiSecret] = useState(false);
  const [showQueueModeModal, setShowQueueModeModal] = useState(false);
  const [showNotificationModeModal, setShowNotificationModeModal] = useState(false);
  const [showDisplayModeModal, setShowDisplayModeModal] = useState(false);
  const [queueModalAnimation] = useState(new Animated.Value(0));
  const [notificationModalAnimation] = useState(new Animated.Value(0));
  const [displayModeModalAnimation] = useState(new Animated.Value(0));

  const [announcementDevices, setAnnouncementDevices] = useState<AnnouncementDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [addDeviceModalAnimation] = useState(new Animated.Value(0));
  const [newDeviceName, setNewDeviceName] = useState("");
  const [newDeviceLanguage, setNewDeviceLanguage] = useState<"en" | "ar">("en");
  const [savingDevice, setSavingDevice] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm?: () => void | Promise<void>;
    testIdSuffix?: string;
  }>({ visible: false, title: "", message: "", confirmLabel: "" });
  const [confirmAnimation] = useState(new Animated.Value(0));
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [showAnnouncerModal, setShowAnnouncerModal] = useState(false);
  const [announcerModalAnimation] = useState(new Animated.Value(0));

  const accessibleBranches = getAccessibleBranches();
  const [selectedSettingsBranchId, setSelectedSettingsBranchId] = useState<string>(accessibleBranches[0]?.id || "");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  const [showSettingsWizard, setShowSettingsWizard] = useState(false);
  const [settingsWizardStep, setSettingsWizardStep] = useState<"branch" | "service">("branch");

  const selectedBranch = branches.find(b => b.id === selectedSettingsBranchId) || accessibleBranches[0];
  const branchServices = selectedBranch?.services?.filter(s => s.isActive) || [];
  const selectedService = selectedServiceId ? branchServices.find(s => s.id === selectedServiceId) : null;

  const canSelectSettingsBranch = accessibleBranches.length > 1;
  const settingsWizardSteps: ("branch" | "service")[] = (() => {
    const steps: ("branch" | "service")[] = [];
    if (canSelectSettingsBranch) steps.push("branch");
    steps.push("service");
    return steps;
  })();
  const wizardCurrentIndex = settingsWizardSteps.indexOf(settingsWizardStep);
  const isWizardFirstStep = wizardCurrentIndex <= 0;
  const isWizardLastStep = wizardCurrentIndex === settingsWizardSteps.length - 1;

  const openSettingsWizard = () => {
    setSettingsWizardStep(settingsWizardSteps[0] || "branch");
    setShowSettingsWizard(true);
  };

  const handleWizardNext = () => {
    if (isWizardLastStep) {
      setShowSettingsWizard(false);
    } else {
      Haptics.selectionAsync();
      setSettingsWizardStep(settingsWizardSteps[wizardCurrentIndex + 1]);
    }
  };

  const handleWizardBack = () => {
    if (!isWizardFirstStep) {
      Haptics.selectionAsync();
      setSettingsWizardStep(settingsWizardSteps[wizardCurrentIndex - 1]);
    }
  };

  const getWizardStepTitle = () => {
    switch (settingsWizardStep) {
      case "branch": return "Select Branch";
      case "service": return "Select Service";
    }
  };

  const getWizardStepSubtitle = () => {
    const total = settingsWizardSteps.length;
    if (total <= 1) return "";
    return `Step ${wizardCurrentIndex + 1} of ${total}`;
  };

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

  const loadAnnouncementDevices = React.useCallback(async (branchId: string) => {
    if (!branchId) return;
    setLoadingDevices(true);
    try {
      const res = await apiRequest("GET", `/api/branches/${branchId}/announcement-devices`);
      const data = await res.json();
      setAnnouncementDevices(Array.isArray(data) ? data : (data.devices || []));
    } catch (err) {
      setAnnouncementDevices([]);
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedBranch?.id && hasPermission("org.announcements.toggle")) {
      loadAnnouncementDevices(selectedBranch.id);
    } else {
      setAnnouncementDevices([]);
    }
  }, [selectedBranch?.id, hasPermission, loadAnnouncementDevices]);

  const handleToggleAnnouncements = async () => {
    if (!selectedBranch) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !(settings.display.announcementsEnabled === true);
    await saveSetting({
      display: { ...settings.display, announcementsEnabled: next },
    });
  };

  const handleToggleDedicatedPlayer = async () => {
    if (!selectedBranch) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !(settings.display.useDedicatedPlayerDevices === true);
    await saveSetting({
      display: { ...settings.display, useDedicatedPlayerDevices: next },
    });
  };

  const branchStaffOptions = React.useMemo(() => {
    if (!selectedBranch) return [] as typeof users;
    return users.filter((u) => {
      if (!u.isActive) return false;
      const ids: string[] = (u as any).branchIds || [];
      if (ids.length > 0) return ids.includes(selectedBranch.id);
      return u.branchId === selectedBranch.id;
    });
  }, [users, selectedBranch]);

  const announcerLabel = React.useMemo(() => {
    const id = (selectedBranch as any)?.announcerUserId;
    if (!id) return "Not set — pick a logged-in device";
    const u = users.find((x) => x.id === id);
    return u ? `${u.name}${u.email ? ` (${u.email})` : ""}` : "Selected user not found";
  }, [selectedBranch, users]);

  const openAnnouncerPicker = () => {
    setShowAnnouncerModal(true);
    Animated.spring(announcerModalAnimation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeAnnouncerPicker = () => {
    Animated.timing(announcerModalAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setShowAnnouncerModal(false);
  };

  const handleSelectAnnouncer = async (userId: string | null) => {
    if (!selectedBranch) return;
    closeAnnouncerPicker();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateBranchSettings(selectedBranch.id, { announcerUserId: userId } as any);
    } catch (err: any) {
      Alert.alert("Couldn't save announcer", err?.message || "Please try again.");
    }
  };

  const openAddDeviceModal = () => {
    setNewDeviceName("");
    setNewDeviceLanguage("en");
    setShowAddDeviceModal(true);
    Animated.spring(addDeviceModalAnimation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeAddDeviceModal = () => {
    Animated.timing(addDeviceModalAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowAddDeviceModal(false);
    });
  };

  const handleCreateDevice = async () => {
    if (!selectedBranch || !newDeviceName.trim()) {
      Alert.alert("Name required", "Please enter a device name.");
      return;
    }
    setSavingDevice(true);
    try {
      await apiRequest("POST", `/api/branches/${selectedBranch.id}/announcement-devices`, {
        deviceName: newDeviceName.trim(),
        language: newDeviceLanguage,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadAnnouncementDevices(selectedBranch.id);
      closeAddDeviceModal();
    } catch (err: any) {
      Alert.alert("Couldn't create device", err?.message || "Please try again.");
    } finally {
      setSavingDevice(false);
    }
  };

  const handleToggleDeviceActive = async (device: AnnouncementDevice) => {
    if (!selectedBranch) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await apiRequest("PUT", `/api/announcement-devices/${device.id}`, {
        isActive: !device.isActive,
      });
      await loadAnnouncementDevices(selectedBranch.id);
    } catch (err: any) {
      Alert.alert("Couldn't update device", err?.message || "Please try again.");
    }
  };

  const openConfirmDialog = (config: Omit<typeof confirmDialog, "visible">) => {
    setConfirmDialog({ ...config, visible: true });
    Animated.spring(confirmAnimation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeConfirmDialog = () => {
    Animated.timing(confirmAnimation, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setConfirmDialog((prev) => ({ ...prev, visible: false }));
    });
  };

  const handleConfirmDialog = async () => {
    if (!confirmDialog.onConfirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await confirmDialog.onConfirm();
      closeConfirmDialog();
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleRegenerateDeviceToken = (device: AnnouncementDevice) => {
    if (!selectedBranch) return;
    openConfirmDialog({
      title: "Regenerate Token",
      message: `This will invalidate the current player URL for "${device.deviceName}". Continue?`,
      confirmLabel: "Regenerate",
      destructive: true,
      testIdSuffix: "regenerate",
      onConfirm: async () => {
        try {
          await apiRequest("POST", `/api/announcement-devices/${device.id}/regenerate-token`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await loadAnnouncementDevices(selectedBranch.id);
        } catch (err: any) {
          Alert.alert("Couldn't regenerate", err?.message || "Please try again.");
        }
      },
    });
  };

  const handleDeleteDevice = (device: AnnouncementDevice) => {
    if (!selectedBranch) return;
    openConfirmDialog({
      title: "Delete Device",
      message: `Remove "${device.deviceName}"? Its player URL will stop working.`,
      confirmLabel: "Delete",
      destructive: true,
      testIdSuffix: "delete",
      onConfirm: async () => {
        try {
          await apiRequest("DELETE", `/api/announcement-devices/${device.id}`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await loadAnnouncementDevices(selectedBranch.id);
        } catch (err: any) {
          Alert.alert("Couldn't delete", err?.message || "Please try again.");
        }
      },
    });
  };

  const buildPlayerUrl = (token: string) => {
    try {
      return new URL(`/announce/${token}`, getApiUrl()).toString();
    } catch {
      return `/announce/${token}`;
    }
  };

  const handleCopyDeviceUrl = async (device: AnnouncementDevice) => {
    await Clipboard.setStringAsync(buildPlayerUrl(device.deviceToken));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", "Player URL copied to clipboard");
  };

  const switchTrackColor = {
    false: colors.border,
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
        {/* Settings Scope Selector */}
        <Pressable
          style={({ pressed }) => [
            styles.wizardTrigger,
            {
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.borderSubtle,
            },
            pressed && { opacity: 0.8 },
          ]}
          onPress={openSettingsWizard}
        >
          <View style={styles.wizardTriggerContent}>
            <View style={[styles.wizardTriggerIcon, { backgroundColor: colors.primary + "15" }]}>
              <Feather name="settings" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.wizardTriggerLabels}>
                <View style={styles.wizardTriggerChip}>
                  <Feather name="map-pin" size={11} color="#2563EB" />
                  <ThemedText style={[styles.wizardTriggerChipText, { color: "#2563EB" }]}>
                    {selectedBranch?.name || "Select Branch"}
                  </ThemedText>
                </View>
                <Feather name="chevron-right" size={12} color={colors.textSecondary} />
                <View style={styles.wizardTriggerChip}>
                  <Feather name="tag" size={11} color="#059669" />
                  <ThemedText style={[styles.wizardTriggerChipText, { color: "#059669" }]}>
                    {selectedService ? selectedService.name : "All Services"}
                  </ThemedText>
                </View>
              </View>
              <ThemedText style={[styles.wizardTriggerHint, { color: colors.textSecondary }]}>
                {selectedService ? "Editing service settings" : "Editing branch settings"}
              </ThemedText>
            </View>
            <View style={[styles.wizardTriggerAction, { backgroundColor: colors.primary + "12" }]}>
              <Feather name="edit-2" size={14} color={colors.primary} />
            </View>
          </View>
        </Pressable>

        {hasPermission("org.settings.queue") ? (
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
              <View style={[styles.divider, { backgroundColor: colors.surfaceMuted }]} />
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
        ) : null}

        {hasPermission("org.settings.notifications") ? (
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
        ) : null}

        {hasPermission("org.settings.display") ? (
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
          <View style={[styles.divider, { backgroundColor: colors.surfaceMuted }]} />
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
              style={[styles.tvUrlBox, { backgroundColor: colors.surfaceMuted }]}
              onPress={handleCopyTVUrl}
            >
              <ThemedText style={[styles.tvUrl, { color: colors.textSecondary }]} numberOfLines={1}>
                tiqkets.app/tv/{organization.id}
              </ThemedText>
              <Feather name="copy" size={16} color={BrandColors.primary} />
            </Pressable>
          ) : null}
        </SettingSection>
        ) : null}

        {hasPermission("org.announcements.toggle") ? (
        <SettingSection title="QUEUE ANNOUNCEMENTS">
          <View style={styles.settingHeaderRow}>
            <SettingsSourceBadge level="branch" isDark={isDark} />
          </View>
          <SettingRow
            icon="volume-2"
            label="Enable Announcements"
            description="Play Call-Next audio for this branch"
            isDark={isDark}
            right={
              <Switch
                value={settings.display.announcementsEnabled === true}
                onValueChange={handleToggleAnnouncements}
                trackColor={switchTrackColor}
                thumbColor={switchThumbColor}
              />
            }
          />
          {settings.display.announcementsEnabled === true ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.surfaceMuted }]} />
              <Pressable
                onPress={openAnnouncerPicker}
                style={({ pressed }) => pressed && styles.pressed}
                testID="button-open-announcer-picker"
              >
                <View style={styles.settingRow}>
                  <View style={[styles.settingIcon, { backgroundColor: colors.surfaceMuted }]}>
                    <Feather name="user" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.settingInfo}>
                    <ThemedText style={styles.settingLabel}>Announcer Device</ThemedText>
                    <ThemedText style={[styles.settingDescription, { color: colors.textSecondary }]} testID="text-announcer-current">
                      {announcerLabel}
                    </ThemedText>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                </View>
              </Pressable>
              <View style={[styles.divider, { backgroundColor: colors.surfaceMuted }]} />
              <SettingRow
                icon="radio"
                label="Use dedicated player URLs"
                description="Advanced: power separate speaker tabs via tokenized URLs"
                isDark={isDark}
                right={
                  <Switch
                    value={settings.display.useDedicatedPlayerDevices === true}
                    onValueChange={handleToggleDedicatedPlayer}
                    trackColor={switchTrackColor}
                    thumbColor={switchThumbColor}
                    testID="switch-use-dedicated-players"
                  />
                }
              />
              {settings.display.useDedicatedPlayerDevices === true ? (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.surfaceMuted }]} />
                  {announcementDevices.length === 0 ? (
                    <View style={styles.announceEmpty}>
                      <Feather name="radio" size={24} color={colors.textSecondary} />
                      <ThemedText style={[styles.announceEmptyText, { color: colors.textSecondary }]} testID="text-announcement-devices-empty">
                        {loadingDevices ? "Loading devices..." : "No dedicated player devices yet"}
                      </ThemedText>
                    </View>
                  ) : (
                    announcementDevices.map((device, idx) => (
                      <View key={device.id}>
                        {idx > 0 ? <View style={[styles.divider, { backgroundColor: colors.surfaceMuted }]} /> : null}
                        <View style={styles.announceDeviceRow} testID={`row-announcement-device-${device.id}`}>
                          <View style={[styles.settingIcon, { backgroundColor: colors.surfaceMuted }]}>
                            <Feather name="speaker" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.announceDeviceInfo}>
                            <ThemedText style={styles.settingLabel} testID={`text-device-name-${device.id}`}>{device.deviceName}</ThemedText>
                            <View style={styles.announceDeviceMeta}>
                              <View style={[styles.announceLangChip, { backgroundColor: colors.surfaceMuted }]}>
                                <ThemedText style={[styles.announceLangText, { color: colors.textSecondary }]}>
                                  {device.language === "ar" ? "Arabic" : "English"}
                                </ThemedText>
                              </View>
                              <View style={[styles.announceStatusDot, { backgroundColor: device.isActive ? "#10B981" : colors.border }]} />
                              <ThemedText style={[styles.announceStatusText, { color: colors.textSecondary }]}>
                                {device.isActive ? "Active" : "Disabled"}
                              </ThemedText>
                            </View>
                            <View style={styles.announceDeviceActions}>
                              <Pressable
                                onPress={() => handleCopyDeviceUrl(device)}
                                style={styles.announceActionBtn}
                                testID={`button-copy-url-${device.id}`}
                              >
                                <Feather name="copy" size={13} color={BrandColors.primary} />
                                <ThemedText style={[styles.announceActionText, { color: BrandColors.primary }]}>Copy URL</ThemedText>
                              </Pressable>
                              <Pressable
                                onPress={() => handleRegenerateDeviceToken(device)}
                                style={styles.announceActionBtn}
                                testID={`button-regenerate-${device.id}`}
                              >
                                <Feather name="refresh-cw" size={13} color={colors.textSecondary} />
                                <ThemedText style={[styles.announceActionText, { color: colors.textSecondary }]}>Regenerate</ThemedText>
                              </Pressable>
                              <Pressable
                                onPress={() => handleDeleteDevice(device)}
                                style={styles.announceActionBtn}
                                testID={`button-delete-device-${device.id}`}
                              >
                                <Feather name="trash-2" size={13} color="#DC2626" />
                                <ThemedText style={[styles.announceActionText, { color: "#DC2626" }]}>Delete</ThemedText>
                              </Pressable>
                            </View>
                          </View>
                          <Switch
                            value={device.isActive}
                            onValueChange={() => handleToggleDeviceActive(device)}
                            trackColor={switchTrackColor}
                            thumbColor={switchThumbColor}
                          />
                        </View>
                      </View>
                    ))
                  )}
                  <View style={[styles.divider, { backgroundColor: colors.surfaceMuted }]} />
                  <Pressable
                    style={({ pressed }) => [styles.announceAddBtn, pressed && styles.pressed]}
                    onPress={openAddDeviceModal}
                    testID="button-add-announcement-device"
                  >
                    <Feather name="plus-circle" size={18} color={BrandColors.primary} />
                    <ThemedText style={[styles.announceAddText, { color: BrandColors.primary }]}>Add Device</ThemedText>
                  </Pressable>
                </>
              ) : null}
            </>
          ) : null}
        </SettingSection>
        ) : null}

        <SettingSection title="APPEARANCE">
          <Pressable
            style={({ pressed }) => pressed && styles.pressed}
            onPress={openDisplayModeModal}
          >
            <View style={styles.settingRow}>
              <View style={[styles.settingIcon, { backgroundColor: colors.surfaceMuted }]}>
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

        {hasPermission("org.settings.staff") ? (
        <SettingSection title="TEAM & ACCESS">
          <SettingRow
            icon="users"
            label="Manage Team"
            isDark={isDark}
            onPress={() => navigation.navigate("UserManagement")}
            showChevron
            right={
              <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
                <ThemedText style={[styles.badgeText, { color: colors.text }]}>{users.length}</ThemedText>
              </View>
            }
          />
          {hasPermission("org.users.assign_role") ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.surfaceMuted }]} />
              <SettingRow
                icon="shield"
                label="Roles & Permissions"
                isDark={isDark}
                onPress={() => navigation.navigate("TeamRoles")}
                showChevron
              />
            </>
          ) : null}
          <View style={[styles.divider, { backgroundColor: colors.surfaceMuted }]} />
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
          <View style={[styles.divider, { backgroundColor: colors.surfaceMuted }]} />
          <View style={styles.branchInfo}>
            <Feather name="map-pin" size={14} color={colors.textSecondary} />
            <ThemedText style={[styles.branchText, { color: colors.textSecondary }]}>
              {branches.length} branch{branches.length !== 1 ? "es" : ""} configured
            </ThemedText>
          </View>
        </SettingSection>
        ) : null}

        {hasPermission("org.settings.api") ? (
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
              <View style={[styles.divider, { backgroundColor: colors.surfaceMuted }]} />
              <View style={styles.apiContainer}>
                <View style={styles.apiRow}>
                  <ThemedText style={[styles.apiLabel, { color: colors.textSecondary }]}>API Key</ThemedText>
                  <Pressable 
                    onPress={handleCopyAPIKey} 
                    style={[styles.apiValue, { backgroundColor: colors.surfaceMuted }]}
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
                    style={[styles.apiValue, { backgroundColor: colors.surfaceMuted }]}
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
        ) : null}
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
              { backgroundColor: colors.surface },
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
                          backgroundColor: colors.surfaceMuted,
                          borderColor: settings.queueMode === option.id ? BrandColors.primary : "transparent",
                          borderWidth: settings.queueMode === option.id ? 2 : 0,
                        },
                      ]}
                      onPress={() => handleQueueModeChange(option.id)}
                    >
                      <View style={[
                        styles.modalOptionIcon,
                        { backgroundColor: settings.queueMode === option.id ? BrandColors.primary : (colors.border) }
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
                style={[styles.modalCloseButton, { backgroundColor: colors.surfaceMuted }]}
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
              { backgroundColor: colors.surface },
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
                          backgroundColor: colors.surfaceMuted,
                          borderColor: settings.notificationMode === option.id ? BrandColors.primary : "transparent",
                          borderWidth: settings.notificationMode === option.id ? 2 : 0,
                        },
                      ]}
                      onPress={() => handleNotificationModeChange(option.id)}
                    >
                      <View style={[
                        styles.modalOptionIcon,
                        { backgroundColor: settings.notificationMode === option.id ? BrandColors.primary : (colors.border) }
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
                style={[styles.modalCloseButton, { backgroundColor: colors.surfaceMuted }]}
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
              { backgroundColor: colors.surface },
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
                          backgroundColor: colors.surfaceMuted,
                          borderColor: themeMode === option.id ? BrandColors.primary : "transparent",
                          borderWidth: themeMode === option.id ? 2 : 0,
                        },
                      ]}
                      onPress={() => handleDisplayModeChange(option.id)}
                    >
                      <View style={[
                        styles.modalOptionIcon,
                        { backgroundColor: themeMode === option.id ? BrandColors.primary : (colors.border) }
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
                style={[styles.modalCloseButton, { backgroundColor: colors.surfaceMuted }]}
                onPress={closeDisplayModeModal}
              >
                <ThemedText style={styles.modalCloseText}>Cancel</ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal
        visible={showAddDeviceModal}
        transparent
        animationType="none"
        onRequestClose={closeAddDeviceModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeAddDeviceModal}>
          <Animated.View
            style={[
              styles.modalContent,
              { backgroundColor: colors.surface },
              {
                transform: [
                  {
                    translateY: addDeviceModalAnimation.interpolate({
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
              <ThemedText style={styles.modalTitle}>Add Announcement Device</ThemedText>
              <ThemedText style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Register a player device for this branch
              </ThemedText>

              <ThemedText style={[styles.announceFormLabel, { color: colors.text }]}>Device Name</ThemedText>
              <TextInput
                value={newDeviceName}
                onChangeText={setNewDeviceName}
                placeholder="e.g. Lobby Speaker"
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.announceTextInput,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
                ]}
                testID="input-device-name"
                autoFocus
              />

              <ThemedText style={[styles.announceFormLabel, { color: colors.text }]}>Language</ThemedText>
              <View style={styles.announceLangPicker}>
                {(["en", "ar"] as const).map((lang) => {
                  const selected = newDeviceLanguage === lang;
                  return (
                    <Pressable
                      key={lang}
                      onPress={() => setNewDeviceLanguage(lang)}
                      style={[
                        styles.announceLangOption,
                        {
                          borderColor: selected ? BrandColors.primary : colors.border,
                          backgroundColor: selected ? BrandColors.primary + "15" : "transparent",
                        },
                      ]}
                      testID={`option-language-${lang}`}
                    >
                      <ThemedText
                        style={[
                          styles.announceLangOptionText,
                          { color: selected ? BrandColors.primary : colors.text },
                        ]}
                      >
                        {lang === "en" ? "English" : "Arabic"}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.announceModalActions}>
                <View style={{ flex: 1 }}>
                  <Button title="Cancel" onPress={closeAddDeviceModal} variant="secondary" />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title={savingDevice ? "Adding..." : "Add Device"}
                    onPress={handleCreateDevice}
                    disabled={savingDevice || !newDeviceName.trim()}
                    testID="button-confirm-add-device"
                  />
                </View>
              </View>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal
        visible={confirmDialog.visible}
        transparent
        animationType="none"
        onRequestClose={closeConfirmDialog}
      >
        <Pressable style={styles.modalOverlay} onPress={closeConfirmDialog}>
          <Animated.View
            style={[
              styles.confirmModalContent,
              { backgroundColor: colors.surface },
              {
                opacity: confirmAnimation,
                transform: [
                  {
                    scale: confirmAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.92, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View onStartShouldSetResponder={() => true} testID="modal-confirm-dialog">
              <ThemedText style={styles.confirmTitle}>{confirmDialog.title}</ThemedText>
              <ThemedText style={[styles.confirmMessage, { color: colors.textSecondary }]}>
                {confirmDialog.message}
              </ThemedText>
              <View style={styles.confirmActions}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Cancel"
                    onPress={closeConfirmDialog}
                    variant="secondary"
                    disabled={confirmBusy}
                    testID="button-confirm-cancel"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Pressable
                    onPress={handleConfirmDialog}
                    disabled={confirmBusy}
                    style={({ pressed }) => [
                      styles.confirmDestructive,
                      {
                        backgroundColor: confirmDialog.destructive ? "#DC2626" : BrandColors.primary,
                        opacity: confirmBusy || pressed ? 0.75 : 1,
                      },
                    ]}
                    testID={`button-confirm-${confirmDialog.testIdSuffix || "ok"}`}
                  >
                    <ThemedText style={styles.confirmDestructiveText}>
                      {confirmBusy ? "Working..." : confirmDialog.confirmLabel}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal
        visible={showAnnouncerModal}
        transparent
        animationType="none"
        onRequestClose={closeAnnouncerPicker}
      >
        <Pressable style={styles.modalOverlay} onPress={closeAnnouncerPicker}>
          <Animated.View
            style={[
              styles.announcerModalContent,
              { backgroundColor: colors.surface },
              {
                opacity: announcerModalAnimation,
                transform: [
                  {
                    scale: announcerModalAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.94, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View onStartShouldSetResponder={() => true} testID="modal-announcer-picker">
              <View style={styles.announcerModalHeader}>
                <ThemedText style={styles.confirmTitle}>Choose Announcer Device</ThemedText>
                <Pressable onPress={closeAnnouncerPicker} hitSlop={8} testID="button-close-announcer-picker">
                  <Feather name="x" size={22} color={colors.text} />
                </Pressable>
              </View>
              <ThemedText style={[styles.confirmMessage, { color: colors.textSecondary }]}>
                The selected user's logged-in dashboard will play queue audio for this branch. Only that device receives the alert.
              </ThemedText>
              <ScrollView style={styles.announcerList}>
                <Pressable
                  style={({ pressed }) => [styles.announcerOption, pressed && styles.pressed, { borderColor: colors.surfaceMuted }]}
                  onPress={() => handleSelectAnnouncer(null)}
                  testID="option-announcer-none"
                >
                  <View style={[styles.settingIcon, { backgroundColor: colors.surfaceMuted }]}>
                    <Feather name="x-circle" size={18} color={colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.settingLabel}>None</ThemedText>
                    <ThemedText style={[styles.settingDescription, { color: colors.textSecondary }]}>No device will play audio</ThemedText>
                  </View>
                  {!(selectedBranch as any)?.announcerUserId ? (
                    <Feather name="check" size={20} color={BrandColors.primary} />
                  ) : null}
                </Pressable>
                {branchStaffOptions.length === 0 ? (
                  <View style={styles.announceEmpty}>
                    <Feather name="users" size={22} color={colors.textSecondary} />
                    <ThemedText style={[styles.announceEmptyText, { color: colors.textSecondary }]}>
                      No staff assigned to this branch yet.
                    </ThemedText>
                  </View>
                ) : (
                  branchStaffOptions.map((u) => {
                    const selected = (selectedBranch as any)?.announcerUserId === u.id;
                    return (
                      <Pressable
                        key={u.id}
                        style={({ pressed }) => [styles.announcerOption, pressed && styles.pressed, { borderColor: colors.surfaceMuted }]}
                        onPress={() => handleSelectAnnouncer(u.id)}
                        testID={`option-announcer-${u.id}`}
                      >
                        <View style={[styles.settingIcon, { backgroundColor: colors.surfaceMuted }]}>
                          <Feather name="user" size={18} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.settingLabel}>{u.name}</ThemedText>
                          <ThemedText style={[styles.settingDescription, { color: colors.textSecondary }]}>
                            {u.email}{u.role ? ` · ${u.role.replace(/_/g, " ")}` : ""}
                          </ThemedText>
                        </View>
                        {selected ? <Feather name="check" size={20} color={BrandColors.primary} /> : null}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Settings Scope Wizard Modal */}
      <Modal
        visible={showSettingsWizard}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSettingsWizard(false)}
      >
        <Pressable style={styles.wizardOverlay} onPress={() => setShowSettingsWizard(false)}>
          <Pressable style={[styles.wizardModal, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={styles.wizardHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.wizardTitle}>{getWizardStepTitle()}</ThemedText>
                {getWizardStepSubtitle() ? (
                  <ThemedText style={[styles.wizardSubtitle, { color: colors.textSecondary }]}>{getWizardStepSubtitle()}</ThemedText>
                ) : null}
              </View>
              <Pressable onPress={() => setShowSettingsWizard(false)} hitSlop={8}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>

            {settingsWizardSteps.length > 1 ? (
              <View style={styles.wizardStepRow}>
                {settingsWizardSteps.map((step, idx) => (
                  <View key={step} style={styles.wizardStepDotWrapper}>
                    <View style={[
                      styles.wizardStepDot,
                      { backgroundColor: idx <= wizardCurrentIndex ? colors.primary : (colors.border) },
                    ]} />
                    {idx < settingsWizardSteps.length - 1 ? (
                      <View style={[styles.wizardStepLine, { backgroundColor: idx < wizardCurrentIndex ? colors.primary : (colors.border) }]} />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              <View style={styles.wizardBody}>
                {settingsWizardStep === "branch" ? (
                  <View style={{ gap: 8 }}>
                    {accessibleBranches.map((branch) => {
                      const activeServices = branch.services?.filter(s => s.isActive) || [];
                      return (
                        <Pressable
                          key={branch.id}
                          style={[styles.wizardOptionCard, {
                            borderColor: selectedSettingsBranchId === branch.id ? colors.primary : (colors.border),
                            backgroundColor: selectedSettingsBranchId === branch.id ? colors.primary + "10" : (colors.surfaceMuted),
                          }]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setSelectedSettingsBranchId(branch.id);
                            setSelectedServiceId(null);
                          }}
                        >
                          <View style={styles.wizardOptionIcon}>
                            <Feather name="map-pin" size={18} color={selectedSettingsBranchId === branch.id ? colors.primary : colors.textSecondary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <ThemedText style={[styles.wizardOptionTitle, selectedSettingsBranchId === branch.id && { color: colors.primary }]}>{branch.name}</ThemedText>
                            {activeServices.length > 0 ? (
                              <ThemedText style={[styles.wizardOptionMeta, { color: colors.textSecondary }]}>{activeServices.length} service{activeServices.length !== 1 ? "s" : ""}</ThemedText>
                            ) : null}
                          </View>
                          {selectedSettingsBranchId === branch.id ? (
                            <View style={[styles.wizardCheckCircle, { backgroundColor: colors.primary }]}>
                              <Feather name="check" size={14} color="#FFFFFF" />
                            </View>
                          ) : (
                            <View style={[styles.wizardCheckCircle, { borderWidth: 2, borderColor: colors.borderSubtle }]} />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {settingsWizardStep === "service" ? (
                  <View style={{ gap: 8 }}>
                    <Pressable
                      style={[styles.wizardOptionCard, {
                        borderColor: !selectedServiceId ? colors.primary : (colors.border),
                        backgroundColor: !selectedServiceId ? colors.primary + "10" : (colors.surfaceMuted),
                      }]}
                      onPress={() => { Haptics.selectionAsync(); setSelectedServiceId(null); }}
                    >
                      <View style={styles.wizardOptionIcon}>
                        <Feather name="sliders" size={18} color={!selectedServiceId ? colors.primary : colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={[styles.wizardOptionTitle, !selectedServiceId && { color: colors.primary }]}>All Services</ThemedText>
                        <ThemedText style={[styles.wizardOptionMeta, { color: colors.textSecondary }]}>Apply settings to entire branch</ThemedText>
                      </View>
                      {!selectedServiceId ? (
                        <View style={[styles.wizardCheckCircle, { backgroundColor: colors.primary }]}>
                          <Feather name="check" size={14} color="#FFFFFF" />
                        </View>
                      ) : (
                        <View style={[styles.wizardCheckCircle, { borderWidth: 2, borderColor: colors.borderSubtle }]} />
                      )}
                    </Pressable>
                    {branchServices.map((service) => {
                      const hasOverrides = service.serviceSettings && Object.keys(service.serviceSettings).length > 0;
                      return (
                        <Pressable
                          key={service.id}
                          style={[styles.wizardOptionCard, {
                            borderColor: selectedServiceId === service.id ? colors.primary : (colors.border),
                            backgroundColor: selectedServiceId === service.id ? colors.primary + "10" : (colors.surfaceMuted),
                          }]}
                          onPress={() => { Haptics.selectionAsync(); setSelectedServiceId(service.id); }}
                        >
                          <View style={styles.wizardOptionIcon}>
                            <Feather name="tag" size={18} color={selectedServiceId === service.id ? colors.primary : colors.textSecondary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <ThemedText style={[styles.wizardOptionTitle, selectedServiceId === service.id && { color: colors.primary }]}>{service.name}</ThemedText>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            {hasOverrides ? (
                              <View style={[styles.wizardOverrideBadge, { backgroundColor: "#059669" + "18" }]}>
                                <ThemedText style={{ fontSize: 10, fontWeight: "600", color: "#059669" }}>Override</ThemedText>
                              </View>
                            ) : null}
                            {selectedServiceId === service.id ? (
                              <View style={[styles.wizardCheckCircle, { backgroundColor: colors.primary }]}>
                                <Feather name="check" size={14} color="#FFFFFF" />
                              </View>
                            ) : (
                              <View style={[styles.wizardCheckCircle, { borderWidth: 2, borderColor: colors.borderSubtle }]} />
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </ScrollView>

            <View style={styles.wizardFooter}>
              {!isWizardFirstStep ? (
                <Pressable
                  style={[styles.wizardButton, styles.wizardBackButton, { borderColor: colors.textSecondary }]}
                  onPress={handleWizardBack}
                >
                  <Feather name="arrow-left" size={16} color={colors.textSecondary} />
                  <ThemedText style={[styles.wizardBackText, { color: colors.textSecondary }]}>Back</ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.wizardButton, styles.wizardApplyButton, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={handleWizardNext}
              >
                {isWizardLastStep ? (
                  <>
                    <Feather name="check" size={18} color="#FFFFFF" />
                    <ThemedText style={styles.wizardApplyText}>Apply</ThemedText>
                  </>
                ) : (
                  <>
                    <ThemedText style={styles.wizardApplyText}>Next</ThemedText>
                    <Feather name="arrow-right" size={16} color="#FFFFFF" />
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const createStyles = (colors: typeof Colors.light) => StyleSheet.create({
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
  wizardTrigger: {
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    padding: Spacing.md,
  },
  wizardTriggerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  wizardTriggerIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  wizardTriggerLabels: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 2,
  },
  wizardTriggerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  wizardTriggerChipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  wizardTriggerHint: {
    fontSize: 11,
    fontWeight: "500",
  },
  wizardTriggerAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  wizardOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  wizardModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.7,
  },
  wizardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  wizardTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  wizardSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  wizardStepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  wizardStepDotWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  wizardStepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  wizardStepLine: {
    width: 40,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 4,
  },
  wizardBody: {
    paddingBottom: Spacing.md,
  },
  wizardOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    gap: Spacing.md,
  },
  wizardOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  wizardOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  wizardOptionMeta: {
    fontSize: 12,
    marginTop: 1,
  },
  wizardCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  wizardOverrideBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  wizardFooter: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingTop: Spacing.lg,
  },
  wizardButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  wizardBackButton: {
    borderWidth: 1,
  },
  wizardBackText: {
    fontWeight: "600",
    fontSize: 15,
  },
  wizardApplyButton: {},
  wizardApplyText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
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
  announceEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  announceEmptyText: {
    fontSize: 13,
  },
  announceDeviceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  announceDeviceInfo: {
    flex: 1,
    gap: 4,
  },
  announceDeviceMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  announceLangChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  announceLangText: {
    fontSize: 11,
    fontWeight: "600",
  },
  announceStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  announceStatusText: {
    fontSize: 11,
  },
  announceDeviceActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: 6,
    flexWrap: "wrap",
  },
  announceActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  announceActionText: {
    fontSize: 12,
    fontWeight: "500",
  },
  announceAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
  },
  announceAddText: {
    fontSize: 14,
    fontWeight: "600",
  },
  announceFormLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase" as const,
    opacity: 0.6,
    marginBottom: 6,
    marginTop: Spacing.md,
  },
  announceTextInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
  },
  announceLangPicker: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  announceLangOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    alignItems: "center",
  },
  announceLangOptionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  announceModalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  confirmModalContent: {
    margin: "auto",
    width: "85%",
    maxWidth: 420,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
  },
  announcerModalContent: {
    margin: "auto",
    width: "90%",
    maxWidth: 480,
    maxHeight: "80%",
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
  },
  announcerModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  announcerList: {
    maxHeight: 380,
  },
  announcerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  confirmMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  confirmActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  confirmDestructive: {
    paddingVertical: 12,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDestructiveText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
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
    backgroundColor: colors.borderSubtle,
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
