import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the actual shared listener/worker, substituting ONLY device APIs and time.
const listenerSource = readFileSync(new URL("../client/services/AnnouncerListener.ts", import.meta.url), "utf8");
const queueSource = readFileSync(new URL("../client/services/AnnouncementQueue.ts", import.meta.url), "utf8");
const compile = (source: string) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const listenerJs = compile(listenerSource);
const queueJs = compile(queueSource);

async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }

async function harness(web = false) {
  let now = 0;
  let timerId = 0;
  let stops = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const sounds: any[] = [];
  const speech: any[] = [];
  const warnings: string[] = [];
  const modes: any[] = [];
  const sources: any[] = [];
  const runtime = {
    AbortController,
    URL,
    setTimeout: (fn: () => void, ms: number) => { const id = ++timerId; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (id: number) => { timers.delete(id); },
    console: { warn: (message: string) => warnings.push(message) },
  };
  class EventSource {
    listeners: Record<string, (ev: unknown) => void> = {};
    onmessage?: (ev: unknown) => void;
    closed = false;
    constructor() { sources.push(this); }
    addEventListener(name: string, listener: (ev: unknown) => void) { this.listeners[name] = listener; }
    close() { this.closed = true; }
  }
  class Utterance { constructor(public text: string) {} }
  const queueExports: any = {};
  runInNewContext(queueJs, { ...runtime, exports: queueExports });
  const listenerExports: any = {};
  runInNewContext(listenerJs, {
    ...runtime, exports: listenerExports,
    window: web ? {
      EventSource,
      SpeechSynthesisUtterance: Utterance,
      speechSynthesis: {
        getVoices: () => [], addEventListener: () => {},
        cancel: () => { stops++; }, speak: (utterance: any) => speech.push(utterance),
      },
    } : undefined,
    require: (name: string) => {
      if (name === "./AnnouncementQueue") return queueExports;
      if (name === "react-native") return { Platform: { OS: web ? "web" : "ios" } };
      if (name === "react-native-sse") return { __esModule: true, default: EventSource };
      if (name === "@/lib/query-client") return { getApiUrl: () => "https://example.test" };
      if (name === "@shared/languages") return { getLanguage: (lang: string) => ({ bcp47: lang === "ar" ? "ar-SA" : "en-US" }) };
      if (name === "expo-speech") return {
        getAvailableVoicesAsync: async () => [],
        speak: (text: string, options: any) => speech.push({ text, ...options }),
        stop: async () => { stops++; },
      };
      if (name === "@/utils/audioCompat") return { Audio: {
        setAudioModeAsync: async (mode: unknown) => { modes.push(mode); },
        Sound: { createAsync: async (source: unknown, options: unknown) => {
          const sound = {
            source, options, startedAt: now, stopped: false, unloaded: false,
            callback: (_status: unknown) => {},
            setOnPlaybackStatusUpdate(fn: (status: unknown) => void) { this.callback = fn; },
            async stopAsync() { this.stopped = true; },
            async unloadAsync() { this.unloaded = true; },
          };
          sounds.push(sound);
          return { sound };
        } },
      } };
      if (name === "../assets/sounds/alert-tone.mp3") return "existing-alert-tone.mp3";
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const listener = listenerExports.AnnouncerListener;
  listener.start("org", "user", [{ id: "branch", announcerUserId: "user" }]);
  await flush();
  const baselineStops = stops;
  const emit = (label: string, fallback?: string) => {
    const payload = { spokenText: label, language: "en", fallbackText: fallback, fallbackLanguage: "ar" };
    const source = sources.at(-1);
    (web ? source.onmessage : source.listeners.message)({ data: JSON.stringify(payload) });
  };
  const advance = async (ms: number) => {
    const target = now + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
      await flush();
    }
    now = target;
    await flush();
  };
  const toneDone = async (index: number) => {
    sounds[index].callback({ isLoaded: true, didJustFinish: true });
    await flush();
  };
  const speechDone = async (index: number) => {
    (web ? speech[index].onend : speech[index].onDone)();
    await flush();
  };
  const complete = async (index: number) => {
    const first = speech.length;
    await toneDone(index);
    await speechDone(first);
    if (!web) await advance(1500);
    await speechDone(first + 1);
  };
  const stop = async () => { listener.stop(); await flush(); };
  return { listener, sounds, speech, warnings, modes, sources, emit, advance, toneDone, speechDone, complete, stop,
    additionalStops: () => stops - baselineStops };
}

test("single event starts immediately, preserving sound, speech, repeat/fallback, and cadence", async () => {
  const h = await harness();
  h.emit("Ticket A", "التذكرة أ");
  await flush();
  assert.equal(h.sounds.length, 1);
  assert.equal(h.sounds[0].startedAt, 0);
  assert.equal(h.sounds[0].source, "existing-alert-tone.mp3");
  assert.equal(h.sounds[0].options.volume, 1);
  assert.equal(h.speech.length, 0);
  await h.toneDone(0);
  assert.equal(h.speech[0].text, "Ticket A");
  assert.equal(h.speech[0].rate, 0.92);
  assert.equal(h.speech[0].pitch, 1.05);
  await h.advance(1499);
  assert.equal(h.speech.length, 1);
  await h.advance(1);
  assert.equal(h.speech[1].text, "التذكرة أ");
  assert.equal(h.speech[1].language, "ar-SA");
  await h.speechDone(0);
  await h.speechDone(1);
  assert.equal(h.additionalStops(), 0);
  await h.stop();
});

test("two back-to-back events finish both utterances, then wait exactly one second", async () => {
  const h = await harness();
  h.emit("A"); h.emit("B");
  await flush();
  assert.equal(h.sounds.length, 1);
  assert.equal(h.sounds[0].unloaded, false);
  await h.toneDone(0);
  await h.advance(1500);
  await h.speechDone(0);
  await h.advance(5000); // Primary completed, repeat still in progress.
  assert.equal(h.sounds.length, 1);
  await h.speechDone(1);
  await h.advance(999);
  assert.equal(h.sounds.length, 1);
  await h.advance(1);
  assert.equal(h.sounds.length, 2);
  assert.equal(h.additionalStops(), 0);
  await h.complete(1);
  assert.deepEqual(h.speech.map(s => s.text), ["A", "A", "B", "B"]);
  await h.stop();
});

test("three rapid events and an event arriving during the gap stay in FIFO order", async () => {
  const h = await harness();
  h.emit("A"); h.emit("B"); h.emit("C");
  await flush();
  await h.complete(0);
  await h.advance(400);
  h.emit("D");
  await flush();
  assert.equal(h.sounds.length, 1);
  await h.advance(600);
  for (let index = 1; index < 4; index++) {
    await h.complete(index);
    if (index < 3) await h.advance(1000);
  }
  assert.deepEqual(h.speech.map(s => s.text), ["A", "A", "B", "B", "C", "C", "D", "D"]);
  assert.equal(h.additionalStops(), 0);
  await h.stop();
});

test("an event arriving during an otherwise empty gap cannot start early", async () => {
  const h = await harness();
  h.emit("A"); await flush(); await h.complete(0);
  await h.advance(700);
  h.emit("B"); await flush();
  assert.equal(h.sounds.length, 1);
  await h.advance(299);
  assert.equal(h.sounds.length, 1);
  await h.advance(1);
  assert.equal(h.sounds.length, 2);
  await h.stop();
});

test("missing tone completion times out at 30 seconds, stops the old sound, and continues", async () => {
  const h = await harness();
  h.emit("A"); h.emit("B"); await flush();
  await h.advance(30000);
  assert.ok(h.warnings.some(w => w.includes("timed out")));
  assert.ok(h.sounds[0].stopped && h.sounds[0].unloaded);
  await h.advance(1000);
  assert.equal(h.sounds.length, 2);
  // Even a late old callback cannot start old speech.
  await h.toneDone(0);
  assert.equal(h.speech.length, 0);
  await h.complete(1);
  assert.deepEqual(h.speech.map(s => s.text), ["B", "B"]);
  await h.stop();
});

test("missing speech completion also times out and releases the next announcement", async () => {
  const h = await harness();
  h.emit("A"); h.emit("B"); await flush(); await h.toneDone(0);
  await h.advance(30000);
  assert.ok(h.warnings.some(w => w.includes("timed out")));
  assert.equal(h.additionalStops(), 1);
  await h.advance(1000);
  assert.equal(h.sounds.length, 2);
  await h.stop();
});

test("speech errors clear the pending repeat and allow the next item after the gap", async () => {
  const h = await harness();
  h.emit("A"); h.emit("B"); await flush(); await h.toneDone(0);
  h.speech[0].onError(new Error("Speech engine failure")); await flush();
  await h.advance(1000);
  assert.equal(h.sounds.length, 2);
  await h.toneDone(1);
  assert.deepEqual(h.speech.map(s => s.text), ["A", "B"]); // Failed A never repeats.
  assert.ok(h.warnings.some(w => w.includes("failed")));
  await h.stop();
});

test("logout clears waiting items and cancels current speech and repeat", async () => {
  const h = await harness();
  h.emit("A"); h.emit("B"); h.emit("C"); await flush(); await h.toneDone(0);
  await h.stop();
  await h.advance(40000);
  assert.equal(h.sounds.length, 1);
  assert.deepEqual(h.speech.map(s => s.text), ["A"]);
  assert.equal(h.additionalStops(), 1);
  assert.ok(h.sources[0].closed);
});

test("announcer/branch change discards old work and stale callbacks, but permits new work", async () => {
  const h = await harness();
  h.emit("OLD"); h.emit("DISCARD"); await flush();
  h.listener.start("org", "new-user", [{ id: "new-branch", announcerUserId: "new-user" }]);
  h.emit("NEW"); await flush();
  assert.ok(h.sounds[0].stopped);
  assert.equal(h.sounds.length, 2);
  await h.toneDone(0);
  assert.equal(h.speech.length, 0);
  await h.toneDone(1);
  assert.equal(h.speech[0].text, "NEW");
  await h.stop();
});

test("stop during the inter-announcement gap clears the waiting list", async () => {
  const h = await harness();
  h.emit("A"); h.emit("B"); await flush(); await h.complete(0);
  await h.advance(500);
  await h.stop();
  await h.advance(40000);
  assert.equal(h.sounds.length, 1);
});

test("backlog above twenty warns without dropping items or deduplicating messages", async () => {
  const h = await harness();
  for (let i = 0; i < 23; i++) h.emit("SAME");
  await flush();
  assert.ok(h.warnings.some(w => w.includes("21 waiting")));
  for (let i = 0; i < 23; i++) {
    await h.complete(i);
    if (i < 22) await h.advance(1000);
  }
  assert.equal(h.sounds.length, 23);
  assert.equal(h.speech.length, 46);
  await h.stop();
});

test("shared web playback waits for both speech completions without cancelling a new arrival", async () => {
  const h = await harness(true);
  h.emit("A"); h.emit("B"); await flush();
  await h.toneDone(0);
  assert.deepEqual(h.speech.map(s => s.text), ["A", "A"]);
  await h.speechDone(0);
  await h.advance(1500);
  assert.equal(h.sounds.length, 1);
  await h.speechDone(1);
  await h.advance(1000);
  assert.equal(h.sounds.length, 2);
  assert.equal(h.additionalStops(), 0);
  await h.stop();
});

test("foreground-only settings are unchanged; no background mode is enabled", async () => {
  const h = await harness();
  h.emit("A"); await flush();
  assert.equal(h.modes[0].staysActiveInBackground, false);
  const config = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8")).expo;
  const audioPlugin = config.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === "expo-audio");
  assert.equal(audioPlugin[1].enableBackgroundPlayback, false);
  assert.ok(!config.ios.infoPlist.UIBackgroundModes?.includes("audio"));
  await h.stop();
});
