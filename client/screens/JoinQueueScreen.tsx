import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { ServiceSelectionModal } from "@/components/ServiceSelectionModal";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { useAuth } from "@/contexts/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Organization, Service } from "@/types/queue";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface OrganizationWithLocation extends Organization {
  location: {
    latitude: number;
    longitude: number;
    address: string;
    city: string;
    state: string;
    pincode: string;
    radius: number;
  };
  distance?: number;
}

const MOCK_ORGANIZATIONS: OrganizationWithLocation[] = [
  {
    id: "org_1",
    name: "City Hospital",
    description: "Healthcare services",
    services: [
      { id: "svc_1", name: "General Consultation", description: "", averageWaitTime: 15, formFields: [] },
      { id: "svc_2", name: "Lab Tests", description: "", averageWaitTime: 10, formFields: [] },
      { id: "svc_3", name: "Pharmacy", description: "", averageWaitTime: 5, formFields: [] },
    ],
    location: {
      latitude: 37.7749,
      longitude: -122.4194,
      address: "123 Health St",
      city: "San Francisco",
      state: "California",
      pincode: "94102",
      radius: 100,
    },
  },
  {
    id: "org_2",
    name: "National Bank",
    description: "Banking services",
    services: [
      { id: "svc_4", name: "Account Services", description: "", averageWaitTime: 12, formFields: [] },
      { id: "svc_5", name: "Loans", description: "", averageWaitTime: 20, formFields: [] },
      { id: "svc_6", name: "Customer Support", description: "", averageWaitTime: 8, formFields: [] },
    ],
    location: {
      latitude: 37.7849,
      longitude: -122.4094,
      address: "456 Finance Ave",
      city: "San Francisco",
      state: "California",
      pincode: "94103",
      radius: 100,
    },
  },
  {
    id: "org_3",
    name: "DMV Office",
    description: "Government services",
    services: [
      { id: "svc_7", name: "License Renewal", description: "", averageWaitTime: 25, formFields: [] },
      { id: "svc_8", name: "Vehicle Registration", description: "", averageWaitTime: 30, formFields: [] },
    ],
    location: {
      latitude: 37.7649,
      longitude: -122.4294,
      address: "789 Gov Blvd",
      city: "Oakland",
      state: "California",
      pincode: "94612",
      radius: 100,
    },
  },
  {
    id: "org_4",
    name: "Tech Support Center",
    description: "IT support services",
    services: [
      { id: "svc_9", name: "Hardware Repair", description: "", averageWaitTime: 20, formFields: [] },
      { id: "svc_10", name: "Software Help", description: "", averageWaitTime: 15, formFields: [] },
    ],
    location: {
      latitude: 34.0522,
      longitude: -118.2437,
      address: "100 Tech Blvd",
      city: "Los Angeles",
      state: "California",
      pincode: "90012",
      radius: 100,
    },
  },
  {
    id: "org_5",
    name: "City Utilities",
    description: "Utility services",
    services: [
      { id: "svc_11", name: "Bill Payment", description: "", averageWaitTime: 8, formFields: [] },
      { id: "svc_12", name: "New Connection", description: "", averageWaitTime: 25, formFields: [] },
    ],
    location: {
      latitude: 40.7128,
      longitude: -74.0060,
      address: "200 Utility Way",
      city: "New York",
      state: "New York",
      pincode: "10001",
      radius: 100,
    },
  },
  {
    id: "org_6",
    name: "Metro Clinic",
    description: "Walk-in medical clinic",
    services: [
      { id: "svc_13", name: "Urgent Care", description: "", averageWaitTime: 20, formFields: [] },
      { id: "svc_14", name: "Vaccinations", description: "", averageWaitTime: 10, formFields: [] },
    ],
    location: {
      latitude: 41.8781,
      longitude: -87.6298,
      address: "500 Medical Parkway",
      city: "Chicago",
      state: "Illinois",
      pincode: "60601",
      radius: 100,
    },
  },
];

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  if (km < 100) {
    return `${km.toFixed(1)} km`;
  }
  return `${Math.round(km)} km`;
}

