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

const expo = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["expo", "start", "--tunnel", "--clear"],
  {
    env,
    stdio: "inherit",
  },
);

let stopped = false;

function stop(signal) {
  if (stopped) return;
  stopped = true;
  expo.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGHUP", () => stop("SIGHUP"));

expo.on("error", (error) => {
  console.error("Unable to start Expo:", error);
  process.exitCode = 1;
});

expo.on("exit", (code, signal) => {
  stopped = true;
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});