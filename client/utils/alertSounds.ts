import { Audio, AVPlaybackStatus } from "expo-av";
import { Platform } from "react-native";

let successSound: Audio.Sound | null = null;
let errorSound: Audio.Sound | null = null;
let audioModeReady = false;

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

async function playTone(kind: "success" | "error"): Promise<void> {
  if (Platform.OS === "web") return;
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

    const asset =
      kind === "success"
        ? require("../assets/sounds/success-tone.mp3")
        : require("../assets/sounds/error-tone.mp3");

    const { sound } = await Audio.Sound.createAsync(asset, {
      shouldPlay: true,
      volume: 1.0,
    });

    if (kind === "success") successSound = sound;
    else errorSound = sound;

    sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        if (kind === "success" && successSound === sound) successSound = null;
        if (kind === "error" && errorSound === sound) errorSound = null;
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
