import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Image,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type AuthStep = "phone" | "otp" | "register";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { loginWithCustomer } = useAuth();
  const { setOrgLoginMode } = useOrganization();

  const [step, setStep] = useState<AuthStep>("phone");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const otpInputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const fullPhone = `${countryCode.replace("+", "")}${phone.replace(/[^0-9]/g, "")}`;

  const handleSendOTP = async () => {
    if (phone.replace(/[^0-9]/g, "").length < 6) {
      setError("Please enter a valid phone number");
      return;
    }

    setIsLoading(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const response = await fetch(new URL("/api/auth/send-otp", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to send OTP");
        return;
      }

      setIsExistingUser(data.isExistingUser);
      setStep("otp");
      setResendTimer(60);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError("Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPChange = (text: string, index: number) => {
    const newOtp = [...otp];

    if (text.length > 1) {
      const digits = text.replace(/[^0-9]/g, "").split("").slice(0, 6);
      digits.forEach((digit, i) => {
        if (i + index < 6) newOtp[i + index] = digit;
      });
      setOtp(newOtp);
      const nextIndex = Math.min(index + digits.length, 5);
      otpInputRefs.current[nextIndex]?.focus();
      return;
    }

    newOtp[index] = text.replace(/[^0-9]/g, "");
    setOtp(newOtp);

    if (text && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOTPKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = "";
      setOtp(newOtp);
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOTP = async () => {
    const otpCode = otp.join("");
    if (otpCode.length !== 6) {
      setError("Please enter the complete 6-digit OTP");
      return;
    }

    setIsLoading(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const response = await fetch(new URL("/api/auth/verify-otp", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: fullPhone,
          code: otpCode,
          firstName: isExistingUser ? undefined : firstName || undefined,
          lastName: isExistingUser ? undefined : lastName || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Verification failed");
        return;
      }

      if (data.needsRegistration) {
        setStep("register");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      await loginWithCustomer(data.customer);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError("Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterAndVerify = async () => {
    if (!firstName.trim()) {
      setError("First name is required");
      return;
    }

    const otpCode = otp.join("");
    if (otpCode.length !== 6) {
      setError("Please go back and enter the OTP first");
      return;
    }

    setIsLoading(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const response = await fetch(new URL("/api/auth/verify-otp", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: fullPhone,
          code: otpCode,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      await loginWithCustomer(data.customer);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError("Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;
    setOtp(["", "", "", "", "", ""]);
    await handleSendOTP();
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError("");
    if (step === "otp") {
      setStep("phone");
      setOtp(["", "", "", "", "", ""]);
    } else if (step === "register") {
      setStep("otp");
    }
  };

  const handleOrgLogin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setOrgLoginMode(true);
  };

  const renderPhoneStep = () => (
    <Animated.View
      entering={FadeInDown.springify()}
      style={styles.stepContainer}
    >
      <View style={styles.stepHeader}>
        <View style={[styles.iconCircle, { backgroundColor: BrandColors.primary + "15" }]}>
          <Feather name="message-circle" size={28} color={BrandColors.primary} />
        </View>
        <ThemedText type="h3" style={styles.stepTitle}>
          Welcome to TIQKETS
        </ThemedText>
        <ThemedText type="body" style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
          Enter your WhatsApp number to get started. We'll send you a verification code.
        </ThemedText>
      </View>

      <View style={styles.phoneInputContainer}>
        <TextInput
          style={[
            styles.countryCodeInput,
            {
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
          value={countryCode}
          onChangeText={setCountryCode}
          keyboardType="phone-pad"
          testID="input-country-code"
        />
        <TextInput
          style={[
            styles.phoneInput,
            {
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
          placeholder="WhatsApp number"
          placeholderTextColor={theme.textSecondary}
          value={phone}
          onChangeText={(text) => {
            setPhone(text);
            setError("");
          }}
          keyboardType="phone-pad"
          autoFocus
          testID="input-phone"
        />
      </View>

      {error ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <ThemedText type="caption" style={styles.errorText}>{error}</ThemedText>
        </Animated.View>
      ) : null}

      <Pressable
        onPress={handleSendOTP}
        disabled={isLoading || phone.replace(/[^0-9]/g, "").length < 6}
        style={[
          styles.primaryButton,
          { backgroundColor: BrandColors.primary },
          (isLoading || phone.replace(/[^0-9]/g, "").length < 6) && { opacity: 0.5 },
        ]}
        testID="button-send-otp"
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <ThemedText style={styles.primaryButtonText}>Send OTP</ThemedText>
            <Feather name="arrow-right" size={18} color="#FFFFFF" />
          </>
        )}
      </Pressable>

      <View style={styles.infoRow}>
        <Feather name="shield" size={14} color={theme.textSecondary} />
        <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: Spacing.xs, flex: 1 }}>
          We'll send a 6-digit code to your WhatsApp. Standard messaging rates may apply.
        </ThemedText>
      </View>
    </Animated.View>
  );

  const renderOTPStep = () => (
    <Animated.View
      entering={FadeInDown.springify()}
      style={styles.stepContainer}
    >
      <Pressable onPress={handleBack} style={styles.backButton} testID="button-back-otp">
        <Feather name="arrow-left" size={20} color={theme.text} />
        <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>Back</ThemedText>
      </Pressable>

      <View style={styles.stepHeader}>
        <View style={[styles.iconCircle, { backgroundColor: BrandColors.primary + "15" }]}>
          <Feather name="lock" size={28} color={BrandColors.primary} />
        </View>
        <ThemedText type="h3" style={styles.stepTitle}>
          Verify Your Number
        </ThemedText>
        <ThemedText type="body" style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
          Enter the 6-digit code sent to your WhatsApp{"\n"}
          <ThemedText type="body" style={{ fontWeight: "700", color: theme.text }}>
            {countryCode} {phone}
          </ThemedText>
        </ThemedText>
      </View>

      <View style={styles.otpContainer}>
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => { otpInputRefs.current[index] = ref; }}
            style={[
              styles.otpInput,
              {
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                borderColor: digit ? BrandColors.primary : theme.border,
              },
            ]}
            value={digit}
            onChangeText={(text) => handleOTPChange(text, index)}
            onKeyPress={({ nativeEvent }) => handleOTPKeyPress(nativeEvent.key, index)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            testID={`input-otp-${index}`}
          />
        ))}
      </View>

      {error ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <ThemedText type="caption" style={styles.errorText}>{error}</ThemedText>
        </Animated.View>
      ) : null}

      <Pressable
        onPress={handleVerifyOTP}
        disabled={isLoading || otp.join("").length !== 6}
        style={[
          styles.primaryButton,
          { backgroundColor: BrandColors.primary },
          (isLoading || otp.join("").length !== 6) && { opacity: 0.5 },
        ]}
        testID="button-verify-otp"
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <ThemedText style={styles.primaryButtonText}>Verify & Continue</ThemedText>
            <Feather name="check" size={18} color="#FFFFFF" />
          </>
        )}
      </Pressable>

      <View style={styles.resendContainer}>
        {resendTimer > 0 ? (
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            Resend OTP in {resendTimer}s
          </ThemedText>
        ) : (
          <Pressable onPress={handleResendOTP} testID="button-resend-otp">
            <ThemedText type="body" style={{ color: BrandColors.primary, fontWeight: "600" }}>
              Resend OTP
            </ThemedText>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );

  const renderRegisterStep = () => (
    <Animated.View
      entering={FadeInDown.springify()}
      style={styles.stepContainer}
    >
      <Pressable onPress={handleBack} style={styles.backButton} testID="button-back-register">
        <Feather name="arrow-left" size={20} color={theme.text} />
        <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>Back</ThemedText>
      </Pressable>

      <View style={styles.stepHeader}>
        <View style={[styles.iconCircle, { backgroundColor: BrandColors.primary + "15" }]}>
          <Feather name="user-plus" size={28} color={BrandColors.primary} />
        </View>
        <ThemedText type="h3" style={styles.stepTitle}>
          Create Your Profile
        </ThemedText>
        <ThemedText type="body" style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
          Almost there! Tell us your name to complete registration.
        </ThemedText>
      </View>

      <TextInput
        style={[
          styles.textInput,
          {
            backgroundColor: theme.backgroundSecondary,
            color: theme.text,
            borderColor: theme.border,
          },
        ]}
        placeholder="First Name"
        placeholderTextColor={theme.textSecondary}
        value={firstName}
        onChangeText={(text) => {
          setFirstName(text);
          setError("");
        }}
        autoCapitalize="words"
        autoFocus
        testID="input-first-name"
      />

      <TextInput
        style={[
          styles.textInput,
          {
            backgroundColor: theme.backgroundSecondary,
            color: theme.text,
            borderColor: theme.border,
          },
        ]}
        placeholder="Last Name (optional)"
        placeholderTextColor={theme.textSecondary}
        value={lastName}
        onChangeText={setLastName}
        autoCapitalize="words"
        testID="input-last-name"
      />

      {error ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <ThemedText type="caption" style={styles.errorText}>{error}</ThemedText>
        </Animated.View>
      ) : null}

      <Pressable
        onPress={handleRegisterAndVerify}
        disabled={isLoading || !firstName.trim()}
        style={[
          styles.primaryButton,
          { backgroundColor: BrandColors.primary },
          (isLoading || !firstName.trim()) && { opacity: 0.5 },
        ]}
        testID="button-register"
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <ThemedText style={styles.primaryButtonText}>Complete Registration</ThemedText>
            <Feather name="check-circle" size={18} color="#FFFFFF" />
          </>
        )}
      </Pressable>
    </Animated.View>
  );

  return (
    <LinearGradient
      colors={isDark ? [BrandColors.darkGray, BrandColors.black] : ["#FFFFFF", BrandColors.lightGray]}
      style={[styles.container, { paddingTop: insets.top + Spacing["2xl"] }]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoContainer}>
            <Image
              source={isDark
                ? require("../assets/images/logo/logo-white-bottom-text.png")
                : require("../assets/images/logo/logo-color-bottom-text.png")
              }
              style={styles.logo}
              resizeMode="contain"
            />
            <Animated.View entering={FadeInDown.delay(200).springify()}>
              <ThemedText
                type="body"
                style={[styles.tagline, { color: theme.textSecondary }]}
              >
                Skip the wait, not the service
              </ThemedText>
            </Animated.View>
          </View>

          <View style={[styles.authContainer, { paddingBottom: insets.bottom + Spacing.xl }]}>
            {step === "phone" ? renderPhoneStep() : null}
            {step === "otp" ? renderOTPStep() : null}
            {step === "register" ? renderRegisterStep() : null}

            {step === "phone" ? (
              <>
                <Animated.View
                  entering={FadeInDown.delay(500).springify()}
                  style={styles.termsContainer}
                >
                  <ThemedText
                    type="caption"
                    style={[styles.termsText, { color: theme.textSecondary }]}
                  >
                    By continuing, you agree to our{" "}
                    <ThemedText type="caption" style={{ color: theme.primary }}>
                      Terms of Service
                    </ThemedText>
                    {" "}and{" "}
                    <ThemedText type="caption" style={{ color: theme.primary }}>
                      Privacy Policy
                    </ThemedText>
                  </ThemedText>
                </Animated.View>

                <Animated.View
                  entering={FadeInDown.delay(550).springify()}
                  style={[styles.orgLoginContainer, { borderTopColor: theme.border }]}
                >
                  <Pressable onPress={handleOrgLogin} style={styles.orgLoginButton} testID="button-org-login">
                    <Feather name="briefcase" size={16} color={theme.primary} />
                    <ThemedText style={[styles.orgLoginText, { color: theme.primary }]}>
                      Organization Login
                    </ThemedText>
                  </Pressable>
                </Animated.View>
              </>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing["2xl"],
    paddingBottom: Spacing.xl,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: Spacing.md,
  },
  tagline: {
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  authContainer: {
    paddingHorizontal: Spacing.xl,
    flex: 1,
    justifyContent: "flex-end",
  },
  stepContainer: {
    gap: Spacing.lg,
  },
  stepHeader: {
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  stepTitle: {
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    textAlign: "center",
    lineHeight: 22,
  },
  phoneInputContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  countryCodeInput: {
    width: 70,
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  phoneInput: {
    flex: 1,
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
  },
  textInput: {
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderRadius: BorderRadius.sm,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  errorText: {
    color: "#EF4444",
    textAlign: "center",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.xs,
  },
  resendContainer: {
    alignItems: "center",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  termsContainer: {
    marginTop: Spacing.xl,
  },
  termsText: {
    textAlign: "center",
    lineHeight: 20,
  },
  orgLoginContainer: {
    marginTop: Spacing.lg,
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: Spacing.lg,
  },
  orgLoginButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  orgLoginText: {
    fontWeight: "600",
    fontSize: 14,
  },
});
