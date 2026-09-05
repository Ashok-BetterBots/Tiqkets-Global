const releaseVersion = process.env.RELEASE_VERSION?.replace(/^v/, "");
const androidVersionCode = process.env.ANDROID_VERSION_CODE
  ? Number.parseInt(process.env.ANDROID_VERSION_CODE, 10)
  : undefined;

if (
  releaseVersion &&
  !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(releaseVersion)
) {
  throw new Error(
    `RELEASE_VERSION must be a semantic version, received: ${releaseVersion}`,
  );
}

module.exports = ({ config }) => ({
  ...config,
  version: releaseVersion || config.version,
  ios: {
    ...config.ios,
    buildNumber: process.env.IOS_BUILD_NUMBER || config.ios?.buildNumber || "1",
  },
  android: {
    ...config.android,
    versionCode: androidVersionCode || config.android?.versionCode || 1,
  },
});
