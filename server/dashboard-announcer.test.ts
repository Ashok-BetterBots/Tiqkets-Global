import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const scripts = ["dashboard-announcer-audio.js", "dashboard-announcer.js"].map(name =>
  readFileSync(new URL(`./public/${name}`, import.meta.url), "utf8"));
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function emitter() {
  const listeners = new Map<string, Set<Function>>();
  return {
    addEventListener: (name: string, fn: Function) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    },
    removeEventListener: (name: string, fn: Function) => listeners.get(name)?.delete(fn),
    emit: (name: string) => listeners.get(name)?.forEach(fn => fn()),
  };
}
function clock() {
  let now = 100000;
  let id = 0;
  const timers = new Map<number, { at: number; fn: Function; repeat: number }>();
  const set = (fn: Function, delay: number, repeat = 0) => {
    timers.set(++id, { at: now + delay, fn, repeat }); return id;
  };
  return {
    now: () => now,
    setTimeout: (fn: Function, delay: number) => set(fn, delay),
    setInterval: (fn: Function, delay: number) => set(fn, delay, delay),
    clearTimeout: (id: number) => timers.delete(id),
    clearInterval: (id: number) => timers.delete(id),
    async advance(ms: number) {
      const until = now + ms;
      while (true) {
        const entry = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [key, timer] = entry; now = timer.at;
        if (timer.repeat) timer.at += timer.repeat; else timers.delete(key);
        timer.fn(); await flush();
      }
      now = until; await flush();
    },
  };
}
function locks() {
  let owner = false;
  return { async request(_name: string, _options: unknown, callback: Function) {
    if (owner) return callback(null);
    owner = true;
    try { await callback({ name: "lock" }); } finally { owner = false; }
  } };
}
function harness(sharedLocks = locks()) {
  const time = clock();
  const warnings: unknown[] = [];
  const wakeRequests: any[] = [];
  const root: any = {
    ...emitter(), ...time, URL, AbortController, location: { origin: "https://example.test" },
    document: { ...emitter(), hidden: false },
    navigator: { locks: sharedLocks, wakeLock: { async request() {
      const wake = { ...emitter(), released: false, async release() { this.released = true; this.emit("release"); } };
      wakeRequests.push(wake); return wake;
    } } },
    console: { warn: (...args: unknown[]) => warnings.push(args) },
    Date: class extends Date { static now() { return time.now(); } },
  };
  root.window = root;
  for (const script of scripts) runInNewContext(script, root);
  let scope = { key: "org|user|branch", branchId: "branch", selected: true, enabled: true };
  const plays: any[] = [];
  let stops = 0;
  let unlocks = 0;
  const audio = {
    unlock: async () => { unlocks++; }, voices: () => [], dispose: async () => {},
    stop: () => { stops++; },
    play: (event: any, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
      const item = { event, at: time.now(), finish: resolve, fail: reject };
      plays.push(item);
      signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }),
  };
  const announcer = root.TiqketsDashboardAnnouncer.create({
    audio, getScope: () => scope, inspectScope: async () => scope, onState: () => {},
    resolveUtterances: (event: any) => [{ text: event.spokenText || "Ticket A", lang: "en" }],
  });
  announcer.syncScope(scope);
  const event = (stamp = time.now(), id = "ticket") => ({ id, type: "call", branchId: "branch",
    calledAt: new Date(stamp).toISOString(), spokenText: id });
  return { root, time, announcer, audio, plays, warnings, wakeRequests, event,
    stops: () => stops, unlocks: () => unlocks,
    scope: (update: any) => { scope = { ...scope, ...update }; announcer.syncScope(scope); } };
}

test("fresh login/reload requires Enable; events before consent are never replayed", async () => {
  const h = harness();
  h.announcer.receive(h.event());
  assert.equal(h.plays.length, 0);
  await h.announcer.enable(); await flush();
  h.announcer.receive(h.event());
  assert.equal(h.plays.length, 0);
  h.announcer.receive(h.event(101000));
  await flush();
  assert.equal(h.plays.length, 1);
  h.announcer.destroy(); await flush();
});

test("non-announcer cannot unlock, play or own a tab", async () => {
  const h = harness();
  h.scope({ selected: false });
  await h.announcer.enable();
  h.announcer.receive(h.event());
  assert.equal(h.unlocks(), 0);
  assert.equal(h.plays.length, 0);
  assert.equal(h.announcer.state.selected, false);
  h.announcer.destroy();
});

test("duplicate event is ignored but genuine Call Again is retained", async () => {
  const h = harness();
  await h.announcer.enable(); await flush();
  h.announcer.receive(h.event());
  h.announcer.receive(h.event());
  h.announcer.receive(h.event(101000));
  await flush();
  assert.equal(h.plays.length, 1);
  assert.equal(h.announcer.queue.length, 1);
  h.announcer.destroy(); await flush();
});

