import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Dimensions,
  Platform,
  Animated as RNAnimated,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import Animated, { FadeInUp, FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { MapViewWrapper, MapOrganization } from "@/components/MapViewWrapper";
import { getApiUrl } from "@/lib/query-client";

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { ServiceSelectionModal } from "@/components/ServiceSelectionModal";
import { ActiveQueueCard } from "@/components/ActiveQueueCard";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Organization as QueueOrganization, Service } from "@/types/queue";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const CARD_MARGIN = Spacing.sm;

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

const FALLBACK_ORGANIZATIONS: Organization[] = [];

const DEFAULT_REGION: Region = {
  latitude: 24.7136,
  longitude: 46.6753,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme, isDark } = useTheme();
  const { activeQueue } = useQueue();
  const flatListRef = useRef<RNAnimated.FlatList>(null);
  const mapRef = useRef<any>(null);
  const scrollX = useRef(new RNAnimated.Value(0)).current;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrgIndex, setSelectedOrgIndex] = useState(0);
  const [organizations, setOrganizations] = useState<Organization[]>(FALLBACK_ORGANIZATIONS);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<Array<{ address: string; latitude: number; longitude: number }>>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (data.organizations && data.organizations.length > 0) {
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
      setLocationPermission(status);
      
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

  const searchLocation = async (query: string) => {
    if (query.length < 3) {
      setLocationSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsSearchingLocation(true);
    try {
      const results = await Location.geocodeAsync(query);
      if (results.length > 0) {
        const suggestions = await Promise.all(
          results.slice(0, 5).map(async (result) => {
            const reverseResults = await Location.reverseGeocodeAsync({
              latitude: result.latitude,
              longitude: result.longitude,
            });
            const addr = reverseResults[0];
            const address = addr
              ? [addr.name, addr.street, addr.city, addr.region, addr.country]
                  .filter(Boolean)
                  .join(", ")
              : `${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}`;
            return {
              address,
              latitude: result.latitude,
              longitude: result.longitude,
            };
          })
        );
        setLocationSuggestions(suggestions);
        setShowSuggestions(true);
      } else {
        setLocationSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.log("Geocoding error:", error);
      setLocationSuggestions([]);
    } finally {
      setIsSearchingLocation(false);
    }
  };

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length >= 3) {
      searchTimeoutRef.current = setTimeout(() => {
        searchLocation(searchQuery);
      }, 500);
    } else {
      setLocationSuggestions([]);
      setShowSuggestions(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleSelectSuggestion = (suggestion: { address: string; latitude: number; longitude: number }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchQuery(suggestion.address);
    setShowSuggestions(false);
    setLocationSuggestions([]);

    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
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

  const handleSelectOrganization = (org: Organization) => {
    if (!org.isOpen) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedOrg(org);
    setShowServiceModal(true);
  };

  const handleJoinQueueFromModal = (organizationId: string, serviceId: string, formData: Record<string, string>) => {
    setShowServiceModal(false);
    if (selectedOrg) {
      const service = selectedOrg.services.find(s => s.id === serviceId);
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

  const handleCenterOnUser = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    } else if (mapRef.current) {
      mapRef.current.animateToRegion(DEFAULT_REGION, 500);
    }
  };

  const handleMarkerPress = (org: MapOrganization, index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedOrgIndex(index);
    
    if (flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    }
    
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: org.latitude,
        longitude: org.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  };

  const filteredOrganizations = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const index = viewableItems[0].index;
      setSelectedOrgIndex(index);
      
      const org = filteredOrganizations[index];
      if (org && mapRef.current && mapReady) {
        mapRef.current.animateToRegion({
          latitude: org.latitude,
          longitude: org.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }, 300);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const getCategoryIcon = (category: string): keyof typeof Feather.glyphMap => {
    switch (category.toLowerCase()) {
      case "healthcare":
        return "heart";
      case "banking":
        return "credit-card";
      case "government":
        return "briefcase";
      case "retail":
        return "shopping-bag";
      default:
        return "grid";
    }
  };

  const getMarkerColor = (category: string, isOpen: boolean): string => {
    if (!isOpen) return "#9CA3AF";
    switch (category.toLowerCase()) {
      case "healthcare":
        return "#EF4444";
      case "banking":
        return "#3B82F6";
      case "government":
        return "#8B5CF6";
      case "retail":
        return "#10B981";
      default:
        return BrandColors.primary;
    }
  };

  const renderOrganizationCard = ({ item, index }: { item: Organization; index: number }) => {
    const inputRange = [
      (index - 1) * (CARD_WIDTH + CARD_MARGIN * 2),
      index * (CARD_WIDTH + CARD_MARGIN * 2),
      (index + 1) * (CARD_WIDTH + CARD_MARGIN * 2),
    ];

    const scale = scrollX.interpolate({
      inputRange,
      outputRange: [0.95, 1, 0.95],
      extrapolate: "clamp",
    });

    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.7, 1, 0.7],
      extrapolate: "clamp",
    });

    const getDistanceText = () => {
      if (!userLocation || !item.latitude || !item.longitude) return "- -";
      const R = 6371;
      const dLat = ((item.latitude - userLocation.latitude) * Math.PI) / 180;
      const dLon = ((item.longitude - userLocation.longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((userLocation.latitude * Math.PI) / 180) *
        Math.cos((item.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const dist = R * c;
      if (dist < 1) return `${Math.round(dist * 1000)} m`;
      return `${dist.toFixed(1)} km`;
    };

    const waitTimeText = item.queueLength > 0 ? `${item.waitTime} min` : "No wait";

    return (
      <RNAnimated.View style={{ transform: [{ scale }], opacity }}>
        <Card style={{ ...styles.orgCard, width: CARD_WIDTH }}>
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <View style={styles.orgLogoContainer}>
                {item.logoUrl ? (
                  <Image source={{ uri: item.logoUrl }} style={styles.orgLogo} resizeMode="cover" />
                ) : (
                  <Feather name={getCategoryIcon(item.category)} size={22} color={BrandColors.primary} />
                )}
              </View>
              <View style={styles.orgDetails}>
                <ThemedText style={styles.orgName} numberOfLines={1}>
                  {item.name}
                </ThemedText>
                <ThemedText style={styles.orgAddress} numberOfLines={1}>
                  {item.address}
                </ThemedText>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: item.isOpen ? "#10B981" : "#EF4444" }]}>
                <ThemedText style={styles.statusText}>
                  {item.isOpen ? "Open" : "Closed"}
                </ThemedText>
              </View>
            </View>

            <View style={styles.cardStats}>
              <View style={styles.statItem}>
                <Feather name="clock" size={14} color={BrandColors.accent} />
                <ThemedText style={styles.statValue}>{waitTimeText}</ThemedText>
              </View>
              <View style={styles.statItem}>
                <Feather name="users" size={14} color={BrandColors.accent} />
                <ThemedText style={styles.statValue}>{item.queueLength} waiting</ThemedText>
              </View>
              <View style={styles.statItem}>
                <Feather name="navigation" size={14} color={BrandColors.accent} />
                <ThemedText style={styles.statValue}>{getDistanceText()}</ThemedText>
              </View>
            </View>

            <Pressable
              style={[styles.joinButton, !item.isOpen && styles.joinButtonDisabled]}
              onPress={() => handleSelectOrganization(item)}
              disabled={!item.isOpen}
              testID={`button-join-${item.id}`}
            >
              <ThemedText style={styles.joinButtonText}>
                {item.isOpen ? "Select & Join" : "Currently Closed"}
              </ThemedText>
            </Pressable>
          </View>
        </Card>
      </RNAnimated.View>
    );
  };

  const renderMapContent = () => {
    return (
      <MapViewWrapper
        mapRef={mapRef}
        initialRegion={DEFAULT_REGION}
        showsUserLocation={locationPermission === "granted"}
        organizations={filteredOrganizations}
        selectedOrgIndex={selectedOrgIndex}
        onMapReady={() => setMapReady(true)}
        onMarkerPress={handleMarkerPress}
        getCategoryIcon={getCategoryIcon}
        getMarkerColor={getMarkerColor}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {renderMapContent()}

      <LinearGradient
        colors={["rgba(0,0,0,0.6)", "transparent"]}
        style={[styles.topGradient, { paddingTop: insets.top }]}
      >
        <Animated.View entering={FadeInDown.delay(200)} style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Feather name="search" size={20} color={Colors.light.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, location, or pincode"
              placeholderTextColor={Colors.light.textSecondary}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                if (text.length === 0) {
                  setShowSuggestions(false);
                  setLocationSuggestions([]);
                }
              }}
              onFocus={() => {
                if (locationSuggestions.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              testID="input-search"
            />
            {isSearchingLocation ? (
              <View style={styles.searchLoading}>
                <Feather name="loader" size={16} color={BrandColors.primary} />
              </View>
            ) : searchQuery.length > 0 ? (
              <Pressable onPress={() => {
                setSearchQuery("");
                setShowSuggestions(false);
                setLocationSuggestions([]);
              }} testID="button-clear-search">
                <Feather name="x" size={18} color={Colors.light.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          <Pressable style={styles.scanButton} onPress={handleScanQR} testID="button-scan-qr">
            <Feather name="maximize" size={22} color="#FFFFFF" />
          </Pressable>
        </Animated.View>

        {showSuggestions && locationSuggestions.length > 0 ? (
          <View style={styles.suggestionsContainer}>
            {locationSuggestions.map((suggestion, index) => (
              <Pressable
                key={index}
                style={styles.suggestionItem}
                onPress={() => handleSelectSuggestion(suggestion)}
                testID={`suggestion-${index}`}
              >
                <Feather name="map-pin" size={16} color={BrandColors.primary} />
                <ThemedText style={styles.suggestionText} numberOfLines={2}>
                  {suggestion.address}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </LinearGradient>

      <Pressable 
        style={[styles.centerButton, { bottom: 280 + insets.bottom }]} 
        onPress={handleCenterOnUser}
        testID="button-center-location"
      >
        <Feather name="crosshair" size={22} color={BrandColors.primary} />
      </Pressable>

      {activeQueue ? (
        <LinearGradient
          colors={["transparent", isDark ? "rgba(39,38,38,0.95)" : "rgba(255,255,255,0.95)"]}
          style={[styles.bottomGradient, { paddingBottom: insets.bottom + 80 }]}
        >
          <Animated.View entering={FadeInUp.delay(300)}>
            <ActiveQueueCard queue={activeQueue} onPress={handleActiveQueuePress} />
          </Animated.View>
        </LinearGradient>
      ) : (
        <LinearGradient
          colors={["transparent", isDark ? "rgba(39,38,38,0.95)" : "rgba(255,255,255,0.95)"]}
          style={[styles.bottomGradient, { paddingBottom: insets.bottom + 80 }]}
        >
          <Animated.View entering={FadeInUp.delay(300)}>
            <ThemedText style={styles.nearbyTitle}>
              Nearby Organizations
            </ThemedText>
            <RNAnimated.FlatList
              ref={flatListRef}
              data={filteredOrganizations}
              renderItem={renderOrganizationCard}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContent}
              snapToInterval={CARD_WIDTH + CARD_MARGIN * 2}
              decelerationRate="fast"
              onScroll={RNAnimated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: true }
              )}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              getItemLayout={(data, index) => ({
                length: CARD_WIDTH + CARD_MARGIN * 2,
                offset: (CARD_WIDTH + CARD_MARGIN * 2) * index,
                index,
              })}
              testID="carousel-organizations"
            />
          </Animated.View>
        </LinearGradient>
      )}

      <ServiceSelectionModal
        visible={showServiceModal}
        organization={selectedOrg ? {
          id: selectedOrg.id,
          name: selectedOrg.name,
          description: selectedOrg.description,
          services: selectedOrg.services,
        } : null}
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
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.light.text,
    paddingVertical: Platform.OS === "ios" ? Spacing.xs : 0,
  },
  scanButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: BrandColors.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: BrandColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  centerButton: {
    position: "absolute",
    right: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: Spacing["2xl"],
  },
  nearbyTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginLeft: Spacing.lg,
    marginBottom: Spacing.md,
  },
  carouselContent: {
    paddingHorizontal: Spacing.lg - CARD_MARGIN,
  },
  orgCard: {
    marginHorizontal: CARD_MARGIN,
    padding: 0,
    overflow: "hidden",
  },
  cardContent: {
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  orgLogoContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BrandColors.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
    overflow: "hidden",
  },
  orgLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  orgDetails: {
    flex: 1,
  },
  orgName: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  orgAddress: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  cardStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.light.text,
  },
  joinButton: {
    backgroundColor: BrandColors.primary,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  joinButtonDisabled: {
    backgroundColor: Colors.light.textSecondary,
  },
  joinButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  searchLoading: {
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  suggestionsContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    overflow: "hidden",
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.backgroundSecondary,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
  },
});
