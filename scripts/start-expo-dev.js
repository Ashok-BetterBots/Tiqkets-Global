const { spawn } = require("node:child_process");

const domain = process.env.REPLIT_DEV_DOMAIN;

if (!domain) {
  console.error("REPLIT_DEV_DOMAIN is required to start Expo on Replit.");
  process.exit(1);
}

const env = {
  ...process.env,
  EXPO_PUBLIC_DOMAIN: `${domain}:5000`,
};
delete env.EXPO_PACKAGER_PROXY_URL;
delete env.REACT_NATIVE_PACKAGER_HOSTNAME;
delete env.EXPO_NO_QR_CODE;

let stopped = false;
let expo = null;
let retryTimer = null;
let attempt = 0;
const maxAttempts = 5;

function startExpo() {
  attempt += 1;
  const tunnelSubdomain = `tiqkets-${Date.now().toString(36)}-${process.pid}-${attempt}`;
  console.log(`Starting Expo tunnel (attempt ${attempt}/${maxAttempts})...`);

  expo = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["expo", "start", "--tunnel"],
    {
      env: {
        ...env,
        EXPO_TUNNEL_SUBDOMAIN: tunnelSubdomain,
      },
      stdio: "inherit",
    },
  );

  expo.on("error", (error) => {
    console.error("Unable to start Expo:", error);
  });

  expo.on("exit", (code, signal) => {
    expo = null;

    if (stopped) {
      process.exit(0);
      return;
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    if (code === 0) {
      process.exit(0);
      return;
    }

    if (attempt >= maxAttempts) {
      console.error(`Expo tunnel failed after ${maxAttempts} attempts.`);
      process.exit(code ?? 1);
      return;
    }

    const delayMs = attempt * 5000;
    console.warn(`Expo tunnel exited with code ${code ?? 1}; retrying in ${delayMs / 1000}s...`);
    retryTimer = setTimeout(startExpo, delayMs);
  });
}

function stop(signal) {
  if (stopped) return;
  stopped = true;
  if (retryTimer) clearTimeout(retryTimer);
  if (expo) {
    expo.kill(signal);
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGHUP", () => stop("SIGHUP"));

startExpo();