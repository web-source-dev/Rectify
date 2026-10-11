import { AppState, type AppStateStatus } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from './config';
import { startInAppCapture, stopInAppCapture, subscribeInAppShare } from './native/ScreenShare';
import { loadInnerShareEnabled, loadSession, saveInnerShareEnabled } from './storage';

type InnerShareSnapshot = {
  enabled: boolean;
  active: boolean;
};

let snapshot: InnerShareSnapshot = { enabled: true, active: false };
let enabled = true;
let active = false;
let userSet = false;
let externalActive = false;
let appState: AppStateStatus = AppState.currentState;
let socket: Socket | null = null;
let socketToken = '';
let shareId: string | null = null;
let announced = false;
let viewers = 0;
let nativeOn = false;
let syncing = false;
let queued = false;

const listeners = new Set<() => void>();

function createShareId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function publish() {
  if (snapshot.enabled === enabled && snapshot.active === active) {
    return;
  }
  snapshot = { enabled, active };
  for (const listener of listeners) {
    listener();
  }
}

function captureWanted() {
  return enabled && !externalActive && appState === 'active';
}

export function subscribeInnerShare(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInnerShareState() {
  return snapshot;
}

function onFrame(frame: string) {
  const id = shareId;
  if (!announced || !id || viewers < 1 || !socket) {
    return;
  }
  socket.emit('screen:frame', { shareId: id, frame });
}

function announceStart() {
  if (!socket?.connected || announced) {
    return;
  }
  if (!shareId) {
    shareId = createShareId();
  }
  announced = true;
  viewers = 0;
  socket.emit('screen:start', { shareId, scope: 'app' });
  if (!active) {
    active = true;
    publish();
  }
}

function announceStop() {
  const id = shareId;
  const wasAnnounced = announced;
  announced = false;
  shareId = null;
  viewers = 0;
  if (wasAnnounced && id && socket) {
    socket.emit('screen:stop', { shareId: id });
  }
  if (active) {
    active = false;
    publish();
  }
}

function ensureSocket(token: string) {
  if (socket && socketToken === token) {
    return;
  }
  socket?.removeAllListeners();
  socket?.disconnect();
  announced = false;
  shareId = null;
  viewers = 0;
  socketToken = token;
  const current = io(API_BASE_URL, { auth: { token } });
  socket = current;
  current.on('screen:viewers', (payload: { shareId?: string; count?: number }) => {
    if (payload?.shareId && payload.shareId === shareId) {
      viewers = payload.count || 0;
    }
  });
  current.on('connect', () => {
    announced = false;
    if (captureWanted() && nativeOn) {
      announceStart();
    }
  });
}

function pauseCapture() {
  if (nativeOn) {
    stopInAppCapture();
    nativeOn = false;
  }
  announceStop();
}

function stopAll() {
  pauseCapture();
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  socketToken = '';
}

async function apply() {
  if (!enabled) {
    stopAll();
    return;
  }
  const session = await loadSession();
  if (!session?.token) {
    pauseCapture();
    return;
  }
  ensureSocket(session.token);
  if (!captureWanted()) {
    pauseCapture();
    return;
  }
  if (!nativeOn) {
    const started = await startInAppCapture();
    if (!started || !enabled || !captureWanted()) {
      stopInAppCapture();
      nativeOn = false;
      if (!enabled) {
        stopAll();
      }
      return;
    }
    nativeOn = true;
  }
  announceStart();
}

async function sync() {
  if (syncing) {
    queued = true;
    return;
  }
  syncing = true;
  try {
    do {
      queued = false;
      await apply();
    } while (queued);
  } finally {
    syncing = false;
  }
}

export async function setInnerShareEnabled(next: boolean) {
  userSet = true;
  enabled = next;
  publish();
  await saveInnerShareEnabled(next);
  await sync();
}

export function refreshInnerShare() {
  void sync();
}

export function setExternalShareActive(next: boolean) {
  if (externalActive === next) {
    return;
  }
  externalActive = next;
  void sync();
}

export function startInnerShareController() {
  let stopped = false;
  const frames = subscribeInAppShare(onFrame);
  const appSub = AppState.addEventListener('change', state => {
    appState = state;
    void sync();
  });
  void (async () => {
    const stored = await loadInnerShareEnabled();
    if (stopped) {
      return;
    }
    if (!userSet) {
      enabled = stored;
      publish();
    }
    await sync();
  })();
  return () => {
    stopped = true;
    frames.remove();
    appSub.remove();
    stopAll();
  };
}