test("FIFO waits for completion and owns the full one-second gap, including new arrivals", async () => {
  const h = harness();
  await h.announcer.enable(); await flush();
  h.announcer.receive(h.event(100000, "A"));
  h.announcer.receive(h.event(100000, "B"));
  h.plays[0].finish(); await flush();
  await h.time.advance(999);
  h.announcer.receive(h.event(100999, "C"));
  assert.equal(h.plays.length, 1);
  await h.time.advance(1);
  assert.equal(h.plays[1].event.id, "B");
  h.plays[1].finish(); await flush(); await h.time.advance(1000);
  assert.equal(h.plays[2].event.id, "C");
  h.announcer.destroy(); await flush();
});

test("30-second timeout logs, cancels stuck audio and continues after the gap", async () => {
  const h = harness();
  await h.announcer.enable(); await flush();
  h.announcer.receive(h.event(100000, "stuck"));
  h.announcer.receive(h.event(100000, "next"));
  await h.time.advance(30000);
  assert.equal(h.stops(), 1);
  assert.ok(h.warnings.length);
  assert.match(h.announcer.state.message, /30 seconds/);
  await h.time.advance(1000);
  assert.equal(h.plays[1].event.id, "next");
  h.announcer.destroy(); await flush();
});

test("ordinary playback error continues; browser blocking resets Enable and clears pending work", async () => {
  const h = harness();
  await h.announcer.enable(); await flush();
  h.announcer.receive(h.event(100000, "first"));
  h.announcer.receive(h.event(100000, "second"));
  h.plays[0].fail(new Error("Decode failed")); await flush(); await h.time.advance(1000);
  assert.equal(h.plays.length, 2);
  h.plays[1].fail(Object.assign(new Error("Denied"), { name: "NotAllowedError" }));
  await flush();
  assert.equal(h.announcer.state.active, false);
  assert.equal(h.announcer.state.wanted, false);
  assert.match(h.announcer.state.message, /Click Enable/);
  assert.equal(h.announcer.queue.length, 0);
  h.announcer.destroy(); await flush();
});

test("one tab owns audio and an enabled standby recovers when the owner exits", async () => {
  const shared = locks();
  const first = harness(shared), second = harness(shared);
  await first.announcer.enable(); await flush();
  await second.announcer.enable(); await flush();
  assert.equal(first.announcer.state.active, true);
  assert.equal(second.announcer.state.otherTab, true);
  second.announcer.receive(second.event());
  assert.equal(second.plays.length, 0);
  first.announcer.destroy(); await flush();
  await second.time.advance(2000);
  assert.equal(second.announcer.state.active, true);
  assert.equal(second.plays.length, 0);
  second.announcer.destroy(); await flush();
});

test("branch, logout and announcer changes stop playback and clear queues without automatic re-enabling", async () => {
  for (const update of [{ key: "org|user|other", branchId: "other" }, { key: "" }, { selected: false }]) {
    const h = harness();
    await h.announcer.enable(); await flush();
    h.announcer.receive(h.event()); h.announcer.receive(h.event(101000));
    h.scope(update); await flush();
    assert.equal(h.announcer.queue.length, 0);
    assert.equal(h.announcer.state.active, false);
    assert.equal(h.announcer.state.wanted, false);
    assert.ok(h.wakeRequests.every(w => w.released));
    h.announcer.destroy(); await flush();
  }
});

test("wake lock is optional, releases when hidden, and reacquires on visibility", async () => {
  const h = harness();
  await h.announcer.enable(); await flush();
  assert.equal(h.wakeRequests.length, 1);
  h.root.document.hidden = true; h.root.document.emit("visibilitychange"); await flush();
  assert.equal(h.wakeRequests[0].released, true);
  h.root.document.hidden = false; h.root.document.emit("visibilitychange"); await flush();
  assert.equal(h.wakeRequests.length, 2);
  h.announcer.destroy(); await flush();
});

test("reconnect preserves deduplication and does not restart an old event", async () => {
  const h = harness();
  await h.announcer.enable(); await flush();
  h.announcer.receive(h.event());
  h.announcer.connection(false); h.announcer.connection(true);
  h.announcer.receive(h.event());
  assert.equal(h.plays.length, 1);
  assert.equal(h.announcer.queue.length, 0);
  h.announcer.destroy(); await flush();
});

test("access verification failure cannot enable audio", async () => {
  const h = harness();
  h.announcer.options.inspectScope = async () => { throw new Error("Offline"); };
  await h.announcer.enable(); await flush();
  assert.equal(h.announcer.state.active, false);
  assert.equal(h.announcer.state.wanted, false);
  assert.match(h.announcer.state.message, /verify announcer access/);
  h.announcer.destroy(); await flush();
});

