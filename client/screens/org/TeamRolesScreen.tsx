import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  useColorScheme,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { apiRequest, getErrorMessage, getApiUrl } from "@/lib/query-client";
import {
  PERMISSION_CATALOG,
  type PermissionGroup,
  type PermissionDef,
} from "@shared/permissions";
import { useOrganization } from "@/contexts/OrganizationContext";

interface OrgRole {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  organizationId: string | null;
  permissionCount: number;
  userCount: number;
}

function flattenPerms(nodes: Array<PermissionGroup | PermissionDef>): PermissionDef[] {
  const out: PermissionDef[] = [];
  for (const n of nodes) {
    if (n.type === "perm") out.push(n);
    else out.push(...flattenPerms(n.children));
  }
  return out;
}

function permsInGroup(g: PermissionGroup): string[] {
  return flattenPerms(g.children).map((p) => p.key);
}

export default function TeamRolesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const { hasPermission, currentUser, isSuperAdmin } = useOrganization();

  const isOwner = isSuperAdmin || currentUser?.role === "admin";
  const canEdit = isOwner && hasPermission("org.users.assign_role");

  const rolesQuery = useQuery<{ roles: OrgRole[] }>({
    queryKey: ["/api/org/roles"],
    staleTime: 15_000,
  });

  const [search, setSearch] = useState("");
  const [editingRole, setEditingRole] = useState<OrgRole | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteRole, setDeleteRole] = useState<OrgRole | null>(null);

  const roles = rolesQuery.data?.roles ?? [];
  const filtered = useMemo(
    () =>
      search.trim()
        ? roles.filter(
            (r) =>
              r.name.toLowerCase().includes(search.toLowerCase()) ||
              r.key.toLowerCase().includes(search.toLowerCase()),
          )
        : roles,
    [roles, search],
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + Spacing.xl },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontSize: 16, fontWeight: "700" }}>Roles & Permissions</ThemedText>
            <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
              Manage role templates and what each role can do
            </ThemedText>
          </View>
          {canEdit ? (
            <Button
              title="New role"
              onPress={() => setShowCreate(true)}
              style={[styles.primaryBtn, { backgroundColor: BrandColors.primaryDark }]}
              testID="button-create-role"
            />
          ) : null}
        </View>

        <View style={[styles.searchBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.textSecondary} />
          <TextInput
            placeholder="Search roles…"
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: colors.text }]}
            testID="input-search-roles"
          />
        </View>

        {rolesQuery.isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={BrandColors.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Feather name="users" size={28} color={colors.textSecondary} />
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>No roles found</ThemedText>
            <ThemedText style={[styles.emptySub, { color: colors.textSecondary }]}>
              {search.trim() ? "Try a different search term" : "Create a custom role to get started"}
            </ThemedText>
          </Card>
        ) : (
          filtered.map((r) => (
            <Card key={r.id} style={styles.roleCard}>
              <View style={styles.roleHeader}>
                <View style={[styles.roleIcon, { backgroundColor: r.isSystem ? "#7C3AED20" : "#05966920" }]}>
                  <Feather name={r.isSystem ? "shield" : "users"} size={18} color={r.isSystem ? "#7C3AED" : "#059669"} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="h4" testID={`text-role-${r.key}`}>{r.name}</ThemedText>
                  <ThemedText style={[styles.roleMeta, { color: colors.textSecondary }]}>
                    {r.isSystem ? "System role" : "Custom · This organisation"}
                    {" · "}
                    {r.permissionCount} permission{r.permissionCount === 1 ? "" : "s"}
                    {" · "}
                    {r.userCount} user{r.userCount === 1 ? "" : "s"}
                  </ThemedText>
                </View>
              </View>

              {r.description ? (
                <ThemedText style={[styles.roleDesc, { color: colors.textSecondary }]}>{r.description}</ThemedText>
              ) : null}

              <View style={styles.roleActions}>
                <Pressable
                  onPress={() => setEditingRole(r)}
                  style={[styles.actionBtn, { borderColor: colors.border }]}
                  testID={`button-edit-${r.key}`}
                >
                  <Feather name={r.isSystem ? "eye" : "edit-2"} size={14} color={colors.text} />
                  <ThemedText style={[styles.actionLabel, { color: colors.text }]}>
                    {r.isSystem ? "View permissions" : "Edit permissions"}
                  </ThemedText>
                </Pressable>
                {canEdit && !r.isSystem ? (
                  <Pressable
                    onPress={() => setDeleteRole(r)}
                    style={[styles.actionBtn, { borderColor: "#DC262640" }]}
                    testID={`button-delete-${r.key}`}
                  >
                    <Feather name="trash-2" size={14} color="#DC2626" />
                    <ThemedText style={[styles.actionLabel, { color: "#DC2626" }]}>Delete</ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {showCreate && (
        <CreateRoleModal
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ["/api/org/roles"] });
          }}
          existingRoles={roles}
          colors={colors}
        />
      )}

      {editingRole && (
        <PermissionsModal
          role={editingRole}
          visible={!!editingRole}
          onClose={() => setEditingRole(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/org/roles"] });
            queryClient.invalidateQueries({ queryKey: ["/api/org/me/permissions"] });
          }}
          isOwner={isOwner}
          colors={colors}
        />
      )}

      {deleteRole && (
        <DeleteRoleModal
          role={deleteRole}
          allRoles={roles}
          visible={!!deleteRole}
          onClose={() => setDeleteRole(null)}
          onDeleted={() => {
            setDeleteRole(null);
            queryClient.invalidateQueries({ queryKey: ["/api/org/roles"] });
          }}
          colors={colors}
        />
      )}
    </ThemedView>
  );
}

