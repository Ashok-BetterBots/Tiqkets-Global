import { Platform } from "react-native";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import RNEventSource from "react-native-sse";
import { getApiUrl } from "@/lib/query-client";
import { getLanguage } from "@shared/languages";

type AnnouncementPayload = {
  spokenText?: string;
  spokenTextEn?: string;
  spokenTextAr?: string;
  language?: string;
  languageBcp47?: string;
  fallbackText?: string | null;
  fallbackLanguage?: string | null;
  fallbackLanguageBcp47?: string | null;
  alertSoundUrl?: string | null;
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

// Per-language preferred voice names — the picker walks down each list and
// returns the first match. Codes not listed here use generic female/neural
// hints + the language prefix match. Names are partial; matching is fuzzy.
const PREFERRED_VOICE_NAMES: Record<string, string[]> = {
  en: [
    "Microsoft Aria Online (Natural)",
    "Microsoft Jenny Online (Natural)",
    "Microsoft Emma Online (Natural)",
    "Microsoft Ava Online (Natural)",
    "Google UK English Female",
    "Google US English",
    "Samantha", "Ava (Premium)", "Ava (Enhanced)", "Ava",
    "Allison (Premium)", "Allison (Enhanced)", "Allison",
    "Susan (Premium)", "Susan", "Karen (Premium)", "Karen",
    "Serena (Premium)", "Serena", "Victoria",
  ],
  ar: [
    "Microsoft Hoda Online (Natural)",
    "Microsoft Salma Online (Natural)",
    "Microsoft Amina Online (Natural)",
    "Google عربية", "Maged", "Laila",
  ],
  fr: ["Microsoft Denise Online (Natural)", "Microsoft Vivienne Online (Natural)", "Audrey", "Amelie", "Marie", "Thomas"],
  es: ["Microsoft Elvira Online (Natural)", "Microsoft Helena Online (Natural)", "Monica", "Paulina", "Esperanza"],
  de: ["Microsoft Katja Online (Natural)", "Anna", "Petra", "Marlene"],
  it: ["Microsoft Elsa Online (Natural)", "Alice", "Federica"],
  pt: ["Microsoft Francisca Online (Natural)", "Joana", "Luciana"],
  nl: ["Microsoft Colette Online (Natural)", "Claire", "Xander"],
  ru: ["Microsoft Svetlana Online (Natural)", "Milena", "Yuri"],
  tr: ["Microsoft Emel Online (Natural)", "Yelda"],
  hi: ["Microsoft Swara Online (Natural)", "Lekha"],
  ur: ["Microsoft Uzma Online (Natural)"],
  fa: ["Microsoft Dilara Online (Natural)"],
  bn: ["Microsoft Tanishaa Online (Natural)"],
  ta: ["Microsoft Pallavi Online (Natural)"],
  te: ["Microsoft Shruti Online (Natural)"],
  ml: ["Microsoft Sobhana Online (Natural)"],
  zh: ["Microsoft Xiaoxiao Online (Natural)", "Microsoft Yunxi Online (Natural)", "Tingting", "Mei-Jia"],
  ja: ["Microsoft Nanami Online (Natural)", "Kyoko", "Otoya"],
  ko: ["Microsoft SunHi Online (Natural)", "Yuna"],
  th: ["Microsoft Premwadee Online (Natural)", "Kanya"],
  id: ["Microsoft Gadis Online (Natural)", "Damayanti"],
  ms: ["Microsoft Yasmin Online (Natural)"],
  tl: ["Microsoft Blessica Online (Natural)"],
  vi: ["Microsoft HoaiMy Online (Natural)", "Linh"],
};

const FEMALE_HINTS = [
  "female", "samantha", "victoria", "karen", "tessa", "moira", "fiona",
  "aria", "jenny", "emma", "ava", "allison", "sara", "anna", "amelie",
  "hoda", "salma", "laila", "amina", "zira", "susan", "serena", "kathy",
  "denise", "vivienne", "audrey", "marie", "elvira", "helena", "monica",
  "paulina", "katja", "petra", "marlene", "elsa", "alice", "federica",
  "francisca", "joana", "luciana", "colette", "claire", "svetlana", "milena",
  "emel", "yelda", "swara", "lekha", "uzma", "dilara", "tanishaa", "pallavi",
  "shruti", "sobhana", "xiaoxiao", "tingting", "nanami", "kyoko", "sunhi",
  "yuna", "premwadee", "kanya", "gadis", "yasmin", "blessica", "hoaimy", "linh",
];

const NEURAL_HINTS = /natural|neural|online|premium|enhanced|wavenet/i;

function pickWebVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  const synth = (window as any).speechSynthesis;
  if (!synth) return null;
  const all: SpeechSynthesisVoice[] = synth.getVoices?.() || [];
  if (!all.length) return null;
  const langPrefix = (lang || "en").toLowerCase();
  const langMatch = all.filter((v) =>
    (v.lang || "").toLowerCase().startsWith(langPrefix)
  );
  if (!langMatch.length) return null;
  const preferred = PREFERRED_VOICE_NAMES[langPrefix] || [];
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

function pickNativeVoice(lang: string, voices: Speech.Voice[]): Speech.Voice | null {
  if (!voices?.length) return null;
  const langPrefix = (lang || "en").toLowerCase();
  const langMatch = voices.filter((v) =>
    (v.language || "").toLowerCase().startsWith(langPrefix)
  );
  if (!langMatch.length) return null;
  const preferred = PREFERRED_VOICE_NAMES[langPrefix] || [];
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
  private currentUserId: string | null = null;
  private alertSound: Audio.Sound | null = null;
  private audioModeReady = false;
  private repeatTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private webVoiceCache: Record<string, SpeechSynthesisVoice | null> = {};
  private webVoicesListenerAttached = false;
  private nativeVoiceCache: Record<string, Speech.Voice | null> = {};
  private nativeVoicesLoaded = false;
  private nativeVoices: Speech.Voice[] = [];

  start(orgId: string | null, userId: string | null, branches: BranchInfo[]) {
    const targetBranchIds = (branches || [])
      .filter((b) => b && b.announcerUserId && userId && b.announcerUserId === userId)
      .map((b) => b.id)
      .sort();

    const sig = `${orgId || ""}|${userId || ""}|${targetBranchIds.join(",")}`;
    if (sig === this.currentSig) return;

    this.stop();
    this.currentSig = sig;
    this.currentUserId = userId;

    if (!orgId || !userId || targetBranchIds.length === 0) return;

    targetBranchIds.forEach((branchId) => {
      this.openConnection(branchId, orgId);
    });
  }

  private openConnection(branchId: string, orgId: string) {
    try {
      // Pass the announcer's userId explicitly. The server matches connections
      // against the branch's chosen announcer to avoid overlap, and normally
      // derives the userId from the org-session cookie. On native, the SSE
      // transport does not reliably replay that cookie, so without this the
      // match fails and announcements never fire. The client only opens a
      // connection for branches where it IS the announcer, so sending the
      // userId here is safe and intent-preserving.
      const userIdParam = this.currentUserId
        ? `&userId=${encodeURIComponent(this.currentUserId)}`
        : "";
      const url = new URL(
        `/api/announcements/stream?branchId=${encodeURIComponent(branchId)}&orgId=${encodeURIComponent(orgId)}${userIdParam}`,
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
    // Try first with background audio enabled so the alert tone keeps
    // playing even when the app is backgrounded (the screen is off or
    // the user has switched apps). This requires the iOS "audio"
    // background mode to be declared in app.json — see
    // expo.ios.infoPlist.UIBackgroundModes. If the runtime refuses
    // (e.g. running in plain Expo Go without the capability), we fall
    // back to foreground-only mode so we never throw and silently
    // disable announcements.
    const baseMode = {
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    } as const;
    try {
      await Audio.setAudioModeAsync({
        ...baseMode,
        staysActiveInBackground: true,
        // Mix with other audio so a paused music app doesn't stop the
        // alert tone, and so the alert tone briefly ducks music
        // instead of replacing the user's session.
        interruptionModeIOS: Audio.InterruptionModeIOS?.DuckOthers,
        interruptionModeAndroid: Audio.InterruptionModeAndroid?.DuckOthers,
      } as any);
      this.audioModeReady = true;
      return;
    } catch {
      // Background audio not available (likely Expo Go without the
      // background mode capability). Fall back to foreground-only.
    }
    try {
      await Audio.setAudioModeAsync({
        ...baseMode,
        staysActiveInBackground: false,
      });
    } catch {
      // ignore
    }
    this.audioModeReady = true;
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
        : require("../assets/sounds/alert-tone.mp3");
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

  private getWebVoice(lang: string): SpeechSynthesisVoice | null {
    if (typeof window === "undefined") return null;
    const synth = (window as any).speechSynthesis;
    if (!synth) return null;
    const key = (lang || "en").toLowerCase();
    if (this.webVoiceCache[key] !== undefined) return this.webVoiceCache[key];
    const picked = pickWebVoice(key);
    if (picked) {
      this.webVoiceCache[key] = picked;
      return picked;
    }
    if (!this.webVoicesListenerAttached && typeof synth.addEventListener === "function") {
      this.webVoicesListenerAttached = true;
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
      this.nativeVoices = await Speech.getAvailableVoicesAsync();
    } catch {
      this.nativeVoices = [];
    }
  }

  private getNativeVoice(lang: string): Speech.Voice | null {
    const key = (lang || "en").toLowerCase();
    if (this.nativeVoiceCache[key] !== undefined) return this.nativeVoiceCache[key];
    const picked = pickNativeVoice(key, this.nativeVoices);
    this.nativeVoiceCache[key] = picked;
    return picked;
  }

  // Resolve the (text, lang, bcp47) tuples to actually speak. Returns one or
  // two utterances depending on whether the payload includes a fallback.
  private resolveUtterances(payload: AnnouncementPayload): Array<{ text: string; lang: string; bcp47: string }> {
    const primaryLangCode = (payload.language || "en").toLowerCase();
    const primaryBcp47 =
      payload.languageBcp47 || getLanguage(primaryLangCode).bcp47;
    const primaryText =
      payload.spokenText ||
      (primaryLangCode === "ar" ? payload.spokenTextAr : payload.spokenTextEn) ||
      payload.spokenTextEn ||
      payload.spokenTextAr ||
      "";

    const out: Array<{ text: string; lang: string; bcp47: string }> = [];
    if (!primaryText) return out;
    out.push({ text: primaryText, lang: primaryLangCode, bcp47: primaryBcp47 });

    const fallbackText = payload.fallbackText && payload.fallbackText.trim() ? payload.fallbackText : null;
    if (fallbackText) {
      const fbLang = (payload.fallbackLanguage || "en").toLowerCase();
      const fbBcp47 = payload.fallbackLanguageBcp47 || getLanguage(fbLang).bcp47;
      out.push({ text: fallbackText, lang: fbLang, bcp47: fbBcp47 });
    } else {
      // No bilingual fallback — repeat the primary line so admins still hear it twice.
      out.push({ text: primaryText, lang: primaryLangCode, bcp47: primaryBcp47 });
    }
    return out;
  }

  private speak(payload: AnnouncementPayload, gen: number) {
    if (gen !== this.generation) return;
    const utterances = this.resolveUtterances(payload);
    if (!utterances.length) return;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const synth = (window as any).speechSynthesis;
      const Utter = (window as any).SpeechSynthesisUtterance;
      if (!synth || !Utter) return;
      try {
        synth.cancel();
        for (const u of utterances) {
          const voice = this.getWebVoice(u.lang);
          const utter = new Utter(u.text);
          utter.lang = voice?.lang || u.bcp47;
          if (voice) utter.voice = voice;
          // Warmer, more professional cadence.
          utter.rate = 0.92;
          utter.pitch = 1.05;
          utter.volume = 1.0;
          synth.speak(utter);
        }
      } catch {
        // ignore
      }
      return;
    }

    const speakOne = (u: { text: string; lang: string; bcp47: string }) => {
      const voice = this.getNativeVoice(u.lang);
      try {
        Speech.speak(u.text, {
          language: u.bcp47,
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
        speakOne(utterances[0]);
        if (this.repeatTimer) clearTimeout(this.repeatTimer);
        if (utterances.length > 1) {
          this.repeatTimer = setTimeout(() => {
            this.repeatTimer = null;
            if (gen !== this.generation) return;
            speakOne(utterances[1]);
          }, 1500);
        }
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
