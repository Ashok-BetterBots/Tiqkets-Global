import { Audio, AVPlaybackStatus } from "@/utils/audioCompat";
import { Platform } from "react-native";

let successSound: Audio.Sound | null = null;
let errorSound: Audio.Sound | null = null;
let audioModeReady = false;

// Module-level dedup: prevent the same tone firing twice within 1 s
// (expo-camera onBarcodeScanned fires multiple times before state can block it)
let lastSuccessAt = 0;
let lastErrorAt   = 0;

function toneAsset(kind: "success" | "error") {
  return kind === "success"
    ? require("../assets/sounds/success-tone.mp3")
    : require("../assets/sounds/error-tone.mp3");
}

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

export async function preloadAlertTones(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await ensureAudioMode();
    if (!successSound) {
      const loaded = await Audio.Sound.createAsync(toneAsset("success"), { shouldPlay: false });
      successSound = loaded.sound;
    }
    if (!errorSound) {
      const loaded = await Audio.Sound.createAsync(toneAsset("error"), { shouldPlay: false });
      errorSound = loaded.sound;
    }
  } catch (err) {
    console.log("Alert tone preload error:", err);
  }
}

async function playTone(kind: "success" | "error"): Promise<void> {
  if (Platform.OS === "web") return;

  // Debounce: ignore calls within 1 s of the last identical tone
  const now = Date.now();
  if (kind === "success") {
    if (now - lastSuccessAt < 1000) return;
    lastSuccessAt = now;
  } else {
    if (now - lastErrorAt < 1000) return;
    lastErrorAt = now;
  }

  try {
    await ensureAudioMode();

    let sound = kind === "success" ? successSound : errorSound;
    if (!sound) {
      const loaded = await Audio.Sound.createAsync(toneAsset(kind), {
        shouldPlay: false,
        volume: 1.0,
      });
      sound = loaded.sound;
      if (kind === "success") successSound = sound;
      else errorSound = sound;
    }

    sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
      if (status.isLoaded && status.didJustFinish) {
        sound?.stopAsync().catch(() => {});
      }
    });
    await sound.replayAsync();
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
