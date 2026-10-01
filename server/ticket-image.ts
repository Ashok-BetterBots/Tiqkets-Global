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

// ── In-memory ticket image caches ─────────────────────────────────────────
// Keyed by qrToken.  Entries expire after 24 h (tickets are day-scoped).
// The primary purpose is to eliminate the Playwright render latency when
// Meta fetches the image URL right after we send an approved template:
// pre-render before sending → Meta hits a warm cache → zero delay.

// Queue ticket image cache (non-event queue boarding pass)
const _queueImageCache = new Map<string, { buf: Buffer; ts: number }>();
const _queueImageRenderInFlight = new Map<string, Promise<Buffer>>();
const QUEUE_IMAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Event ticket image cache — keyed by qrToken (lowercase hex).
// issueTicket pre-renders into this cache BEFORE calling sendEventTrigger so
// that when the WhatsApp Cloud API performs its HEAD/GET check on the image
// URL, the endpoint serves the cached PNG instantly (avoiding error 130472
// "Image not available" which occurs when the URL returns 500 while Playwright
// is still launching / rendering).
const _eventTicketImageCache = new Map<string, { buf: Buffer; ts: number }>();
const EVENT_IMAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function getEventTicketImageCache(qrToken: string): Buffer | null {
  const entry = _eventTicketImageCache.get(qrToken);
  if (!entry) return null;
  if (Date.now() - entry.ts > EVENT_IMAGE_CACHE_TTL_MS) {
    _eventTicketImageCache.delete(qrToken);
    return null;
  }
  return entry.buf;
}

export function setEventTicketImageCache(qrToken: string, buf: Buffer): void {
  _eventTicketImageCache.set(qrToken, { buf, ts: Date.now() });
}

export function getCachedQueueTicketImage(qrToken: string): Buffer | null {
  const entry = _queueImageCache.get(qrToken);
  if (!entry) return null;
  if (Date.now() - entry.ts > QUEUE_IMAGE_CACHE_TTL_MS) {
    _queueImageCache.delete(qrToken);
    return null;
  }
  return entry.buf;
}

/** Pre-renders and caches the queue ticket image.  Safe to fire-and-forget. */
export async function preRenderAndCacheQueueTicketImage(
  qrToken: string,
  render: (token: string) => Promise<Buffer> = renderQueueTicketImage,
): Promise<Buffer> {
  // Return from cache if still fresh — avoid redundant Playwright renders.
  const cached = getCachedQueueTicketImage(qrToken);
  if (cached) return cached;
  const inFlight = _queueImageRenderInFlight.get(qrToken);
  if (inFlight) return inFlight;

  const renderPromise = render(qrToken)
    .then((buf) => {
      _queueImageCache.set(qrToken, { buf, ts: Date.now() });
      return buf;
    })
    .finally(() => {
      if (_queueImageRenderInFlight.get(qrToken) === renderPromise) {
        _queueImageRenderInFlight.delete(qrToken);
      }
    });
  _queueImageRenderInFlight.set(qrToken, renderPromise);
  return renderPromise;
}

// NOTE: uses a top-level static import of { existsSync } — do NOT use
// require("fs") here; the production ESM bundle (esbuild --format=esm)
// does not support CommonJS require() calls at runtime.
function resolveChromiumPath(): string | undefined {
  if (cachedChromiumPath !== undefined) return cachedChromiumPath ?? undefined;
  const candidates: string[] = [];
  // Explicit override env var (Dockerfile or custom deployments).
  if (process.env.CHROMIUM_PATH) candidates.push(process.env.CHROMIUM_PATH);
  // Try both common binary names: "chromium" (Nix, Debian) and
  // "chromium-browser" (Alpine apk, Ubuntu PPA).
  for (const name of ["chromium", "chromium-browser"]) {
    try {
      const which = execFileSync("which", [name], { encoding: "utf8" }).trim();
      if (which) candidates.push(which);
    } catch { /* not on PATH — try next */ }
  }
  // Well-known paths used by Alpine's apk chromium package and by
  // playwright-chromium on Debian/Ubuntu.
  candidates.push(
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/lib/chromium/chromium",
  );
  // Dev-workspace convenience var (Replit dev only — not set in prod).
  if (process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    candidates.push(process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE);
  }
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        cachedChromiumPath = p;
        console.log(`[ticket-image] Chromium resolved to: ${p}`);
        return p;
      }
    } catch { /* ignore */ }
  }
  cachedChromiumPath = null;
  console.warn("[ticket-image] No system Chromium found; letting playwright-core use its own bundled binary");
  return undefined; // Let playwright-core locate its own bundled binary
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright-core");
      const executablePath = resolveChromiumPath();
      // When running as root (e.g. dev environment), user namespaces are not
      // available for the sandbox and --no-sandbox is required.  In production
      // (non-root user via the Dockerfile USER directive) the setuid/namespace
      // sandbox is preserved — passing --no-sandbox would unnecessarily weaken
      // isolation, so it is omitted when the process UID is non-zero.
      const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
      const chromiumArgs = [
        ...(isRoot ? ["--no-sandbox"] : []),
        "--disable-dev-shm-usage",
      ];
      const browser = await chromium.launch({
        executablePath,
        headless: true,
        args: chromiumArgs,
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
  // deviceScaleFactor: 4 → 4× pixel density for crisp WhatsApp HD delivery.
  // Viewport width 480 gives the 420px ticket card 30px padding on each side.
  const page = await browser.newPage({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 4 });
  try {
    // The ticket's web page may use Google Fonts for its live presentation.
    // Abort only those optional font requests for this screenshot so a slow or
    // unreachable external CDN cannot keep Chromium's screenshot font wait open.
    await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
    await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForSelector('body[data-ready="1"]', { timeout: 12000 });
    const ticket = page.locator("#ticket-wrap");
    await ticket.waitFor({ state: "visible", timeout: 5000 });

    // Keep rendering bounded even if a future template adds another remote
    // font dependency or the local QR endpoint is slow.
    await page.evaluate(async () => {
      if (!document.fonts) return;
      await Promise.race([
        document.fonts.ready,
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    });
    await page.waitForFunction(() => {
      const image = document.querySelector("#qr-wrap img");
      return !image || (image instanceof HTMLImageElement && image.complete);
    }, null, { timeout: 4000 }).catch(() => {});

    // The live ticket uses a perforation mask and layered drop-shadow filters.
    // They are decorative, but make a full-page GPU repaint expensive in
    // headless Chromium. Keep the designed card, color, typography, and QR,
    // while replacing those effects with a simple, stable card edge for PNG.
    await page.addStyleTag({
      content: `
        .ticket-outer {
          filter: none !important;
          will-change: auto !important;
        }
        .ticket {
          -webkit-mask-image: none !important;
          mask-image: none !important;
        }
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
        }
      `,
    });

    // Crop to the actual pass (not the hidden live page) and put a hard ceiling
    // on capture time. 4x device scale preserves small text and QR detail.
    const buffer = await ticket.screenshot({
      type: "png",
      animations: "disabled",
      timeout: 15000,
    });
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
