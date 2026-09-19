const appConfig = require('./app.json');

const base = appConfig.expo;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Expo evaluates this file during prebuild. Release CI supplies immutable build
 * identifiers so the generated native projects contain store-upgradeable
 * version numbers rather than the development defaults in app.json.
 */
module.exports = () => ({
  ...base,
  version: process.env.RELEASE_VERSION || base.version,
  android: {
    ...base.android,
    versionCode: positiveInteger(process.env.ANDROID_VERSION_CODE, base.android.versionCode || 1),
  },
  ios: {
    ...base.ios,
    buildNumber: process.env.IOS_BUILD_NUMBER || base.ios.buildNumber || '1',
  },
});
