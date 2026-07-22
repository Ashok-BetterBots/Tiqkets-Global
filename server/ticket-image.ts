// ============================================
// Server-side ticket image renderer.
//
// Renders the boarding-pass HTML (event-ticket.html, in ?embed=1 mode) with
// a headless Chromium instance and screenshots the ticket card as a PNG.
// This is the image sent to customers on WhatsApp — a real designed ticket
// (event + customer details baked in), not just a bare QR square.
//
// Chromium comes from the "chromium" Nix system package (declared in
// replit.nix / .replit [nix] packages), resolved at runtime via `which
// chromium`. This is the ONLY reliable source across environments:
//  - `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` is a dev-workspace-only
//    convenience env var; it is not set in a deployed VM container.
//  - Playwright's own downloaded browser binaries (`npx playwright install`)
//    are generic Linux builds that expect an apt/FHS-style system and fail
//    to launch on this Nix-based image with "error while loading shared
//    libraries: libglib-2.0.so.0" (no equivalent of `--with-deps` on Nix).
//  - The Nix `chromium` package is compiled specifically for this Nix
//    closure (correct rpaths to glib/nss/etc via the Nix store) and is
//    installed as a real system dependency, so it's present identically in
//    dev AND in any VM deployment build from the same .replit config.
// The browser instance is a lazy singleton — one process shared across
// requests, a fresh page per render.
// ============================================

import { execFileSync } from "child_process";
import { existsSync } from "fs";
import type { Browser } from "playwright-core";

let browserPromise: Promise<Browser> | null = null;
let cachedChromiumPath: string | null | undefined;

// NOTE: uses a top-level static import of { existsSync } — do NOT use
// require("fs") here; the production ESM bundle (esbuild --format=esm)
// does not support CommonJS require() calls at runtime.
function resolveChromiumPath(): string | undefined {
  if (cachedChromiumPath !== undefined) return cachedChromiumPath ?? undefined;
  const candidates: string[] = [];
  try {
    const which = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
    if (which) candidates.push(which);
  } catch { /* chromium not on PATH — fall through to env var fallback */ }
  // Dev-workspace convenience var, kept as a secondary fallback.
  if (process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    candidates.push(process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE);
  }
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        cachedChromiumPath = p;
        return p;
      }
    } catch { /* ignore */ }
  }
  cachedChromiumPath = null;
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

// Renders the queue ticket card for `qrToken` and returns a PNG buffer.
// Points at /queue-ticket/:qrToken?embed=1 — same Playwright pattern as
// the event boarding-pass, but for the queue pass page.
export async function renderQueueTicketImage(qrToken: string): Promise<Buffer> {
  const port = process.env.PORT || "5000";
  const url = `http://127.0.0.1:${port}/ticket/${encodeURIComponent(qrToken)}?embed=1`;

  const browser = await getBrowser();
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
