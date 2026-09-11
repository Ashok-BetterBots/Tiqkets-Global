import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { registerRoutes } from "./routes";
import { registerQueueTicketRoutes } from "./queue-ticket-routes";
import { registerAnnouncementRoutes } from "./announcements";
import { registerExperimentalFormRoutes } from "./form-builder/routes";
import { ensureBuiltinRoles } from "./rbac";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d: string) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    if (process.env.ALLOWED_ORIGINS) {
      process.env.ALLOWED_ORIGINS.split(",").forEach((o: string) => {
        origins.add(o.trim());
      });
    }

    if (process.env.APP_DOMAIN) {
      origins.add(`https://${process.env.APP_DOMAIN}`);
      origins.add(`http://${process.env.APP_DOMAIN}`);
    }

    const origin = req.header("origin");

    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      // Keep method/path/status/duration intact — these are essential for
      // debugging production issues — and only truncate the (often large,
      // less critical) captured JSON response body tail. Previously this
      // truncated the whole line to 80 chars, which silently cut off the
      // status code for any request with a long path (e.g. event registration
      // routes with two UUIDs), making it impossible to tell from logs alone
      // whether a register/verify-payment call had actually failed.
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        let bodyStr = JSON.stringify(capturedJsonResponse);
        const maxBodyLen = 200;
        if (bodyStr.length > maxBodyLen) {
          bodyStr = bodyStr.slice(0, maxBodyLen) + "…";
        }
        logLine += ` :: ${bodyStr}`;
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function rewriteExpoManifest(manifestStr: string, req: Request): string {
  // Dynamically rewrite the manifest's download URLs to match the current
  // deployment domain. This makes the Docker image portable: even if the image
  // was built with a different APP_DOMAIN (or none), Expo Go will fetch bundles
  // and assets from the server that actually answered the manifest request.
  try {
    const { protocol, host } = getPublicHost(req);
    const actualBase = `${protocol}://${host}`;
    const manifest = JSON.parse(manifestStr);

    // Extract the domain that was baked in at build time so we can replace it.
    const builtBase = manifest.launchAsset?.url
      ? (() => {
          try {
            const u = new URL(manifest.launchAsset.url);
            return `${u.protocol}//${u.host}`;
          } catch {
            return null;
          }
        })()
      : null;

    const patchUrl = (url: string): string => {
      if (!url) return url;
      try {
        const u = new URL(url);
        const actual = new URL(actualBase);
        u.protocol = actual.protocol;
        u.hostname = actual.hostname;
        u.port = actual.port;
        return u.toString();
      } catch {
        return url;
      }
    };

    // Patch launchAsset (the JS bundle URL)
    if (manifest.launchAsset?.url) {
      manifest.launchAsset.url = patchUrl(manifest.launchAsset.url);
    }

    // Patch all asset download URLs
    if (Array.isArray(manifest.assets)) {
      manifest.assets = manifest.assets.map((a: Record<string, unknown>) => ({
        ...a,
        url: a.url ? patchUrl(a.url as string) : a.url,
      }));
    }

    // hostUri/debuggerHost are packager identities, not URLs. They must be the
    // bare public host; platform path suffixes can leave Android Expo Go stuck
    // on its native "Loading project..." screen before JavaScript starts.
    const actualHost = host;

    if (manifest.extra?.expoClient?.hostUri) {
      manifest.extra.expoClient.hostUri = actualHost;
    }
    if (manifest.extra?.expoGo?.debuggerHost) {
      manifest.extra.expoGo.debuggerHost = actualHost;
    }

    return JSON.stringify(manifest);
  } catch {
    // If JSON parse or patching fails for any reason, fall back to the raw file
    return manifestStr;
  }
}

function serveExpoManifest(platform: string, req: Request, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifestStr = fs.readFileSync(manifestPath, "utf-8");
  res.send(rewriteExpoManifest(manifestStr, req));
}

