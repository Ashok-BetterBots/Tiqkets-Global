import { Platform } from "react-native";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import RNEventSource from "react-native-sse";
import { getApiUrl } from "@/lib/query-client";

type AnnouncementPayload = {
  spokenText?: string;
  spokenTextEn?: string;
  spokenTextAr?: string;
  language?: string;
  ticketNumber?: string;
  customerName?: string;
};

type BranchInfo = {
  id: string;
  announcerUserId?: string | null;
};

const isWeb =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  typeof (window as any).EventSource !== "undefined";

const NativeESCtor: any = isWeb ? (window as any).EventSource : RNEventSource;

const PREFERRED_VOICE_NAMES_EN = [
  "Microsoft Aria Online (Natural)",
  "Microsoft Jenny Online (Natural)",
  "Microsoft Emma Online (Natural)",
  "Microsoft Ava Online (Natural)",
  "Google UK English Female",
  "Google US English",
  "Samantha",
  "Ava (Premium)",
  "Ava (Enhanced)",
  "Ava",
  "Allison (Premium)",
  "Allison (Enhanced)",
  "Allison",
  "Susan (Premium)",
  "Susan",
  "Karen (Premium)",
  "Karen",
  "Serena (Premium)",
  "Serena",
  "Victoria",
];

const PREFERRED_VOICE_NAMES_AR = [
  "Microsoft Hoda Online (Natural)",
  "Microsoft Salma Online (Natural)",
  "Microsoft Amina Online (Natural)",
  "Google عربية",
  "Maged",
  "Laila",
];

const FEMALE_HINTS = [
  "female",
  "samantha",
  "victoria",
  "karen",
  "tessa",
  "moira",
  "fiona",
  "aria",
  "jenny",
  "emma",
  "ava",
  "allison",
  "sara",
  "anna",
  "amelie",
  "hoda",
  "salma",
  "laila",
  "amina",
  "zira",
  "susan",
  "serena",
  "kathy",
];

const NEURAL_HINTS = /natural|neural|online|premium|enhanced|wavenet/i;

function pickWebVoice(lang: "en" | "ar"): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  const synth = (window as any).speechSynthesis;
  if (!synth) return null;
  const all: SpeechSynthesisVoice[] = synth.getVoices?.() || [];
  if (!all.length) return null;
  const langPrefix = lang === "ar" ? "ar" : "en";
  const langMatch = all.filter((v) =>
    (v.lang || "").toLowerCase().startsWith(langPrefix)
  );
  if (!langMatch.length) return null;
  const preferred =
    lang === "ar" ? PREFERRED_VOICE_NAMES_AR : PREFERRED_VOICE_NAMES_EN;
  for (const name of preferred) {
    const exact = langMatch.find((v) => v.name === name);
    if (exact) return exact;
    const fuzzy = langMatch.find((v) =>
      v.name.toLowerCase().includes(name.toLowerCase())
    );
    if (fuzzy) return fuzzy;
  }
  const female = langMatch.find((v) =>
    FEMALE_HINTS.some((h) => v.name.toLowerCase().includes(h))
  );
  if (female) return female;
  const neural = langMatch.find((v) => NEURAL_HINTS.test(v.name));
  if (neural) return neural;
  return langMatch[0];
}

function pickNativeVoice(
  lang: "en" | "ar",
  voices: Speech.Voice[]
): Speech.Voice | null {
  if (!voices?.length) return null;
  const langPrefix = lang === "ar" ? "ar" : "en";
  const langMatch = voices.filter((v) =>
    (v.language || "").toLowerCase().startsWith(langPrefix)
  );
  if (!langMatch.length) return null;
  const preferred =
    lang === "ar"
      ? ["Hoda", "Salma", "Amina", "Laila", "Maged"]
      : [
          "Ava",
          "Allison",
          "Samantha",
          "Susan",
          "Karen",
          "Serena",
          "Victoria",
          "Kathy",
        ];
  for (const name of preferred) {
    const fuzzy = langMatch.find((v) =>
      (v.identifier || v.name || "").toLowerCase().includes(name.toLowerCase())
    );
    if (fuzzy) return fuzzy;
  }
  const enhanced = langMatch.find(
    (v) =>
      (v as any).quality === Speech.VoiceQuality?.Enhanced ||
      (v.identifier || "").toLowerCase().includes("premium") ||
      (v.identifier || "").toLowerCase().includes("enhanced")
  );
  if (enhanced) return enhanced;
  const female = langMatch.find((v) =>
    FEMALE_HINTS.some((h) =>
      (v.name || v.identifier || "").toLowerCase().includes(h)
    )
  );
  if (female) return female;
  return langMatch[0];
}

