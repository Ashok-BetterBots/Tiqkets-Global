import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  useColorScheme,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { RequirePermission } from "@/components/RequirePermission";
import {
  OrgUser,
  UserRole,
  ROLE_PERMISSIONS,
  isBuiltinUserRole,
  getRoleLabel,
} from "@/types/organization";

// Built-in role styling. Custom roles fall through getRoleColor /
// getRoleIcon to neutral defaults so the UI never crashes on an
// unknown key.
const BUILTIN_ROLE_COLORS: Partial<Record<UserRole, string>> = {
  super_admin: "#0F172A",
  admin: "#7C3AED",
  location_manager: "#2563EB",
  floor_manager: "#059669",
  front_desk: "#D97706",
};

const BUILTIN_ROLE_ICONS: Partial<Record<UserRole, keyof typeof Feather.glyphMap>> = {
  super_admin: "shield",
  admin: "star",
  location_manager: "map-pin",
  floor_manager: "layers",
  front_desk: "monitor",
};

const CUSTOM_ROLE_FALLBACK_COLOR = "#475569";
const CUSTOM_ROLE_FALLBACK_ICON: keyof typeof Feather.glyphMap = "user-check";

function getRoleColor(roleKey: string | undefined | null): string {
  if (roleKey && isBuiltinUserRole(roleKey)) return BUILTIN_ROLE_COLORS[roleKey] ?? CUSTOM_ROLE_FALLBACK_COLOR;
  return CUSTOM_ROLE_FALLBACK_COLOR;
}

function getRoleIcon(roleKey: string | undefined | null): keyof typeof Feather.glyphMap {
  if (roleKey && isBuiltinUserRole(roleKey)) return BUILTIN_ROLE_ICONS[roleKey] ?? CUSTOM_ROLE_FALLBACK_ICON;
  return CUSTOM_ROLE_FALLBACK_ICON;
}

interface OrgRoleOption {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isSystem?: boolean;
}

interface UserCardProps {
  user: OrgUser;
  branches: { id: string; name: string }[];
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  isDark?: boolean;
}

function UserCard({ user, branches, onEdit, onToggleStatus, onDelete, isDark = false }: UserCardProps) {
  const roleColor = getRoleColor(user.role);
  const roleIcon = getRoleIcon(user.role);
  const colors = isDark ? Colors.dark : Colors.light;
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const getUserBranchNames = () => {
    if (user.branchIds && user.branchIds.length > 0) {
      const branchNames = user.branchIds
        .map(id => branches.find(b => b.id === id)?.name)
        .filter(Boolean);
      return branchNames.join(", ");
    }
    return user.branchName || null;
  };

  const branchNames = getUserBranchNames();

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut}>
      <Card variant="outlined" style={styles.userCard}>
        <View style={styles.userHeader}>
          <View style={[styles.roleIcon, { backgroundColor: roleColor + "15" }]}>
            <Feather name={roleIcon} size={18} color={roleColor} />
          </View>
          <View style={styles.userInfo}>
            <ThemedText style={styles.userName}>{user.name}</ThemedText>
            <ThemedText style={[styles.userEmail, { color: colors.textSecondary }]}>{user.email}</ThemedText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: user.isActive ? "#10B981" + "15" : "#EF4444" + "15" }]}>
            <View style={[styles.statusDot, { backgroundColor: user.isActive ? "#10B981" : "#EF4444" }]} />
            <ThemedText style={[styles.statusText, { color: user.isActive ? "#10B981" : "#EF4444" }]}>
              {user.isActive ? "Active" : "Inactive"}
            </ThemedText>
          </View>
        </View>

        <View style={styles.userDetails}>
          <View style={[styles.roleBadge, { backgroundColor: roleColor + "15" }]}>
            <ThemedText style={[styles.roleText, { color: roleColor }]}>
              {getRoleLabel(user.role)}
            </ThemedText>
          </View>
          {branchNames ? (
            <View style={styles.branchInfo}>
              <Feather name="map-pin" size={12} color={colors.textSecondary} />
              <ThemedText style={[styles.branchText, { color: colors.textSecondary }]} numberOfLines={2}>{branchNames}</ThemedText>
            </View>
          ) : null}
          {user.assignedServiceIds && user.assignedServiceIds.length > 0 ? (
            <View style={styles.serviceInfo}>
              <Feather name="tag" size={12} color={colors.textSecondary} />
              <ThemedText style={[styles.serviceText, { color: colors.textSecondary }]}>
                {user.assignedServiceIds.length} service(s) assigned
              </ThemedText>
            </View>
          ) : null}
        </View>

        <View style={[styles.userActions, { borderTopColor: colors.border }]}>
          <RequirePermission permission="org.users.edit">
            <Pressable style={styles.actionBtn} onPress={onEdit}>
              <Feather name="edit-2" size={16} color={colors.primary} />
            </Pressable>
          </RequirePermission>
          <RequirePermission permission="org.users.edit">
            <Pressable style={styles.actionBtn} onPress={onToggleStatus}>
              <Feather name={user.isActive ? "user-x" : "user-check"} size={16} color={user.isActive ? "#EF4444" : "#10B981"} />
            </Pressable>
          </RequirePermission>
          <RequirePermission permission="org.users.deactivate">
            <Pressable style={styles.actionBtn} onPress={onDelete}>
              <Feather name="trash-2" size={16} color="#EF4444" />
            </Pressable>
          </RequirePermission>
        </View>
      </Card>
    </Animated.View>
  );
}

