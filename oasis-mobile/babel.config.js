module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Reanimated 4 ships the worklets transform — do not add react-native-worklets/plugin too.
      "react-native-reanimated/plugin",
    ],
  };
};
