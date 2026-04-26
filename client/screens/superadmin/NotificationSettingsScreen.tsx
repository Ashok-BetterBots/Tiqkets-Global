import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Audio } from "expo-av";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";
import { SUPPORTED_LANGUAGES, getLanguage } from "@shared/languages";

type QueueMode = "fifo" | "selective" | "checkin" | "multistage" | "dinein" | "takeaway";

interface SettingRow {
  queueMode: QueueMode;
  alertSoundUrl: string | null;
  templateEn: string;
  templateAr: string;
  templates?: Record<string, string>;
  isCustom: boolean;
  updatedAt: string | null;
}

interface ApiResponse {
  settings: SettingRow[];
  variables: string[];
  languages?: { code: string; label: string; bcp47: string; rtl?: boolean }[];
  defaultTemplates?: Record<string, { en: string; ar: string }>;
}

const QUEUE_LABELS: Record<QueueMode, string> = {
  fifo: "First In First Out (FIFO)",
  selective: "Selective Service",
  checkin: "Check-in / Reception",
  multistage: "Multi-stage",
  dinein: "Dine-in",
  takeaway: "Takeaway",
};

const QUEUE_DESCRIPTIONS: Record<QueueMode, string> = {
  fifo: "Standard queue. Tickets called in order.",
  selective: "Customer picks a service when joining the queue.",
  checkin: "Front-desk check-in flow.",
  multistage: "Tickets move through several stages.",
  dinein: "Restaurant table booking.",
  takeaway: "Pickup orders.",
};

interface Draft {
  templates: Record<string, string>;
  soundUrl: string | null;
}

