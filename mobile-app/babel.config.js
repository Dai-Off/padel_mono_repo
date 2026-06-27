module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // reanimated v4 usa el plugin de worklets; DEBE ser el último de la lista.
    plugins: ['react-native-worklets/plugin'],
  };
};
