const { AndroidConfig } = require("expo/config-plugins");

const UNUSED_ANDROID_PERMISSIONS = [
  "android.permission.RECORD_AUDIO",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO",
  "android.permission.SYSTEM_ALERT_WINDOW",
];

module.exports = function withStoreCompliance(config) {
  return AndroidConfig.Permissions.withBlockedPermissions(
    config,
    UNUSED_ANDROID_PERMISSIONS,
  );
};