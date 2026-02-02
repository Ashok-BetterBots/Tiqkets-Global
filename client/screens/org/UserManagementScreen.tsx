import React, { useState } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  OrgUser,
  UserRole,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
} from "@/types/organization";

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "#7C3AED",
  location_manager: "#2563EB",
  floor_manager: "#059669",
  front_desk: "#D97706",
};

const ROLE_ICONS: Record<UserRole, keyof typeof Feather.glyphMap> = {
  admin: "shield",
  location_manager: "map-pin",
  floor_manager: "layers",
  front_desk: "monitor",
};

interface UserCardProps {
  user: OrgUser;
  branches: { id: string; name: string }[];
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  isDark?: boolean;
}

function UserCard({ user, branches, onEdit, onToggleStatus, onDelete, isDark = false }: UserCardProps) {
  const roleColor = ROLE_COLORS[user.role];
  const roleIcon = ROLE_ICONS[user.role];
  const colors = isDark ? Colors.dark : Colors.light;

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
      <Card style={styles.userCard}>
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
              {ROLE_LABELS[user.role]}
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

        <View style={[styles.userActions, { borderTopColor: isDark ? "#3A3A3A" : "#F1F5F9" }]}>
          <Pressable style={styles.actionBtn} onPress={onEdit}>
            <Feather name="edit-2" size={16} color={colors.primary} />
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={onToggleStatus}>
            <Feather name={user.isActive ? "user-x" : "user-check"} size={16} color={user.isActive ? "#EF4444" : "#10B981"} />
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={onDelete}>
            <Feather name="trash-2" size={16} color="#EF4444" />
          </Pressable>
        </View>
      </Card>
    </Animated.View>
  );
}

interface AddUserModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (user: Omit<OrgUser, "id" | "createdAt" | "organizationId">) => void;
  branches: { id: string; name: string }[];
  services: { id: string; name: string }[];
  editingUser?: OrgUser | null;
}