class AnnouncerListenerImpl {
  private connections = new Map<string, any>();
  private currentSig = "";
  private alertSound: Audio.Sound | null = null;
  private audioModeReady = false;
  private repeatTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private webVoiceCache: Partial<Record<"en" | "ar", SpeechSynthesisVoice | null>> = {};
  private webVoicesReady = false;
  private nativeVoiceCache: Partial<Record<"en" | "ar", Speech.Voice | null>> = {};
  private nativeVoicesLoaded = false;

  start(orgId: string | null, userId: string | null, branches: BranchInfo[]) {
    const targetBranchIds = (branches || [])
      .filter((b) => b && b.announcerUserId && userId && b.announcerUserId === userId)
      .map((b) => b.id)
      .sort();

    const sig = `${orgId || ""}|${userId || ""}|${targetBranchIds.join(",")}`;
    if (sig === this.currentSig) return;

    this.stop();
    this.currentSig = sig;

    if (!orgId || !userId || targetBranchIds.length === 0) return;

    targetBranchIds.forEach((branchId) => {
      this.openConnection(branchId, orgId);
    });
  }

  private openConnection(branchId: string, orgId: string) {
    try {
      const url = new URL(
        `/api/announcements/stream?branchId=${encodeURIComponent(branchId)}&orgId=${encodeURIComponent(orgId)}`,
        getApiUrl(),
      ).toString();

      const es = isWeb
        ? new NativeESCtor(url, { withCredentials: true })
        : new NativeESCtor(url, { withCredentials: true });

      const myGen = this.generation;

      const onMessage = (ev: any) => {
        if (myGen !== this.generation) return;
        try {
          const raw = ev?.data ?? ev?.detail?.data;
          if (!raw || typeof raw !== "string") return;
          const data: AnnouncementPayload = JSON.parse(raw);
          this.fire(data, myGen);
        } catch {
          // ignore malformed payloads
        }
      };

      const onError = () => {
        if (myGen !== this.generation) return;
        // Schedule a reconnect in 3s (web's native EventSource auto-reconnects,
        // but native react-native-sse and auth-failure cases may not).
        try {
          es.close();
        } catch {
          // ignore
        }
        this.connections.delete(branchId);
        const existing = this.reconnectTimers.get(branchId);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          if (myGen !== this.generation) return;
          this.reconnectTimers.delete(branchId);
          this.openConnection(branchId, orgId);
        }, 3000);
        this.reconnectTimers.set(branchId, t);
      };

      if (isWeb) {
        es.onmessage = onMessage;
        es.onerror = onError;
      } else {
        es.addEventListener("message", onMessage);
        es.addEventListener("error", onError);
      }

