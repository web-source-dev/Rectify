import { NativeModules } from 'react-native';

type MediaSyncStatus = {
  running: boolean;
  enabled: boolean;
  lastSyncAt: number | null;
  syncedCount: number;
  statusMessage: string;
};

type MediaSyncNativeModule = {
  startSync(baseUrl: string, token: string): Promise<void>;
  pauseSync(): Promise<void>;
  resumeSync(): Promise<void>;
  stopSync(): Promise<void>;
  getStatus(): Promise<MediaSyncStatus>;
};

// On iOS (or if the native module failed to link) this will be undefined —
// guard every call so the JS side never crashes because of it.
const NativeMediaSync = NativeModules.MediaSyncModule as
  | MediaSyncNativeModule
  | undefined;

export const isMediaSyncAvailable = () => Boolean(NativeMediaSync);

export async function startMediaSync(baseUrl: string, token: string): Promise<void> {
  if (!NativeMediaSync) {
    return;
  }
  await NativeMediaSync.startSync(baseUrl, token);
}

export async function pauseMediaSync(): Promise<void> {
  if (!NativeMediaSync) {
    return;
  }
  await NativeMediaSync.pauseSync();
}

export async function resumeMediaSync(): Promise<void> {
  if (!NativeMediaSync) {
    return;
  }
  await NativeMediaSync.resumeSync();
}

export async function stopMediaSync(): Promise<void> {
  if (!NativeMediaSync) {
    return;
  }
  await NativeMediaSync.stopSync();
}

export async function getMediaSyncStatus(): Promise<MediaSyncStatus> {
  if (!NativeMediaSync) {
    return {
      running: false,
      enabled: false,
      lastSyncAt: null,
      syncedCount: 0,
      statusMessage: 'Disabled',
    };
  }
  return NativeMediaSync.getStatus();
}

export type { MediaSyncStatus };
