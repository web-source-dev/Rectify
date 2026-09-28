module.exports = {
  preset: '@react-native/jest-preset',
  // These packages ship untranspiled ES modules, so Jest must run them through Babel.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-webview|@react-native-async-storage)/)',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
};
