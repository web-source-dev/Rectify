import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

type ScreenShareNative = {
  start: () => Promise<boolean>;
  stop: () => void;
  startInApp: () => Promise<boolean>;
  stopInApp: () => void;
  setCompact: (enabled: boolean) => void;
  canDrawOverlay: () => Promise<boolean>;
  openOverlaySettings: () => void;
};

const Native = NativeModules.ScreenShareModule as ScreenShareNative | undefined;

export function isScreenShareAvailable() {
  return Platform.OS === 'android' && Native != null;
}

export function isInAppShareAvailable() {
  return Platform.OS === 'android' && typeof Native?.startInApp === 'function';
}

export function startInAppCapture() {
  if (!Native?.startInApp) {
    return Promise.resolve(false);
  }
  return Native.startInApp();
}

export function stopInAppCapture() {
  Native?.stopInApp?.();
}

export function startScreenCapture() {
  if (!Native) {
    return Promise.reject(new Error('unavailable'));
  }
  return Native.start();
}

export function stopScreenCapture() {
  Native?.stop();
}

export function setScreenShareCompact(enabled: boolean) {
  Native?.setCompact(enabled);
}

export function canDrawOverlay() {
  if (!Native) {
    return Promise.resolve(false);
  }
  return Native.canDrawOverlay();
}

export function openOverlaySettings() {
  Native?.openOverlaySettings();
}

export function subscribeScreenShare(
  onFrame: (frame: string) => void,
  onStopped: () => void,
) {
  if (!Native) {
    return { remove() {} };
  }
  const emitter = new NativeEventEmitter(NativeModules.ScreenShareModule);
  const frameSub = emitter.addListener('screenShareFrame', (event: { frame?: string }) => {
    if (event?.frame) {
      onFrame(event.frame);
    }
  });
  const stopSub = emitter.addListener('screenShareStopped', onStopped);
  return {
    remove() {
      frameSub.remove();
      stopSub.remove();
    },
  };
}

export function subscribeInAppShare(onFrame: (frame: string) => void) {
  if (!Native) {
    return { remove() {} };
  }
  const emitter = new NativeEventEmitter(NativeModules.ScreenShareModule);
  const frameSub = emitter.addListener('inAppShareFrame', (event: { frame?: string }) => {
    if (event?.frame) {
      onFrame(event.frame);
    }
  });
  return {
    remove() {
      frameSub.remove();
    },
  };
}
