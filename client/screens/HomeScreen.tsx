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
import { ServiceSelectionModal } from "@/components/ServiceSelectionModal";
import { ActiveQueueCard } from "@/components/ActiveQueueCard";
import { useAuth } from "@/contexts/AuthContext";
import { useQueue } from "@/contexts/QueueContext";
import { Spacing, BorderRadius, AuroraColors } from "@/constants/theme";
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
  onPress: () => void;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
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

  const greetingTime = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
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
      onPress: handleScanQR,
    },
    {
      key: "book",
      title: "Book",
      icon: "calendar",
      onPress: handleBookAppointment,
    },
    {
      key: "queue",
      title: activeQueue ? "My Queue" : "Browse",
      icon: activeQueue ? "clipboard" : "compass",
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
    <View style={styles.container}>
      {/* Aurora background — base color + soft gradient washes */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: AuroraColors.bg }]} />
        <LinearGradient
          colors={["rgba(143,0,255,0.18)", "rgba(143,0,255,0)"]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.2, y: 0.6 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={["rgba(217,30,138,0)", "rgba(217,30,138,0.14)"]}
          start={{ x: 0.6, y: 0.2 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={["rgba(143,0,255,0)", "rgba(143,0,255,0.08)"]}
          start={{ x: 0.2, y: 0.5 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + Spacing.md,
            paddingBottom: tabBarHeight + Spacing["3xl"],
          },
        ]}
        scrollIndicatorInsets={{ bottom: tabBarHeight }}
      >
        {/* Greeting Header */}
        <Animated.View entering={FadeInDown.delay(50)} style={styles.greetingRow}>
          <View style={styles.greetingTextWrap}>
            <ThemedText style={styles.greetingHi}>
              {greetingTime.toUpperCase()}
            </ThemedText>
            <ThemedText style={styles.greetingTitle}>{greetingName}</ThemedText>
          </View>
          <View style={styles.avatarRing}>
            <View style={styles.avatarRingInner}>
              <Feather name="user" size={20} color={AuroraColors.text} />
            </View>
          </View>
        </Animated.View>

        {/* Search Bar */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Feather name="search" size={18} color={AuroraColors.textFaint} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search places, categories…"
              placeholderTextColor={AuroraColors.textFaint}
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
                <Feather name="x" size={18} color={AuroraColors.textFaint} />
              </Pressable>
            ) : null}
          </View>
        </Animated.View>

        {/* Active queue OR welcome hero */}
        {activeQueue ? (
          <Animated.View entering={FadeInUp.delay(150)} style={styles.sectionWrap}>
            <ActiveQueueCard queue={activeQueue} onPress={handleActiveQueuePress} />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInUp.delay(150)} style={styles.sectionWrap}>
            <View style={styles.heroOuter}>
              <View pointerEvents="none" style={styles.heroHaloWrap}>
                <LinearGradient
                  colors={[AuroraColors.magenta, AuroraColors.violet]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
              <View style={styles.heroCard}>
                <View style={styles.heroTextWrap}>
                  <ThemedText style={styles.heroEyebrow}>WELCOME</ThemedText>
                  <ThemedText style={styles.heroTitle}>
                    Skip the wait,{"\n"}join from anywhere
                  </ThemedText>
                  <Pressable
                    style={styles.heroButton}
                    onPress={handleScanQR}
                    testID="button-hero-scan"
                  >
                    <Feather name="maximize" size={14} color={AuroraColors.text} />
                    <ThemedText style={styles.heroButtonText}>Scan to join</ThemedText>
                  </Pressable>
                </View>
                <View style={styles.heroIllustration}>
                  <Feather
                    name="users"
                    size={56}
                    color="rgba(255,255,255,0.25)"
                  />
                </View>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Quick Actions */}
        <Animated.View entering={FadeInUp.delay(200)} style={styles.sectionWrap}>
          <View style={styles.quickRow}>
            {quickActions.map((action) => (
              <Pressable
                key={action.key}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.quickItem,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                testID={`quick-${action.key}`}
              >
                <View style={styles.quickIconWrap}>
                  <Feather name={action.icon} size={22} color={AuroraColors.text} />
                </View>
                <ThemedText style={styles.quickLabel} numberOfLines={1}>
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
            <ThemedText style={styles.sectionTitle}>Nearby & Fast</ThemedText>
            {filteredOrganizations.length > 0 ? (
              <ThemedText style={styles.sectionMeta}>
                {filteredOrganizations.length}{" "}
                {filteredOrganizations.length === 1 ? "place" : "places"}
              </ThemedText>
            ) : null}
          </View>

          {isLoadingOrgs ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={AuroraColors.magenta} />
            </View>
          ) : filteredOrganizations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="map-pin" size={28} color={AuroraColors.textFaint} />
              <ThemedText style={styles.emptyText}>
                {searchQuery
                  ? "No results match your search"
                  : "No organizations available right now"}
              </ThemedText>
            </View>
          ) : (
            <View style={styles.nearbyList}>
              {filteredOrganizations.map((org) => {
                const distance = calculateDistance(org);
                const waitText =
                  org.queueLength > 0 ? `${org.waitTime} min` : "No wait";
                const waitColor =
                  !org.isOpen
                    ? AuroraColors.textFaint
                    : org.waitTime === 0
                    ? AuroraColors.success
                    : org.waitTime > 20
                    ? AuroraColors.warning
                    : AuroraColors.text;
                return (
                  <Pressable
                    key={org.id}
                    onPress={() => handleSelectOrganization(org)}
                    disabled={!org.isOpen}
                    style={({ pressed }) => [
                      styles.nearbyCard,
                      {
                        opacity: !org.isOpen ? 0.55 : pressed ? 0.85 : 1,
                      },
                    ]}
                    testID={`card-org-${org.id}`}
                  >
                    <View style={styles.orgLogoWrap}>
                      {org.logoUrl ? (
                        <Image
                          source={{ uri: org.logoUrl }}
                          style={styles.orgLogo}
                          resizeMode="cover"
                        />
                      ) : (
                        <ThemedText style={styles.orgInitial}>
                          {org.name.charAt(0).toUpperCase()}
                        </ThemedText>
                      )}
                    </View>
                    <View style={styles.orgInfo}>
                      <ThemedText style={styles.orgName} numberOfLines={1}>
                        {org.name}
                      </ThemedText>
                      <View style={styles.orgMetaRow}>
                        <ThemedText style={styles.orgMetaText} numberOfLines={1}>
                          {org.category}
                        </ThemedText>
                        <View style={styles.orgMetaDot} />
                        {distance ? (
                          <View style={styles.orgMetaInline}>
                            <Feather
                              name="map-pin"
                              size={11}
                              color={AuroraColors.textFaint}
                            />
                            <ThemedText style={styles.orgMetaText}>
                              {distance}
                            </ThemedText>
                          </View>
                        ) : (
                          <ThemedText style={styles.orgMetaText} numberOfLines={1}>
                            {org.address}
                          </ThemedText>
                        )}
                      </View>
                    </View>
                    <View style={styles.orgRight}>
                      {!org.isOpen ? (
                        <View style={styles.closedPill}>
                          <ThemedText style={styles.closedText}>CLOSED</ThemedText>
                        </View>
                      ) : (
                        <ThemedText
                          style={[styles.orgWait, { color: waitColor }]}
                        >
                          {waitText}
                        </ThemedText>
                      )}
                    </View>
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
    backgroundColor: AuroraColors.bg,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },

  // Greeting
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
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.5,
    color: AuroraColors.textMuted,
    marginBottom: 4,
  },
  greetingTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: AuroraColors.text,
    letterSpacing: -0.4,
  },
  avatarRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    padding: 2,
    backgroundColor: AuroraColors.magenta,
  },
  avatarRingInner: {
    flex: 1,
    borderRadius: 21,
    backgroundColor: "#0F0F12",
    alignItems: "center",
    justifyContent: "center",
  },

  // Search
  searchWrap: {
    marginBottom: Spacing.xl,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: AuroraColors.border,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: AuroraColors.text,
    paddingVertical: Platform.OS === "ios" ? 0 : 4,
  },

  // Hero (no active queue)
  heroOuter: {
    position: "relative",
  },
  heroHaloWrap: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: BorderRadius.lg + 4,
    overflow: "hidden",
    opacity: 0.18,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    backgroundColor: AuroraColors.bgGlass,
    borderWidth: 1,
    borderColor: AuroraColors.borderStrong,
    overflow: "hidden",
  },
  heroTextWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  heroEyebrow: {
    color: AuroraColors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  heroTitle: {
    color: AuroraColors.text,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
    marginBottom: Spacing.md,
  },
  heroButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: AuroraColors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  heroButtonText: {
    color: AuroraColors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  heroIllustration: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
  },

  // Sections
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
    color: AuroraColors.text,
    letterSpacing: -0.2,
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: "500",
    color: AuroraColors.textMuted,
  },

  // Quick actions
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  quickItem: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  quickIconWrap: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: AuroraColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: AuroraColors.textMuted,
  },

  // Nearby
  nearbyList: {
    gap: Spacing.sm,
  },
  nearbyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: AuroraColors.border,
  },
  orgLogoWrap: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: AuroraColors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  orgLogo: {
    width: "100%",
    height: "100%",
  },
  orgInitial: {
    fontSize: 18,
    fontWeight: "700",
    color: AuroraColors.text,
  },
  orgInfo: {
    flex: 1,
    gap: 4,
  },
  orgName: {
    fontSize: 14,
    fontWeight: "700",
    color: AuroraColors.text,
  },
  orgMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orgMetaInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  orgMetaText: {
    fontSize: 11,
    fontWeight: "500",
    color: AuroraColors.textFaint,
  },
  orgMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: AuroraColors.textFaint,
    opacity: 0.5,
  },
  orgRight: {
    alignItems: "flex-end",
    minWidth: 60,
  },
  orgWait: {
    fontSize: 13,
    fontWeight: "700",
  },
  closedPill: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  closedText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: AuroraColors.textFaint,
  },

  // States
  loadingWrap: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
  },
  emptyCard: {
    paddingVertical: Spacing["2xl"],
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: AuroraColors.border,
  },
  emptyText: {
    fontSize: 13,
    color: AuroraColors.textMuted,
    textAlign: "center",
  },
});
