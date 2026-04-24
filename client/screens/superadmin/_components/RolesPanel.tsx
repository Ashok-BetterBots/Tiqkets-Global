import React, { useState, useMemo } from "react";
import { View, StyleSheet, Pressable, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { apiRequest, getErrorMessage } from "@/lib/query-client";
import { DataTable, StatusPill, Column } from "./DataTable";
import { Modal, PrimaryBtn } from "./Modal";

interface RoleRow {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  scope: "platform" | "organization";
  permissionCount: number;
  userCount: number;
}

interface FormState {
  name: string;
  description: string;
  scope: "platform" | "organization";
  cloneFromRoleId: string | null;
}

const emptyForm: FormState = {
  name: "",
  description: "",
  scope: "organization",
  cloneFromRoleId: null,
};

export function RolesPanel({ onOpenMatrixForRole }: { onOpenMatrixForRole?: (roleId: string) => void }) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<RoleRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState<RoleRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editForm, setEditForm] = useState<{ name: string; description: string }>({
    name: "",
    description: "",
  });
  const [fallbackRoleId, setFallbackRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const rolesQuery = useQuery<{ roles: RoleRow[] }>({
    queryKey: ["/api/superadmin/roles"],
  });

  const roles = rolesQuery.data?.roles ?? [];

  const createMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const res = await apiRequest("POST", "/api/superadmin/roles", {
        name: data.name,
        description: data.description || null,
        scope: data.scope,
        cloneFromRoleId: data.cloneFromRoleId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/audit-logs"] });
      setCreateOpen(false);
      setForm(emptyForm);
      setError(null);
      setToast("Role created");
      setTimeout(() => setToast(null), 2500);
    },
    onError: (err: unknown) => setError(getErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description: string }) => {
      const res = await apiRequest("PATCH", `/api/superadmin/roles/${id}`, {
        name,
        description: description || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/audit-logs"] });
      setEditOpen(null);
      setError(null);
      setToast("Role updated");
      setTimeout(() => setToast(null), 2500);
    },
    onError: (err: unknown) => setError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, fallback }: { id: string; fallback: string | null }) => {
      const url = fallback
        ? `/api/superadmin/roles/${id}?fallbackRoleId=${encodeURIComponent(fallback)}`
        : `/api/superadmin/roles/${id}`;
      const res = await apiRequest("DELETE", url);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/audit-logs"] });
      setDeleteOpen(null);
      setFallbackRoleId(null);
      setError(null);
      setToast("Role deleted");
      setTimeout(() => setToast(null), 2500);
    },
    onError: (err: unknown) => setError(getErrorMessage(err)),
  });

  const cols: Column<RoleRow>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Role",
        flex: 1.4,
        render: (r) => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ThemedText style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>{r.name}</ThemedText>
                {r.isSystem ? <StatusPill label="SYSTEM" tone="info" /> : null}
              </View>
              {r.description ? (
                <ThemedText
                  style={{ color: theme.mutedText, fontSize: 11, marginTop: 2 }}
                  numberOfLines={1}
                >
                  {r.description}
                </ThemedText>
              ) : null}
              <ThemedText
                style={{ color: theme.mutedText, fontSize: 10, marginTop: 2, fontFamily: "Menlo, Consolas, monospace" }}
              >
                {r.key}
              </ThemedText>
            </View>
          </View>
        ),
      },
      {
        key: "scope",
        label: "Scope",
        flex: 0.7,
        render: (r) => <StatusPill label={r.scope} tone={r.scope === "platform" ? "info" : "neutral"} />,
      },
      {
        key: "permissionCount",
        label: "Permissions",
        flex: 0.7,
        align: "right",
        render: (r) => (
          <ThemedText style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>
            {r.permissionCount}
          </ThemedText>
        ),
      },
      {
        key: "userCount",
        label: "Users",
        flex: 0.6,
        align: "right",
        render: (r) => (
          <ThemedText style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>
            {r.userCount}
          </ThemedText>
        ),
      },
      {
        key: "actions",
        label: "",
        flex: 1.1,
        align: "right",
        render: (r) => (
          <View style={{ flexDirection: "row", gap: 6 }}>
            {onOpenMatrixForRole ? (
              <Pressable
                onPress={() => onOpenMatrixForRole(r.id)}
                style={[styles.iconBtn, { borderColor: theme.borderSubtle }]}
              >
                <Feather name="grid" size={13} color={theme.text} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                setEditForm({ name: r.name, description: r.description || "" });
                setEditOpen(r);
              }}
              style={[styles.iconBtn, { borderColor: theme.borderSubtle }]}
            >
              <Feather name="edit-2" size={13} color={theme.text} />
            </Pressable>
            <Pressable
              onPress={() => {
                if (r.isSystem) return;
                setFallbackRoleId(null);
                setDeleteOpen(r);
              }}
              disabled={r.isSystem}
              style={[
                styles.iconBtn,
                { borderColor: theme.borderSubtle, opacity: r.isSystem ? 0.35 : 1 },
              ]}
            >
              <Feather name="trash-2" size={13} color={theme.text} />
            </Pressable>
          </View>
        ),
      },
    ],
    [theme, onOpenMatrixForRole],
  );

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: Spacing.md }}>
        <PrimaryBtn label="New Role" icon="plus" onPress={() => { setForm(emptyForm); setError(null); setCreateOpen(true); }} />
      </View>

      {rolesQuery.isLoading ? (
        <View style={{ padding: Spacing.xl, alignItems: "center" }}>
          <ThemedText style={{ color: theme.mutedText }}>Loading roles…</ThemedText>
        </View>
      ) : rolesQuery.isError ? (
        <View style={{ padding: Spacing.xl, alignItems: "center" }}>
          <ThemedText style={{ color: theme.text }}>
            {getErrorMessage(rolesQuery.error)}
          </ThemedText>
        </View>
      ) : (
        <DataTable<RoleRow>
          columns={cols}
          rows={roles}
          searchKeys={["name", "description", "key"]}
          emptyText="No roles yet"
        />
      )}

      {toast ? (
        <View style={[styles.toast, { backgroundColor: theme.text }]}>
          <ThemedText lightColor={theme.surface as string} darkColor={theme.surface as string} style={styles.toastText}>
            {toast}
          </ThemedText>
        </View>
      ) : null}

      <Modal
        visible={createOpen}
        title="New Role"
        subtitle="Create a custom role and assign permissions"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <PrimaryBtn label="Cancel" tone="secondary" onPress={() => setCreateOpen(false)} />
            <PrimaryBtn
              label={createMutation.isPending ? "Creating…" : "Create role"}
              icon="check"
              disabled={createMutation.isPending || !form.name.trim()}
              onPress={() => createMutation.mutate(form)}
            />
          </>
        }
      >
        <Field label="Role name">
          <TextInputField value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Branch Auditor" />
        </Field>
        <Field label="Description (optional)">
          <TextInputField
            value={form.description}
            onChange={(v) => setForm((f) => ({ ...f, description: v }))}
            placeholder="What can people in this role do?"
            multiline
          />
        </Field>
        <Field label="Scope">
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["organization", "platform"] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setForm((f) => ({ ...f, scope: s }))}
                style={[
                  styles.choice,
                  {
                    borderColor: form.scope === s ? BrandColors.primary : theme.borderSubtle,
                    backgroundColor: form.scope === s ? BrandColors.primary + "12" : "transparent",
                  },
                ]}
              >
                <ThemedText style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>
                  {s === "platform" ? "Platform" : "Organization"}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </Field>
        <Field label="Clone permissions from (optional)">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Pressable
              onPress={() => setForm((f) => ({ ...f, cloneFromRoleId: null }))}
              style={[
                styles.choice,
                {
                  borderColor: form.cloneFromRoleId === null ? BrandColors.primary : theme.borderSubtle,
                  backgroundColor: form.cloneFromRoleId === null ? BrandColors.primary + "12" : "transparent",
                },
              ]}
            >
              <ThemedText style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>None</ThemedText>
            </Pressable>
            {roles.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => setForm((f) => ({ ...f, cloneFromRoleId: r.id }))}
                style={[
                  styles.choice,
                  {
                    borderColor: form.cloneFromRoleId === r.id ? BrandColors.primary : theme.borderSubtle,
                    backgroundColor: form.cloneFromRoleId === r.id ? BrandColors.primary + "12" : "transparent",
                  },
                ]}
              >
                <ThemedText style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>{r.name}</ThemedText>
              </Pressable>
            ))}
          </View>
        </Field>
        {error ? <ErrorText text={error} /> : null}
      </Modal>

      <Modal
        visible={!!editOpen}
        title="Edit Role"
        subtitle={editOpen?.isSystem ? "System role: name and description are still editable." : undefined}
        onClose={() => setEditOpen(null)}
        footer={
          <>
            <PrimaryBtn label="Cancel" tone="secondary" onPress={() => setEditOpen(null)} />
            <PrimaryBtn
              label={updateMutation.isPending ? "Saving…" : "Save"}
              icon="check"
              disabled={updateMutation.isPending || !editForm.name.trim()}
              onPress={() => editOpen && updateMutation.mutate({ id: editOpen.id, name: editForm.name, description: editForm.description })}
            />
          </>
        }
      >
        <Field label="Role name">
          <TextInputField value={editForm.name} onChange={(v) => setEditForm((f) => ({ ...f, name: v }))} />
        </Field>
        <Field label="Description">
          <TextInputField value={editForm.description} onChange={(v) => setEditForm((f) => ({ ...f, description: v }))} multiline />
        </Field>
        {error ? <ErrorText text={error} /> : null}
      </Modal>

      <Modal
        visible={!!deleteOpen}
        title="Delete Role"
        subtitle={deleteOpen ? `Permanently remove "${deleteOpen.name}"` : undefined}
        onClose={() => setDeleteOpen(null)}
        footer={
          <>
            <PrimaryBtn label="Cancel" tone="secondary" onPress={() => setDeleteOpen(null)} />
            <PrimaryBtn
              label={deleteMutation.isPending ? "Deleting…" : "Delete"}
              icon="trash-2"
              tone="danger"
              disabled={
                deleteMutation.isPending ||
                (!!deleteOpen && deleteOpen.userCount > 0 && !fallbackRoleId)
              }
              onPress={() =>
                deleteOpen && deleteMutation.mutate({ id: deleteOpen.id, fallback: fallbackRoleId })
              }
            />
          </>
        }
      >
        {deleteOpen && deleteOpen.userCount > 0 ? (
          <>
            <View
              style={[
                styles.warning,
                { backgroundColor: "#FEF3C7", borderColor: "#FCD34D" },
              ]}
            >
              <Feather name="alert-triangle" size={16} color="#92400E" />
              <View style={{ flex: 1 }}>
                <ThemedText style={{ color: "#92400E", fontSize: 13, fontWeight: "700" }}>
                  {deleteOpen.userCount} user{deleteOpen.userCount === 1 ? "" : "s"} are assigned to this role
                </ThemedText>
                <ThemedText style={{ color: "#92400E", fontSize: 12, marginTop: 4 }}>
                  Pick a fallback role to reassign them to before deleting.
                </ThemedText>
              </View>
            </View>
            <Field label="Reassign to">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {roles
                  .filter((r) => r.id !== deleteOpen.id)
                  .map((r) => (
                    <Pressable
                      key={r.id}
                      onPress={() => setFallbackRoleId(r.id)}
                      style={[
                        styles.choice,
                        {
                          borderColor: fallbackRoleId === r.id ? BrandColors.primary : theme.borderSubtle,
                          backgroundColor: fallbackRoleId === r.id ? BrandColors.primary + "12" : "transparent",
                        },
                      ]}
                    >
                      <ThemedText style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>{r.name}</ThemedText>
                    </Pressable>
                  ))}
              </View>
            </Field>
          </>
        ) : (
          <ThemedText style={{ color: theme.text, fontSize: 13 }}>
            This action cannot be undone.
          </ThemedText>
        )}
        {error ? <ErrorText text={error} /> : null}
      </Modal>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <ThemedText style={{ color: theme.textSecondary, fontSize: 12, fontWeight: "600" }}>{label}</ThemedText>
      {children}
    </View>
  );
}

function TextInputField({
  value,
  onChange,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.mutedText}
      multiline={multiline}
      style={[
        styles.input,
        {
          color: theme.text,
          borderColor: theme.borderSubtle,
          backgroundColor: theme.surfaceMuted,
          minHeight: multiline ? 80 : 38,
          textAlignVertical: multiline ? "top" : "center",
        },
      ]}
    />
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <View style={[styles.errorBox, { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" }]}>
      <Feather name="alert-circle" size={14} color="#991B1B" />
      <ThemedText lightColor="#991B1B" darkColor="#991B1B" style={{ fontSize: 12, flex: 1 }}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  choice: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  toast: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    shadowColor: "rgba(0,0,0,0.2)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 6,
  },
  toastText: { fontSize: 13, fontWeight: "600" },
});
