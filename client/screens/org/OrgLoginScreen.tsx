import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
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
import * as Localization from "expo-localization";
import { State } from "country-state-city";
import {
  CountryPicker,
  StatePicker,
  CityPicker,
  PhoneWithDialCode,
  getCountryByIso,
  type CountrySelection,
} from "@/components/LocationFields";

type Mode = "login" | "register" | "verify";

// 60 seconds — matches the server-side resend cooldown so the UI
// disables Resend for the same window the backend would reject anyway.
const RESEND_COOLDOWN_SECONDS = 60;

// Persist the verify-mode handoff (org id + email) to AsyncStorage so a
// reload of the Expo app — which happens routinely when the user
// switches to their email client to copy the OTP — doesn't drop them
// back on the login screen and force them to re-register. We
// deliberately do NOT persist the password: it lives only in this
// screen's state, and after verification we route the user to the
// login form (per product spec) so they enter it explicitly.
const PENDING_VERIFY_STORAGE_KEY = "@tiqkets_org_pending_verify";
// 30 minutes mirrors the server-side OTP expiry window — a stored
// pending-verify older than this is no longer actionable (the OTP
// would be expired) so we drop it on hydration. This also bounds how
// long a previous user's email could be visible to a subsequent user
// on a shared device.
const PENDING_VERIFY_TTL_MS = 30 * 60 * 1000;

type PendingVerifyState = {
  organizationId: string;
  email: string;
};

type StoredPendingVerifyState = PendingVerifyState & {
  createdAt: number;
};

async function readPendingVerify(): Promise<PendingVerifyState | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_VERIFY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPendingVerifyState>;
    if (
      !parsed ||
      typeof parsed.organizationId !== "string" ||
      typeof parsed.email !== "string" ||
      parsed.organizationId.length === 0 ||
      parsed.email.length === 0
    ) {
      return null;
    }
    // Drop entries that exceed the TTL or pre-date this code path
    // (older entries lacked `createdAt`). Either way the OTP would
    // be expired server-side, so the only honest behavior is to
    // forget the state and let the user start over.
    if (
      typeof parsed.createdAt !== "number" ||
      Date.now() - parsed.createdAt > PENDING_VERIFY_TTL_MS
    ) {
      try {
        await AsyncStorage.removeItem(PENDING_VERIFY_STORAGE_KEY);
      } catch {
        // best-effort
      }
      return null;
    }
    return { organizationId: parsed.organizationId, email: parsed.email };
  } catch {
    return null;
  }
}

async function writePendingVerify(state: PendingVerifyState): Promise<void> {
  try {
    const stored: StoredPendingVerifyState = { ...state, createdAt: Date.now() };
    await AsyncStorage.setItem(
      PENDING_VERIFY_STORAGE_KEY,
      JSON.stringify(stored),
    );
  } catch {
    // Best-effort persistence — if storage fails we still keep the in-memory
    // state for the rest of this session.
  }
}

async function clearPendingVerify(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_VERIFY_STORAGE_KEY);
  } catch {
    // Best-effort cleanup.
  }
}

