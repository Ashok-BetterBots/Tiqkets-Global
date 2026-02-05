import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Image,
  useColorScheme,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";

type Mode = "login" | "register";

function BackToCustomerButton() {
  const { setOrgLoginMode } = useOrganization();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        setOrgLoginMode(false);
      }}
      style={{
        position: "absolute",
        top: 0,
        left: Spacing.md,
        flexDirection: "row",
        alignItems: "center",
        zIndex: 10,
        paddingVertical: Spacing.sm,
      }}
    >
      <Feather name="arrow-left" size={20} color="#FFFFFF" />
      <ThemedText
        style={{ marginLeft: Spacing.xs, fontSize: 14, fontWeight: "600" }}
        lightColor="#FFFFFF"
        darkColor="#FFFFFF"
      >
        Back
      </ThemedText>
    </Pressable>
  );
}

export default function OrgLoginScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { loginOrganization, registerOrganization, isLoading } = useOrganization();
  
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const success = await loginOrganization(email, password);
    if (!success) {
      setError("Invalid credentials. Please try again.");
    }
  };

  const handleRegister = async () => {
    if (!orgName || !email || !password || !phone || !address || !city) {
      setError("Please fill in all required fields");
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const success = await registerOrganization({
      name: orgName,
      email,
      phone,
      address,
      city,
      state,
      pincode,
      category: category || "Other",
    });
    
    if (!success) {
      setError("Registration failed. Please try again.");
    }
  };

  const toggleMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError("");
    Haptics.selectionAsync();
  };

  return (
    <ThemedView style={styles.container}>
      <LinearGradient
        colors={[BrandColors.primary, BrandColors.primaryDark]}
        style={[styles.header, { paddingTop: insets.top + Spacing.xl }]}
      >
        <BackToCustomerButton />
        <Image
          source={require("../../assets/images/logo/logo-white.png")}
          style={{ width: 64, height: 64 }}
          resizeMode="contain"
        />
        <ThemedText style={styles.headerTitle} lightColor="#FFFFFF" darkColor="#FFFFFF">
          TIQKETS for Business
        </ThemedText>
        <ThemedText style={styles.headerSubtitle} lightColor="rgba(255,255,255,0.8)" darkColor="rgba(255,255,255,0.8)">
          {mode === "login" ? "Sign in to manage your organization" : "Register your organization"}
        </ThemedText>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.formContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={[styles.errorContainer, { backgroundColor: colors.accent + "15" }]}>
              <Feather name="alert-circle" size={16} color={colors.accent} />
              <ThemedText style={[styles.errorText, { color: colors.accent }]}>{error}</ThemedText>
            </View>
          ) : null}

          {mode === "register" ? (
            <>
              <View style={styles.inputGroup}>
                <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Organization Name *</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? "#2A2A2A" : "#F3F4F6", color: colors.text }]}
                  value={orgName}
                  onChangeText={setOrgName}
                  placeholder="Enter organization name"
                  placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Category</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? "#2A2A2A" : "#F3F4F6", color: colors.text }]}
                  value={category}
                  onChangeText={setCategory}
                  placeholder="e.g., Healthcare, Banking, Government"
                  placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Phone Number *</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? "#2A2A2A" : "#F3F4F6", color: colors.text }]}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Enter phone number"
                  placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Address *</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? "#2A2A2A" : "#F3F4F6", color: colors.text }]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Street address"
                  placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: Spacing.sm }]}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>City *</ThemedText>
                  <TextInput
                    style={[styles.input, { backgroundColor: isDark ? "#2A2A2A" : "#F3F4F6", color: colors.text }]}
                    value={city}
                    onChangeText={setCity}
                    placeholder="City"
                    placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>State</ThemedText>
                  <TextInput
                    style={[styles.input, { backgroundColor: isDark ? "#2A2A2A" : "#F3F4F6", color: colors.text }]}
                    value={state}
                    onChangeText={setState}
                    placeholder="State"
                    placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Pincode</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? "#2A2A2A" : "#F3F4F6", color: colors.text }]}
                  value={pincode}
                  onChangeText={setPincode}
                  placeholder="Postal code"
                  placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                  keyboardType="number-pad"
                />
              </View>
            </>
          ) : null}

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Email *</ThemedText>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? "#2A2A2A" : "#F3F4F6", color: colors.text }]}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Password *</ThemedText>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? "#2A2A2A" : "#F3F4F6", color: colors.text }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
              secureTextEntry
            />
          </View>

          <Button
            title={mode === "login" ? "Sign In" : "Register Organization"}
            onPress={mode === "login" ? handleLogin : handleRegister}
            loading={isLoading}
            style={styles.submitButton}
          />

          <Pressable onPress={toggleMode} style={styles.toggleButton}>
            <ThemedText style={[styles.toggleText, { color: isDark ? BrandColors.primaryLight : BrandColors.primary }]}>
              {mode === "login"
                ? "Don't have an account? Register"
                : "Already registered? Sign In"}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing["2xl"],
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: Spacing.md,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  formContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    marginLeft: Spacing.sm,
    fontSize: 14,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  input: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 16,
  },
  row: {
    flexDirection: "row",
  },
  submitButton: {
    marginTop: Spacing.md,
  },
  toggleButton: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
