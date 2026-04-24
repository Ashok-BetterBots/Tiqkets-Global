import React, { useMemo, useState, useEffect } from "react";
import { View, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { apiRequest, getErrorMessage } from "@/lib/query-client";
import { SuperCard } from "./SuperCard";
import { PrimaryBtn } from "./Modal";
import type { PermissionGroup, PermissionDef, PermissionSurface } from "@shared/permissions";

interface RoleRow {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
}

type CatalogResponse = {
  catalog: PermissionGroup[];
  allKeys: string[];
};

type RolePermsState = Record<string, Set<string>>; // roleId -> set of perm keys

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

interface Props {
  initialRoleId?: string | null;
}

export function PermissionsMatrix({ initialRoleId }: Props) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [surface, setSurface] = useState<"all" | PermissionSurface>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [perms, setPerms] = useState<RolePermsState>({});
  const [originalPerms, setOriginalPerms] = useState<RolePermsState>({});
  const [highlightRoleId, setHighlightRoleId] = useState<string | null>(initialRoleId ?? null);
  // True role filter: when null, all roles are visible. When non-null, only the
  // listed role IDs are shown as columns in the matrix.
  const [roleFilter, setRoleFilter] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const catalogQuery = useQuery<CatalogResponse>({ queryKey: ["/api/superadmin/permissions/catalog"] });
  const rolesQuery = useQuery<{ roles: RoleRow[] }>({ queryKey: ["/api/superadmin/roles"] });

  const catalog = catalogQuery.data?.catalog ?? [];
  const allRoles = rolesQuery.data?.roles ?? [];
  // Roles displayed in the matrix after applying the role filter.
  const roles = useMemo(
    () => (roleFilter ? allRoles.filter((r) => roleFilter.has(r.id)) : allRoles),
    [allRoles, roleFilter],
  );

  useEffect(() => {
    if (allRoles.length === 0) return;
    let cancelled = false;
    (async () => {
      const fetched: RolePermsState = {};
      await Promise.all(
        allRoles.map(async (r) => {
          try {
            const res = await apiRequest("GET", `/api/superadmin/roles/${r.id}/permissions`);
            const data = await res.json();
            fetched[r.id] = new Set<string>(data.permissions ?? []);
          } catch {
            fetched[r.id] = new Set<string>();
          }
        }),
      );
      if (cancelled) return;
      setPerms(fetched);
      const cloned: RolePermsState = {};
      for (const [id, set] of Object.entries(fetched)) cloned[id] = new Set(set);
      setOriginalPerms(cloned);
    })();
    return () => {
      cancelled = true;
    };
  }, [allRoles]);

  // Auto-expand top-level groups initially
  useEffect(() => {
    if (catalog.length > 0 && expanded.size === 0) {
      setExpanded(new Set(catalog.map((g) => g.key)));
    }
  }, [catalog]);

  // Compute dirty state across ALL roles (not just visible columns) so
  // unsaved changes for filtered-out roles are not silently lost on Save.
  const dirtyRoles = useMemo(() => {
    const out: string[] = [];
    for (const r of allRoles) {
      const a = perms[r.id];
      const b = originalPerms[r.id];
      if (!a || !b) continue;
      if (a.size !== b.size) {
        out.push(r.id);
        continue;
      }
      let same = true;
      for (const k of a) if (!b.has(k)) { same = false; break; }
      if (!same) out.push(r.id);
    }
    return out;
  }, [perms, originalPerms, allRoles]);

  const isDirty = dirtyRoles.length > 0;

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    function filterNode(n: PermissionGroup | PermissionDef): (PermissionGroup | PermissionDef) | null {
      if (n.type === "perm") {
        if (surface !== "all" && n.surface !== "both" && n.surface !== surface) return null;
        if (!q) return n;
        if (n.label.toLowerCase().includes(q) || n.key.toLowerCase().includes(q)) return n;
        return null;
      }
      const filteredChildren = n.children
        .map(filterNode)
        .filter(Boolean) as (PermissionGroup | PermissionDef)[];
      if (filteredChildren.length === 0) return null;
      return { ...n, children: filteredChildren };
    }
    return catalog.map((g) => filterNode(g)).filter(Boolean) as PermissionGroup[];
  }, [catalog, search, surface]);

  function togglePerm(roleId: string, key: string, value: boolean) {
    setPerms((prev) => {
      const next = { ...prev };
      const set = new Set(next[roleId] ?? []);
      if (value) set.add(key);
      else set.delete(key);
      next[roleId] = set;
      return next;
    });
  }

  function toggleGroup(roleId: string, group: PermissionGroup, value: boolean) {
    const keys = permsInGroup(group);
    setPerms((prev) => {
      const next = { ...prev };
      const set = new Set(next[roleId] ?? []);
      for (const k of keys) {
        if (value) set.add(k);
        else set.delete(k);
      }
      next[roleId] = set;
      return next;
    });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        dirtyRoles.map(async (roleId) => {
          await apiRequest("PUT", `/api/superadmin/roles/${roleId}/permissions`, {
            permissions: Array.from(perms[roleId] ?? []),
          });
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/audit-logs"] });
      const cloned: RolePermsState = {};
      for (const [id, set] of Object.entries(perms)) cloned[id] = new Set(set);
      setOriginalPerms(cloned);
      setError(null);
      setToast("Saved permission changes");
      setTimeout(() => setToast(null), 2500);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  function discardChanges() {
    const cloned: RolePermsState = {};
    for (const [id, set] of Object.entries(originalPerms)) cloned[id] = new Set(set);
    setPerms(cloned);
    setError(null);
  }

  const restoreMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const res = await apiRequest("POST", `/api/superadmin/roles/${roleId}/restore-defaults`);
      return res.json();
    },
    onSuccess: (data, roleId) => {
      const newSet = new Set<string>(data.permissions ?? []);
      setPerms((prev) => ({ ...prev, [roleId]: newSet }));
      setOriginalPerms((prev) => ({ ...prev, [roleId]: new Set(newSet) }));
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/audit-logs"] });
      setToast("Defaults restored");
      setTimeout(() => setToast(null), 2500);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  if (catalogQuery.isLoading || rolesQuery.isLoading) {
    return (
      <SuperCard>
        <ThemedText style={{ color: theme.mutedText, padding: Spacing.lg }}>
          Loading permissions matrix…
        </ThemedText>
      </SuperCard>
    );
  }

  if (catalogQuery.isError || rolesQuery.isError) {
    return (
      <SuperCard>
        <ThemedText style={{ color: theme.text, padding: Spacing.lg }}>
          {getErrorMessage(catalogQuery.error || rolesQuery.error)}
        </ThemedText>
      </SuperCard>
    );
  }

  return (
    <View>
      {/* Toolbar */}
      <View style={[styles.toolbar, { borderColor: theme.borderSubtle, backgroundColor: theme.surface }]}>
        <View style={[styles.searchBox, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceMuted }]}>
          <Feather name="search" size={14} color={theme.mutedText} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Filter permissions…"
            placeholderTextColor={theme.mutedText}
            style={{ color: theme.text, fontSize: 13, flex: 1 }}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(["all", "web", "mobile", "both"] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSurface(s)}
              style={[
                styles.chip,
                {
                  borderColor: surface === s ? BrandColors.primary : theme.borderSubtle,
                  backgroundColor: surface === s ? BrandColors.primary + "15" : "transparent",
                },
              ]}
            >
              <ThemedText style={{ fontSize: 11, fontWeight: "700", color: theme.text, textTransform: "uppercase" }}>{s}</ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Role filter row: select which role columns are visible. */}
      <View style={{ height: Spacing.sm }} />
      <View style={[styles.toolbar, { borderColor: theme.borderSubtle, backgroundColor: theme.surface, flexWrap: "wrap" }]}>
        <ThemedText style={{ color: theme.mutedText, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>
          Roles
        </ThemedText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 }}>
          <Pressable
            onPress={() => setRoleFilter(null)}
            style={[
              styles.chip,
              {
                borderColor: roleFilter === null ? BrandColors.primary : theme.borderSubtle,
                backgroundColor: roleFilter === null ? BrandColors.primary + "15" : "transparent",
              },
            ]}
          >
            <ThemedText style={{ fontSize: 11, fontWeight: "700", color: theme.text, textTransform: "uppercase" }}>All</ThemedText>
          </Pressable>
          {allRoles.map((r) => {
            const active = roleFilter !== null && roleFilter.has(r.id);
            return (
              <Pressable
                key={r.id}
                onPress={() => {
                  setRoleFilter((cur) => {
                    const next = new Set(cur ?? []);
                    if (next.has(r.id)) next.delete(r.id);
                    else next.add(r.id);
                    return next.size === 0 ? null : next;
                  });
                }}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? BrandColors.primary : theme.borderSubtle,
                    backgroundColor: active ? BrandColors.primary + "15" : "transparent",
                  },
                ]}
              >
                <ThemedText style={{ fontSize: 11, fontWeight: "700", color: theme.text }} numberOfLines={1}>
                  {r.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ height: Spacing.md }} />

      {/* Matrix table */}
      <SuperCard padded={false}>
        <ScrollView horizontal>
          <View style={{ minWidth: 640 + roles.length * 110 }}>
            {/* Header */}
            <View style={[styles.headerRow, { borderBottomColor: theme.borderSubtle }]}>
              <View style={[styles.featureCol, { borderRightColor: theme.borderSubtle }]}>
                <ThemedText style={[styles.headerText, { color: theme.mutedText }]}>FEATURE</ThemedText>
              </View>
              {roles.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => setHighlightRoleId((cur) => (cur === r.id ? null : r.id))}
                  style={[
                    styles.roleCol,
                    {
                      backgroundColor: highlightRoleId === r.id ? BrandColors.primary + "10" : "transparent",
                      borderRightColor: theme.borderSubtle,
                    },
                  ]}
                >
                  <ThemedText style={[styles.roleHeader, { color: theme.text }]} numberOfLines={1}>
                    {r.name}
                  </ThemedText>
                  {r.isSystem ? (
                    <ThemedText style={{ color: theme.mutedText, fontSize: 9, fontWeight: "700", marginTop: 2 }}>
                      SYSTEM
                    </ThemedText>
                  ) : null}
                  {dirtyRoles.includes(r.id) ? (
                    <View style={[styles.dirtyDot, { backgroundColor: "#F59E0B" }]} />
                  ) : null}
                </Pressable>
              ))}
            </View>

            {/* Body: tree */}
            {filteredCatalog.map((group) => (
              <GroupNode
                key={group.key}
                group={group}
                depth={0}
                roles={roles}
                perms={perms}
                expanded={expanded}
                setExpanded={setExpanded}
                onTogglePerm={togglePerm}
                onToggleGroup={toggleGroup}
                highlightRoleId={highlightRoleId}
              />
            ))}

            {filteredCatalog.length === 0 ? (
              <View style={{ padding: Spacing.xl, alignItems: "center" }}>
                <ThemedText style={{ color: theme.mutedText }}>No permissions match your filter.</ThemedText>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </SuperCard>

      {/* Restore defaults bar */}
      {highlightRoleId ? (
        (() => {
          const r = roles.find((x) => x.id === highlightRoleId);
          if (!r || !r.isSystem) return null;
          return (
            <View style={[styles.restoreBar, { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSubtle }]}>
              <ThemedText style={{ color: theme.text, fontSize: 13, flex: 1 }}>
                Restore <ThemedText style={{ fontWeight: "700", color: theme.text }}>{r.name}</ThemedText> to its default permissions.
              </ThemedText>
              <PrimaryBtn
                tone="secondary"
                label={restoreMutation.isPending ? "Restoring…" : "Restore defaults"}
                icon="rotate-ccw"
                onPress={() => restoreMutation.mutate(r.id)}
                disabled={restoreMutation.isPending}
              />
            </View>
          );
        })()
      ) : null}

      {/* Save bar */}
      {isDirty ? (
        <View style={[styles.saveBar, { backgroundColor: theme.text, borderColor: theme.borderSubtle }]}>
          <ThemedText lightColor={theme.surface as string} darkColor={theme.surface as string} style={{ flex: 1, fontSize: 13, fontWeight: "600" }}>
            {dirtyRoles.length} role{dirtyRoles.length === 1 ? "" : "s"} have unsaved changes
          </ThemedText>
          <PrimaryBtn label="Discard" tone="secondary" onPress={discardChanges} />
          <PrimaryBtn
            label={saveMutation.isPending ? "Saving…" : "Save changes"}
            icon="check"
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          />
        </View>
      ) : null}

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" }]}>
          <Feather name="alert-circle" size={14} color="#991B1B" />
          <ThemedText lightColor="#991B1B" darkColor="#991B1B" style={{ fontSize: 12, flex: 1 }}>
            {error}
          </ThemedText>
        </View>
      ) : null}

      {toast ? (
        <View style={[styles.toast, { backgroundColor: theme.text }]}>
          <ThemedText lightColor={theme.surface as string} darkColor={theme.surface as string} style={styles.toastText}>
            {toast}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

interface GroupProps {
  group: PermissionGroup;
  depth: number;
  roles: RoleRow[];
  perms: RolePermsState;
  expanded: Set<string>;
  setExpanded: (s: Set<string>) => void;
  onTogglePerm: (roleId: string, key: string, value: boolean) => void;
  onToggleGroup: (roleId: string, group: PermissionGroup, value: boolean) => void;
  highlightRoleId: string | null;
}

function GroupNode(props: GroupProps) {
  const { theme } = useTheme();
  const { group, depth, roles, perms, expanded, setExpanded, onTogglePerm, onToggleGroup, highlightRoleId } = props;
  const isExpanded = expanded.has(group.key);
  const groupKeys = permsInGroup(group);

  function toggleExpand() {
    const next = new Set(expanded);
    if (next.has(group.key)) next.delete(group.key);
    else next.add(group.key);
    setExpanded(next);
  }

  function getGroupState(roleId: string): "all" | "some" | "none" {
    const set = perms[roleId];
    if (!set) return "none";
    let count = 0;
    for (const k of groupKeys) if (set.has(k)) count++;
    if (count === 0) return "none";
    if (count === groupKeys.length) return "all";
    return "some";
  }

  return (
    <View>
      <View style={[styles.row, { borderBottomColor: theme.borderSubtle, backgroundColor: depth === 0 ? theme.surfaceMuted : "transparent" }]}>
        <Pressable
          onPress={toggleExpand}
          style={[styles.featureCol, { paddingLeft: 16 + depth * 18, borderRightColor: theme.borderSubtle, flexDirection: "row", alignItems: "center", gap: 8 }]}
        >
          <Feather name={isExpanded ? "chevron-down" : "chevron-right"} size={14} color={theme.mutedText} />
          <ThemedText style={{ color: theme.text, fontSize: 13, fontWeight: depth === 0 ? "700" : "600", flex: 1 }} numberOfLines={1}>
            {group.label}
          </ThemedText>
        </Pressable>
        {roles.map((r) => {
          const state = getGroupState(r.id);
          return (
            <View
              key={r.id}
              style={[
                styles.roleCol,
                {
                  backgroundColor: highlightRoleId === r.id ? BrandColors.primary + "10" : "transparent",
                  borderRightColor: theme.borderSubtle,
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <TriCheckbox
                state={state}
                onPress={() => onToggleGroup(r.id, group, state !== "all")}
              />
            </View>
          );
        })}
      </View>

      {isExpanded
        ? group.children.map((child) =>
            child.type === "group" ? (
              <GroupNode
                key={child.key}
                group={child}
                depth={depth + 1}
                roles={roles}
                perms={perms}
                expanded={expanded}
                setExpanded={setExpanded}
                onTogglePerm={onTogglePerm}
                onToggleGroup={onToggleGroup}
                highlightRoleId={highlightRoleId}
              />
            ) : (
              <View key={child.key} style={[styles.row, { borderBottomColor: theme.borderSubtle }]}>
                <View style={[styles.featureCol, { paddingLeft: 32 + depth * 18, borderRightColor: theme.borderSubtle, justifyContent: "center" }]}>
                  <ThemedText style={{ color: theme.text, fontSize: 12 }} numberOfLines={1}>
                    {child.label}
                  </ThemedText>
                  <ThemedText style={{ color: theme.mutedText, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                    {child.key}
                  </ThemedText>
                </View>
                {roles.map((r) => {
                  const checked = perms[r.id]?.has(child.key) ?? false;
                  return (
                    <View
                      key={r.id}
                      style={[
                        styles.roleCol,
                        {
                          backgroundColor: highlightRoleId === r.id ? BrandColors.primary + "10" : "transparent",
                          borderRightColor: theme.borderSubtle,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <TriCheckbox
                        state={checked ? "all" : "none"}
                        onPress={() => onTogglePerm(r.id, child.key, !checked)}
                      />
                    </View>
                  );
                })}
              </View>
            ),
          )
        : null}
    </View>
  );
}

function TriCheckbox({ state, onPress }: { state: "all" | "some" | "none"; onPress: () => void }) {
  const { theme } = useTheme();
  const checked = state === "all";
  const indeterminate = state === "some";
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.checkbox,
        {
          borderColor: checked || indeterminate ? BrandColors.primary : theme.borderSubtle,
          backgroundColor: checked ? BrandColors.primary : indeterminate ? BrandColors.primary + "30" : "transparent",
        },
      ]}
    >
      {checked ? <Feather name="check" size={12} color="#FFFFFF" /> : null}
      {indeterminate ? <View style={styles.indeterminateBar} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: Spacing.md,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 260,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    flex: 1,
    maxWidth: 360,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    minHeight: 44,
  },
  featureCol: {
    width: 320,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRightWidth: 1,
  },
  roleCol: {
    width: 110,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRightWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  headerText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  roleHeader: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  indeterminateBar: {
    width: 8,
    height: 2,
    backgroundColor: BrandColors.primary,
    borderRadius: 1,
  },
  saveBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: 14,
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  restoreBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: 12,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  dirtyDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  toast: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
  },
  toastText: { fontSize: 13, fontWeight: "600" },
});
