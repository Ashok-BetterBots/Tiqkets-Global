const platform = process.argv[2];
const required = ["EXPO_PUBLIC_API_URL"];
if (platform === "android") {
  required.push(
    "ANDROID_KEYSTORE_BASE64",
    "ANDROID_KEYSTORE_PASSWORD",
    "ANDROID_KEY_ALIAS",
    "ANDROID_KEY_PASSWORD",
  );
  if (process.env.RELEASE_DESTINATION !== "build")
    required.push("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
} else if (platform === "ios") {
  required.push(
    "APPLE_TEAM_ID",
    "MATCH_PASSWORD",
  );
  if (process.env.RELEASE_DESTINATION !== "build")
    required.push(
      "APP_STORE_CONNECT_KEY_ID",
      "APP_STORE_CONNECT_ISSUER_ID",
      "APP_STORE_CONNECT_KEY_BASE64",
    );
} else throw new Error("Specify android or ios.");
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length)
  throw new Error(`Missing GitHub configuration: ${missing.join(", ")}`);
const url = new URL(process.env.EXPO_PUBLIC_API_URL);
if (
  url.protocol !== "https:" ||
  /localhost|example\.com|127\.0\.0\.1/.test(url.hostname)
)
  throw new Error("A production HTTPS API base URL is required.");
console.log(`${platform} release configuration is present.`);
