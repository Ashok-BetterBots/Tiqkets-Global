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

function startExpo() {
  console.log("Starting Expo Metro behind the Replit HTTPS proxy...");

  expo = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["expo", "start", "--localhost"],
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

    if (code === 0) {
      process.exit(0);
      return;
    }

    process.exit(code ?? 1);
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