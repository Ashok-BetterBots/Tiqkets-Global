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
import {
  Colors,
  Spacing,
  BorderRadius,
  BrandColors,
  Shadows,
} from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";

type Mode = "login" | "register";

function BackToCustomerButton() {
  const { setOrgLoginMode } = useOrganization();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        setOrgLoginMode(false);
      }}
      style={{
        position: "absolute",
        top: insets.top + Spacing.sm,
        left: Spacing.md,
        flexDirection: "row",
        alignItems: "center",
        zIndex: 10,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        borderRadius: BorderRadius.full,
        backgroundColor: "rgba(255,255,255,0.14)",
      }}
    >
      <Feather name="arrow-left" size={18} color="#FFFFFF" />
      <ThemedText
        style={{ marginLeft: Spacing.xs, fontSize: 13, fontWeight: "600" }}
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
  const { loginOrganization, registerOrganization, isLoading } =
    useOrganization();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    const result = await loginOrganization(email, password);
    if (!result.success) {
      setError(result.error || "Invalid credentials. Please try again.");
    }
  };

  const handleRegister = async () => {
    if (!orgName || !email || !password || !phone || !address || !city) {
      setError("Please fill in all required fields");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await registerOrganization({
      name: orgName,
      email,
      password,
      phone,
      address,
      city,
      state,
      pincode,
      category: category || "Other",
    });

    if (!result.success) {
      setError(result.error || "Registration failed. Please try again.");
    }
  };

  const toggleMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError("");
    Haptics.selectionAsync();
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.surface,
      borderColor: colors.borderSubtle,
      color: colors.text,
    },
  ];
  const placeholderColor = colors.mutedText;

  const renderField = (
    label: string,
    value: string,
    onChangeText: (v: string) => void,
    placeholder: string,
    extra: Partial<React.ComponentProps<typeof TextInput>> = {},
    required = false,
  ) => (
    <View style={styles.inputGroup}>
      <ThemedText
        style={[styles.inputLabel, { color: colors.textSecondary }]}
      >
        {label}
        {required ? " *" : ""}
      </ThemedText>
      <TextInput
        style={inputStyle}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        {...extra}
      />
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <LinearGradient
        colors={[BrandColors.primary, BrandColors.primaryDark]}
        style={[styles.header, { paddingTop: insets.top + Spacing["2xl"] }]}
      >
        <BackToCustomerButton />
        <View style={styles.logoBadge}>
          <Image
            source={require("../../assets/images/logo/logo-white.png")}
            style={{ width: 48, height: 48 }}
            resizeMode="contain"
          />
        </View>
        <ThemedText
          style={styles.headerTitle}
          lightColor="#FFFFFF"
          darkColor="#FFFFFF"
        >
          TIQKETS for Business
        </ThemedText>
        <ThemedText
          style={styles.headerSubtitle}
          lightColor="rgba(255,255,255,0.85)"
          darkColor="rgba(255,255,255,0.85)"
        >
          {mode === "login"
            ? "Sign in to manage your organization"
            : "Register your organization"}
        </ThemedText>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.formContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + Spacing["2xl"] },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
              },
              Shadows.card,
            ]}
          >
            <View
              style={[
                styles.modeToggle,
                { backgroundColor: colors.surfaceMuted },
              ]}
            >
              <Pressable
                onPress={() => mode !== "login" && toggleMode()}
                style={[
                  styles.modeToggleItem,
                  mode === "login" && {
                    backgroundColor: colors.brand,
                  },
                ]}
              >
                <ThemedText
                  style={[
                    styles.modeToggleText,
                    {
                      color:
                        mode === "login" ? "#FFFFFF" : colors.textSecondary,
                    },
                  ]}
                >
                  Sign In
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => mode !== "register" && toggleMode()}
                style={[
                  styles.modeToggleItem,
                  mode === "register" && {
                    backgroundColor: colors.brand,
                  },
                ]}
              >
                <ThemedText
                  style={[
                    styles.modeToggleText,
                    {
                      color:
                        mode === "register"
                          ? "#FFFFFF"
                          : colors.textSecondary,
                    },
                  ]}
                >
                  Register
                </ThemedText>
              </Pressable>
            </View>

            {mode === "register" ? (
              <>
                {renderField(
                  "Organization Name",
                  orgName,
                  setOrgName,
                  "Enter organization name",
                  {},
                  true,
                )}
                {renderField(
                  "Category",
                  category,
                  setCategory,
                  "e.g., Healthcare, Banking, Government",
                )}
                {renderField(
                  "Phone Number",
                  phone,
                  setPhone,
                  "Enter phone number",
                  { keyboardType: "phone-pad" },
                  true,
                )}
                {renderField(
                  "Address",
                  address,
                  setAddress,
                  "Street address",
                  {},
                  true,
                )}
                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: Spacing.sm }}>
                    {renderField(
                      "City",
                      city,
                      setCity,
                      "City",
                      {},
                      true,
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    {renderField("State", state, setState, "State")}
                  </View>
                </View>
                {renderField(
                  "Pincode",
                  pincode,
                  setPincode,
                  "Postal code",
                  { keyboardType: "number-pad" },
                )}
              </>
            ) : null}

            {renderField(
              "Email",
              email,
              setEmail,
              "Enter your email",
              { keyboardType: "email-address", autoCapitalize: "none" },
              true,
            )}

            <View style={styles.inputGroup}>
              <ThemedText
                style={[styles.inputLabel, { color: colors.textSecondary }]}
              >
                Password *
              </ThemedText>
              <View style={{ position: "relative" }}>
                <TextInput
                  style={[inputStyle, { paddingRight: 48 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={placeholderColor}
                  secureTextEntry={!showPassword}
                />
                <Pressable
                  onPress={() => setShowPassword((p) => !p)}
                  style={styles.eyeButton}
                  hitSlop={8}
                >
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={18}
                    color={colors.mutedText}
                  />
                </Pressable>
              </View>
            </View>

            {error ? (
              <View
                style={[
                  styles.errorContainer,
                  {
                    backgroundColor: colors.error + "15",
                    borderColor: colors.error + "33",
                  },
                ]}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                <Feather
                  name="alert-circle"
                  size={16}
                  color={colors.error}
                />
                <ThemedText
                  style={[styles.errorText, { color: colors.error }]}
                >
                  {error}
                </ThemedText>
              </View>
            ) : null}

            <Button
              title={mode === "login" ? "Sign In" : "Register Organization"}
              onPress={mode === "login" ? handleLogin : handleRegister}
              loading={isLoading}
              style={styles.submitButton}
            />
          </View>

          <Pressable onPress={toggleMode} style={styles.toggleButton}>
            <ThemedText
              style={[
                styles.toggleText,
                {
                  color: isDark
                    ? BrandColors.primaryLight
                    : BrandColors.primary,
                },
              ]}
            >
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
    paddingBottom: Spacing["3xl"],
    alignItems: "center",
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
  },
  logoBadge: {
    width: 76,
    height: 76,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: Spacing.lg,
    letterSpacing: 0.3,
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
    padding: Spacing.lg,
    paddingTop: Spacing["2xl"],
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: BorderRadius.full,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  modeToggleItem: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    alignItems: "center",
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
  },
  errorText: {
    marginLeft: Spacing.sm,
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: Spacing.xs,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  input: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 15,
    borderWidth: 1,
    minHeight: Spacing.inputHeight,
  },
  eyeButton: {
    position: "absolute",
    right: Spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 32,
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
    marginTop: Spacing.sm,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