async function serveDevExpoManifest(req: Request, res: Response) {
  try {
    const headers: Record<string, string> = {};
    for (const name of ["expo-platform", "expo-protocol-version", "accept"]) {
      const value = req.header(name);
      if (value) headers[name] = value;
    }
    const upstream = await fetch(`http://127.0.0.1:8081${req.originalUrl}`, { headers });
    const manifestStr = await upstream.text();

    res.status(upstream.status);
    res.setHeader("expo-protocol-version", upstream.headers.get("expo-protocol-version") || "1");
    res.setHeader("expo-sfv-version", upstream.headers.get("expo-sfv-version") || "0");
    res.setHeader("content-type", "application/json");
    res.send(rewriteExpoManifest(manifestStr, req));
  } catch (error) {
    log("Unable to load the development Expo manifest:", error);
    res.status(503).json({ error: "Expo Metro is not ready. Please retry." });
  }
}

function getPublicHost(req: Request): { protocol: string; host: string } {
  // In Replit production the real public hostname is available via env vars.
  // Never trust proxy headers alone — they can resolve to an internal address
  // (e.g. 127.0.0.1:1104) that phones can't reach.
  if (process.env.APP_DOMAIN) {
    return { protocol: "https", host: process.env.APP_DOMAIN };
  }
  if (process.env.REPLIT_DOMAINS) {
    const first = process.env.REPLIT_DOMAINS.split(",")[0].trim();
    if (first) return { protocol: "https", host: first };
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return { protocol: "https", host: process.env.REPLIT_DEV_DOMAIN };
  }
  // Fallback to request headers (works in local dev without env vars set)
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host") || "localhost:5000";
  return { protocol, host };
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const { protocol, host } = getPublicHost(req);
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  // In development, the externally-exposed Replit URL is mapped to port 5000
  // (Express). Expo Go connects to that URL, so any Metro bundler request
  // (manifest, /index.bundle, /assets, /symbolicate, HMR, etc.) needs to be
  // proxied through this server to Metro on localhost:8081. Without this,
  // Expo Go shows "Manifest not found for platform: ios" because Express
  // tries to serve from the (non-existent in dev) static-build/ directory.
  const isDev = process.env.NODE_ENV !== "production";
  const metroProxy = isDev
    ? createProxyMiddleware({
        target: "http://localhost:8081",
        changeOrigin: true,
        ws: true,
        logger: undefined,
      })
    : null;
  if (metroProxy) {
    log("Dev mode: proxying Expo/Metro requests to http://localhost:8081");
  } else {
    log("Serving static Expo files with dynamic manifest routing");
  }

  // Path prefixes that always belong to Metro (bundler / HMR / asset / debug
  // surfaces). In dev, requests matching these short-circuit to the Metro
  // proxy. In prod they fall through to the static-build/ asset middleware.
  const METRO_PATH_PREFIXES = [
    "/node_modules/",
    "/symbolicate",
    "/logs",
    "/onerror",
    "/open-stack-frame",
    "/reload",
    "/hot",
    "/message",
    "/inspector",
    "/debugger-ui",
    "/__inspector",
    "/__expo",
    "/_expo/",
  ];

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    
    if (req.path.startsWith("/join/") || req.path.startsWith("/reserve/") || req.path.startsWith("/dashboard")) {
      return next();
    }
    
    // Pass through PWA manifest and service worker
    if (req.path === "/manifest.json" || req.path === "/sw.js") {
      return next();
    }

    // Dev: forward all Metro-owned paths (bundle, assets-with-platform,
    // symbolication, HMR, etc.) to the Metro server. Asset requests carry a
    // ?platform=ios|android query, so we proxy /assets/* in dev as well.
    if (metroProxy) {
      const isMetroPath =
        METRO_PATH_PREFIXES.some((p) => req.path.startsWith(p)) ||
        req.path.endsWith(".bundle") ||
        req.path.endsWith(".map") ||
        (req.path.startsWith("/assets/") && typeof req.query.platform === "string");
      if (isMetroPath) {
        return metroProxy(req, res, next);
      }
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      // Dev: ask Metro for the up-to-the-minute manifest instead of the
      // (non-existent) static-build manifest.
      if (metroProxy) {
        return void serveDevExpoManifest(req, res);
      }
      return serveExpoManifest(platform, req, res);
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.get("/dashboard", (_req: Request, res: Response) => {
    const dashboardPath = path.resolve(process.cwd(), "server", "templates", "dashboard.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Disable HTTP caching so admins always pull the latest dashboard JS,
    // including freshly-deployed validation logic. Without this, a stale
    // cached copy can let the user save staff records the new code blocks.
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(dashboardPath);
  });

  app.use("/uploads", express.static(path.resolve(process.cwd(), "server/uploads")));
  // Serves persistent public objects (event branding, profile pictures, etc.)
  // written via ObjectStorageService.uploadPublicObject — added via the
  // Replit "App Storage" (object storage) blueprint integration.
  app.get("/public-objects/*filePath", async (req: Request, res: Response) => {
    const filePath = Array.isArray((req.params as any).filePath)
      ? (req.params as any).filePath.join("/")
      : (req.params as any).filePath;
    try {
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use("/brand", express.static(path.resolve(process.cwd(), "client/assets/images/logo")));
  app.use("/public", express.static(path.resolve(process.cwd(), "server/public")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  // Register customer-facing ticket page routes BEFORE configureExpoAndLanding
  // so they are matched at the top of the Express middleware chain — ahead of
  // express.static("static-build"). In production the Expo web bundle lives
  // in static-build/ and its SPA catch-all would intercept /ticket/:token
  // before the intended queue-ticket-routes handler could fire.
  registerQueueTicketRoutes(app);

  configureExpoAndLanding(app);

  registerAnnouncementRoutes(app);
  await ensureBuiltinRoles();
  const server = await registerRoutes(app);
  await registerExperimentalFormRoutes(app);

  setupErrorHandler(app);

  // Start the subscription expiry-reminder scheduler. Safe to call once
  // here — internally it no-ops on duplicate starts and uses unref'd
  // timers so it doesn't keep the process alive on shutdown.
  const { startBillingReminders } = await import("./billing-reminders");
  startBillingReminders();

  // Auto-end service queues that sit idle (no one waiting) for 30+ minutes,
  // firing the same alerts as a manual End. Same safe single-start pattern.
  const { startQueueAutoEnd } = await import("./queue-auto-end");
  startQueueAutoEnd();

  // Events-mode WhatsApp reminders (day-before / hour-before / slot-active).
  const { startEventReminders } = await import("./event-reminders");
  startEventReminders();

  // Persistent WhatsApp job queue — processes all outbound WA ticket
  // confirmations (event + queue) with automatic retry on failure.
  // This is the primary delivery mechanism; no message is lost on restart
  // because jobs are written to the wa_queue table before the HTTP response.
  import("./wa-queue-worker")
    .then(({ startWaQueueWorker }) => startWaQueueWorker())
    .catch((err) => console.error("[wa-queue] worker start failed:", err));

  // Legacy reconciler — kept as a safety net for any ticket_wa_pending rows
  // that predate the wa_queue (e.g. registrations made before this deploy).
  // New registrations go through wa_queue; the reconciler handles the tail.
  import("./events-routes")
    .then(({ startTicketWaReconciler }) => startTicketWaReconciler())
    .catch((err) => console.error("[events] reconcile import failed:", err));

  const port = parseInt(process.env.PORT || "5000", 10);

  if (process.env.NODE_ENV === "production" && !process.env.APP_DOMAIN) {
    console.warn(
      "WARNING: APP_DOMAIN is not set. The production server will not know its public domain, " +
        "which means the CORS allowlist, landing-page links, and Expo manifest URLs will be missing " +
        "the deployed origin. Set APP_DOMAIN as a deployment secret (e.g. APP_DOMAIN=yourapp.replit.app).",
    );
  }

  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
      // Fire-and-forget WhatsApp config self-test. Surfaces a loud
      // [whatsapp-config] MISMATCH log if the wa.me business phone
      // does not correspond to WHATSAPP_PHONE_NUMBER_ID — the most
      // common silent cause of "customer never gets the reply".
      import("./whatsapp")
        .then(({ verifyWhatsAppConfig }) => verifyWhatsAppConfig())
        .catch((err) => console.error("[whatsapp-config] import error:", err));
    },
  );
})();