function BackToCustomerButton() {
  const { setOrgLoginMode, customerLoginEnabled } = useOrganization();
  const insets = useSafeAreaInsets();
  // Hide the "back to customer" affordance when the super admin has
  // disabled the customer mobile app login — there's nowhere to go back to.
  if (!customerLoginEnabled) return null;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        // Clear any in-progress verify handoff before exiting the
        // For-Business area. Without this, a different user who later
        // opens this profile would be dropped into the previous user's
        // OTP screen with their email visible.
        void clearPendingVerify();
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
  // Org login is always rendered in light mode regardless of the
  // device's system theme, so the brand presentation stays consistent.
  const isDark = false;
  const colors = Colors.light;
  const { loginOrganization, registerOrganization, verifyEmailOtp, resendEmailOtp, isLoading } =
    useOrganization();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  // Country / state / city are tracked by their ISO codes (driven by the
  // `country-state-city` library) so we can deterministically narrow the
  // next picker. The human-readable names are derived on demand and sent
  // to the backend as plain text so older clients / reports keep working.
  const [countryIso, setCountryIso] = useState<string>("");
  const [stateIso, setStateIso] = useState<string>("");
  const [city, setCity] = useState("");
  // Phone is stored as (dialCode, localNumber) so we can show the dial code
  // as a separate visual chip and let the user change it independently. On
  // submit we combine them into a single "+<dial> <number>" string.
  const [dialCode, setDialCode] = useState<string>("");
  const [pincode, setPincode] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Default the country / dial code from the device locale so users in
  // India see "+91 / India" out of the box without manual selection. If
  // expo-localization can't determine a region (web, jailbroken device)
  // we silently leave the fields blank and let the user pick.
  useEffect(() => {
    if (countryIso) return;
    try {
      const locales = Localization.getLocales?.() || [];
      const region = locales[0]?.regionCode || "";
      const sel = getCountryByIso(region);
      if (sel) {
        setCountryIso(sel.isoCode);
        setDialCode(sel.dialCode);
      }
    } catch {
      // ignore — locale detection is best-effort
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived country object (memo-free; cheap lookup) used for the dial-code
  // chip flag and for keeping the country name in sync with the picker.
  const selectedCountry: CountrySelection | null = getCountryByIso(countryIso);

  // Verify-OTP flow state. `pendingVerifyOrgId` and `pendingVerifyEmail`
  // are captured from the registration response (or from the login
  // verification gate). `resendCooldown` ticks down from
  // RESEND_COOLDOWN_SECONDS so the Resend button mirrors the server cap.
  const [pendingVerifyOrgId, setPendingVerifyOrgId] = useState("");
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  // Restore an in-progress email verification on mount. When a user
  // submits the registration form and then taps over to their email
  // app to copy the OTP, Expo Go (and the web preview on refresh)
  // remounts the React tree — without this hydration the local
  // `mode` state would reset to "login" and they'd be stranded on
  // the login form with no obvious way back to the OTP entry.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = await readPendingVerify();
      if (cancelled || !pending) return;
      setPendingVerifyOrgId(pending.organizationId);
      setPendingVerifyEmail(pending.email);
      setEmail((current) => current || pending.email);
      setMode("verify");
      setInfo(
        `We sent a 6-digit verification code to ${pending.email}. Enter it below to activate your account, or tap Resend if you didn't receive one.`,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Single shared timer ref so a re-render mid-tick doesn't spawn
  // duplicate intervals (which would make the cooldown drop by 2/sec).
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (resendCooldown <= 0) {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      return;
    }
    if (cooldownTimerRef.current) return;
    cooldownTimerRef.current = setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, [resendCooldown]);

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError("");
    setInfo("");
    const result = await loginOrganization(email, password);
    if (result.success) {
      return;
    }
    // Server told us this org exists but hasn't completed email verification.
    // Pivot the user into verify mode (instead of just showing a generic
    // "invalid credentials" toast) so they can finish what registration
    // started — including the option to request a fresh code.
    if (result.requiresEmailVerification && result.organizationId) {
      const verifyEmail = result.pendingEmail || email;
      setPendingVerifyOrgId(result.organizationId);
      setPendingVerifyEmail(verifyEmail);
      setOtpCode("");
      setMode("verify");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setInfo(
        "Your email isn't verified yet. Enter the 6-digit code we sent to your inbox, or tap Resend to get a new one.",
      );
      void writePendingVerify({
        organizationId: result.organizationId,
        email: verifyEmail,
      });
      return;
    }
    setError(result.error || "Invalid credentials. Please try again.");
  };

  const handleRegister = async () => {
    if (
      !orgName ||
      !email ||
      !password ||
      !phone ||
      !address ||
      !countryIso ||
      !city
    ) {
      setError("Please fill in all required fields");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError("");
    setInfo("");
    // Resolve human-readable names from the selected ISO codes before we
    // ship the payload to the backend — the DB stores text, not codes.
    const countryName = selectedCountry?.name || "";
    const stateName =
      stateIso && countryIso
        ? State.getStateByCodeAndCountry(stateIso, countryIso)?.name || ""
        : "";
    const fullPhone = dialCode
      ? `+${dialCode.replace(/^\+/, "")} ${phone.trim()}`
      : phone.trim();
    const result = await registerOrganization({
      name: orgName,
      email,
      password,
      phone: fullPhone,
      address,
      country: countryName,
      city,
      state: stateName,
      pincode,
      category: category || "Other",
    });

    if (!result.success || !result.organizationId) {
      setError(result.error || "Registration failed. Please try again.");
      return;
    }

    // Stash the org id + email so the OTP verify screen has what it
    // needs. We persist this handoff to AsyncStorage as well, so that
    // if the user switches to their email app to copy the code (which
    // typically reloads the Expo runtime) they come back to the verify
    // screen instead of being dropped on the login form.
    const verifyEmail = result.email || email;
    setPendingVerifyOrgId(result.organizationId);
    setPendingVerifyEmail(verifyEmail);
    setOtpCode("");
    setMode("verify");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setInfo(
      result.emailVerificationSent === false
        ? "Your account is created. Tap Resend to send a verification code to your email."
        : `We've sent a 6-digit verification code to ${verifyEmail}. Enter it below to activate your account.`,
    );
    void writePendingVerify({
      organizationId: result.organizationId,
      email: verifyEmail,
    });
  };

  const handleVerify = async () => {
    if (!pendingVerifyOrgId) {
      setError("Please start registration again.");
      return;
    }
    const cleaned = otpCode.replace(/\D+/g, "");
    if (cleaned.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError("");
    setInfo("");
    setVerifying(true);
    try {
      const result = await verifyEmailOtp(pendingVerifyOrgId, cleaned);
      if (!result.success) {
        setError(result.error || "We couldn't verify that code. Please try again.");
        // If the server told us a fresh code is required, surface that
        // by zeroing the cooldown so Resend is immediately tappable.
        if (result.requiresResend) setResendCooldown(0);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Per product spec, after a successful OTP verification we send
      // the user to the login screen (with their email pre-filled) so
      // they explicitly sign in — we no longer auto-login. This also
      // means we don't need to keep the password in component state.
      const verifiedEmail = pendingVerifyEmail;
      await clearPendingVerify();
      setMode("login");
      setEmail(verifiedEmail);
      setPassword("");
      setOtpCode("");
      setPendingVerifyOrgId("");
      setPendingVerifyEmail("");
      setError("");
      setInfo(
        result.alreadyVerified
          ? "Your email is already verified. Please sign in to continue."
          : "Email verified! Please sign in to continue.",
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!pendingVerifyOrgId || resendCooldown > 0 || resending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError("");
    setInfo("");
    setResending(true);
    try {
      const result = await resendEmailOtp(pendingVerifyOrgId);
      if (!result.success) {
        setError(result.error || "We couldn't send a new code. Please try again in a moment.");
        if (result.retryAfterSec && result.retryAfterSec > 0) {
          setResendCooldown(Math.min(result.retryAfterSec, RESEND_COOLDOWN_SECONDS));
        }
        return;
      }
      setOtpCode("");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setInfo(
        result.emailSent === false
          ? "Code refreshed, but email delivery isn't configured. Please contact support."
          : `New 6-digit code sent to ${pendingVerifyEmail}. Check your inbox.`,
      );
    } finally {
      setResending(false);
    }
  };

  const handleChangeEmail = () => {
    // Bail out of verification entirely. The unverified org row stays in
    // the database; if the user tries to register the same email again,
    // we'll politely tell them it already exists. This is a known
    // limitation — fixing it requires either a "delete unverified org"
    // sweeper or letting register reset the OTP for unverified orgs.
    setMode("register");
    setError("");
    setInfo("");
    setOtpCode("");
    setPendingVerifyOrgId("");
    setPendingVerifyEmail("");
    void clearPendingVerify();
  };

  const toggleMode = () => {
    if (mode === "verify") return;
    setMode(mode === "login" ? "register" : "login");
    setError("");
    setInfo("");
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
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + Spacing["2xl"] }]}
      >
        <BackToCustomerButton />
        <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.logoBadge}>
          <Image
            source={require("../../assets/images/logo/logo-white.png")}
            style={{ width: 48, height: 48 }}
            resizeMode="contain"
          />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(140)} style={{ alignItems: "center" }}>
          <ThemedText
            style={styles.headerTitle}
            lightColor="#FFFFFF"
            darkColor="#FFFFFF"
          >
            TIQKETS
          </ThemedText>
          <ThemedText
            style={styles.headerSubtitle}
            lightColor="rgba(255,255,255,0.88)"
            darkColor="rgba(255,255,255,0.88)"
          >
            {mode === "login"
              ? "Sign in to manage your organization"
              : "Register your organization"}
          </ThemedText>
        </Animated.View>
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
          <Animated.View
            entering={FadeInUp.delay(180).springify()}
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
              },
              isDark ? Shadows.subtle : Shadows.medium,
            ]}
          >
            {mode === "verify" ? (
              <View>
                <View style={{ alignItems: "center", marginBottom: Spacing.lg }}>
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: BrandColors.primary + "15",
                      marginBottom: Spacing.md,
                    }}
                  >
                    <Feather name="mail" size={26} color={BrandColors.primary} />
                  </View>
                  <ThemedText
                    style={{ fontSize: 20, fontWeight: "700", marginBottom: 4 }}
                  >
                    Check your email
                  </ThemedText>
                  <ThemedText
                    style={{
                      fontSize: 13,
                      color: colors.textSecondary,
                      textAlign: "center",
                      paddingHorizontal: Spacing.md,
                    }}
                  >
                    We sent a 6-digit verification code to
                  </ThemedText>
                  <ThemedText
                    testID="text-verify-email"
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {pendingVerifyEmail}
                  </ThemedText>
                </View>

                {info ? (
                  <View
                    style={[
                      styles.errorContainer,
                      {
                        backgroundColor: colors.brand + "12",
                        borderColor: colors.brand + "33",
                      },
                    ]}
                    accessibilityLiveRegion="polite"
                  >
                    <Feather name="info" size={16} color={colors.brand} />
                    <ThemedText
                      testID="text-verify-info"
                      style={[styles.errorText, { color: colors.text }]}
                    >
                      {info}
                    </ThemedText>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <ThemedText
                    style={[styles.inputLabel, { color: colors.textSecondary }]}
                  >
                    Verification code *
                  </ThemedText>
                  <TextInput
                    testID="input-otp-code"
                    style={[
                      inputStyle,
                      {
                        textAlign: "center",
                        fontSize: 22,
                        letterSpacing: 8,
                        fontWeight: "600",
                      },
                    ]}
                    value={otpCode}
                    onChangeText={(t) => setOtpCode(t.replace(/\D+/g, "").slice(0, 6))}
                    placeholder="000000"
                    placeholderTextColor={placeholderColor}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                  />
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
                    <Feather name="alert-circle" size={16} color={colors.error} />
                    <ThemedText
                      testID="text-verify-error"
                      style={[styles.errorText, { color: colors.error }]}
                    >
                      {error}
                    </ThemedText>
                  </View>
                ) : null}

                <Button
                  testID="button-verify-otp"
                  title="Verify & Continue"
                  onPress={handleVerify}
                  loading={verifying}
                  style={styles.submitButton}
                />

                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    marginTop: Spacing.md,
                  }}
                >
                  <ThemedText
                    style={{ fontSize: 13, color: colors.textSecondary }}
                  >
                    Didn't get the code?{" "}
                  </ThemedText>
                  <Pressable
                    testID="button-resend-otp"
                    onPress={handleResend}
                    disabled={resendCooldown > 0 || resending}
                    hitSlop={8}
                  >
                    <ThemedText
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color:
                          resendCooldown > 0 || resending
                            ? colors.mutedText
                            : isDark
                              ? BrandColors.primaryLight
                              : BrandColors.primary,
                      }}
                    >
                      {resending
                        ? "Sending…"
                        : resendCooldown > 0
                          ? `Resend in ${resendCooldown}s`
                          : "Resend code"}
                    </ThemedText>
                  </Pressable>
                </View>

                <Pressable
                  testID="button-change-email"
                  onPress={handleChangeEmail}
                  style={{ alignSelf: "center", marginTop: Spacing.sm }}
                  hitSlop={8}
                >
                  <ThemedText
                    style={{ fontSize: 12, color: colors.textSecondary }}
                  >
                    Wrong email? Start over
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
            <>
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
                <PhoneWithDialCode
                  dialCode={dialCode}
                  phone={phone}
                  isoCode={countryIso}
                  onChangePhone={setPhone}
                  onChangeDialCode={({ dialCode: dc }) => setDialCode(dc)}
                  onCountryChange={(sel) => {
                    // Keep the country (and therefore the State/City pickers)
                    // in lock-step with the phone's dial code. Clear the
                    // dependent state/city so the user doesn't end up with
                    // a Mumbai-in-Germany combination.
                    if (sel.isoCode !== countryIso) {
                      setCountryIso(sel.isoCode);
                      setStateIso("");
                      setCity("");
                    }
                  }}
                  required
                />
                {renderField(
                  "Address",
                  address,
                  setAddress,
                  "Street address",
                  {},
                  true,
                )}
                <CountryPicker
                  value={countryIso}
                  required
                  onChange={(sel) => {
                    if (sel.isoCode !== countryIso) {
                      setCountryIso(sel.isoCode);
                      setStateIso("");
                      setCity("");
                    }
                    // Update the dial code too — picking the country is the
                    // strongest signal of where the org actually is.
                    if (sel.dialCode) setDialCode(sel.dialCode);
                  }}
                />
                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: Spacing.sm }}>
                    <StatePicker
                      countryCode={countryIso}
                      value={stateIso}
                      onChange={(s) => {
                        setStateIso(s.isoCode);
                        setCity("");
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <CityPicker
                      countryCode={countryIso}
                      stateCode={stateIso}
                      value={city}
                      onChange={setCity}
                      required
                    />
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
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
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
            </>
            )}
          </Animated.View>

          {mode !== "verify" ? (
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
          ) : null}
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
  headerEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginTop: Spacing.lg,
  },
  headerTitle: {
    fontSize: 24,
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