type OrgUserDraft = Omit<OrgUser, "id" | "createdAt" | "organizationId"> & {
  password?: string;
};

interface AddUserModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (user: OrgUserDraft) => void;
  branches: { id: string; name: string }[];
  services: { id: string; name: string; branchId: string }[];
  editingUser?: OrgUser | null;
}

function AddUserModal({ visible, onClose, onSave, branches, services, editingUser }: AddUserModalProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [name, setName] = useState(editingUser?.name || "");
  const [email, setEmail] = useState(editingUser?.email || "");
  const [phone, setPhone] = useState(editingUser?.phone || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>(editingUser?.role || "front_desk");
  const [branchId, setBranchId] = useState(editingUser?.branchId || "");
  const [branchIds, setBranchIds] = useState<string[]>(editingUser?.branchIds || []);
  const [selectedServices, setSelectedServices] = useState<string[]>(editingUser?.assignedServiceIds || []);

  // Dynamic role catalog from /api/org/roles. Includes built-in
  // assignable roles (admin/location_manager/floor_manager/front_desk)
  // plus any custom role minted in Super Admin → Roles. The list
  // refreshes whenever the modal opens so newly-created custom roles
  // appear without an app reload.
  const { data: rolesData } = useQuery<{ roles: OrgRoleOption[] }>({
    queryKey: ["/api/org/roles"],
    enabled: visible,
    staleTime: 30_000,
  });

  const availableRoles: OrgRoleOption[] = useMemo(() => {
    const list = rolesData?.roles ?? [];
    if (list.length > 0) return list;
    // Fallback to built-ins (server unreachable / first paint).
    return (["admin", "location_manager", "floor_manager", "front_desk"] as UserRole[]).map((k) => ({
      id: k,
      key: k,
      name: getRoleLabel(k),
      isSystem: true,
    }));
  }, [rolesData]);

  React.useEffect(() => {
    if (editingUser) {
      setName(editingUser.name);
      setEmail(editingUser.email);
      setPhone(editingUser.phone || "");
      setPassword("");
      setRole(editingUser.role);
      setBranchId(editingUser.branchId || "");
      setBranchIds(editingUser.branchIds || (editingUser.branchId ? [editingUser.branchId] : []));
      setSelectedServices(editingUser.assignedServiceIds || []);
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setRole("front_desk");
      setBranchId("");
      setBranchIds([]);
      setSelectedServices([]);
    }
  }, [editingUser, visible]);

  const handleSave = () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert("Error", "Name and email are required");
      return;
    }
    if (!editingUser && password.length < 6) {
      Alert.alert("Error", "A password of at least 6 characters is required");
      return;
    }
    if (!role) {
      Alert.alert("Error", "Please select a role");
      return;
    }
    const isMultiBranchRole = role === "admin" || role === "location_manager";
    if (isMultiBranchRole) {
      if (!branchIds || branchIds.length === 0) {
        Alert.alert("Error", "Please assign at least one branch");
        return;
      }
    } else {
      if (!branchId) {
        Alert.alert("Error", "Please select a branch");
        return;
      }
    }
    if (role === "front_desk" && (!selectedServices || selectedServices.length === 0)) {
      Alert.alert("Error", "Please select at least one service for Front Desk");
      return;
    }

    const selectedBranch = branches.find((b) => b.id === branchId);
    const selectedBranchNames = branchIds.map(id => branches.find(b => b.id === id)?.name).filter(Boolean);

    onSave({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      password: editingUser ? undefined : password,
      role,
      branchId: role === "location_manager" ? (branchIds[0] || undefined) : (branchId || undefined),
      branchName: role === "location_manager" ? (selectedBranchNames[0] || undefined) : selectedBranch?.name,
      branchIds: role === "location_manager" ? branchIds : undefined,
      assignedServiceIds: role === "front_desk" ? selectedServices : undefined,
      isActive: editingUser?.isActive ?? true,
      lastLoginAt: editingUser?.lastLoginAt,
    });
    onClose();
  };

  const toggleService = (serviceId: string) => {
    setSelectedServices((prev) =>
      prev.includes(serviceId)
        ? prev.filter((s) => s !== serviceId)
        : [...prev, serviceId]
    );
  };

  const toggleBranch = (branchIdToToggle: string) => {
    Haptics.selectionAsync();
    setBranchIds((prev) =>
      prev.includes(branchIdToToggle)
        ? prev.filter((b) => b !== branchIdToToggle)
        : [...prev, branchIdToToggle]
    );
  };

  // Services belong to a branch, so the "Assigned Services" picker must only
  // offer services from the currently selected branch.
  const availableServices = useMemo(
    () => (branchId ? services.filter((s) => s.branchId === branchId) : []),
    [services, branchId]
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.modalContainer, { paddingTop: insets.top, backgroundColor: colors.surface }]}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={24} color={colors.text} />
          </Pressable>
          <ThemedText type="h3" style={styles.modalTitle}>
            {editingUser ? "Edit User" : "Add New User"}
          </ThemedText>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalScrollContent}>
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Full Name</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Enter full name"
              value={name}
              onChangeText={setName}
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Email</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Enter email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Phone (Optional)</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Enter phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {!editingUser ? (
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Password</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="Minimum 6 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Role</ThemedText>
            <View style={styles.roleGrid}>
              {availableRoles.map((r) => {
                const c = getRoleColor(r.key);
                const icon = getRoleIcon(r.key);
                const selected = role === r.key;
                return (
                  <Pressable
                    key={r.id}
                    style={[
                      styles.roleOption,
                      selected && { borderColor: c, backgroundColor: c + "10" },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setRole(r.key);
                    }}
                  >
                    <Feather name={icon} size={20} color={selected ? c : colors.textSecondary} />
                    <ThemedText style={[styles.roleOptionText, selected && { color: c }]}>
                      {r.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.roleDescription}>
            <Feather name="info" size={14} color={BrandColors.primary} />
            <ThemedText style={styles.roleDescText}>
              {(() => {
                const selected = availableRoles.find((r) => r.key === role);
                if (selected?.description) return selected.description;
                if (role === "admin") return "Full access to all branches, users, payments, and settings.";
                if (role === "location_manager") return "Manage assigned branches settings, reports, and create staff users. Can be assigned to multiple branches.";
                if (role === "floor_manager") return "Process queue for multiple services in assigned branch.";
                if (role === "front_desk") return "Process queue for specific assigned service only.";
                return `Custom role — permissions are defined by Super Admin.`;
              })()}
            </ThemedText>
          </View>

          {role === "location_manager" ? (
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Assigned Branches</ThemedText>
              <ThemedText style={styles.inputHint}>
                Select one or more branches this manager can access
              </ThemedText>
              <View style={styles.branchOptions}>
                {branches.map((branch) => (
                  <Pressable
                    key={branch.id}
                    style={[
                      styles.branchOptionMulti,
                      branchIds.includes(branch.id) && styles.branchOptionMultiActive,
                    ]}
                    onPress={() => toggleBranch(branch.id)}
                  >
                    <View style={[
                      styles.checkbox,
                      branchIds.includes(branch.id) && styles.checkboxActive,
                    ]}>
                      {branchIds.includes(branch.id) ? (
                        <Feather name="check" size={12} color="#FFFFFF" />
                      ) : null}
                    </View>
                    <View style={styles.branchOptionContent}>
                      <Feather
                        name="git-branch"
                        size={16}
                        color={branchIds.includes(branch.id) ? BrandColors.primary : colors.textSecondary}
                      />
                      <ThemedText style={[
                        styles.branchOptionText,
                        branchIds.includes(branch.id) && { color: BrandColors.primary },
                      ]}>
                        {branch.name}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
              </View>
              {branchIds.length > 0 && (
                <View style={styles.selectedBranchesInfo}>
                  <Feather name="check-circle" size={14} color={colors.success} />
                  <ThemedText style={styles.selectedBranchesText}>
                    {branchIds.length} branch{branchIds.length > 1 ? 'es' : ''} selected
                  </ThemedText>
                </View>
              )}
            </View>
          ) : role !== "admin" ? (
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Assigned Branch</ThemedText>
              <View style={styles.branchOptions}>
                {branches.map((branch) => (
                  <Pressable
                    key={branch.id}
                    style={[
                      styles.branchOption,
                      branchId === branch.id && styles.branchOptionActive,
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setBranchId(branch.id);
                      // Drop any selected services that don't belong to the
                      // newly chosen branch.
                      setSelectedServices((prev) =>
                        prev.filter((sid) =>
                          services.some((s) => s.id === sid && s.branchId === branch.id)
                        )
                      );
                    }}
                  >
                    <Feather
                      name="map-pin"
                      size={16}
                      color={branchId === branch.id ? BrandColors.primary : colors.textSecondary}
                    />
                    <ThemedText style={[
                      styles.branchOptionText,
                      branchId === branch.id && { color: BrandColors.primary },
                    ]}>
                      {branch.name}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {role === "front_desk" ? (
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Assigned Services</ThemedText>
              <ThemedText style={styles.inputHint}>Select which services this user can process</ThemedText>
              {!branchId ? (
                <ThemedText style={[styles.inputHint, { color: colors.textSecondary }]}>
                  Select a branch first to see its services
                </ThemedText>
              ) : availableServices.length === 0 ? (
                <ThemedText style={[styles.inputHint, { color: colors.textSecondary }]}>
                  This branch has no services yet
                </ThemedText>
              ) : null}
              <View style={styles.serviceOptions}>
                {availableServices.map((service) => (
                  <Pressable
                    key={service.id}
                    style={[
                      styles.serviceOption,
                      selectedServices.includes(service.id) && styles.serviceOptionActive,
                    ]}
                    onPress={() => toggleService(service.id)}
                  >
                    <View style={[
                      styles.checkbox,
                      selectedServices.includes(service.id) && styles.checkboxActive,
                    ]}>
                      {selectedServices.includes(service.id) ? (
                        <Feather name="check" size={12} color="#FFFFFF" />
                      ) : null}
                    </View>
                    <ThemedText style={styles.serviceOptionText}>{service.name}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.modalFooter, { paddingBottom: insets.bottom + Spacing.md }]}>
          <Button title="Cancel" variant="secondary" onPress={onClose} style={styles.cancelBtn} />
          <Button title={editingUser ? "Save Changes" : "Add User"} onPress={handleSave} style={[styles.saveBtn, { backgroundColor: BrandColors.primaryDark }]} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function UserManagementScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { users, branches, organization, addUser, updateUser, deleteUser } = useOrganization();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null);
  const [filterRole, setFilterRole] = useState<UserRole | "all">("all");

  const filteredUsers = users.filter((u) => filterRole === "all" || u.role === filterRole);

  const handleAddUser = async (userData: OrgUserDraft) => {
    try {
      await addUser(userData);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "User has been added successfully");
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Could not add user", error?.message || "Please try again.");
    }
  };

  const handleEditUser = async (userData: OrgUserDraft) => {
    if (!editingUser) return;
    try {
      await updateUser(editingUser.id, userData);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingUser(null);
      Alert.alert("Success", "User has been updated successfully");
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Could not update user", error?.message || "Please try again.");
    }
  };

  const handleToggleStatus = async (user: OrgUser) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateUser(user.id, { isActive: !user.isActive });
  };

  const handleDeleteUser = (user: OrgUser) => {
    Alert.alert(
      "Delete User",
      `Are you sure you want to delete ${user.name}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await deleteUser(user.id);
          },
        },
      ]
    );
  };

  const filters: { key: UserRole | "all"; label: string }[] = [
    { key: "all", label: "All Users" },
    { key: "admin", label: "Admins" },
    { key: "location_manager", label: "Managers" },
    { key: "floor_manager", label: "Floor" },
    { key: "front_desk", label: "Front Desk" },
  ];

  const services = branches.flatMap((b) =>
    (b.services || []).map((s) => ({ id: s.id, name: s.name, branchId: b.id }))
  );
  const branchOptions = branches.map((b) => ({ id: b.id, name: b.name }));

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { marginTop: headerHeight }]}>
        <View style={styles.headerTop}>
          <View>
            <ThemedText style={{ fontSize: 16, fontWeight: "700" }}>Team Members</ThemedText>
            <ThemedText style={[styles.headerSubtitle, { color: colors.textSecondary }]}>{users.length} users</ThemedText>
          </View>
          <RequirePermission permission="org.users.invite">
            <Button
              title="Add User"
              size="small"
              icon={<Feather name="user-plus" size={16} color="#FFFFFF" />}
              onPress={() => setShowAddModal(true)}
              style={{ backgroundColor: BrandColors.primaryDark }}
            />
          </RequirePermission>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContainer}
          style={styles.filtersScroll}
        >
          {filters.map((filter) => (
            <Pressable
              key={filter.key}
              style={[
                styles.filterChip,
                { backgroundColor: filterRole === filter.key ? colors.primary : (isDark ? colors.surfaceMuted : "#F7F5FE") },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setFilterRole(filter.key);
              }}
            >
              <ThemedText
                style={[
                  styles.filterText,
                  { color: filterRole === filter.key ? "#FFFFFF" : colors.textSecondary },
                ]}
              >
                {filter.label}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.userList}
        contentContainerStyle={[styles.userListContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {filteredUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="users" size={48} color={colors.textSecondary} />
            <ThemedText style={styles.emptyTitle}>No users found</ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {filterRole === "all" ? "Add your first team member" : `No ${ROLE_LABELS[filterRole as UserRole]}s yet`}
            </ThemedText>
          </View>
        ) : (
          filteredUsers.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              branches={branchOptions}
              onEdit={() => {
                setEditingUser(user);
                setShowAddModal(true);
              }}
              onToggleStatus={() => handleToggleStatus(user)}
              onDelete={() => handleDeleteUser(user)}
              isDark={isDark}
            />
          ))
        )}
      </ScrollView>

      <AddUserModal
        visible={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingUser(null);
        }}
        onSave={editingUser ? handleEditUser : handleAddUser}
        branches={branchOptions}
        services={services}
        editingUser={editingUser}
      />
    </ThemedView>
  );
}

const createStyles = (colors: typeof Colors.light, isDark = false) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  filtersScroll: {
    marginHorizontal: -Spacing.lg,
  },
  filtersContainer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: colors.surfaceMuted,
  },
  filterChipActive: {
    backgroundColor: BrandColors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.buttonText,
  },
  userList: {
    flex: 1,
  },
  userListContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  userCard: {
    padding: Spacing.lg,
  },
  userHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  roleIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontWeight: "600",
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  userDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  roleBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  roleText: {
    fontSize: 11,
    fontWeight: "600",
  },
  branchInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  branchText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  serviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  serviceText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  userActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: Spacing.md,
    gap: Spacing.md,
    justifyContent: "flex-end",
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: colors.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["4xl"],
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: Spacing.xs,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 16,
    textAlign: "center",
  },
  modalContent: {
    flex: 1,
  },
  modalScrollContent: {
    padding: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  inputHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: isDark ? colors.surfaceMuted : "#F7F5FE",
  },
  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  roleOption: {
    width: "48%",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: colors.borderSubtle,
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: isDark ? colors.surfaceMuted : "#F7F5FE",
  },
  roleOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    textAlign: "center",
  },
  roleDescription: {
    flexDirection: "row",
    backgroundColor: BrandColors.primary + "10",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  roleDescText: {
    flex: 1,
    fontSize: 13,
    color: BrandColors.primary,
  },
  branchOptions: {
    gap: Spacing.sm,
  },
  branchOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: Spacing.sm,
    backgroundColor: isDark ? colors.surfaceMuted : "#F7F5FE",
  },
  branchOptionActive: {
    borderColor: BrandColors.primary,
    backgroundColor: BrandColors.primary + "10",
  },
  branchOptionMulti: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: Spacing.sm,
    backgroundColor: isDark ? colors.surfaceMuted : "#F7F5FE",
  },
  branchOptionMultiActive: {
    borderColor: BrandColors.primary,
    backgroundColor: BrandColors.primary + "10",
  },
  branchOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  branchOptionText: {
    fontSize: 14,
    color: colors.text,
  },
  selectedBranchesInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  selectedBranchesText: {
    fontSize: 13,
    color: colors.success,
    fontWeight: "500",
  },
  serviceOptions: {
    gap: Spacing.sm,
  },
  serviceOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: Spacing.sm,
    backgroundColor: isDark ? colors.surfaceMuted : "#F7F5FE",
  },
  serviceOptionActive: {
    borderColor: BrandColors.primary,
    backgroundColor: BrandColors.primary + "10",
  },
  serviceOptionText: {
    fontSize: 14,
    color: colors.text,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: colors.borderSubtle,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxActive: {
    backgroundColor: BrandColors.primary,
    borderColor: BrandColors.primary,
  },
  modalFooter: {
    flexDirection: "row",
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: Spacing.md,
  },
  cancelBtn: {
    flex: 1,
  },
  saveBtn: {
    flex: 2,
  },
});