// ---------- CREATE MODAL ----------
function CreateRoleModal({
  visible,
  onClose,
  onCreated,
  existingRoles,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  existingRoles: OrgRole[];
  colors: typeof Colors.light;
}) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cloneFromRoleId, setCloneFromRoleId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter a role name");
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/org/roles", {
        name: name.trim(),
        description: description.trim() || null,
        cloneFromRoleId: cloneFromRoleId || undefined,
      });
      onCreated();
    } catch (err) {
      Alert.alert("Failed to create role", getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={styles.modalContainer}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + Spacing.sm, borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose}><Feather name="x" size={22} color={colors.text} /></Pressable>
          <ThemedText type="h4">New role</ThemedText>
          <View style={{ width: 22 }} />
        </View>
        <KeyboardAwareScrollViewCompat contentContainerStyle={{ padding: Spacing.lg }}>
          <ThemedText style={styles.fieldLabel}>Name</ThemedText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Branch Supervisor"
            placeholderTextColor={colors.textSecondary}
            style={[styles.field, { borderColor: colors.border, color: colors.text, backgroundColor: isDark ? colors.surfaceMuted : "#F7F5FE" }]}
            testID="input-new-role-name"
          />
          <ThemedText style={styles.fieldLabel}>Description (optional)</ThemedText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What this role can do"
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[styles.field, styles.fieldMultiline, { borderColor: colors.border, color: colors.text, backgroundColor: isDark ? colors.surfaceMuted : "#F7F5FE" }]}
            testID="input-new-role-desc"
          />
          <ThemedText style={styles.fieldLabel}>Start with permissions from</ThemedText>
          <View style={{ gap: Spacing.xs }}>
            <Pressable
              onPress={() => setCloneFromRoleId("")}
              style={[styles.cloneRow, {
                borderColor: cloneFromRoleId === "" ? BrandColors.primary : colors.border,
                backgroundColor: cloneFromRoleId === "" ? BrandColors.primary + "12" : (isDark ? colors.surfaceMuted : "#F7F5FE"),
              }]}
            >
              <Feather
                name={cloneFromRoleId === "" ? "check-circle" : "circle"}
                size={16}
                color={cloneFromRoleId === "" ? BrandColors.primary : colors.textSecondary}
              />
              <ThemedText style={{ color: colors.text }}>Empty (no permissions)</ThemedText>
            </Pressable>
            {existingRoles.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => setCloneFromRoleId(r.id)}
                style={[styles.cloneRow, {
                  borderColor: cloneFromRoleId === r.id ? BrandColors.primary : colors.border,
                  backgroundColor: cloneFromRoleId === r.id ? BrandColors.primary + "12" : (isDark ? colors.surfaceMuted : "#F7F5FE"),
                }]}
              >
                <Feather
                  name={cloneFromRoleId === r.id ? "check-circle" : "circle"}
                  size={16}
                  color={cloneFromRoleId === r.id ? BrandColors.primary : colors.textSecondary}
                />
                <ThemedText style={{ color: colors.text, flex: 1 }}>{r.name}</ThemedText>
                <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>{r.permissionCount} perms</ThemedText>
              </Pressable>
            ))}
          </View>
        </KeyboardAwareScrollViewCompat>
        <View style={[styles.modalFooter, { borderTopColor: colors.border, paddingBottom: insets.bottom + Spacing.sm }]}>
          <Button title="Cancel" onPress={onClose} variant="secondary" style={{ flex: 1 }} />
          <Button title={busy ? "Creating…" : "Create role"} onPress={handleSubmit} disabled={busy} style={{ flex: 1 }} testID="button-submit-create-role" />
        </View>
      </ThemedView>
    </Modal>
  );
}

