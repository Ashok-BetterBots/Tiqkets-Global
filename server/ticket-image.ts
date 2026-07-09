// ============================================
// Server-side ticket image renderer.
//
// Renders the boarding-pass HTML (event-ticket.html, in ?embed=1 mode) with
// a headless Chromium instance and screenshots the ticket card as a PNG.
// This is the image sent to customers on WhatsApp — a real designed ticket
// (event + customer details baked in), not just a bare QR square.
//
// Chromium is provided by the Replit environment (REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE)
// so no browser download is required. The browser instance is a lazy
// singleton — one process shared across requests, a fresh page per render.
// ============================================

import { existsSync, readdirSync } from "fs";
import { join } from "path";
import type { Browser } from "playwright-core";

let browserPromise: Promise<Browser> | null = null;

// Resolve a working Chromium binary across very different environments:
//  - Dev workspace: REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE points into the
//    live /nix/store, which is NOT available in a production build (the
//    deployment image only bundles what the build/run commands touch).
//  - Production (VM deploy): the build step runs
//    `npx playwright install chromium`, which downloads a browser into
//    the default cache dir (~/.cache/ms-playwright/chromium-<rev>/...).
//    The exact <rev> folder name changes with the playwright-core version,
//    so we can't hardcode it — scan the cache dir for a chromium-* folder.
// NOTE: uses a top-level static import of { existsSync } — do NOT use
// require("fs") here; the production ESM bundle (esbuild --format=esm)
// does not support CommonJS require() calls at runtime.
function findDownloadedChromium(): string | undefined {
  const cacheDir = join(process.env.HOME || "/root", ".cache", "ms-playwright");
  try {
    const entries = readdirSync(cacheDir).filter((d) => d.startsWith("chromium"));
    for (const dir of entries) {
      for (const rel of [
        "chrome-linux/chrome",
        "chrome-headless-shell-linux64/chrome-headless-shell",
      ]) {
        const candidate = join(cacheDir, dir, rel);
        if (existsSync(candidate)) return candidate;
      }
    }
  } catch { /* cache dir doesn't exist yet */ }
  return undefined;
}

function resolveChromiumPath(): string | undefined {
  const candidates = [
    process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    findDownloadedChromium(),
    // Legacy fallback Nix store path (dev workspace only; hash changes
    // across environment rebuilds, kept only as a last-ditch guess).
    "/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome",
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return undefined; // Let playwright-core locate its own bundled binary
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright-core");
      const executablePath = resolveChromiumPath();
      const browser = await chromium.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      browser.on("disconnected", () => {
        browserPromise = null;
      });
      return browser;
    })().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

// Call once at server startup to launch the Chromium singleton eagerly.
// This ensures the browser is warm before the first registration comes in,
// eliminating the cold-start race where Meta fetches the ticket image URL
// before Chromium has finished launching (2–5 s on first start).
export function prewarmBrowser(): void {
  getBrowser().catch((err) => {
    console.warn("[ticket-image] Chromium pre-warm failed:", err instanceof Error ? err.message : err);
  });
}

// Renders the boarding-pass card for `qrToken` and returns a PNG buffer.
// Throws if the ticket can't be found/rendered — callers should fall back
// to a plain QR image or text message on failure.
export async function renderTicketImage(qrToken: string): Promise<Buffer> {
  const port = process.env.PORT || "5000";
  const url = `http://127.0.0.1:${port}/event-ticket/${encodeURIComponent(qrToken)}?embed=1`;

  const browser = await getBrowser();
  // deviceScaleFactor: 3 → 3× pixel density; produces a ~1440×2700 px PNG
  // which is sharp enough for WhatsApp's HD image delivery and crisp on
  // high-DPI screens.  Width 480 matches the ticket card's max-width so
  // there is no wasted canvas on either side.
  const page = await browser.newPage({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 3 });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForSelector('body[data-ready="1"]', { timeout: 12000 });
    const pass = page.locator(".pass");
    await pass.waitFor({ state: "visible", timeout: 5000 });
    const buffer = await pass.screenshot({ type: "png" });
    return buffer;
  } finally {
    await page.close().catch(() => {});
  }
}