export default function NotificationSettingsScreen() {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const isWeb = Platform.OS === "web";

  const query = useQuery<ApiResponse>({
    queryKey: ["/api/superadmin/notification-settings"],
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [activeLangByMode, setActiveLangByMode] = useState<Record<string, string>>({});
  const [savingMode, setSavingMode] = useState<string | null>(null);
  const [uploadingMode, setUploadingMode] = useState<string | null>(null);
  const [statusByMode, setStatusByMode] = useState<Record<string, string>>({});
  const playerRef = useRef<Audio.Sound | null>(null);

  // Hydrate drafts from server.
  useEffect(() => {
    if (!query.data) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const r of query.data.settings) {
        if (!next[r.queueMode]) {
          const tmap: Record<string, string> = { ...(r.templates || {}) };
          if (r.templateEn && !tmap.en) tmap.en = r.templateEn;
          if (r.templateAr && !tmap.ar) tmap.ar = r.templateAr;
          next[r.queueMode] = {
            templates: tmap,
            soundUrl: r.alertSoundUrl,
          };
        }
      }
      return next;
    });
  }, [query.data]);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.unloadAsync().catch(() => {});
        playerRef.current = null;
      }
    };
  }, []);

  const variables = query.data?.variables || [
    "{ticketNumber}",
    "{customerName}",
    "{customerNameTail}",
    "{desk}",
    "{table}",
    "{stage}",
    "{service}",
  ];

  const supportedLanguages = useMemo(() => {
    if (query.data?.languages && query.data.languages.length > 0) return query.data.languages;
    return SUPPORTED_LANGUAGES;
  }, [query.data?.languages]);

  const upsertMutation = useMutation({
    mutationFn: async (vars: { queueMode: string; templates: Record<string, string>; alertSoundUrl: string | null }) => {
      const res = await apiRequest(
        "PUT",
        `/api/superadmin/notification-settings/${vars.queueMode}`,
        {
          templateEn: vars.templates.en || "",
          templateAr: vars.templates.ar || "",
          templates: vars.templates,
          alertSoundUrl: vars.alertSoundUrl,
        },
      );
      return res.json();
    },
    onSuccess: (_data, vars) => {
      setStatusByMode((s) => ({ ...s, [vars.queueMode]: "Saved" }));
      qc.invalidateQueries({ queryKey: ["/api/superadmin/notification-settings"] });
      setTimeout(() => {
        setStatusByMode((s) => {
          const next = { ...s };
          if (next[vars.queueMode] === "Saved") delete next[vars.queueMode];
          return next;
        });
      }, 2500);
    },
    onError: (_e, vars) => {
      setStatusByMode((s) => ({ ...s, [vars.queueMode]: "Save failed" }));
    },
    onSettled: () => setSavingMode(null),
  });

  const handleSave = (mode: QueueMode) => {
    const d = drafts[mode];
    if (!d) return;
    setSavingMode(mode);
    upsertMutation.mutate({
      queueMode: mode,
      templates: d.templates,
      alertSoundUrl: d.soundUrl,
    });
  };

  const handleResetSound = (mode: QueueMode) => {
    setDrafts((p) => ({
      ...p,
      [mode]: { ...(p[mode] || { templates: {}, soundUrl: null }), soundUrl: null },
    }));
  };

  const handleUploadFile = async (mode: QueueMode, file: File) => {
    setUploadingMode(mode);
    setStatusByMode((s) => ({ ...s, [mode]: "Uploading…" }));
    try {
      const dataBase64 = await fileToBase64(file);
      const res = await apiRequest(
        "POST",
        `/api/superadmin/notification-settings/${mode}/upload-sound`,
        { filename: file.name, dataBase64 },
      );
      const json = await res.json();
      if (json.url) {
        setDrafts((p) => ({
          ...p,
          [mode]: { ...(p[mode] || { templates: {}, soundUrl: null }), soundUrl: json.url },
        }));
        setStatusByMode((s) => ({ ...s, [mode]: "Uploaded" }));
        qc.invalidateQueries({ queryKey: ["/api/superadmin/notification-settings"] });
        setTimeout(() => {
          setStatusByMode((s) => {
            const next = { ...s };
            if (next[mode] === "Uploaded") delete next[mode];
            return next;
          });
        }, 2500);
      } else {
        setStatusByMode((s) => ({ ...s, [mode]: "Upload failed" }));
      }
    } catch {
      setStatusByMode((s) => ({ ...s, [mode]: "Upload failed" }));
    } finally {
      setUploadingMode(null);
    }
  };

  const handlePreviewSound = async (url: string | null) => {
    try {
      if (playerRef.current) {
        await playerRef.current.unloadAsync().catch(() => {});
        playerRef.current = null;
      }
      const fullUrl = url
        ? new URL(url, getApiUrl()).toString()
        : require("../../assets/sounds/alert-tone.wav");
      const { sound } = await Audio.Sound.createAsync(
        typeof fullUrl === "string" ? { uri: fullUrl } : fullUrl,
        { shouldPlay: true, volume: 1.0 },
      );
      playerRef.current = sound;
    } catch (err) {
      console.warn("preview sound failed", err);
    }
  };

  const setActiveLang = (mode: QueueMode, lang: string) => {
    setActiveLangByMode((p) => ({ ...p, [mode]: lang }));
  };

  const updateTemplate = (mode: QueueMode, lang: string, text: string) => {
    setDrafts((p) => {
      const cur = p[mode] || { templates: {}, soundUrl: null };
      return {
        ...p,
        [mode]: {
          ...cur,
          templates: { ...cur.templates, [lang]: text },
        },
      };
    });
  };

  const insertVariable = (mode: QueueMode, lang: string, token: string) => {
    setDrafts((p) => {
      const cur = p[mode] || { templates: {}, soundUrl: null };
      const existing = cur.templates[lang] || "";
      return {
        ...p,
        [mode]: {
          ...cur,
          templates: { ...cur.templates, [lang]: existing + token },
        },
      };
    });
  };

  if (query.isLoading) {
    return (
      <ThemedView style={styles.loading}>
        <ThemedText>Loading notification settings…</ThemedText>
      </ThemedView>
    );
  }

  if (query.isError) {
    return (
      <ThemedView style={styles.loading}>
        <ThemedText>Failed to load. You may not have super admin access.</ThemedText>
      </ThemedView>
    );
  }

  const rows = query.data?.settings || [];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        styles.page,
        { backgroundColor: theme.backgroundRoot },
      ]}
      testID="screen-notification-settings"
    >
      <View style={styles.header}>
        <ThemedText style={[styles.title, { color: theme.text }]}>
          Notification Settings
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.mutedText }]}>
          Customize the announcement sentence and alert sound played when a ticket is called, per queue type. Add wording for any of the supported languages — branches choose which language plays.
        </ThemedText>
      </View>

      <View
        style={[
          styles.legend,
          { backgroundColor: theme.surface, borderColor: theme.borderSubtle },
        ]}
      >
        <ThemedText style={[styles.legendTitle, { color: theme.text }]}>
          Available variables
        </ThemedText>
        <View style={styles.chipRow}>
          {variables.map((v) => (
            <View
              key={v}
              style={[
                styles.chip,
                { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSubtle },
              ]}
            >
              <ThemedText style={[styles.chipText, { color: theme.textSecondary }]}>
                {v}
              </ThemedText>
            </View>
          ))}
        </View>
        <ThemedText style={[styles.legendNote, { color: theme.mutedText }]}>
          Tip: <ThemedText style={{ fontFamily: Platform.select({ web: "monospace", default: undefined }) }}>{"{customerNameTail}"}</ThemedText> renders as ", John" only when a name is present, so there's no awkward dangling comma.
        </ThemedText>
      </View>

      {rows.map((row) => {
        const draft = drafts[row.queueMode] || {
          templates: {
            ...(row.templates || {}),
            ...(row.templateEn ? { en: row.templateEn } : {}),
            ...(row.templateAr ? { ar: row.templateAr } : {}),
          },
          soundUrl: row.alertSoundUrl,
        };
        const status = statusByMode[row.queueMode];
        const isSaving = savingMode === row.queueMode;
        const isUploading = uploadingMode === row.queueMode;
        const activeLang = activeLangByMode[row.queueMode] || "en";
        const langMeta = getLanguage(activeLang);
        const isRtl = !!langMeta.rtl;
        const activeText = draft.templates[activeLang] || "";
        const hasCustomForLang =
          activeLang === "en"
            ? !!draft.templates.en && draft.templates.en !== (query.data?.defaultTemplates?.[row.queueMode]?.en || "")
            : activeLang === "ar"
              ? !!draft.templates.ar && draft.templates.ar !== (query.data?.defaultTemplates?.[row.queueMode]?.ar || "")
              : !!draft.templates[activeLang];

        return (
          <View
            key={row.queueMode}
            style={[
              styles.card,
              { backgroundColor: theme.surface, borderColor: theme.borderSubtle },
            ]}
            testID={`card-notification-${row.queueMode}`}
          >
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.cardTitle, { color: theme.text }]}>
                  {QUEUE_LABELS[row.queueMode]}
                </ThemedText>
                <ThemedText style={[styles.cardSubtitle, { color: theme.mutedText }]}>
                  {QUEUE_DESCRIPTIONS[row.queueMode]}
                </ThemedText>
              </View>
              {row.isCustom ? (
                <View style={[styles.tag, { backgroundColor: "#E6F4EA", borderColor: "#A8D5B7" }]}>
                  <ThemedText style={{ fontSize: 11, color: "#1B6E3A", fontWeight: "600" }}>
                    CUSTOM
                  </ThemedText>
                </View>
              ) : (
                <View style={[styles.tag, { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSubtle }]}>
                  <ThemedText style={{ fontSize: 11, color: theme.mutedText, fontWeight: "600" }}>
                    DEFAULT
                  </ThemedText>
                </View>
              )}
            </View>

            {/* Language picker */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldHeader}>
                <ThemedText style={[styles.fieldLabel, { color: theme.text }]}>
                  Announcement language
                </ThemedText>
                <View
                  style={[
                    styles.langTag,
                    {
                      backgroundColor: hasCustomForLang ? "#FEF3C7" : theme.surfaceMuted,
                      borderColor: hasCustomForLang ? "#F59E0B" : theme.borderSubtle,
                    },
                  ]}
                >
                  <ThemedText
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: hasCustomForLang ? "#92400E" : theme.mutedText,
                    }}
                    testID={`status-template-customised-${row.queueMode}`}
                  >
                    {hasCustomForLang ? "CUSTOMISED" : "DEFAULT"}
                  </ThemedText>
                </View>
              </View>
              {isWeb ? (
                <View
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.surfaceMuted,
                      borderColor: theme.borderSubtle,
                      paddingHorizontal: 0,
                      paddingVertical: 0,
                      minHeight: 40,
                    },
                  ]}
                >
                  <select
                    value={activeLang}
                    onChange={(e: any) => setActiveLang(row.queueMode, e.target.value)}
                    data-testid={`select-language-${row.queueMode}`}
                    style={{
                      appearance: "auto",
                      width: "100%",
                      height: 40,
                      padding: "0 12px",
                      background: "transparent",
                      color: theme.text as string,
                      border: "none",
                      fontSize: 13,
                      outline: "none",
                    }}
                  >
                    {supportedLanguages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}{lang.code === "en" ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {supportedLanguages.map((lang) => {
                    const selected = activeLang === lang.code;
                    return (
                      <Pressable
                        key={lang.code}
                        onPress={() => setActiveLang(row.queueMode, lang.code)}
                        style={[
                          styles.langPill,
                          {
                            borderColor: selected ? theme.primary : theme.borderSubtle,
                            backgroundColor: selected ? theme.primary + "22" : theme.surfaceMuted,
                          },
                        ]}
                        testID={`option-language-${row.queueMode}-${lang.code}`}
                      >
                        <ThemedText
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: selected ? theme.primary : theme.textSecondary,
                          }}
                        >
                          {lang.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* Template for active language */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldHeader}>
                <ThemedText style={[styles.fieldLabel, { color: theme.text }]}>
                  Announcement wording — {langMeta.label}
                </ThemedText>
                <View style={styles.miniChipRow}>
                  {variables.map((v) => (
                    <Pressable
                      key={v}
                      onPress={() => insertVariable(row.queueMode, activeLang, v)}
                      style={[
                        styles.miniChip,
                        { borderColor: theme.borderSubtle },
                      ]}
                      testID={`btn-var-${row.queueMode}-${activeLang}-${v}`}
                    >
                      <ThemedText style={[styles.miniChipText, { color: theme.textSecondary }]}>
                        {v}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
              <TextInput
                value={activeText}
                onChangeText={(t) => updateTemplate(row.queueMode, activeLang, t)}
                multiline
                placeholder={
                  activeLang === "en"
                    ? "e.g., Now serving {ticketNumber} at {desk}"
                    : `If left empty, English will be used as a fallback. Suggested wording: "${draft.templates.en || "Now serving {ticketNumber}"}"`
                }
                placeholderTextColor={theme.mutedText}
                style={[
                  styles.input,
                  isRtl ? styles.inputRtl : null,
                  {
                    color: theme.text,
                    backgroundColor: theme.surfaceMuted,
                    borderColor: theme.borderSubtle,
                  },
                ]}
                testID={`input-template-${row.queueMode}-${activeLang}`}
              />
            </View>

            {/* Sound */}
            <View style={styles.fieldGroup}>
              <ThemedText style={[styles.fieldLabel, { color: theme.text }]}>
                Alert sound
              </ThemedText>
              <View style={styles.soundRow}>
                <View style={[styles.soundCurrent, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceMuted }]}>
                  <Feather name="music" size={14} color={theme.mutedText} />
                  <ThemedText
                    numberOfLines={1}
                    style={[styles.soundCurrentText, { color: theme.textSecondary }]}
                  >
                    {draft.soundUrl ? draft.soundUrl.split("/").pop() : "Default (alert-tone.wav)"}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => handlePreviewSound(draft.soundUrl)}
                  style={[styles.btnGhost, { borderColor: theme.borderSubtle }]}
                  testID={`btn-preview-sound-${row.queueMode}`}
                >
                  <Feather name="play" size={13} color={theme.text} />
                  <ThemedText style={[styles.btnGhostText, { color: theme.text }]}>
                    Preview
                  </ThemedText>
                </Pressable>
                {isWeb ? (
                  <FilePickerButton
                    label={isUploading ? "Uploading…" : "Upload"}
                    onPick={(file) => handleUploadFile(row.queueMode, file)}
                    disabled={isUploading}
                    testID={`btn-upload-sound-${row.queueMode}`}
                  />
                ) : (
                  <View style={[styles.btnDisabled, { borderColor: theme.borderSubtle }]}>
                    <ThemedText style={{ fontSize: 12, color: theme.mutedText }}>
                      Use web dashboard to upload
                    </ThemedText>
                  </View>
                )}
                {draft.soundUrl ? (
                  <Pressable
                    onPress={() => handleResetSound(row.queueMode)}
                    style={[styles.btnGhost, { borderColor: theme.borderSubtle }]}
                    testID={`btn-reset-sound-${row.queueMode}`}
                  >
                    <Feather name="rotate-ccw" size={13} color={theme.text} />
                    <ThemedText style={[styles.btnGhostText, { color: theme.text }]}>
                      Reset
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.cardFooter}>
              {status ? (
                <ThemedText
                  style={{
                    fontSize: 12,
                    color: status === "Saved" || status === "Uploaded" ? "#1B6E3A" : theme.mutedText,
                    fontWeight: "600",
                  }}
                  testID={`status-notification-${row.queueMode}`}
                >
                  {status}
                </ThemedText>
              ) : (
                <View />
              )}
              <Pressable
                onPress={() => handleSave(row.queueMode)}
                disabled={isSaving}
                style={[
                  styles.btnPrimary,
                  { backgroundColor: theme.primary, opacity: isSaving ? 0.6 : 1 },
                ]}
                testID={`btn-save-${row.queueMode}`}
              >
                <Feather name="save" size={14} color="#fff" />
                <ThemedText style={styles.btnPrimaryText}>
                  {isSaving ? "Saving…" : "Save"}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function FilePickerButton({
  label,
  onPick,
  disabled,
  testID,
}: {
  label: string;
  onPick: (file: File) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { theme } = useTheme();
  return (
    <View>
      <input
        ref={inputRef as any}
        type="file"
        accept="audio/wav,audio/mpeg,audio/mp3,audio/ogg,audio/mp4,audio/x-m4a,.wav,.mp3,.ogg,.m4a"
        style={{ display: "none" }}
        onChange={(e: any) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <Pressable
        onPress={() => inputRef.current?.click()}
        disabled={disabled}
        style={[
          styles.btnGhost,
          { borderColor: theme.borderSubtle, opacity: disabled ? 0.6 : 1 },
        ]}
        testID={testID}
      >
        <Feather name="upload" size={13} color={theme.text} />
        <ThemedText style={[styles.btnGhostText, { color: theme.text }]}>
          {label}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  page: {
    padding: Spacing["2xl"],
    gap: Spacing.lg,
  },
  header: { marginBottom: Spacing.md },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 4 },
  legend: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  legendTitle: { fontSize: 13, fontWeight: "700" },
  legendNote: { fontSize: 12, marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontFamily: Platform.select({ web: "monospace", default: undefined }) },
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardSubtitle: { fontSize: 12, marginTop: 2 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  langTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  langPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  fieldGroup: { gap: 6 },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  fieldLabel: { fontSize: 12, fontWeight: "600" },
  miniChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  miniChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  miniChipText: {
    fontSize: 11,
    fontFamily: Platform.select({ web: "monospace", default: undefined }),
  },
  input: {
    minHeight: 56,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 13,
  },
  inputRtl: { writingDirection: "rtl", textAlign: "right" } as any,
  soundRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  soundCurrent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    minWidth: 220,
  },
  soundCurrentText: { fontSize: 12, flex: 1 },
  btnGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  btnGhostText: { fontSize: 12, fontWeight: "600" },
  btnDisabled: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: BorderRadius.sm,
  },
  btnPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
