import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  FlatList,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string | null;
  priority: "low" | "medium" | "high" | string;
  status: "open" | "in_progress" | "awaiting_reply" | "resolved" | "closed" | string;
  createdAt: string;
  updatedAt: string;
}

interface SupportMessage {
  id: string;
  ticketId: string;
  senderType: "org" | "support" | string;
  senderName: string | null;
  senderEmail: string | null;
  body: string;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  awaiting_reply: "Awaiting Reply",
  resolved: "Resolved",
  closed: "Closed",
};
const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function OrgSupportScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New-ticket modal
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerSubject, setComposerSubject] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerPriority, setComposerPriority] = useState<"low" | "medium" | "high">("medium");
  const [composerSubmitting, setComposerSubmitting] = useState(false);

  // Chat thread modal
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [replySending, setReplySending] = useState(false);
  const messagesListRef = useRef<FlatList<SupportMessage>>(null);

  const loadTickets = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(new URL("/api/org/support-tickets", getApiUrl()), {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) setError("Please sign in again to access support.");
        else setError("Could not load your tickets.");
        return;
      }
      const j = await res.json();
      setTickets(j.tickets || []);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTickets();
    }, [loadTickets]),
  );

  const openTicket = useCallback(async (ticket: SupportTicket) => {
    setActiveTicket(ticket);
    setMessages([]);
    setReply("");
    setMessagesLoading(true);
    try {
      const res = await fetch(
        new URL(`/api/org/support-tickets/${ticket.id}/messages`, getApiUrl()),
        { credentials: "include" },
      );
      if (res.ok) {
        const j = await res.json();
        setMessages(j.messages || []);
        if (j.ticket) setActiveTicket(j.ticket);
      }
    } catch {
      /* swallow — surface only via empty list */
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const sendReply = useCallback(async () => {
    const body = reply.trim();
    if (!body || !activeTicket || replySending) return;
    setReplySending(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/org/support-tickets/${activeTicket.id}/messages`,
        { body },
      );
      const j = await res.json();
      if (j.message) {
        setMessages((prev) => [...prev, j.message]);
        setReply("");
        // Refresh the parent list so updatedAt sorting reflects the new message.
        loadTickets();
      }
    } catch {
      /* keep draft on failure so user doesn't lose it */
    } finally {
      setReplySending(false);
    }
  }, [reply, activeTicket, replySending, loadTickets]);

  const submitNewTicket = useCallback(async () => {
    const subject = composerSubject.trim();
    if (!subject || composerSubmitting) return;
    setComposerSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/org/support-tickets", {
        subject,
        description: composerBody.trim() || undefined,
        priority: composerPriority,
      });
      const j = await res.json();
      setComposerOpen(false);
      setComposerSubject("");
      setComposerBody("");
      setComposerPriority("medium");
      await loadTickets();
      if (j.ticket) {
        // Open the chat thread for the new ticket so the user can keep typing.
        openTicket(j.ticket);
      }
    } catch {
      /* leave modal open so user can retry */
    } finally {
      setComposerSubmitting(false);
    }
  }, [composerSubject, composerBody, composerPriority, composerSubmitting, loadTickets, openTicket]);

  // Auto-scroll chat to latest message whenever messages change.
  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => {
        messagesListRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [messages]);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const statusPillStyle = (status: string) => {
    if (status === "resolved") return { bg: "#DCFCE7", fg: "#166534" };
    if (status === "closed") return { bg: theme.surfaceMuted, fg: theme.textSecondary };
    if (status === "in_progress" || status === "awaiting_reply") return { bg: BrandColors.primaryDark + "18", fg: BrandColors.primaryDark };
    return { bg: "#FEF3C7", fg: "#92400E" }; // open
  };

  const priorityPillStyle = (p: string) => {
    if (p === "high") return { bg: "#FEE2E2", fg: "#B91C1C" };
    if (p === "low") return { bg: theme.surfaceMuted, fg: theme.textSecondary };
    return { bg: "#FEF3C7", fg: "#92400E" };
  };

  return (
    <ThemedView style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.xl, paddingBottom: insets.bottom + Spacing["2xl"] },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <ThemedText type="h3">Tech Support</ThemedText>
            <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
              Open a ticket to chat directly with the TIQKETS support team.
            </ThemedText>
          </View>
          <Pressable
            testID="button-new-ticket"
            onPress={() => setComposerOpen(true)}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: BrandColors.primaryDark, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.primaryBtnText}>
              New ticket
            </ThemedText>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : error ? (
          <Card style={styles.empty}>
            <Feather name="alert-circle" size={24} color={theme.textSecondary} />
            <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>{error}</ThemedText>
            <Pressable onPress={loadTickets} style={styles.retryBtn}>
              <ThemedText style={{ color: theme.primary, fontWeight: "600" }}>Retry</ThemedText>
            </Pressable>
          </Card>
        ) : tickets.length === 0 ? (
          <Card style={styles.empty}>
            <Feather name="message-square" size={28} color={theme.textSecondary} />
            <ThemedText style={[styles.emptyTitle, { color: theme.text }]}>No tickets yet</ThemedText>
            <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
              Have a question, request, or complaint? Open your first ticket and our team will reply right here.
            </ThemedText>
          </Card>
        ) : (
          <View style={{ gap: Spacing.md }}>
            {tickets.map((t) => {
              const sp = statusPillStyle(t.status);
              const pp = priorityPillStyle(t.priority);
              return (
                <Pressable
                  key={t.id}
                  testID={`ticket-${t.ticketNumber}`}
                  onPress={() => openTicket(t)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                >
                  <Card style={styles.ticketCard}>
                    <View style={styles.ticketTopRow}>
                      <ThemedText style={[styles.ticketNumber, { color: theme.primary }]}>
                        {t.ticketNumber}
                      </ThemedText>
                      <View style={[styles.pill, { backgroundColor: sp.bg }]}>
                        <ThemedText style={[styles.pillText, { color: sp.fg }]}>
                          {STATUS_LABEL[t.status] || t.status}
                        </ThemedText>
                      </View>
                    </View>
                    <ThemedText style={styles.ticketSubject}>{t.subject}</ThemedText>
                    {t.description ? (
                      <ThemedText
                        numberOfLines={2}
                        style={[styles.ticketDesc, { color: theme.textSecondary }]}
                      >
                        {t.description}
                      </ThemedText>
                    ) : null}
                    <View style={styles.ticketMetaRow}>
                      <View style={[styles.pill, { backgroundColor: pp.bg }]}>
                        <ThemedText style={[styles.pillText, { color: pp.fg }]}>
                          {PRIORITY_LABEL[t.priority] || t.priority}
                        </ThemedText>
                      </View>
                      <ThemedText style={[styles.metaTime, { color: theme.textSecondary }]}>
                        Updated {timeAgo(t.updatedAt)}
                      </ThemedText>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Composer modal — new ticket */}
      <Modal
        visible={composerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setComposerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <RNKeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalKbWrap}
          >
            <ThemedView style={[styles.modalCard, { backgroundColor: theme.surface }]}>
              <View style={styles.modalHeader}>
                <ThemedText type="h4">Open a ticket</ThemedText>
                <Pressable onPress={() => setComposerOpen(false)} style={styles.iconBtn}>
                  <Feather name="x" size={18} color={theme.textSecondary} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
                <View>
                  <ThemedText style={styles.fieldLabel}>Subject</ThemedText>
                  <TextInput
                    testID="input-ticket-subject"
                    value={composerSubject}
                    onChangeText={setComposerSubject}
                    placeholder="A short summary of the issue"
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.input,
                      { backgroundColor: isDark ? theme.surfaceMuted : "#F7F5FE", color: theme.text, borderColor: theme.borderSubtle },
                    ]}
                  />
                </View>
                <View>
                  <ThemedText style={styles.fieldLabel}>Priority</ThemedText>
                  <View style={styles.priorityRow}>
                    {(["low", "medium", "high"] as const).map((p) => {
                      const active = composerPriority === p;
                      return (
                        <Pressable
                          key={p}
                          onPress={() => setComposerPriority(p)}
                          style={[
                            styles.priorityChip,
                            {
                              borderColor: active ? theme.primary : theme.borderSubtle,
                              backgroundColor: active ? BrandColors.primaryDark + "1A" : (isDark ? "transparent" : "#F7F5FE"),
                            },
                          ]}
                        >
                          <ThemedText
                            style={{
                              color: active ? BrandColors.primaryDark : theme.text,
                              fontWeight: active ? "700" : "500",
                              fontSize: 13,
                            }}
                          >
                            {PRIORITY_LABEL[p]}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View>
                  <ThemedText style={styles.fieldLabel}>Describe your question or issue</ThemedText>
                  <TextInput
                    testID="input-ticket-body"
                    value={composerBody}
                    onChangeText={setComposerBody}
                    multiline
                    numberOfLines={6}
                    placeholder="Provide as much detail as you can — screenshots can be shared in the chat after the ticket is created."
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.input,
                      styles.textarea,
                      { backgroundColor: isDark ? theme.surfaceMuted : "#F7F5FE", color: theme.text, borderColor: theme.borderSubtle },
                    ]}
                  />
                </View>
              </ScrollView>
              <View style={styles.modalFooter}>
                <Pressable onPress={() => setComposerOpen(false)} style={styles.ghostBtn}>
                  <ThemedText style={{ color: theme.textSecondary, fontWeight: "600" }}>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  testID="button-submit-ticket"
                  onPress={submitNewTicket}
                  disabled={!composerSubject.trim() || composerSubmitting}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      backgroundColor: BrandColors.primaryDark,
                      opacity: !composerSubject.trim() || composerSubmitting ? 0.5 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  {composerSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Feather name="send" size={14} color="#FFFFFF" />
                  )}
                  <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.primaryBtnText}>
                    {composerSubmitting ? "Opening…" : "Open ticket"}
                  </ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          </RNKeyboardAvoidingView>
        </View>
      </Modal>

      {/* Chat thread modal */}
      <Modal
        visible={!!activeTicket}
        animationType="slide"
        onRequestClose={() => setActiveTicket(null)}
      >
        <ThemedView style={styles.threadRoot}>
          <KeyboardAvoidingView
            behavior="padding"
            style={{ flex: 1 }}
            keyboardVerticalOffset={0}
          >
            <View
              style={[
                styles.threadHeader,
                {
                  paddingTop: insets.top + Spacing.md,
                  borderBottomColor: theme.borderSubtle,
                  backgroundColor: theme.surface,
                },
              ]}
            >
              <Pressable onPress={() => setActiveTicket(null)} style={styles.iconBtn}>
                <Feather name="arrow-left" size={20} color={theme.text} />
              </Pressable>
              <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                <ThemedText style={[styles.threadNumber, { color: theme.primary }]}>
                  {activeTicket?.ticketNumber}
                </ThemedText>
                <ThemedText style={styles.threadTitle} numberOfLines={1}>
                  {activeTicket?.subject}
                </ThemedText>
              </View>
              {activeTicket ? (
                <View
                  style={[
                    styles.pill,
                    { backgroundColor: statusPillStyle(activeTicket.status).bg },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.pillText,
                      { color: statusPillStyle(activeTicket.status).fg },
                    ]}
                  >
                    {STATUS_LABEL[activeTicket.status] || activeTicket.status}
                  </ThemedText>
                </View>
              ) : null}
            </View>

            <FlatList
              ref={messagesListRef}
              data={messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={[
                styles.threadList,
                { backgroundColor: theme.backgroundRoot },
              ]}
              ListEmptyComponent={
                messagesLoading ? (
                  <View style={styles.threadEmpty}>
                    <ActivityIndicator color={theme.primary} />
                  </View>
                ) : (
                  <View style={styles.threadEmpty}>
                    <ThemedText style={{ color: theme.textSecondary }}>
                      No messages yet — say hello below.
                    </ThemedText>
                  </View>
                )
              }
              renderItem={({ item }) => {
                const isOrg = item.senderType === "org";
                return (
                  <View style={[styles.bubbleRow, isOrg ? styles.bubbleRight : styles.bubbleLeft]}>
                    <View
                      style={[
                        styles.bubble,
                        isOrg
                          ? { backgroundColor: BrandColors.primaryDark }
                          : { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.borderSubtle },
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.bubbleMeta,
                          { color: isOrg ? "rgba(255,255,255,0.85)" : theme.textSecondary },
                        ]}
                      >
                        {(item.senderName || (isOrg ? "You" : "Tech Support")) + " · " + timeAgo(item.createdAt)}
                      </ThemedText>
                      <ThemedText
                        style={[styles.bubbleText, { color: isOrg ? "#FFFFFF" : theme.text }]}
                      >
                        {item.body}
                      </ThemedText>
                    </View>
                  </View>
                );
              }}
            />

            <View
              style={[
                styles.composerBar,
                {
                  borderTopColor: theme.borderSubtle,
                  backgroundColor: theme.surface,
                  paddingBottom: insets.bottom + Spacing.sm,
                },
              ]}
            >
              <TextInput
                testID="input-reply"
                value={reply}
                onChangeText={setReply}
                placeholder="Type your reply…"
                placeholderTextColor={theme.textSecondary}
                multiline
                style={[
                  styles.composerInput,
                  { backgroundColor: isDark ? theme.surfaceMuted : "#F7F5FE", color: theme.text, borderColor: theme.borderSubtle },
                ]}
              />
              <Pressable
                testID="button-send-reply"
                onPress={sendReply}
                disabled={!reply.trim() || replySending}
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    backgroundColor: BrandColors.primaryDark,
                    opacity: !reply.trim() || replySending ? 0.5 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                {replySending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Feather name="send" size={16} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    root: { flex: 1 },
    scrollContent: { paddingHorizontal: Spacing.lg, gap: Spacing.lg },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Spacing.md },
    subtitle: { fontSize: 13, marginTop: 4 },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      borderRadius: BorderRadius.sm,
    },
    primaryBtnText: { fontSize: 13, fontWeight: "700" },
    empty: {
      alignItems: "center",
      justifyContent: "center",
      padding: Spacing["2xl"],
      gap: Spacing.md,
    },
    emptyTitle: { fontSize: 16, fontWeight: "700" },
    emptyText: { fontSize: 13, textAlign: "center", lineHeight: 19, maxWidth: 360 },
    retryBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg },
    ticketCard: { padding: Spacing.lg, gap: Spacing.sm },
    ticketTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    ticketNumber: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
    ticketSubject: { fontSize: 15, fontWeight: "700" },
    ticketDesc: { fontSize: 13, lineHeight: 18 },
    ticketMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
    metaTime: { fontSize: 12 },
    pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    pillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
    /* Composer modal */
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(15,23,42,0.55)",
      justifyContent: "center",
      padding: Spacing.lg,
    },
    modalKbWrap: { width: "100%", alignItems: "center" },
    modalCard: {
      width: "100%",
      maxWidth: 520,
      borderRadius: BorderRadius.lg,
      overflow: "hidden",
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: Spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.borderSubtle,
    },
    iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.xs },
    fieldLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginBottom: Spacing.xs, textTransform: "uppercase", color: theme.textSecondary },
    input: {
      borderWidth: 1,
      borderRadius: BorderRadius.xs,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      fontSize: 14,
    },
    textarea: { minHeight: 120, textAlignVertical: "top" },
    priorityRow: { flexDirection: "row", gap: Spacing.sm },
    priorityChip: {
      paddingVertical: 8,
      paddingHorizontal: Spacing.md,
      borderRadius: 999,
      borderWidth: 1,
    },
    modalFooter: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: Spacing.sm,
      padding: Spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.borderSubtle,
    },
    ghostBtn: { paddingVertical: 10, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm },
    /* Thread modal */
    threadRoot: { flex: 1 },
    threadHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    threadNumber: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
    threadTitle: { fontSize: 15, fontWeight: "700", marginTop: 1 },
    threadList: { padding: Spacing.lg, gap: Spacing.sm, flexGrow: 1 },
    threadEmpty: { padding: Spacing["2xl"], alignItems: "center", justifyContent: "center" },
    bubbleRow: { width: "100%", marginBottom: Spacing.sm, flexDirection: "row" },
    bubbleLeft: { justifyContent: "flex-start" },
    bubbleRight: { justifyContent: "flex-end" },
    bubble: {
      maxWidth: "82%",
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      borderRadius: BorderRadius.md,
    },
    bubbleMeta: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4, marginBottom: 4, textTransform: "uppercase" },
    bubbleText: { fontSize: 14, lineHeight: 20 },
    composerBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    composerInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 140,
      borderWidth: 1,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      fontSize: 14,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: BorderRadius.sm,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