test("speaker Test queues a local English test without calling any queue API", async () => {
  const h = harness();
  await h.announcer.enable(); await flush();
  await h.announcer.test(); await flush();
  assert.equal(h.plays[0].event.test, true);
  assert.match(h.plays[0].event.spokenText, /test announcement/);
  h.announcer.destroy(); await flush();
});

test("playback uses two complete tones before speech, with English/no-voice fallbacks", async () => {
  for (const languages of [["ar", "en"], ["en"], []]) {
    const h = harness();
    const tones: any[] = [], speech: any[] = [], notices: string[] = [];
    const context: any = { ...emitter(), state: "running", destination: {},
      resume: async () => {}, decodeAudioData: async () => ({}),
      createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
      createBufferSource: () => {
        const source: any = { connect() {}, disconnect() {}, stop() {}, start() {} };
        tones.push(source); return source;
      } };
    h.root.AudioContext = function () { return context; };
    h.root.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
    h.root.SpeechSynthesisUtterance = function (this: any, text: string) { this.text = text; };
    h.root.speechSynthesis = { ...emitter(), cancel() {},
      getVoices: () => languages.map(lang => ({ lang, name: lang })),
      speak: (utterance: any) => speech.push(utterance) };
    const engine = new h.root.TiqketsAnnouncementAudio.BrowserAnnouncementAudio({
      onBlocked() {}, notice: (text: string) => notices.push(text), languages() {},
      resolveUtterances: () => [{ text: "Arabic ticket wording", lang: "ar-SA" }],
    });
    await engine.unlock(); speech.length = 0;
    const signal = new AbortController();
    const playback = engine.play({ spokenTextEn: "English ticket wording" }, signal.signal);
    await flush(); assert.equal(tones.length, 1); assert.equal(speech.length, 0);
    tones[0].onended(); await flush();
    assert.equal(tones.length, 2); assert.equal(speech.length, 0);
    tones[1].onended(); await flush();
    if (!languages.length) await h.time.advance(1000);
    if (languages.length) {
      assert.equal(speech.length, 1);
      assert.equal(speech[0].text, languages.includes("ar") ? "Arabic ticket wording" : "English ticket wording");
      speech[0].onend();
    } else {
      assert.equal(speech.length, 0);
      assert.match(notices[0], /Tones and announcement text only/);
    }
    await playback;
    h.announcer.destroy(); await flush();
  }
});

test("Take-Away served timestamp is used even when its original call was much earlier", async () => {
  const h = harness();
  await h.announcer.enable(); await flush();
  h.announcer.receive({ ...h.event(1), type: "serve", servedAt: new Date(h.time.now()).toISOString() });
  assert.equal(h.plays.length, 1);
  h.announcer.destroy(); await flush();
});

test("remote selection can enable without replacing the dashboard's cached branch data", async () => {
  const h = harness();
  h.scope({ selected: false });
  h.announcer.options.inspectScope = async () => ({
    key: "org|user|branch", branchId: "branch", selected: true, enabled: true,
  });
  await h.announcer.inspect();
  await h.announcer.enable(); await flush();
  assert.equal(h.announcer.state.active, true);
  h.announcer.destroy(); await flush();
});

test("event custom sound is fetched, with a visible default-sound fallback only on load failure", async () => {
  for (const fails of [false, true]) {
    const h = harness();
    const fetched: string[] = [], notices: string[] = [];
    let tones = 0;
    const context = { ...emitter(), state: "running", destination: {}, resume: async () => {},
      decodeAudioData: async () => ({}),
      createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
      createBufferSource: () => {
        const source: any = { connect() {}, disconnect() {}, stop() {},
          start() { tones++; source.onended(); } };
        return source;
      } };
    h.root.AudioContext = function () { return context; };
    h.root.fetch = async (url: string) => {
      fetched.push(url);
      return { ok: !(fails && url.includes("custom")), status: 404,
        arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const engine = new h.root.TiqketsAnnouncementAudio.BrowserAnnouncementAudio({
      onBlocked() {}, notice: (message: string) => notices.push(message),
      languages() {}, resolveUtterances: () => [],
    });
    await engine.unlock();
    await engine.play({ alertSoundUrl: "/public/custom.wav" }, new AbortController().signal);
    assert.equal(fetched[0], "https://example.test/public/custom.wav");
    assert.equal(tones, 2);
    if (fails) {
      assert.equal(fetched[1], "/public/alert-tone.wav");
      assert.match(notices[0], /Custom alert sound unavailable/);
    } else assert.equal(fetched.length, 1);
    h.announcer.destroy(); await flush();
  }
});
