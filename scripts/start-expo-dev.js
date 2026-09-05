const { spawn } = require("node:child_process");
const QRCode = require("qrcode");

const domain = process.env.REPLIT_DEV_DOMAIN;

if (!domain) {
  console.error("REPLIT_DEV_DOMAIN is required to start Expo on Replit.");
  process.exit(1);
}

const secureExpoUrl = `exps://${domain}`;
const env = {
  ...process.env,
  EXPO_NO_QR_CODE: "1",
  EXPO_PACKAGER_PROXY_URL: `https://${domain}`,
  REACT_NATIVE_PACKAGER_HOSTNAME: domain,
  EXPO_PUBLIC_DOMAIN: `${domain}:5000`,
};

const expo = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["expo", "start", "--localhost"],
  {
    env,
    stdio: "inherit",
  },
);

let stopped = false;

async function waitForMetroAndPrintSecureQr() {
  for (let attempt = 0; attempt < 90 && !stopped; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:8081/status", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        const qr = await QRCode.toString(secureExpoUrl, {
          type: "terminal",
          small: true,
          errorCorrectionLevel: "M",
        });
        console.log("\nScan this secure QR code with Android or iOS Expo Go:");
        console.log(qr);
        console.log(`Expo Go: ${secureExpoUrl}`);
        console.log(
          "Do not use an exp:// URL for this Replit project; Android cannot reach the development domain over HTTP.\n",
        );
        return;
      }
    } catch {
      // Metro is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

void waitForMetroAndPrintSecureQr();

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