// ---------- PERMISSIONS MODAL ----------
function PermissionsModal({
  role,
  visible,
  onClose,
  onSaved,
  isOwner,
  colors,
}: {
  role: OrgRole;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  isOwner: boolean;
  colors: typeof Colors.light;
}) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const editable = isOwner && !role.isSystem;

  const permsQuery = useQuery<{ role: OrgRole; permissions: string[] }>({
    queryKey: ["/api/org/roles", role.id, "permissions"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/org/roles/${role.id}/permissions`);
      return res.json();
    },
    staleTime: 0,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (permsQuery.data) setSelected(new Set(permsQuery.data.permissions));
  }, [permsQuery.data]);

  const toggle = (k: string) => {
    if (!editable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const toggleGroup = (g: PermissionGroup) => {
    if (!editable) return;
    const keys = permsInGroup(g);
    const allOn = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const toggleExpand = (gKey: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(gKey)) next.delete(gKey);
      else next.add(gKey);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await apiRequest("PUT", `/api/org/roles/${role.id}/permissions`, {
        permissions: Array.from(selected),
      });
      onSaved();
      onClose();
    } catch (err) {
      Alert.alert("Failed to save", getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const renderGroup = (g: PermissionGroup, depth = 0): React.ReactNode => {
    const keys = permsInGroup(g);
    const onCount = keys.filter((k) => selected.has(k)).length;
    const isOpen = expanded.has(g.key) || depth > 0;
    const hasMatch = !search.trim() || g.label.toLowerCase().includes(search.toLowerCase()) ||
      flattenPerms(g.children).some((p) => p.key.includes(search.toLowerCase()) || p.label.toLowerCase().includes(search.toLowerCase()));
    if (!hasMatch) return null;
    return (
      <View key={g.key} style={{ marginBottom: Spacing.xs }}>
        <Pressable
          onPress={() => toggleExpand(g.key)}
          style={[styles.groupRow, { paddingLeft: Spacing.md + depth * Spacing.md, borderColor: colors.border }]}
        >
          <Feather name={isOpen ? "chevron-down" : "chevron-right"} size={16} color={colors.textSecondary} />
          <ThemedText style={[styles.groupLabel, { color: colors.text }]}>{g.label}</ThemedText>
          <Pressable
            onPress={() => toggleGroup(g)}
            disabled={!editable}
            style={[styles.groupToggle, { backgroundColor: onCount === keys.length ? BrandColors.primary : (onCount > 0 ? "#F59E0B" : colors.surfaceMuted) }]}
          >
            <ThemedText style={{ color: onCount > 0 ? "#fff" : colors.textSecondary, fontSize: 11, fontWeight: "600" }}>
              {onCount}/{keys.length}
            </ThemedText>
          </Pressable>
        </Pressable>
        {isOpen && (
          <View style={{ paddingLeft: Spacing.md + depth * Spacing.md }}>
            {g.children.map((c) => {
              if (c.type === "group") return renderGroup(c, depth + 1);
              const matchesSearch = !search.trim() ||
                c.key.toLowerCase().includes(search.toLowerCase()) ||
                c.label.toLowerCase().includes(search.toLowerCase());
              if (!matchesSearch) return null;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => toggle(c.key)}
                  disabled={!editable}
                  style={[styles.permRow, { borderColor: colors.border }]}
                >
                  <Feather
                    name={selected.has(c.key) ? "check-square" : "square"}
                    size={18}
                    color={selected.has(c.key) ? BrandColors.primary : colors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ color: colors.text, fontSize: 14 }}>{c.label}</ThemedText>
                    <ThemedText style={{ color: colors.textSecondary, fontSize: 11 }}>{c.key}</ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={styles.modalContainer}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + Spacing.sm, borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose}><Feather name="x" size={22} color={colors.text} /></Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <ThemedText type="h4">{role.name}</ThemedText>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
              {role.isSystem ? "System role · read-only" : "Custom role · editable"}
            </ThemedText>
          </View>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ padding: Spacing.md }}>
          <View style={[styles.searchBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, marginBottom: 0 }]}>
            <Feather name="search" size={16} color={colors.textSecondary} />
            <TextInput
              placeholder="Filter permissions…"
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              style={[styles.searchInput, { color: colors.text }]}
            />
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: insets.bottom + 100 }}>
          {permsQuery.isLoading ? (
            <ActivityIndicator color={BrandColors.primary} />
          ) : (
            PERMISSION_CATALOG.map((g) => renderGroup(g))
          )}
        </ScrollView>
        {editable && (
          <View style={[styles.modalFooter, { borderTopColor: colors.border, paddingBottom: insets.bottom + Spacing.sm }]}>
            <Button title="Cancel" onPress={onClose} variant="secondary" style={{ flex: 1 }} />
            <Button
              title={busy ? "Saving…" : `Save (${selected.size})`}
              onPress={save}
              disabled={busy}
              style={{ flex: 1 }}
              testID="button-save-permissions"
            />
          </View>
        )}
      </ThemedView>
    </Modal>
  );
}

// ---------- DELETE MODAL ----------
function DeleteRoleModal({
  role,
  allRoles,
  visible,
  onClose,
  onDeleted,
  colors,
}: {
  role: OrgRole;
  allRoles: OrgRole[];
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
  colors: typeof Colors.light;
}) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const styles = useMemo(() => createStyles(colors), [colors]);
  const candidates = allRoles.filter((r) => r.id !== role.id && r.key !== "admin" && r.key !== "super_admin");
  const [fallbackId, setFallbackId] = useState<string>(candidates[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const body = role.userCount > 0 ? { fallbackRoleId: fallbackId } : {};
      await apiRequest("DELETE", `/api/org/roles/${role.id}`, body);
      onDeleted();
    } catch (err) {
      Alert.alert("Failed to delete", getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Card style={[styles.confirmCard, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Feather name="alert-triangle" size={28} color="#DC2626" />
          <ThemedText type="h4" style={{ marginTop: Spacing.sm }}>Delete role?</ThemedText>
          <ThemedText style={{ color: colors.textSecondary, textAlign: "center", marginTop: Spacing.xs }}>
            "{role.name}" will be permanently deleted.
            {role.userCount > 0 ? ` ${role.userCount} user(s) will be reassigned.` : ""}
          </ThemedText>

          {role.userCount > 0 && (
            <View style={{ width: "100%", marginTop: Spacing.md }}>
              <ThemedText style={styles.fieldLabel}>Reassign users to:</ThemedText>
              <ScrollView style={{ maxHeight: 200 }}>
                {candidates.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setFallbackId(c.id)}
                    style={[styles.cloneRow, {
                      borderColor: fallbackId === c.id ? BrandColors.primary : colors.border,
                      backgroundColor: fallbackId === c.id ? BrandColors.primary + "12" : (isDark ? colors.surfaceMuted : "#F7F5FE"),
                    }]}
                  >
                    <Feather
                      name={fallbackId === c.id ? "check-circle" : "circle"}
                      size={16}
                      color={fallbackId === c.id ? BrandColors.primary : colors.textSecondary}
                    />
                    <ThemedText style={{ color: colors.text }}>{c.name}</ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.md, width: "100%" }}>
            <Button title="Cancel" onPress={onClose} variant="secondary" style={{ flex: 1 }} />
            <Button
              title={busy ? "Deleting…" : "Delete"}
              onPress={submit}
              disabled={busy || (role.userCount > 0 && !fallbackId)}
              style={{ flex: 1, backgroundColor: "#DC2626" }}
              testID="button-confirm-delete-role"
            />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const createStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: Spacing.lg, gap: Spacing.md },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.sm },
    subtitle: { fontSize: 13, marginTop: 2 },
    primaryBtn: { paddingHorizontal: Spacing.md },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      marginBottom: Spacing.sm,
    },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 6 },
    loadingBox: { padding: Spacing.xl, alignItems: "center" },
    emptyCard: { alignItems: "center", padding: Spacing.xl, gap: Spacing.xs },
    emptyTitle: { fontSize: 16, fontWeight: "600" },
    emptySub: { fontSize: 13, textAlign: "center" },
    roleCard: { padding: Spacing.md, gap: Spacing.sm },
    roleHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
    roleIcon: {
      width: 36, height: 36, borderRadius: 10,
      alignItems: "center", justifyContent: "center",
    },
    roleMeta: { fontSize: 12, marginTop: 2 },
    roleDesc: { fontSize: 13 },
    roleActions: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.xs },
    actionBtn: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: Spacing.sm, paddingVertical: 8,
      borderWidth: 1, borderRadius: BorderRadius.sm,
    },
    actionLabel: { fontSize: 13, fontWeight: "500" },

    modalContainer: { flex: 1 },
    modalHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, borderBottomWidth: 1,
    },
    modalFooter: {
      flexDirection: "row", gap: Spacing.sm,
      padding: Spacing.md, borderTopWidth: 1,
    },
    fieldLabel: { fontSize: 13, fontWeight: "500", marginBottom: 6, marginTop: Spacing.sm },
    field: {
      borderWidth: 1, borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.sm, paddingVertical: 10, fontSize: 14,
    },
    fieldMultiline: { minHeight: 70, textAlignVertical: "top" },
    cloneRow: {
      flexDirection: "row", alignItems: "center", gap: Spacing.sm,
      borderWidth: 1, borderRadius: BorderRadius.sm,
      padding: Spacing.sm,
    },

    groupRow: {
      flexDirection: "row", alignItems: "center", gap: Spacing.xs,
      paddingVertical: 10, paddingRight: Spacing.sm,
      borderBottomWidth: 1,
    },
    groupLabel: { flex: 1, fontWeight: "600", fontSize: 14 },
    groupToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    permRow: {
      flexDirection: "row", alignItems: "center", gap: Spacing.sm,
      paddingVertical: 10, paddingHorizontal: Spacing.sm,
      borderBottomWidth: 1,
    },

    overlay: {
      flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center", justifyContent: "center", padding: Spacing.lg,
    },
    confirmCard: {
      width: "100%", maxWidth: 420,
      padding: Spacing.lg, alignItems: "center",
    },
  });
