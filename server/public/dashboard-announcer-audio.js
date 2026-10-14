/* Browser-only playback. Not used by mobile or the dedicated speaker page. */
(function (root) {
  "use strict";
  const blocked = (error) => error?.name === "NotAllowedError" ||
    error?.error === "not-allowed" || error?.error === "audio-busy";
  const abortError = () => Object.assign(new Error("Announcement cancelled"), { name: "AbortError" });
  const check = signal => { if (signal.aborted) throw abortError(); };
  function completion(signal, start) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", cancel);
        error ? reject(error) : resolve();
      };
      const cancel = () => finish(abortError());
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) return cancel();
      try { start(() => finish(), error => finish(error)); } catch (error) { finish(error); }
    });
  }
  class BrowserAnnouncementAudio {
    constructor(options) {
      this.options = options;
      this.context = null;
      this.source = null;
      this.buffers = new Map();
    }
    async unlock() {
      const Context = root.AudioContext || root.webkitAudioContext;
      if (!Context) throw new Error("This browser does not support announcement audio. Use a current desktop browser.");
      if (!this.context || this.context.state === "closed") {
        this.context = new Context();
        const context = this.context;
        context.addEventListener("statechange", () => {
          if (["suspended", "interrupted"].includes(context.state)) {
            this.options.onBlocked("Browser audio was paused. Click Enable announcements again.");
          }
        });
      }
      // Invoked directly from the Enable click, before any network/lock await.
      await this.context.resume();
      if (this.context.state !== "running") {
        throw Object.assign(new Error("Browser blocked audio."), { name: "NotAllowedError" });
      }
      // Warm up speech during the same interaction. Actual ticket speech waits
      // until both tones finish; errors on this empty utterance are immaterial.
      if (root.speechSynthesis && root.SpeechSynthesisUtterance) {
        const warmup = new root.SpeechSynthesisUtterance("");
        warmup.volume = 0;
        root.speechSynthesis.speak(warmup);
      }
    }
    stop() {
      try { this.source?.stop(); } catch (_) {}
      this.source = null;
      root.speechSynthesis?.cancel();
    }
    async dispose() {
      this.stop();
      const context = this.context;
      this.context = null;
      this.buffers.clear();
      try { await context?.close(); } catch (_) {}
    }
    voices() { return root.speechSynthesis?.getVoices() || []; }
    async waitForVoices(signal) {
      if (this.voices().length || !root.speechSynthesis) return;
      await completion(signal, done => {
        const synth = root.speechSynthesis;
        const cleanup = () => {
          clearTimeout(timer);
          synth.removeEventListener("voiceschanged", finish);
          signal.removeEventListener("abort", cleanup);
        };
        const finish = () => { cleanup(); done(); };
        const timer = setTimeout(finish, 1000);
        synth.addEventListener("voiceschanged", finish);
        signal.addEventListener("abort", cleanup, { once: true });
      });
    }
    voice(lang) {
      const language = (lang || "en").toLowerCase();
      const prefix = language.split("-")[0];
      const available = this.voices();
      const matching = available.filter(v => v.lang.toLowerCase().split("-")[0] === prefix);
      const female = /female|samantha|karen|victoria|zira|susan|hazel|moira|tessa|fiona|serena|allison|ava|hoda|salma|laila|aria|jenny|swara|pallavi/i;
      return matching.find(v => v.lang.toLowerCase() === language && female.test(v.name)) ||
        matching.find(v => female.test(v.name)) ||
        matching.find(v => v.lang.toLowerCase() === language) || matching[0] || null;
    }
    async buffer(url, signal) {
      if (this.buffers.has(url)) return this.buffers.get(url);
      const response = await root.fetch(url, { signal });
      if (!response.ok) throw new Error(`Alert sound could not load (${response.status}).`);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      check(signal);
      if (this.buffers.size >= 8) this.buffers.delete(this.buffers.keys().next().value);
      this.buffers.set(url, buffer);
      return buffer;
    }
    async tone(buffer, signal) {
      check(signal);
      if (this.context?.state !== "running") {
        throw Object.assign(new Error("Browser blocked audio."), { name: "NotAllowedError" });
      }
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      gain.gain.value = 0.8;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(this.context.destination);
      this.source = source;
      try {
        await completion(signal, done => { source.onended = done; source.start(); });
      } finally {
        try { source.stop(); source.disconnect(); gain.disconnect(); } catch (_) {}
        if (this.source === source) this.source = null;
      }
    }
    async speech(text, voice, signal) {
      check(signal);
      const utterance = new root.SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 0.92;
      utterance.pitch = 1.05;
      utterance.volume = 1;
      await completion(signal, (done, fail) => {
        utterance.onend = done;
        utterance.onerror = event => fail(Object.assign(new Error(`Speech failed: ${event.error}`), {
          name: event.error === "not-allowed" ? "NotAllowedError" : "SpeechError", error: event.error,
        }));
        root.speechSynthesis.speak(utterance);
      });
    }
    async play(event, signal) {
      let url = "/public/alert-tone.wav";
      if (event.alertSoundUrl) url = new URL(event.alertSoundUrl, root.location.origin).href;
      let buffer;
      try {
        buffer = await this.buffer(url, signal);
      } catch (error) {
        if (signal.aborted || blocked(error)) throw error;
        if (url === "/public/alert-tone.wav") throw error;
        this.options.notice("Custom alert sound unavailable; using the default sound.");
        buffer = await this.buffer("/public/alert-tone.wav", signal);
      }
      await this.tone(buffer, signal);
      await this.tone(buffer, signal);
      await this.waitForVoices(signal);
      check(signal);
      const utterances = this.options.resolveUtterances(event);
      this.options.languages([...new Set(this.voices().map(v => v.lang))].sort());
      const spoken = [];
      for (const utterance of utterances) {
        const voice = this.voice(utterance.lang);
        if (voice) spoken.push({ ...utterance, voice });
        else {
          const englishVoice = this.voice("en");
          const englishText = event.spokenTextEn ||
            (String(event.fallbackLanguage || "").startsWith("en") ? event.fallbackText : "");
          if (englishVoice && englishText) {
            this.options.notice(`No ${utterance.lang} voice on this computer; using English.`);
            spoken.push({ text: englishText, voice: englishVoice });
          } else {
            this.options.notice(`No suitable ${utterance.lang} voice on this computer. Tones and announcement text only.`);
          }
        }
      }
      for (let i = 0; i < spoken.length; i++) {
        if (i) await completion(signal, done => {
          const timer = setTimeout(done, 1500);
          signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
        });
        await this.speech(spoken[i].text, spoken[i].voice, signal);
      }
    }
  }
  root.TiqketsAnnouncementAudio = { BrowserAnnouncementAudio, blocked, completion };
})(typeof window !== "undefined" ? window : globalThis);
