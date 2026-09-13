const { spawn } = require("node:child_process");

const domain = process.env.REPLIT_DEV_DOMAIN;

if (!domain) {
  console.error("REPLIT_DEV_DOMAIN is required to start Expo on Replit.");
  process.exit(1);
}

const baseEnv = {
  ...process.env,
  EXPO_PUBLIC_DOMAIN: `${domain}:5000`,
};
delete baseEnv.EXPO_NO_QR_CODE;

let stopped = false;
let expo = null;
let mode = "tunnel";

function startExpo() {
  const useTunnel = mode === "tunnel";
  const env = { ...baseEnv };
  if (useTunnel) {
    delete env.EXPO_PACKAGER_PROXY_URL;
    delete env.REACT_NATIVE_PACKAGER_HOSTNAME;
    env.EXPO_TUNNEL_SUBDOMAIN = `tiqkets-${Date.now().toString(36)}-${process.pid}`;
    console.log("Starting Expo tunnel...");
  } else {
    // When ngrok is unavailable, Expo Go reaches Metro through the public
    // Express proxy on port 5000. Advertising that host keeps manifest,
    // bundle, asset and debugger URLs reachable without a tunnel.
    env.EXPO_PACKAGER_PROXY_URL = `https://${domain}`;
    env.REACT_NATIVE_PACKAGER_HOSTNAME = domain;
    console.log("Expo tunnel unavailable; starting through the Replit development proxy...");
  }

  expo = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["expo", "start", useTunnel ? "--tunnel" : "--localhost"],
    {
      env,
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

    if (mode === "tunnel") {
      mode = "proxy";
      console.warn(`Expo tunnel exited with code ${code ?? 1}; falling back to the Replit proxy...`);
      startExpo();
      return;
    }

    process.exit(code ?? 0);
  });
}

function stop(signal) {
  if (stopped) return;
  stopped = true;
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