export default function JoinQueueScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const { joinQueue } = useQueue();
  const { user } = useAuth();

  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [tempOrg, setTempOrg] = useState<Organization | null>(null);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState(false);

  useEffect(() => {
    (async () => {
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
        } else {
          setLocationError(true);
        }
      } catch (error) {
        console.log("Location error:", error);
        setLocationError(true);
      } finally {
        setLocationLoading(false);
      }
    })();
  }, []);

  const filteredAndSortedOrgs = useMemo(() => {
    let orgs = [...MOCK_ORGANIZATIONS];
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      orgs = orgs.filter((org) => {
        const searchableFields = [
          org.name,
          org.description,
          org.location.city,
          org.location.state,
          org.location.pincode,
          org.location.address,
        ].map((f) => f.toLowerCase());
        
        return searchableFields.some((field) => field.includes(query));
      });
    }

    if (userLocation) {
      orgs = orgs.map((org) => ({
        ...org,
        distance: calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          org.location.latitude,
          org.location.longitude
        ),
      }));
      orgs.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    }

    return orgs;
  }, [searchQuery, userLocation]);

  const canSubmit = selectedOrg && selectedService && name.trim();

  const handleOrgPress = (org: Organization) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempOrg(org);
    setShowServiceModal(true);
  };

  const handleServiceSelect = (service: Service) => {
    if (tempOrg) {
      setSelectedOrg(tempOrg);
      setSelectedService(service);
    }
    setShowServiceModal(false);
  };

  const handleJoin = async () => {
    if (!canSubmit || !selectedOrg || !selectedService) return;

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await joinQueue({
        organizationId: selectedOrg.id,
        organizationName: selectedOrg.name,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        formData: { name, phone, reason },
        notificationPreferences: {
          inApp: true,
          whatsApp: false,
          sms: false,
        },
      });
      navigation.goBack();
    } finally {
      setIsSubmitting(false);
    }
  };

  const getOrgDistance = (org: OrganizationWithLocation): string | null => {
    if (!userLocation) return null;
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      org.location.latitude,
      org.location.longitude
    );
    return formatDistance(distance);
  };

  return (
    <>
      <KeyboardAwareScrollViewCompat
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
      >
        {selectedOrg && selectedService ? (
          <Animated.View entering={FadeInDown.springify()}>
            <View style={[styles.selectedCard, { backgroundColor: theme.backgroundDefault }]}>
              <View style={styles.selectedInfo}>
                <View style={[styles.selectedIcon, { backgroundColor: theme.primary + "15" }]}>
                  <Feather name="briefcase" size={20} color={theme.primary} />
                </View>
                <View style={styles.selectedText}>
                  <ThemedText type="body" style={styles.selectedOrg}>
                    {selectedOrg.name}
                  </ThemedText>
                  <ThemedText type="caption" style={{ color: theme.primary }}>
                    {selectedService.name}
                  </ThemedText>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  setSelectedOrg(null);
                  setSelectedService(null);
                }}
                style={[styles.changeButton, { backgroundColor: theme.backgroundSecondary }]}
              >
                <ThemedText type="caption" style={{ fontWeight: "600" }}>
                  Change
                </ThemedText>
              </Pressable>
            </View>

            <ThemedText
              type="small"
              style={[styles.sectionLabel, { color: theme.textSecondary }]}
            >
              Your Details
            </ThemedText>
            <View style={[styles.formSection, { backgroundColor: theme.backgroundDefault }]}>
              <TextInput
                placeholder="Full Name *"
                placeholderTextColor={theme.textSecondary}
                value={name}
                onChangeText={setName}
                selectTextOnFocus
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />
              <TextInput
                placeholder="Phone Number"
                placeholderTextColor={theme.textSecondary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                selectTextOnFocus
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />
              <TextInput
                placeholder="Reason for Visit (Optional)"
                placeholderTextColor={theme.textSecondary}
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={3}
                style={[
                  styles.input,
                  styles.textArea,
                  { color: theme.text, borderColor: theme.border },
                ]}
              />
            </View>

            <Button
              onPress={handleJoin}
              disabled={!canSubmit || isSubmitting}
              style={styles.submitButton}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                "Join Queue"
              )}
            </Button>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.springify()}>
            <View style={[styles.searchContainer, { backgroundColor: theme.backgroundDefault }]}>
              <Feather name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
              <TextInput
                placeholder="Search by name, city, state, or pincode..."
                placeholderTextColor={theme.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={[styles.searchInput, { color: theme.text }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 ? (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                  <Feather name="x-circle" size={18} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            {locationLoading ? (
              <View style={styles.locationStatus}>
                <ActivityIndicator size="small" color={theme.primary} />
                <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.sm }}>
                  Finding nearby organizations...
                </ThemedText>
              </View>
            ) : userLocation ? (
              <View style={styles.locationStatus}>
                <Feather name="map-pin" size={14} color={theme.primary} />
                <ThemedText type="caption" style={{ color: theme.primary, marginLeft: Spacing.xs }}>
                  Showing organizations sorted by distance
                </ThemedText>
              </View>
            ) : locationError ? (
              <View style={styles.locationStatus}>
                <Feather name="alert-circle" size={14} color={theme.textSecondary} />
                <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.xs }}>
                  Location unavailable - showing all organizations
                </ThemedText>
              </View>
            ) : null}

            <ThemedText
              type="small"
              style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: Spacing.md }]}
            >
              {searchQuery.trim() 
                ? `Results for "${searchQuery}" (${filteredAndSortedOrgs.length})`
                : userLocation 
                  ? "Nearby Organizations" 
                  : "All Organizations"}
            </ThemedText>

            {filteredAndSortedOrgs.length > 0 ? (
              <View style={styles.orgList}>
                {filteredAndSortedOrgs.map((org) => {
                  const distance = getOrgDistance(org);
                  return (
                    <Pressable
                      key={org.id}
                      onPress={() => handleOrgPress(org)}
                      style={({ pressed }) => [
                        styles.orgCard,
                        { backgroundColor: theme.backgroundDefault },
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <View style={[styles.orgIconSmall, { backgroundColor: theme.primary + "10" }]}>
                        <Feather name="briefcase" size={18} color={theme.primary} />
                      </View>
                      <View style={styles.orgInfo}>
                        <ThemedText type="body" style={styles.orgName}>
                          {org.name}
                        </ThemedText>
                        <View style={styles.orgMeta}>
                          <Feather name="map-pin" size={12} color={theme.textSecondary} />
                          <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: 4, flex: 1 }}>
                            {org.location.city}, {org.location.state}
                          </ThemedText>
                        </View>
                        <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                          {org.description} • {org.services.length} services
                        </ThemedText>
                      </View>
                      <View style={styles.orgRight}>
                        {distance ? (
                          <View style={[styles.distanceBadge, { backgroundColor: theme.primary + "15" }]}>
                            <ThemedText type="caption" style={{ color: theme.primary, fontWeight: "600" }}>
                              {distance}
                            </ThemedText>
                          </View>
                        ) : null}
                        <Feather name="chevron-right" size={20} color={theme.textSecondary} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={[styles.emptyState, { backgroundColor: theme.backgroundDefault }]}>
                <Feather name="search" size={40} color={theme.textSecondary} />
                <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
                  No organizations found
                </ThemedText>
                <ThemedText type="caption" style={{ color: theme.textSecondary, marginTop: Spacing.xs, textAlign: "center" }}>
                  Try searching with a different city, state, or pincode
                </ThemedText>
              </View>
            )}
          </Animated.View>
        )}
      </KeyboardAwareScrollViewCompat>

      <ServiceSelectionModal
        visible={showServiceModal}
        organization={tempOrg}
        onClose={() => setShowServiceModal(false)}
        onSelectService={handleServiceSelect}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.sm,
  },
  locationStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  sectionLabel: {
    fontWeight: "600",
    marginBottom: Spacing.md,
    marginTop: Spacing.xl,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  selectedInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  selectedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  selectedText: {
    flex: 1,
  },
  selectedOrg: {
    fontWeight: "600",
    marginBottom: 2,
  },
  changeButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
  orgList: {
    gap: Spacing.sm,
  },
  orgCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  orgIconSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    fontWeight: "600",
    marginBottom: 2,
  },
  orgMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  orgRight: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  distanceBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  formSection: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  input: {
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    paddingTop: Spacing.md,
    textAlignVertical: "top",
  },
  submitButton: {
    marginTop: Spacing["2xl"],
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.sm,
  },
});
