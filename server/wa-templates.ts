// ============================================
// Server-side WhatsApp template resolver.
//
// Loads overrides from the `whatsapp_overrides` table on demand, caches
// them in-process, and exposes helpers that render a fully-substituted
// message body for a given (mode, trigger, language, vars) tuple.
//
// The Super Admin manager mutates overrides through the
// /api/superadmin/whatsapp-overrides routes, which call
// `invalidateWaTemplateCache` after every successful PUT/DELETE so the
// next outgoing message picks up the change immediately.
// ============================================

import { storage } from "./storage";
import {
  getDefaultWaTemplate,
  renderWaTemplate,
  normalizeWaMode,
  type WaMode,
} from "@shared/wa-templates";

let overrideCache: Map<string, string> | null = null;
let inflight: Promise<Map<string, string>> | null = null;

function cacheKey(mode: string, triggerKey: string, language: string): string {
  return `${mode}|${triggerKey}|${language}`;
}

async function loadCache(): Promise<Map<string, string>> {
  if (overrideCache) return overrideCache;
  if (inflight) return inflight;
  inflight = (async () => {
    const rows = await storage.listWhatsappOverrides();
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(cacheKey(r.mode, r.triggerKey, r.language), r.content);
    }
    overrideCache = map;
    return map;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function invalidateWaTemplateCache(): void {
  overrideCache = null;
}

// Returns the active body for (mode, triggerKey, language). Falls back to
// English override → English default → empty string. Pass any branch
// queueMode through `normalizeWaMode` before calling.
export async function getWaTemplateBody(
  mode: string,
  triggerKey: string,
  language: string = "en",
): Promise<string> {
  const cache = await loadCache();
  const lang = (language || "en").toLowerCase();

  const direct = cache.get(cacheKey(mode, triggerKey, lang));
  if (direct !== undefined) return direct;

  // If a non-English language has no override, prefer the English
  // override before the static default so admin edits in English
  // continue to apply when a customer's locale is unknown.
  if (lang !== "en") {
    const english = cache.get(cacheKey(mode, triggerKey, "en"));
    if (english !== undefined) return english;
  }

  return getDefaultWaTemplate(mode, triggerKey, lang);
}

// Variables passed to template rendering. Numbers are stringified, and
// missing keys render as empty strings (see renderWaTemplate) so live
// customer messages never leak literal `{{var}}` text.
export type WaVars = Record<string, string | number | undefined | null>;

export async function renderWaMessage(
  mode: string,
  triggerKey: string,
  language: string,
  vars: WaVars,
): Promise<string> {
  const body = await getWaTemplateBody(mode, triggerKey, language);
  return renderWaTemplate(body, vars);
}

// Convenience: take a branch-style queueMode value (e.g. "dine_in") and a
// trigger key and render with vars. Always defaults to English.
export async function renderForBranch(
  queueMode: string | null | undefined,
  triggerKey: string,
  vars: WaVars,
  language: string = "en",
): Promise<string> {
  const mode: WaMode = normalizeWaMode(queueMode);
  return renderWaMessage(mode, triggerKey, language, vars);
}
