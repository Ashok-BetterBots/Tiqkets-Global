import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { ServiceSelectionModal } from "@/components/ServiceSelectionModal";
import { ActiveQueueCard } from "@/components/ActiveQueueCard";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { useQueue } from "@/contexts/QueueContext";
import { Colors, Spacing, BorderRadius, BrandColors, Shadows } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Service } from "@/types/queue";
import { getApiUrl } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Organization {
  id: string;
  name: string;
  address: string;
  description: string;
  category: string;
  logoUrl?: string | null;
  rating: number;
  waitTime: number;
  queueLength: number;
  distance: string;
  latitude: number;
  longitude: number;
  isOpen: boolean;
  services: Service[];
}

interface QuickActionItem {
  key: string;
  title: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  onPress: () => void;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const { activeQueue } = useQueue();

  const [searchQuery, setSearchQuery] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const nearbyOffsetRef = useRef<number>(0);

  useEffect(() => {
    requestLocationPermission();
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      setIsLoadingOrgs(true);
      const apiUrl = getApiUrl();
      const url = new URL("/api/discover", apiUrl);
      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        if (data.organizations) {
          setOrganizations(data.organizations);
        }
      }
    } catch (error) {
      console.log("Error fetching organizations:", error);
    } finally {
      setIsLoadingOrgs(false);
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    } catch (error) {
      console.log("Error getting location:", error);
    }
  };

  const handleActiveQueuePress = () => {
    if (activeQueue) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      navigation.navigate("QueueDetails");
    }
  };

  const handleScanQR = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("QRScanner");
  };

  const handleBookAppointment = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("BookAppointment");
  };

  const handleSelectOrganization = (org: Organization) => {
    if (!org.isOpen) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedOrg(org);
    setShowServiceModal(true);
  };

  const handleJoinQueueFromModal = (
    organizationId: string,
    serviceId: string,
    formData: Record<string, string>,
  ) => {
    setShowServiceModal(false);
    if (selectedOrg) {
      const service = selectedOrg.services.find((s) => s.id === serviceId);
      navigation.navigate("JoinQueue", {
        organizationId,
        organizationName: selectedOrg.name,
        serviceId,
        serviceName: service?.name || "Service",
        formData,
      });
    }
  };

  const handleCloseServiceModal = () => {
    setShowServiceModal(false);
    setSelectedOrg(null);
  };

  const calculateDistance = (org: Organization) => {
    if (!userLocation || !org.latitude || !org.longitude) return null;
    const R = 6371;
    const dLat = ((org.latitude - userLocation.latitude) * Math.PI) / 180;
    const dLon = ((org.longitude - userLocation.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userLocation.latitude * Math.PI) / 180) *
        Math.cos((org.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;
    if (dist < 1) return `${Math.round(dist * 1000)} m`;
    return `${dist.toFixed(1)} km`;
  };

  const greetingName = (() => {
    const name = user?.name?.trim();
    if (!name || name === "Guest User") return "there";
    return name.split(" ")[0];
  })();

  const filteredOrganizations = organizations.filter((org) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      org.name.toLowerCase().includes(q) ||
      org.address.toLowerCase().includes(q) ||
      org.category.toLowerCase().includes(q)
    );
  });

  const quickActions: QuickActionItem[] = [
    {
      key: "scan",
      title: "Scan QR",
      icon: "maximize",
      color: BrandColors.primary,
      onPress: handleScanQR,
    },
    {
      key: "book",
      title: "Book",
      icon: "calendar",
      color: BrandColors.secondary,
      onPress: handleBookAppointment,
    },
    {
      key: "queue",
      title: activeQueue ? "My Queue" : "Browse",
      icon: activeQueue ? "clipboard" : "compass",
      color: "#10B981",
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (activeQueue) {
          navigation.navigate("QueueDetails");
        } else {
          scrollRef.current?.scrollTo({
            y: Math.max(nearbyOffsetRef.current - Spacing.md, 0),
            animated: true,
          });
        }
      },
    },
    {
      key: "history",
      title: "History",
      icon: "clock",
      color: BrandColors.accentDark,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const parent = navigation.getParent();
        if (parent) {
          parent.navigate("HistoryTab" as never);
        }
      },
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + Spacing.md,
            paddingBottom: tabBarHeight + Spacing["2xl"],
          },
        ]}
        scrollIndicatorInsets={{ bottom: tabBarHeight }}
      >
        {/* Greeting Header */}
        <Animated.View entering={FadeInDown.delay(50)} style={styles.greetingRow}>
          <View style={styles.greetingTextWrap}>
            <ThemedText style={[styles.greetingHi, { color: theme.textSecondary }]}>
              Hi {greetingName},
            </ThemedText>
            <ThemedText style={[styles.greetingTitle, { color: theme.text }]}>
              Find your queue
            </ThemedText>
          </View>
          <View
            style={[
              styles.avatar,
              { backgroundColor: BrandColors.primary + "18" },
            ]}
          >
            <Feather name="user" size={20} color={BrandColors.primary} />
          </View>
        </Animated.View>

        {/* Search Bar */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.searchWrap}>
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderSubtle ?? theme.border,
              },
            ]}
          >
            <Feather name="search" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search by name, location, or category"
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              testID="input-search"
            />
            {searchQuery.length > 0 ? (
              <Pressable
                onPress={() => setSearchQuery("")}
                testID="button-clear-search"
                hitSlop={8}
              >
                <Feather name="x" size={18} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </Animated.View>

        {/* Welcome / Active Queue Hero */}
        {activeQueue ? (
          <Animated.View entering={FadeInUp.delay(150)} style={styles.sectionWrap}>
            <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
              My Active Queue
            </ThemedText>
            <ActiveQueueCard queue={activeQueue} onPress={handleActiveQueuePress} />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInUp.delay(150)} style={styles.heroWrap}>
            <LinearGradient
              colors={[BrandColors.primary, BrandColors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroTextWrap}>
                <ThemedText style={styles.heroEyebrow}>Welcome</ThemedText>
                <ThemedText style={styles.heroTitle}>
                  Skip the wait,{"\n"}join from anywhere
                </ThemedText>
                <Pressable
                  style={styles.heroButton}
                  onPress={handleScanQR}
                  testID="button-hero-scan"
                >
                  <Feather name="maximize" size={14} color={BrandColors.primary} />
                  <ThemedText style={styles.heroButtonText}>Scan to join</ThemedText>
                </Pressable>
              </View>
              <View style={styles.heroIllustration}>
                <View style={styles.heroCircleLg} />
                <View style={styles.heroCircleSm} />
                <Feather name="users" size={48} color="rgba(255,255,255,0.95)" />
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {/* Quick Actions */}
        <Animated.View entering={FadeInUp.delay(200)} style={styles.sectionWrap}>
          <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
            Quick Actions
          </ThemedText>
          <View style={styles.quickRow}>
            {quickActions.map((action) => (
              <Pressable
                key={action.key}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.quickItem,
                  {
                    backgroundColor: theme.surface,
                    opacity: pressed ? 0.85 : 1,
                  },
                  isDark ? Shadows.subtle : Shadows.card,
                ]}
                testID={`quick-${action.key}`}
              >
                <View
                  style={[
                    styles.quickIcon,
                    { backgroundColor: action.color + "18" },
                  ]}
                >
                  <Feather name={action.icon} size={20} color={action.color} />
                </View>
                <ThemedText
                  style={[styles.quickLabel, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {action.title}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Nearby Section */}
        <Animated.View
          entering={FadeInUp.delay(250)}
          style={styles.sectionWrap}
          onLayout={(e) => {
            nearbyOffsetRef.current = e.nativeEvent.layout.y;
          }}
        >
          <View style={styles.sectionHeaderRow}>
            <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
              Nearby
            </ThemedText>
            {filteredOrganizations.length > 0 ? (
              <ThemedText
                style={[styles.sectionMeta, { color: theme.textSecondary }]}
              >
                {filteredOrganizations.length}{" "}
                {filteredOrganizations.length === 1 ? "place" : "places"}
              </ThemedText>
            ) : null}
          </View>

          {isLoadingOrgs ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={BrandColors.primary} />
            </View>
          ) : filteredOrganizations.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Feather name="map-pin" size={28} color={theme.textSecondary} />
              <ThemedText
                style={[styles.emptyText, { color: theme.textSecondary }]}
              >
                {searchQuery
                  ? "No results match your search"
                  : "No organizations available right now"}
              </ThemedText>
            </Card>
          ) : (
            <View style={styles.nearbyList}>
              {filteredOrganizations.map((org) => {
                const distance = calculateDistance(org);
                const waitText =
                  org.queueLength > 0 ? `${org.waitTime} min` : "No wait";
                return (
                  <Pressable
                    key={org.id}
                    onPress={() => handleSelectOrganization(org)}
                    disabled={!org.isOpen}
                    style={({ pressed }) => [
                      styles.nearbyCard,
                      {
                        backgroundColor: theme.surface,
                        opacity: pressed ? 0.92 : 1,
                      },
                      isDark ? Shadows.subtle : Shadows.card,
                    ]}
                    testID={`card-org-${org.id}`}
                  >
                    <View
                      style={[
                        styles.orgLogoWrap,
                        { backgroundColor: BrandColors.primary + "12" },
                      ]}
                    >
                      {org.logoUrl ? (
                        <Image
                          source={{ uri: org.logoUrl }}
                          style={styles.orgLogo}
                          resizeMode="cover"
                        />
                      ) : (
                        <ThemedText
                          style={[
                            styles.orgInitial,
                            { color: BrandColors.primary },
                          ]}
                        >
                          {org.name.charAt(0).toUpperCase()}
                        </ThemedText>
                      )}
                    </View>
                    <View style={styles.orgInfo}>
                      <View style={styles.orgTitleRow}>
                        <ThemedText
                          style={[styles.orgName, { color: theme.text }]}
                          numberOfLines={1}
                        >
                          {org.name}
                        </ThemedText>
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor: org.isOpen
                                ? "#10B981"
                                : "#EF4444",
                            },
                          ]}
                        />
                      </View>
                      <ThemedText
                        style={[
                          styles.orgAddress,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {org.address}
                      </ThemedText>
                      <View style={styles.orgMetaRow}>
                        <View style={styles.orgMetaItem}>
                          <Feather
                            name="clock"
                            size={12}
                            color={theme.textSecondary}
                          />
                          <ThemedText
                            style={[
                              styles.orgMetaText,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {waitText}
                          </ThemedText>
                        </View>
                        <View style={styles.orgMetaItem}>
                          <Feather
                            name="users"
                            size={12}
                            color={theme.textSecondary}
                          />
                          <ThemedText
                            style={[
                              styles.orgMetaText,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {org.queueLength} waiting
                          </ThemedText>
                        </View>
                        {distance ? (
                          <View style={styles.orgMetaItem}>
                            <Feather
                              name="navigation"
                              size={12}
                              color={theme.textSecondary}
                            />
                            <ThemedText
                              style={[
                                styles.orgMetaText,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {distance}
                            </ThemedText>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Feather
                      name="chevron-right"
                      size={20}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                );
              })}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <ServiceSelectionModal
        visible={showServiceModal}
        organization={
          selectedOrg
            ? {
                id: selectedOrg.id,
                name: selectedOrg.name,
                description: selectedOrg.description,
                services: selectedOrg.services,
              }
            : null
        }
        onClose={handleCloseServiceModal}
        onJoinQueue={handleJoinQueueFromModal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  greetingTextWrap: {
    flex: 1,
  },
  greetingHi: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 2,
  },
  greetingTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: {
    marginBottom: Spacing.xl,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Platform.OS === "ios" ? Spacing.md : Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    ...Shadows.subtle,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Platform.OS === "ios" ? 0 : 4,
  },
  heroWrap: {
    marginBottom: Spacing.xl,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    overflow: "hidden",
    ...Shadows.medium,
  },
  heroTextWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
    marginBottom: Spacing.md,
  },
  heroButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Spacing.xs,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  heroButtonText: {
    color: BrandColors.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  heroIllustration: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCircleLg: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroCircleSm: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  sectionWrap: {
    marginBottom: Spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: Spacing.md,
  },
  sectionMeta: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: Spacing.md,
  },
  quickRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  quickItem: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    gap: Spacing.sm,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  loadingWrap: {
    paddingVertical: Spacing["2xl"],
    alignItems: "center",
  },
  emptyCard: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing["2xl"],
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
  },
  nearbyList: {
    gap: Spacing.md,
  },
  nearbyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  orgLogoWrap: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  orgLogo: {
    width: 52,
    height: 52,
  },
  orgInitial: {
    fontSize: 22,
    fontWeight: "700",
  },
  orgInfo: {
    flex: 1,
    gap: 2,
  },
  orgTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  orgName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  orgAddress: {
    fontSize: 12,
    marginBottom: 4,
  },
  orgMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: 2,
  },
  orgMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  orgMetaText: {
    fontSize: 11,
    fontWeight: "500",
  },
});
