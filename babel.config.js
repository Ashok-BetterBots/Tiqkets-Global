module.exports = function (api) {
  api.cache(true);
  const isProduction = process.env.NODE_ENV === "production" || process.env.BABEL_ENV === "production";
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@": "./client",
            "@shared": "./shared",
          },
          extensions: [".ios.js", ".android.js", ".js", ".ts", ".tsx", ".json"],
        },
      ],
      "react-native-reanimated/plugin",
      // Strip console.log/debug/info in production builds to reduce output and
      // prevent accidental data leakage. console.warn and console.error are kept
      // so runtime errors are still surfaced.
      ...(isProduction
        ? [["transform-remove-console", { exclude: ["error", "warn"] }]]
        : []),
    ],
  };
};
