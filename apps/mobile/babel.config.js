module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated's plugin MUST be listed last — it rewrites
    // worklets, and any plugin running after it can see already-transformed
    // (and therefore broken) worklet code.
    plugins: ['react-native-reanimated/plugin'],
  };
};
