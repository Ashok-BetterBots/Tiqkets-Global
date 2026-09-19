import { readFileSync, writeFileSync } from "node:fs";

const buildFile = "android/app/build.gradle";
let source = readFileSync(buildFile, "utf8");

const releaseConfig = `
        release {
            storeFile file(System.getenv("TIQKETS_UPLOAD_STORE_FILE"))
            storePassword System.getenv("TIQKETS_UPLOAD_STORE_PASSWORD")
            keyAlias System.getenv("TIQKETS_UPLOAD_KEY_ALIAS")
            keyPassword System.getenv("TIQKETS_UPLOAD_KEY_PASSWORD")
        }`;

const debugBlockPattern =
  /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\n\s*\})/;
if (!debugBlockPattern.test(source)) {
  throw new Error(
    "Could not locate the generated Android signingConfigs block",
  );
}

source = source.replace(debugBlockPattern, `$1${releaseConfig}`);

const releaseSigningPattern =
  /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
if (!releaseSigningPattern.test(source)) {
  throw new Error(
    "Could not locate the generated Android release signing configuration",
  );
}

source = source.replace(
  releaseSigningPattern,
  "$1signingConfig signingConfigs.release",
);
writeFileSync(buildFile, source);

console.log("Configured generated Android project for release signing");
