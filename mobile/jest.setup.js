/* eslint-env jest */

// Native modules don't exist under Jest — replace them with in-memory stand-ins.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async key => (store.has(key) ? store.get(key) : null)),
      setItem: jest.fn(async (key, value) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async key => {
        store.delete(key);
      }),
    },
  };
});

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, WebView: View };
});
