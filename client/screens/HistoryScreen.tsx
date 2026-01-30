import React, { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, SectionList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { StatsCard } from "@/components/StatsCard";
import { HistoryCard } from "@/components/HistoryCard";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { Spacing } from "@/constants/theme";
import { HistoryEntry } from "@/types/queue";

interface Section {
  title: string;
  data: HistoryEntry[];
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { history, stats } = useQueue();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setRefreshing(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const sections = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const todayItems: HistoryEntry[] = [];
    const thisWeekItems: HistoryEntry[] = [];
    const earlierItems: HistoryEntry[] = [];

    history.forEach((entry) => {
      const entryDate = new Date(entry.completedAt);
      if (entryDate >= today) {
        todayItems.push(entry);
      } else if (entryDate >= weekAgo) {
        thisWeekItems.push(entry);
      } else {
        earlierItems.push(entry);
      }
    });

    const result: Section[] = [];
    if (todayItems.length > 0) {
      result.push({ title: "Today", data: todayItems });
    }
    if (thisWeekItems.length > 0) {
      result.push({ title: "This Week", data: thisWeekItems });
    }
    if (earlierItems.length > 0) {
      result.push({ title: "Earlier", data: earlierItems });
    }

    return result;
  }, [history]);

  if (history.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <SectionList
          sections={[]}
          renderItem={() => null}
          renderSectionHeader={() => null}
          contentContainerStyle={[
            styles.emptyContent,
            {
              paddingTop: headerHeight + Spacing.xl,
              paddingBottom: tabBarHeight + Spacing.xl,
            },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <EmptyState
              image={require("../../assets/images/empty-history.png")}
              title="No Queue History"
              description="Your past queues will appear here. Join a queue to start building your history."
            />
          }
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <HistoryCard entry={item} />}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: theme.backgroundRoot }]}>
            <ThemedText type="small" style={{ color: theme.textSecondary, fontWeight: "600" }}>
              {section.title}
            </ThemedText>
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <StatsCard stats={stats} />
          </View>
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  emptyContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
  },
  headerContent: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
});
