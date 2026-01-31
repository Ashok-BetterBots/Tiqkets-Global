import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
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
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
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
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

function UserCard({ user, onEdit, onToggleStatus, onDelete }: UserCardProps) {
  const roleColor = ROLE_COLORS[user.role];
  const roleIcon = ROLE_ICONS[user.role];

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut}>
      <Card style={styles.userCard}>
        <View style={styles.userHeader}>
          <View style={[styles.roleIcon, { backgroundColor: roleColor + "15" }]}>
            <Feather name={roleIcon} size={18} color={roleColor} />
          </View>
          <View style={styles.userInfo}>
            <ThemedText style={styles.userName}>{user.name}</ThemedText>
            <ThemedText style={styles.userEmail}>{user.email}</ThemedText>
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
          {user.branchName ? (
            <View style={styles.branchInfo}>
              <Feather name="map-pin" size={12} color={Colors.light.textSecondary} />
              <ThemedText style={styles.branchText}>{user.branchName}</ThemedText>
            </View>
          ) : null}
          {user.assignedServiceIds && user.assignedServiceIds.length > 0 ? (
            <View style={styles.serviceInfo}>
              <Feather name="tag" size={12} color={Colors.light.textSecondary} />
              <ThemedText style={styles.serviceText}>
                {user.assignedServiceIds.length} service(s) assigned
              </ThemedText>
            </View>
          ) : null}
        </View>

        <View style={styles.userActions}>
          <Pressable style={styles.actionBtn} onPress={onEdit}>
            <Feather name="edit-2" size={16} color={Colors.light.primary} />
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
  const [selectedServices, setSelectedServices] = useState<string[]>(editingUser?.assignedServiceIds || []);

  React.useEffect(() => {
    if (editingUser) {
      setName(editingUser.name);
      setEmail(editingUser.email);
      setPhone(editingUser.phone || "");
      setRole(editingUser.role);
      setBranchId(editingUser.branchId || "");
      setSelectedServices(editingUser.assignedServiceIds || []);
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setRole("front_desk");
      setBranchId("");
      setSelectedServices([]);
    }
  }, [editingUser, visible]);

  const handleSave = () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert("Error", "Name and email are required");
      return;
    }

    const selectedBranch = branches.find((b) => b.id === branchId);

    onSave({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      role,
      branchId: branchId || undefined,
      branchName: selectedBranch?.name,
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
            <Feather name="info" size={14} color={Colors.light.primary} />
            <ThemedText style={styles.roleDescText}>
              {role === "admin" && "Full access to all branches, users, payments, and settings."}
              {role === "location_manager" && "Manage assigned branch settings, reports, and create staff users."}
              {role === "floor_manager" && "Process queue for multiple services in assigned branch."}
              {role === "front_desk" && "Process queue for specific assigned service only."}
            </ThemedText>
          </View>

          {role !== "admin" ? (
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
                      color={branchId === branch.id ? Colors.light.primary : Colors.light.textSecondary}
                    />
                    <ThemedText style={[
                      styles.branchOptionText,
                      branchId === branch.id && { color: Colors.light.primary },
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
            <ThemedText style={styles.headerSubtitle}>{users.length} users</ThemedText>
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
                filterRole === filter.key && styles.filterChipActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setFilterRole(filter.key);
              }}
            >
              <ThemedText
                style={[
                  styles.filterText,
                  filterRole === filter.key && styles.filterTextActive,
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
            <Feather name="users" size={48} color={Colors.light.textSecondary} />
            <ThemedText style={styles.emptyTitle}>No users found</ThemedText>
            <ThemedText style={styles.emptySubtitle}>
              {filterRole === "all" ? "Add your first team member" : `No ${ROLE_LABELS[filterRole as UserRole]}s yet`}
            </ThemedText>
          </View>
        ) : (
          filteredUsers.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              onEdit={() => {
                setEditingUser(user);
                setShowAddModal(true);
              }}
              onToggleStatus={() => handleToggleStatus(user)}
              onDelete={() => handleDeleteUser(user)}
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
    backgroundColor: Colors.light.primary,
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
  },
  branchText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
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
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderRadius: BorderRadius.md,
    alignItems: "center",
    gap: Spacing.xs,
  },
  roleOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.light.textSecondary,
  },
  roleDescription: {
    flexDirection: "row",
    backgroundColor: Colors.light.primary + "10",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  roleDescText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.primary,
    lineHeight: 18,
  },
  branchOptions: {
    gap: Spacing.sm,
  },
  branchOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  branchOptionActive: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary + "08",
  },
  branchOptionText: {
    fontSize: 14,
    color: Colors.light.text,
  },
  serviceOptions: {
    gap: Spacing.sm,
  },
  serviceOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  serviceOptionActive: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary + "08",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxActive: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary,
  },
  serviceOptionText: {
    fontSize: 14,
    color: Colors.light.text,
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
