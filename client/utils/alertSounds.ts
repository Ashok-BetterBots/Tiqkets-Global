import { Audio, AVPlaybackStatus } from "@/utils/audioCompat";
import { Platform } from "react-native";

let successSound: Audio.Sound | null = null;
let errorSound: Audio.Sound | null = null;
let timingWarningSound: Audio.Sound | null = null;
let audioModeReady = false;

// Module-level dedup: prevent the same tone firing twice within 1 s
// (expo-camera onBarcodeScanned fires multiple times before state can block it)
let lastSuccessAt = 0;
let lastErrorAt   = 0;
let lastTimingWarningAt = 0;

async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    audioModeReady = true;
  } catch {
    // non-fatal — playback will still be attempted
  }
}

async function playTone(kind: "success" | "error" | "timing-warning"): Promise<void> {
  if (Platform.OS === "web") return;

  // Debounce: ignore calls within 1 s of the last identical tone
  const now = Date.now();
  if (kind === "success") {
    if (now - lastSuccessAt < 1000) return;
    lastSuccessAt = now;
  } else if (kind === "error") {
    if (now - lastErrorAt < 1000) return;
    lastErrorAt = now;
  } else {
    if (now - lastTimingWarningAt < 1000) return;
    lastTimingWarningAt = now;
  }

  try {
    await ensureAudioMode();

    if (kind === "success" && successSound) {
      await successSound.unloadAsync();
      successSound = null;
    }
    if (kind === "error" && errorSound) {
      await errorSound.unloadAsync();
      errorSound = null;
    }
    if (kind === "timing-warning" && timingWarningSound) {
      await timingWarningSound.unloadAsync();
      timingWarningSound = null;
    }

    const asset =
      kind === "success"
        ? require("../assets/sounds/success-tone.mp3")
        : kind === "error"
          ? require("../assets/sounds/error-tone.mp3")
          : require("../assets/sounds/early-late-tone.mp3");

    const { sound } = await Audio.Sound.createAsync(asset, {
      shouldPlay: true,
      volume: 1.0,
    });

    if (kind === "success") successSound = sound;
    else if (kind === "error") errorSound = sound;
    else timingWarningSound = sound;

    sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        if (kind === "success" && successSound === sound) successSound = null;
        if (kind === "error" && errorSound === sound) errorSound = null;
        if (kind === "timing-warning" && timingWarningSound === sound) timingWarningSound = null;
      }
    });
  } catch (err) {
    console.log(`Alert tone (${kind}) playback error:`, err);
  }
}

export function playSuccessTone(): void {
  playTone("success");
}

export function playErrorTone(): void {
  playTone("error");
}

export function playTimingWarningTone(): void {
  playTone("timing-warning");
}