      this.connections.set(branchId, es);
    } catch {
      // SSE setup failed for this branch — skip silently
    }
  }

  stop() {
    // Bump generation so any in-flight async callbacks (audio finish, reconnect)
    // become no-ops and cannot trigger speech for a previous session.
    this.generation += 1;

    this.connections.forEach((es) => {
      try {
        es.close();
      } catch {
        // ignore
      }
    });
    this.connections.clear();

    this.reconnectTimers.forEach((t) => clearTimeout(t));
    this.reconnectTimers.clear();

    if (this.repeatTimer) {
      clearTimeout(this.repeatTimer);
      this.repeatTimer = null;
    }

    if (this.alertSound) {
      const s = this.alertSound;
      this.alertSound = null;
      s.stopAsync().catch(() => {});
      s.unloadAsync().catch(() => {});
    }

    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        (window as any).speechSynthesis?.cancel?.();
      } catch {
        // ignore
      }
    } else {
      try {
        Speech.stop();
      } catch {
        // ignore
      }
    }

    this.currentSig = "";
  }

  private async ensureAudioMode() {
    if (this.audioModeReady) return;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      this.audioModeReady = true;
    } catch {
      // Non-fatal on web
      this.audioModeReady = true;
    }
  }

  private async fire(payload: AnnouncementPayload, gen: number) {
    if (gen !== this.generation) return;
    await this.ensureAudioMode();
    if (gen !== this.generation) return;

    try {
      if (this.alertSound) {
        const old = this.alertSound;
        this.alertSound = null;
        try {
          await old.unloadAsync();
        } catch {
          // ignore
        }
      }

      const customUrl = (payload as any)?.alertSoundUrl as string | undefined;
      let resolvedUri: string | null = null;
      if (customUrl) {
        try {
          resolvedUri = customUrl.startsWith("http")
            ? customUrl
            : new URL(customUrl, getApiUrl()).toString();
        } catch {
          resolvedUri = null;
        }
      }
      const source = resolvedUri
        ? { uri: resolvedUri }
        : require("../assets/sounds/alert-tone.wav");
      const { sound } = await Audio.Sound.createAsync(
        source as any,
        { shouldPlay: true, volume: 1.0 },
      );
      if (gen !== this.generation) {
        sound.unloadAsync().catch(() => {});
        return;
      }
      this.alertSound = sound;

      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (gen !== this.generation) return;
        if (status?.isLoaded && status?.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          if (this.alertSound === sound) this.alertSound = null;
          this.speak(payload, gen);
        }
      });
    } catch {
      this.speak(payload, gen);
    }
  }

  private getWebVoice(lang: "en" | "ar"): SpeechSynthesisVoice | null {
    if (typeof window === "undefined") return null;
    const synth = (window as any).speechSynthesis;
    if (!synth) return null;
    if (this.webVoiceCache[lang] !== undefined) return this.webVoiceCache[lang]!;
    const picked = pickWebVoice(lang);
    if (picked) {
      this.webVoiceCache[lang] = picked;
      return picked;
    }
    if (!this.webVoicesReady && typeof synth.addEventListener === "function") {
      this.webVoicesReady = true;
      const handler = () => {
        this.webVoiceCache = {};
        synth.removeEventListener("voiceschanged", handler);
      };
      try {
        synth.addEventListener("voiceschanged", handler);
      } catch {
        // ignore
      }
    }
    return null;
  }

  private async ensureNativeVoices(): Promise<void> {
    if (this.nativeVoicesLoaded) return;
    this.nativeVoicesLoaded = true;
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      this.nativeVoiceCache.en = pickNativeVoice("en", voices);
      this.nativeVoiceCache.ar = pickNativeVoice("ar", voices);
    } catch {
      // ignore — fall back to system default
    }
  }

  private speak(payload: AnnouncementPayload, gen: number) {
    if (gen !== this.generation) return;

    const lang = payload.language === "ar" ? "ar" : "en";
    const text =
      payload.spokenText ||
      (lang === "ar" ? payload.spokenTextAr : payload.spokenTextEn) ||
      payload.spokenTextEn ||
      "";
    if (!text) return;

    const langCode = lang === "ar" ? "ar-SA" : "en-US";

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const synth = (window as any).speechSynthesis;
      const Utter = (window as any).SpeechSynthesisUtterance;
      if (!synth || !Utter) return;
      try {
        synth.cancel();
        const voice = this.getWebVoice(lang);
        const makeUtter = () => {
          const u = new Utter(text);
          u.lang = voice?.lang || langCode;
          if (voice) u.voice = voice;
          // Warmer, more professional cadence — slightly slower with a touch
          // more pitch than default for a softer, human-like delivery.
          u.rate = 0.92;
          u.pitch = 1.05;
          u.volume = 1.0;
          return u;
        };
        synth.speak(makeUtter());
        synth.speak(makeUtter());
      } catch {
        // ignore
      }
      return;
    }

    const speakOnce = () => {
      const voice = this.nativeVoiceCache[lang];
      try {
        Speech.speak(text, {
          language: langCode,
          voice: voice?.identifier,
          rate: 0.92,
          pitch: 1.05,
        });
      } catch {
        // ignore
      }
    };

    const run = () => {
      try {
        Speech.stop();
        speakOnce();
        if (this.repeatTimer) clearTimeout(this.repeatTimer);
        this.repeatTimer = setTimeout(() => {
          this.repeatTimer = null;
          if (gen !== this.generation) return;
          speakOnce();
        }, 1500);
      } catch {
        // ignore
      }
    };

    if (this.nativeVoicesLoaded) {
      run();
    } else {
      this.ensureNativeVoices().finally(() => {
        if (gen !== this.generation) return;
        run();
      });
    }
  }
}

export const AnnouncerListener = new AnnouncerListenerImpl();
