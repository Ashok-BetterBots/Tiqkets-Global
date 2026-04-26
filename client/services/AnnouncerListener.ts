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

class AnnouncerListenerImpl {
  private connections = new Map<string, any>();
  private currentSig = "";
  private alertSound: Audio.Sound | null = null;
  private audioModeReady = false;
  private repeatTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/alert.mp3"),
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
        const u1 = new Utter(text);
        u1.rate = 0.95;
        u1.lang = langCode;
        synth.speak(u1);
        const u2 = new Utter(text);
        u2.rate = 0.95;
        u2.lang = langCode;
        synth.speak(u2);
      } catch {
        // ignore
      }
      return;
    }

    try {
      Speech.stop();
      Speech.speak(text, { language: langCode, rate: 0.95 });
      if (this.repeatTimer) clearTimeout(this.repeatTimer);
      this.repeatTimer = setTimeout(() => {
        this.repeatTimer = null;
        if (gen !== this.generation) return;
        try {
          Speech.speak(text, { language: langCode, rate: 0.95 });
        } catch {
          // ignore
        }
      }, 1500);
    } catch {
      // ignore
    }
  }
}

export const AnnouncerListener = new AnnouncerListenerImpl();
