import React, { useRef, useState } from "react";
import {
  Image,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { BrandColors, headingFont, bodyFont } from "@/constants/theme";
import { ONBOARDING_SEEN_KEY } from "@/constants/storageKeys";
import { useOrganization } from "@/contexts/OrganizationContext";

import slide1 from "../assets/images/onboarding/onboarding-1.jpg";
import slide2 from "../assets/images/onboarding/onboarding-2.jpg";
import slide3 from "../assets/images/onboarding/onboarding-3.jpg";

type Slide = {
  bg: ImageSourcePropType;
  title: string;
  subtitle: string;
  isLast: boolean;
};

const SLIDES: Slide[] = [
  {
    bg: slide1,
    title: "Skip the Wait,\nJoin from Anywhere",
    subtitle:
      "Join hospital, clinic, and government queues remotely. No more standing in line for hours.",
    isLast: false,
  },
  {
    bg: slide2,
    title: "Real-Time Updates,\nAlways",
    subtitle:
      "Know your exact position and get notified the moment it's your turn — at any venue.",
    isLast: false,
  },
  {
    bg: slide3,
    title: "Works Everywhere\nYou Need It",
    subtitle:
      "Hospitals, restaurants, government offices and more — TIQKETS manages every queue.",
    isLast: true,
  },
];

const TITLE_COLOR = "#FEFEFE";
const SUBTITLE_COLOR = "#E3E9ED";
const INACTIVE_DOT = "#BFC6CC";

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { setOrgLoginMode } = useOrganization();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) {
      setIndex(next);
    }
  };

  const finish = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    } catch {
      // Non-fatal: onboarding will simply show again next launch.
    }
    setOrgLoginMode(true);
  };

  const handlePrimary = (slideIndex: number) => {
    if (slideIndex >= SLIDES.length - 1) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: width * (slideIndex + 1), animated: true });
  };

  return (
    <View style={styles.container} testID="screen-onboarding">
      <StatusBar style="light" />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[styles.page, { width }]} testID={`page-onboarding-${i}`}>
            <Image source={slide.bg} style={styles.bg} resizeMode="cover" />
            <LinearGradient
              colors={[
                "rgba(17,12,29,0)",
                "rgba(39,38,38,0.96)",
                BrandColors.darkGray,
              ]}
              locations={[0.14, 0.72, 1]}
              style={styles.overlay}
            />

            <View
              style={[
                styles.content,
                {
                  paddingTop: insets.top + 12,
                  paddingBottom: insets.bottom + 28,
                },
              ]}
            >
              <View style={styles.textBlock}>
                <Text style={styles.title} testID={`text-onboarding-title-${i}`}>
                  {slide.title}
                </Text>
                <Text style={styles.subtitle} testID={`text-onboarding-subtitle-${i}`}>
                  {slide.subtitle}
                </Text>
              </View>

              <View style={styles.dots}>
                {SLIDES.map((_, d) => (
                  <View
                    key={d}
                    style={[
                      styles.dot,
                      {
                        width: d === i ? 24 : 8,
                        backgroundColor: d === i ? BrandColors.primary : INACTIVE_DOT,
                      },
                    ]}
                  />
                ))}
              </View>

              <Pressable
                onPress={() => handlePrimary(i)}
                style={({ pressed }) => [
                  styles.button,
                  pressed ? styles.buttonPressed : null,
                ]}
                testID={slide.isLast ? "button-get-started" : "button-continue"}
              >
                <Text style={styles.buttonLabel}>
                  {slide.isLast ? "Get Started" : "Continue"}
                </Text>
              </Pressable>

              {slide.isLast ? (
                <Pressable
                  onPress={finish}
                  style={styles.registerRow}
                  testID="button-register"
                >
                  <Text style={styles.registerText}>
                    Don't have an account?{" "}
                    <Text style={styles.registerLink}>Register</Text>
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BrandColors.darkGray,
  },
  page: {
    flex: 1,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 24,
    gap: 28,
  },
  textBlock: {
    gap: 8,
  },
  title: {
    fontFamily: headingFont("bold"),
    fontSize: 24,
    lineHeight: 32,
    color: TITLE_COLOR,
    letterSpacing: 0.12,
  },
  subtitle: {
    fontFamily: bodyFont("regular"),
    fontSize: 14,
    lineHeight: 22,
    color: SUBTITLE_COLOR,
    opacity: 0.85,
    maxWidth: 296,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  button: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BrandColors.primary,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonLabel: {
    fontFamily: headingFont("semibold"),
    fontSize: 18,
    lineHeight: 26,
    color: "#FEFEFE",
    letterSpacing: 0.09,
  },
  registerRow: {
    alignItems: "center",
  },
  registerText: {
    fontFamily: bodyFont("regular"),
    fontSize: 16,
    lineHeight: 24,
    color: "#FEFEFE",
    letterSpacing: 0.08,
  },
  registerLink: {
    fontFamily: headingFont("semibold"),
    color: BrandColors.primary,
  },
});
