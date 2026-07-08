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

import type { Browser } from "playwright-core";

let browserPromise: Promise<Browser> | null = null;

// Known fallback Chromium paths in the Replit / NixOS environment.
// The env var may point at a version that was replaced by a newer package;
// we walk a list of candidates so a stale env var doesn't break rendering.
function resolveChromiumPath(): string | undefined {
  const { existsSync } = require("fs") as typeof import("fs");
  const candidates = [
    process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    // Current installed playwright-browsers-chromium in the Nix store.
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

// Renders the boarding-pass card for `qrToken` and returns a PNG buffer.
// Throws if the ticket can't be found/rendered — callers should fall back
// to a plain QR image or text message on failure.
export async function renderTicketImage(qrToken: string): Promise<Buffer> {
  const port = process.env.PORT || "5000";
  const url = `http://127.0.0.1:${port}/event-ticket/${encodeURIComponent(qrToken)}?embed=1`;

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 2 });
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
