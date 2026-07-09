import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { registerRoutes } from "./routes";
import { registerAnnouncementRoutes } from "./announcements";
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

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
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

function serveExpoManifest(platform: string, res: Response) {
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

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
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
        return metroProxy(req, res, next);
      }
      return serveExpoManifest(platform, res);
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

  configureExpoAndLanding(app);

  registerAnnouncementRoutes(app);
  await ensureBuiltinRoles();
  const server = await registerRoutes(app);

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