function AddUserModal({ visible, onClose, onSave, branches, services, editingUser }: AddUserModalProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(editingUser?.name || "");
  const [email, setEmail] = useState(editingUser?.email || "");
  const [phone, setPhone] = useState(editingUser?.phone || "");
  const [role, setRole] = useState<UserRole>(editingUser?.role || "front_desk");
  const [branchId, setBranchId] = useState(editingUser?.branchId || "");
  const [branchIds, setBranchIds] = useState<string[]>(editingUser?.branchIds || []);
  const [selectedServices, setSelectedServices] = useState<string[]>(editingUser?.assignedServiceIds || []);

  React.useEffect(() => {
    if (editingUser) {
      setName(editingUser.name);
      setEmail(editingUser.email);
      setPhone(editingUser.phone || "");
      setRole(editingUser.role);
      setBranchId(editingUser.branchId || "");
      setBranchIds(editingUser.branchIds || (editingUser.branchId ? [editingUser.branchId] : []));
      setSelectedServices(editingUser.assignedServiceIds || []);
    } else {
      setName("");
      setEmail("");
      setPhone("");
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

    const selectedBranch = branches.find((b) => b.id === branchId);
    const selectedBranchNames = branchIds.map(id => branches.find(b => b.id === id)?.name).filter(Boolean);

    onSave({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
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

  const roles: UserRole[] = ["admin", "location_manager", "floor_manager", "front_desk"];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={24} color={Colors.light.text} />
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
              placeholderTextColor={Colors.light.textSecondary}
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
              placeholderTextColor={Colors.light.textSecondary}
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
              placeholderTextColor={Colors.light.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Role</ThemedText>
            <View style={styles.roleGrid}>
              {roles.map((r) => (
                <Pressable
                  key={r}
                  style={[
                    styles.roleOption,
                    role === r && { borderColor: ROLE_COLORS[r], backgroundColor: ROLE_COLORS[r] + "10" },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setRole(r);
                  }}
                >
                  <Feather name={ROLE_ICONS[r]} size={20} color={role === r ? ROLE_COLORS[r] : Colors.light.textSecondary} />
                  <ThemedText style={[styles.roleOptionText, role === r && { color: ROLE_COLORS[r] }]}>
                    {ROLE_LABELS[r]}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.roleDescription}>
            <Feather name="info" size={14} color={BrandColors.primary} />
            <ThemedText style={styles.roleDescText}>
              {role === "admin" && "Full access to all branches, users, payments, and settings."}
              {role === "location_manager" && "Manage assigned branches settings, reports, and create staff users. Can be assigned to multiple branches."}
              {role === "floor_manager" && "Process queue for multiple services in assigned branch."}
              {role === "front_desk" && "Process queue for specific assigned service only."}
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
                        color={branchIds.includes(branch.id) ? BrandColors.primary : Colors.light.textSecondary}
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
                  <Feather name="check-circle" size={14} color={Colors.light.success} />
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
                    }}
                  >
                    <Feather
                      name="map-pin"
                      size={16}
                      color={branchId === branch.id ? BrandColors.primary : Colors.light.textSecondary}
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
              <View style={styles.serviceOptions}>
                {services.map((service) => (
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
          <Button title={editingUser ? "Save Changes" : "Add User"} onPress={handleSave} style={styles.saveBtn} />
        </View>
      </View>
    </Modal>
  );
}

export default function UserManagementScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { users, branches, organization, addUser, updateUser, deleteUser } = useOrganization();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null);
  const [filterRole, setFilterRole] = useState<UserRole | "all">("all");

  const filteredUsers = users.filter((u) => filterRole === "all" || u.role === filterRole);

  const handleAddUser = async (userData: Omit<OrgUser, "id" | "createdAt" | "organizationId">) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addUser(userData);
    Alert.alert("Success", "User has been added successfully");
  };

  const handleEditUser = async (userData: Omit<OrgUser, "id" | "createdAt" | "organizationId">) => {
    if (!editingUser) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await updateUser(editingUser.id, userData);
    setEditingUser(null);
    Alert.alert("Success", "User has been updated successfully");
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

  const services = organization?.services.map((s) => ({ id: s.id, name: s.name })) || [];
  const branchOptions = branches.map((b) => ({ id: b.id, name: b.name }));

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { marginTop: headerHeight }]}>
        <View style={styles.headerTop}>
          <View>
            <ThemedText type="h3">Team Members</ThemedText>
            <ThemedText style={[styles.headerSubtitle, { color: colors.textSecondary }]}>{users.length} users</ThemedText>
          </View>
          <Button
            title="Add User"
            size="small"
            icon={<Feather name="user-plus" size={16} color="#FFFFFF" />}
            onPress={() => setShowAddModal(true)}
          />
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
                { backgroundColor: filterRole === filter.key ? colors.primary : (isDark ? "#2A2A2A" : "#F1F5F9") },
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

const styles = StyleSheet.create({
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
    color: Colors.light.textSecondary,
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
    backgroundColor: "#F1F5F9",
  },
  filterChipActive: {
    backgroundColor: BrandColors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.light.textSecondary,
  },
  filterTextActive: {
    color: "#FFFFFF",
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
    color: Colors.light.textSecondary,
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
    borderRadius: BorderRadius.xs,
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
    color: Colors.light.textSecondary,
    flex: 1,
  },
  serviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  serviceText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  userActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: Spacing.md,
    gap: Spacing.md,
    justifyContent: "flex-end",
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["4xl"],
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: Spacing.xs,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
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
    color: Colors.light.textSecondary,
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
    color: Colors.light.text,
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
    borderColor: "#E5E7EB",
    alignItems: "center",
    gap: Spacing.xs,
  },
  roleOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.light.textSecondary,
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
    borderColor: "#E5E7EB",
    gap: Spacing.sm,
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
    borderColor: "#E5E7EB",
    gap: Spacing.sm,
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
    color: Colors.light.text,
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
    color: Colors.light.success,
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
    borderColor: "#E5E7EB",
    gap: Spacing.sm,
  },
  serviceOptionActive: {
    borderColor: BrandColors.primary,
    backgroundColor: BrandColors.primary + "10",
  },
  serviceOptionText: {
    fontSize: 14,
    color: Colors.light.text,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderColor: "#D1D5DB",
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
    borderTopColor: "#F1F5F9",
    gap: Spacing.md,
  },
  cancelBtn: {
    flex: 1,
  },
  saveBtn: {
    flex: 2,
  },
});
