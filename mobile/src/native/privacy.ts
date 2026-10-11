import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

type PrivacyNative = {
  hideCover?: () => void;
};

const Native = NativeModules.PrivacyModule as PrivacyNative | undefined;

export function hidePrivacyCover() {
  Native?.hideCover?.();
}

export function subscribeUserLeft(listener: () => void) {
  if (Platform.OS !== 'android') {
    return { remove() {} };
  }
  const sub = DeviceEventEmitter.addListener('userLeftApp', listener);
  return {
    remove() {
      sub.remove();
    },
  };
}
