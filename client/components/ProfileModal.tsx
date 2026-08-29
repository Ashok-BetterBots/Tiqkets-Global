import { logHandledError } from "@/lib/logger";
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
  Animated,
  Dimensions,
  useColorScheme,
  Image,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { OrgUser, ROLE_LABELS } from "@/types/organization";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MODAL_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 360);

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
  user: OrgUser;
  onUpdateUser: (updates: Partial<OrgUser>) => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  onLogout: () => Promise<void>;
}

export function ProfileModal({
  visible,
  onClose,
  user,
  onUpdateUser,
  onChangePassword,
  onLogout,
}: ProfileModalProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  
  const slideAnim = useRef(new Animated.Value(-MODAL_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user.name);

  useEffect(() => {
    setEditedName(user.name);
  }, [user.name]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -MODAL_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowChangePassword(false);
    setIsEditingName(false);
    setEditedName(user.name);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    onClose();
  };

  const handlePickImage = async () => {
    try {
      setIsPickingImage(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert(
          "Permission Required",
          "Please allow access to your photo library to change your profile picture.",
          [{ text: "OK" }]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await onUpdateUser({ profilePictureUrl: result.assets[0].uri });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      logHandledError("Error picking image", error);
      Alert.alert("Error", "Failed to update profile picture. Please try again.");
    } finally {
      setIsPickingImage(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Error", "Please fill in all password fields.");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Error", "New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "New passwords do not match.");
      return;
    }

    setIsChangingPassword(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const success = await onChangePassword(currentPassword, newPassword);
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Your password has been changed successfully.");
        setShowChangePassword(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Error", "Current password is incorrect.");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to change password. Please try again.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowLogoutConfirm(false);
    handleClose();
    await onLogout();
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin":
        return "#8B5CF6";
      case "location_manager":
        return BrandColors.secondary;
      case "floor_manager":
        return colors.success;
      case "front_desk":
        return "#F59E0B";
      default:
        return colors.textSecondary;
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: overlayAnim,
            },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.modalContent,
            {
              width: MODAL_WIDTH,
              backgroundColor: isDark ? colors.backgroundRoot : "#F7F5FE",
              transform: [{ translateX: slideAnim }],
              paddingTop: insets.top + Spacing.md,
              paddingBottom: insets.bottom + Spacing.md,
            },
          ]}
        >
          <View style={styles.header}>
            <ThemedText type="h4">Profile</ThemedText>
            <Pressable onPress={handleClose} hitSlop={8}>
              <Feather name="x" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.profileSection}>
              <Pressable onPress={handlePickImage} disabled={isPickingImage}>
                <View style={styles.avatarContainer}>
                  {user.profilePictureUrl ? (
                    <Image
                      source={{ uri: user.profilePictureUrl }}
                      style={[styles.avatar, styles.avatarBorder]}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarBorder, styles.avatarPlaceholder]}>
                      <Feather name="user" size={44} color={BrandColors.primaryDark} />
                    </View>
                  )}
                  <View style={[styles.editBadge, { backgroundColor: colors.primary }]}>
                    <Feather name="camera" size={12} color="#FFFFFF" />
                  </View>
                </View>
              </Pressable>

              {isEditingName ? (
                <View style={styles.editNameContainer}>
                  <TextInput
                    style={[styles.editNameInput, { backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC", color: colors.text, borderColor: isDark ? "#3A3A3A" : "#E2E8F0" }]}
                    value={editedName}
                    onChangeText={setEditedName}
                    autoFocus
                    selectTextOnFocus
                    testID="input-edit-name"
                  />
                  <View style={styles.editNameButtons}>
                    <Pressable
                      style={[styles.editNameBtn, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}
                      onPress={() => { setIsEditingName(false); setEditedName(user.name); }}
                    >
                      <Feather name="x" size={16} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      style={[styles.editNameBtn, { backgroundColor: colors.primary }]}
                      onPress={async () => {
                        if (editedName.trim()) {
                          await onUpdateUser({ name: editedName.trim() });
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                        setIsEditingName(false);
                      }}
                      testID="button-save-name"
                    >
                      <Feather name="check" size={16} color="#FFFFFF" />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsEditingName(true); }}
                  style={styles.nameRow}
                >
                  <ThemedText type="h4" style={styles.userName}>{user.name}</ThemedText>
                  <Feather name="edit-2" size={14} color={colors.textSecondary} />
                </Pressable>
              )}
              <View style={[styles.roleBadge, { backgroundColor: getRoleColor(user.role) + "20" }]}>
                <ThemedText style={[styles.roleText, { color: getRoleColor(user.role) }]}>
                  {ROLE_LABELS[user.role]}
                </ThemedText>
              </View>
            </View>

            <Card style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <View style={[styles.detailIcon, { backgroundColor: colors.primary + "15" }]}>
                  <Feather name="mail" size={16} color={colors.primary} />
                </View>
                <View style={styles.detailContent}>
                  <ThemedText style={[styles.detailLabel, { color: colors.textSecondary }]}>
                    Email
                  </ThemedText>
                  <ThemedText style={styles.detailValue}>{user.email}</ThemedText>
                </View>
              </View>

              {user.phone ? (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIcon, { backgroundColor: colors.success + "15" }]}>
                    <Feather name="phone" size={16} color={colors.success} />
                  </View>
                  <View style={styles.detailContent}>
                    <ThemedText style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      Phone
                    </ThemedText>
                    <ThemedText style={styles.detailValue}>{user.phone}</ThemedText>
                  </View>
                </View>
              ) : null}

              {user.branchName ? (
                <View style={styles.detailRow}>
                  <View style={[styles.detailIcon, { backgroundColor: "#8B5CF6" + "15" }]}>
                    <Feather name="map-pin" size={16} color="#8B5CF6" />
                  </View>
                  <View style={styles.detailContent}>
                    <ThemedText style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      Branch
                    </ThemedText>
                    <ThemedText style={styles.detailValue}>{user.branchName}</ThemedText>
                  </View>
                </View>
              ) : null}

              <View style={styles.detailRow}>
                <View style={[styles.detailIcon, { backgroundColor: "#F59E0B" + "15" }]}>
                  <Feather name="calendar" size={16} color="#F59E0B" />
                </View>
                <View style={styles.detailContent}>
                  <ThemedText style={[styles.detailLabel, { color: colors.textSecondary }]}>
                    Member Since
                  </ThemedText>
                  <ThemedText style={styles.detailValue}>
                    {new Date(user.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </ThemedText>
                </View>
              </View>
            </Card>

            {showChangePassword ? (
              <Card style={styles.passwordCard}>
                <ThemedText type="body" style={styles.passwordTitle}>
                  Change Password
                </ThemedText>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Current Password
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC",
                        color: colors.text,
                        borderColor: isDark ? "#3A3A3A" : "#E2E8F0",
                      },
                    ]}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Enter current password"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    New Password
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC",
                        color: colors.text,
                        borderColor: isDark ? "#3A3A3A" : "#E2E8F0",
                      },
                    ]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new password"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Confirm New Password
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC",
                        color: colors.text,
                        borderColor: isDark ? "#3A3A3A" : "#E2E8F0",
                      },
                    ]}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm new password"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry
                  />
                </View>

                <View style={styles.passwordButtons}>
                  <Pressable
                    style={[styles.cancelButton, { borderColor: isDark ? "#3A3A3A" : "#E2E8F0" }]}
                    onPress={() => {
                      setShowChangePassword(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                  >
                    <ThemedText style={{ color: colors.textSecondary }}>Cancel</ThemedText>
                  </Pressable>
                  <Button
                    title={isChangingPassword ? "Saving..." : "Save"}
                    onPress={handleChangePassword}
                    disabled={isChangingPassword}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            ) : (
              <Pressable
                style={[styles.actionButton, { backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC" }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowChangePassword(true);
                }}
              >
                <View style={[styles.actionIcon, { backgroundColor: colors.primary + "15" }]}>
                  <Feather name="lock" size={18} color={colors.primary} />
                </View>
                <ThemedText style={styles.actionText}>Change Password</ThemedText>
                <Feather name="chevron-right" size={20} color={colors.textSecondary} />
              </Pressable>
            )}

            {showLogoutConfirm ? (
              <View style={styles.logoutConfirmContainer}>
                <ThemedText style={[styles.logoutConfirmText, { color: colors.text }]}>
                  Are you sure you want to log out?
                </ThemedText>
                <View style={styles.logoutConfirmButtons}>
                  <Pressable
                    style={[styles.logoutConfirmBtn, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}
                    onPress={() => setShowLogoutConfirm(false)}
                  >
                    <ThemedText style={[styles.logoutConfirmBtnText, { color: colors.textSecondary }]}>Cancel</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.logoutConfirmBtn, { backgroundColor: BrandColors.primaryDark }]}
                    onPress={confirmLogout}
                    testID="confirm-logout"
                  >
                    <Feather name="log-out" size={16} color="#FFFFFF" />
                    <ThemedText style={[styles.logoutConfirmBtnText, { color: "#FFFFFF" }]}>Log Out</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                style={[styles.logoutButton, { borderColor: BrandColors.primaryDark }]}
                onPress={handleLogout}
                testID="button-logout"
              >
                <Feather name="log-out" size={18} color={BrandColors.primaryDark} />
                <ThemedText style={[styles.logoutText, { color: BrandColors.primaryDark }]}>
                  Log Out
                </ThemedText>
              </Pressable>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  profileSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarBorder: {
    borderWidth: 3,
    borderColor: BrandColors.primaryDark + "40",
  },
  avatarPlaceholder: {
    backgroundColor: "#EDE8F5",
    justifyContent: "center",
    alignItems: "center",
  },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  userName: {
    marginBottom: Spacing.xs,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  editNameContainer: {
    width: "100%",
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  editNameInput: {
    height: 40,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    fontWeight: "600" as const,
    textAlign: "center" as const,
  },
  editNameButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  editNameBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  roleBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  roleText: {
    fontSize: 12,
    fontWeight: "600",
  },
  detailsCard: {
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  detailContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  detailLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 2,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  actionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    marginLeft: Spacing.md,
  },
  passwordCard: {
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  passwordTitle: {
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: 12,
    marginBottom: Spacing.xs,
  },
  input: {
    height: 44,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    fontSize: 15,
  },
  passwordButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    marginTop: Spacing.md,
  },
  logoutConfirmContainer: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "#DC2626",
    gap: Spacing.md,
  },
  logoutConfirmText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  logoutConfirmButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  logoutConfirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: 6,
  },
  logoutConfirmBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "600",
    marginLeft: Spacing.sm,
  },
});
