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
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

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
      setError("Please enter the complete 6-digit code");
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

  const renderPhoneStep = () => (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.stepContainer}>
      <View style={styles.logoArea}>
        <Image
          source={isDark
            ? require("../assets/images/logo/logo-white-bottom-text.png")
            : require("../assets/images/logo/logo-color-bottom-text.png")
          }
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.formArea}>
        <ThemedText type="h3" style={styles.heading}>
          Sign in to TIQKETS
        </ThemedText>
        <ThemedText type="caption" style={[styles.subtitle, { color: theme.textSecondary }]}>
          We'll send a verification code to your WhatsApp
        </ThemedText>

        <View style={styles.phoneRow}>
          <TextInput
            style={[styles.codeInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
            value={countryCode}
            onChangeText={setCountryCode}
            keyboardType="phone-pad"
            testID="input-country-code"
          />
          <TextInput
            style={[styles.phoneInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
            placeholder="WhatsApp number"
            placeholderTextColor={theme.textSecondary}
            value={phone}
            onChangeText={(text) => { setPhone(text); setError(""); }}
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
          style={[styles.primaryBtn, { backgroundColor: BrandColors.primary }, (isLoading || phone.replace(/[^0-9]/g, "").length < 6) ? { opacity: 0.5 } : null]}
          testID="button-send-otp"
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <ThemedText style={styles.btnText}>Continue</ThemedText>
          )}
        </Pressable>

        <ThemedText type="caption" style={[styles.termsText, { color: theme.textSecondary }]}>
          By continuing, you agree to our{" "}
          <ThemedText type="caption" style={{ color: BrandColors.primary }}>Terms</ThemedText>
          {" & "}
          <ThemedText type="caption" style={{ color: BrandColors.primary }}>Privacy Policy</ThemedText>
        </ThemedText>
      </View>

      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setOrgLoginMode(true); }}
        style={[styles.orgLink, { borderTopColor: theme.border }]}
        testID="button-org-login"
      >
        <Feather name="briefcase" size={15} color={theme.textSecondary} />
        <ThemedText type="caption" style={[styles.orgLinkText, { color: theme.textSecondary }]}>
          Organization Login
        </ThemedText>
      </Pressable>
    </Animated.View>
  );

  const renderOTPStep = () => (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.stepContainer}>
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} style={styles.backBtn} testID="button-back-otp">
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.centeredContent}>
        <Feather name="message-circle" size={40} color={BrandColors.primary} style={{ marginBottom: Spacing.lg }} />
        <ThemedText type="h3" style={styles.heading}>Enter verification code</ThemedText>
        <ThemedText type="caption" style={[styles.subtitle, { color: theme.textSecondary }]}>
          Sent to {countryCode} {phone}
        </ThemedText>

        <View style={styles.otpRow}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => { otpInputRefs.current[index] = ref; }}
              style={[
                styles.otpBox,
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
          style={[styles.primaryBtn, { backgroundColor: BrandColors.primary }, (isLoading || otp.join("").length !== 6) ? { opacity: 0.5 } : null]}
          testID="button-verify-otp"
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <ThemedText style={styles.btnText}>Verify</ThemedText>
          )}
        </Pressable>

        <View style={styles.resendRow}>
          {resendTimer > 0 ? (
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              Resend in {resendTimer}s
            </ThemedText>
          ) : (
            <Pressable onPress={handleResendOTP} testID="button-resend-otp">
              <ThemedText type="caption" style={{ color: BrandColors.primary, fontWeight: "600" }}>
                Resend Code
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    </Animated.View>
  );

  const renderRegisterStep = () => (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.stepContainer}>
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} style={styles.backBtn} testID="button-back-register">
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.centeredContent}>
        <Feather name="user" size={40} color={BrandColors.primary} style={{ marginBottom: Spacing.lg }} />
        <ThemedText type="h3" style={styles.heading}>What's your name?</ThemedText>
        <ThemedText type="caption" style={[styles.subtitle, { color: theme.textSecondary, marginBottom: Spacing.lg }]}>
          This helps us personalize your experience
        </ThemedText>

        <TextInput
          style={[styles.fullInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
          placeholder="First Name"
          placeholderTextColor={theme.textSecondary}
          value={firstName}
          onChangeText={(text) => { setFirstName(text); setError(""); }}
          autoCapitalize="words"
          autoFocus
          testID="input-first-name"
        />
        <TextInput
          style={[styles.fullInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border, marginTop: Spacing.sm }]}
          placeholder="Last Name (optional)"
          placeholderTextColor={theme.textSecondary}
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
          testID="input-last-name"
        />

        {error ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <ThemedText type="caption" style={[styles.errorText, { marginTop: Spacing.sm }]}>{error}</ThemedText>
          </Animated.View>
        ) : null}

        <Pressable
          onPress={handleRegisterAndVerify}
          disabled={isLoading || !firstName.trim()}
          style={[styles.primaryBtn, { backgroundColor: BrandColors.primary, marginTop: Spacing.xl }, (isLoading || !firstName.trim()) ? { opacity: 0.5 } : null]}
          testID="button-register"
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <ThemedText style={styles.btnText}>Get Started</ThemedText>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );

  return (
    <LinearGradient
      colors={isDark ? [BrandColors.darkGray, BrandColors.black] : ["#FFFFFF", BrandColors.lightGray]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.lg }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === "phone" ? renderPhoneStep() : null}
          {step === "otp" ? renderOTPStep() : null}
          {step === "register" ? renderRegisterStep() : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
  },
  stepContainer: {
    flex: 1,
  },
  logoArea: {
    alignItems: "center",
    paddingTop: Spacing["2xl"],
    paddingBottom: Spacing.md,
  },
  logo: {
    width: 120,
    height: 120,
  },
  formArea: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: Spacing.xl,
  },
  heading: {
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  phoneRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  codeInput: {
    width: 64,
    height: 52,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  phoneInput: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
  },
  fullInput: {
    height: 52,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
  },
  primaryBtn: {
    height: 52,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
  },
  btnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  errorText: {
    color: "#EF4444",
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  termsText: {
    textAlign: "center",
    marginTop: Spacing.lg,
    lineHeight: 18,
  },
  orgLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  orgLinkText: {
    fontWeight: "500",
    fontSize: 13,
  },
  topBar: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  centeredContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  otpBox: {
    width: 46,
    height: 54,
    borderWidth: 1.5,
    borderRadius: BorderRadius.sm,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  resendRow: {
    alignItems: "center",
    marginTop: Spacing.lg,
  },
});
