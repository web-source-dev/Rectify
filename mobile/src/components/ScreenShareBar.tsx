import React, { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Socket } from 'socket.io-client';
import { isBrowserOpen } from '../browser/BrowserHost';
import { getInnerShareState, setExternalShareActive, setInnerShareEnabled, subscribeInnerShare } from '../innerShare';
import {
  canDrawOverlay,
  isInAppShareAvailable,
  isScreenShareAvailable,
  moveAppToBackground,
  openOverlaySettings,
  setScreenShareCompact,
  startScreenCapture,
  stopScreenCapture,
  subscribeScreenShare,
} from '../native/ScreenShare';

type LiveShare = {
  shareId: string;
  userId: string;
  name: string;
  self: boolean;
  scope?: string;
};

function otherShareLabel(share: LiveShare) {
  const name = share.name || 'Someone';
  return `${name} is sharing screen`;
}

type ScreenShareApi = {
  socket: Socket | null;
  userId: string | null;
  sharing: boolean;
  busy: boolean;
  error: string;
  shares: LiveShare[];
  watching: LiveShare | null;
  startShare: () => void;
  stopShare: () => void;
  watch: (share: LiveShare) => void;
  closeWatch: () => void;
};

const ScreenShareContext = createContext<ScreenShareApi | null>(null);

function createShareId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function askInnerShare(): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    finish(true);
  });
}

function askOverlay(): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    finish(true);
  });
}

export function ScreenShareProvider({
  socket,
  userId,
  children,
}: {
  socket: Socket | null;
  userId: string | null;
  children: React.ReactNode;
}) {
  const [shares, setShares] = useState<LiveShare[]>([]);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [watching, setWatching] = useState<LiveShare | null>(null);
  const socketRef = useRef<Socket | null>(socket);
  const shareIdRef = useRef<string | null>(null);
  const sharingRef = useRef(false);
  const viewersRef = useRef(0);
  const watchingRef = useRef<LiveShare | null>(null);
  const overlayAsked = useRef(false);
  const startingRef = useRef(false);
  const startFailedRef = useRef(false);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const endLocalShare = useCallback((tellServer: boolean) => {
    const id = shareIdRef.current;
    sharingRef.current = false;
    shareIdRef.current = null;
    viewersRef.current = 0;
    setSharing(false);
    setScreenShareCompact(false);
    stopScreenCapture();
    setExternalShareActive(false);
    if (tellServer && id) {
      socketRef.current?.emit('screen:stop', { shareId: id });
    }
  }, []);

  useEffect(() => {
    const sub = subscribeScreenShare(
      frame => {
        const id = shareIdRef.current;
        if (!sharingRef.current || !id || viewersRef.current < 1) {
          return;
        }
        socketRef.current?.volatile.compress(false).emit('screen:frame', { shareId: id, frame });
      },
      () => {
        if (!sharingRef.current && !shareIdRef.current) {
          startFailedRef.current = true;
          return;
        }
        const id = shareIdRef.current;
        sharingRef.current = false;
        shareIdRef.current = null;
        viewersRef.current = 0;
        setSharing(false);
        setScreenShareCompact(false);
        setExternalShareActive(false);
        if (id) {
          socketRef.current?.emit('screen:stop', { shareId: id });
        }
      },
    );
    const appState = AppState.addEventListener('change', state => {
      if (!sharingRef.current) {
        return;
      }
      setScreenShareCompact(state !== 'active');
    });
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!sharingRef.current || isBrowserOpen()) {
        return false;
      }
      moveAppToBackground();
      return true;
    });
    return () => {
      sub.remove();
      appState.remove();
      backSub.remove();
      if (sharingRef.current || shareIdRef.current) {
        const id = shareIdRef.current;
        sharingRef.current = false;
        shareIdRef.current = null;
        setScreenShareCompact(false);
        stopScreenCapture();
        setExternalShareActive(false);
        if (id) {
          socketRef.current?.emit('screen:stop', { shareId: id });
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }
    const onList = (payload: { shares?: LiveShare[] }) => {
      const next = Array.isArray(payload?.shares) ? payload.shares : [];
      setShares(next);
      const current = watchingRef.current;
      if (current && !next.some(item => item.shareId === current.shareId && !item.self)) {
        watchingRef.current = null;
        setWatching(null);
      }
    };
    const onAvailable = (share: LiveShare) => {
      if (!share?.shareId) {
        return;
      }
      setShares(prev => [...prev.filter(item => item.shareId !== share.shareId), share]);
    };
    const onEnded = (payload: { shareId?: string }) => {
      if (!payload?.shareId) {
        return;
      }
      setShares(prev => prev.filter(item => item.shareId !== payload.shareId));
      if (watchingRef.current?.shareId === payload.shareId) {
        watchingRef.current = null;
        setWatching(null);
      }
    };
    const onViewers = (payload: { shareId?: string; count?: number }) => {
      if (payload?.shareId && payload.shareId === shareIdRef.current) {
        viewersRef.current = payload.count || 0;
      }
    };
    const onConnect = () => {
      socket.emit('screen:sync');
      const id = shareIdRef.current;
      if (sharingRef.current && id) {
        socket.emit('screen:start', { shareId: id });
      }
      const current = watchingRef.current;
      if (current) {
        socket.emit('screen:watch', { shareId: current.shareId });
      }
    };
    socket.on('screen:list', onList);
    socket.on('screen:available', onAvailable);
    socket.on('screen:ended', onEnded);
    socket.on('screen:viewers', onViewers);
    socket.on('connect', onConnect);
    if (socket.connected) {
      socket.emit('screen:sync');
    }
    return () => {
      const current = watchingRef.current;
      if (current) {
        socket.emit('screen:unwatch', { shareId: current.shareId });
      }
      socket.off('screen:list', onList);
      socket.off('screen:available', onAvailable);
      socket.off('screen:ended', onEnded);
      socket.off('screen:viewers', onViewers);
      socket.off('connect', onConnect);
    };
  }, [socket]);

  const startShare = useCallback(async () => {
    if (sharingRef.current || startingRef.current) {
      return;
    }
    startingRef.current = true;
    try {
      const current = socketRef.current;
      if (!current) {
        setError('Wait until the chat connects, then try again.');
        return;
      }
      if (!isScreenShareAvailable()) {
        Alert.alert(
          'Screen share needs an app update',
          'Install the latest build of the app, then try sharing again.',
        );
        return;
      }
      setError('');
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      const overlay = await canDrawOverlay().catch(() => false);
      if (!overlay && !overlayAsked.current) {
        overlayAsked.current = true;
        const allow = await askOverlay();
        if (allow) {
          openOverlaySettings();
          return;
        }
      }
      setBusy(true);
      setExternalShareActive(true);
      try {
        startFailedRef.current = false;
        const started = await startScreenCapture();
        if (!started || startFailedRef.current) {
          stopScreenCapture();
          setExternalShareActive(false);
          return;
        }
        const shareId = createShareId();
        shareIdRef.current = shareId;
        viewersRef.current = 0;
        sharingRef.current = true;
        setSharing(true);
        current.emit('screen:start', { shareId });
        setScreenShareCompact(AppState.currentState !== 'active');
      } catch {
        sharingRef.current = false;
        shareIdRef.current = null;
        setSharing(false);
        setExternalShareActive(false);
        setError("Couldn't start screen sharing.");
      } finally {
        setBusy(false);
      }
    } finally {
      startingRef.current = false;
    }
  }, []);

  const watch = useCallback((share: LiveShare) => {
    if (!share || share.self) {
      return;
    }
    const prev = watchingRef.current;
    if (prev && prev.shareId !== share.shareId) {
      socketRef.current?.emit('screen:unwatch', { shareId: prev.shareId });
    }
    watchingRef.current = share;
    setWatching(share);
    socketRef.current?.emit('screen:watch', { shareId: share.shareId });
  }, []);

  const closeWatch = useCallback(() => {
    const current = watchingRef.current;
    watchingRef.current = null;
    setWatching(null);
    if (current) {
      socketRef.current?.emit('screen:unwatch', { shareId: current.shareId });
    }
  }, []);

  const api: ScreenShareApi = {
    socket,
    userId,
    sharing,
    busy,
    error,
    shares,
    watching,
    startShare,
    stopShare: () => endLocalShare(true),
    watch,
    closeWatch,
  };

  return <ScreenShareContext.Provider value={api}>{children}</ScreenShareContext.Provider>;
}

function useScreenShareApi() {
  return useContext(ScreenShareContext);
}

export function InnerShareCheckbox() {
  const { enabled } = useSyncExternalStore(subscribeInnerShare, getInnerShareState, getInnerShareState);
  const onPress = useCallback(async () => {
    if (enabled) {
      await setInnerShareEnabled(false);
      return;
    }
    if (!isInAppShareAvailable()) {
      Alert.alert(
        'App sharing needs an update',
        'Install the latest build of the app, then try again.',
      );
      return;
    }
    const allow = await askInnerShare();
    if (!allow) {
      return;
    }
    await setInnerShareEnabled(true);
  }, [enabled]);

  if (Platform.OS !== 'android') {
    return null;
  }

  return (
    <Pressable
      style={styles.appToggle}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: enabled }}
      accessibilityLabel={enabled ? 'Stop sharing this app' : 'Share this app'}
    >
      <View style={[styles.appBox, enabled && styles.appBoxOn]}>
        {enabled ? <Text style={styles.appTick}>✓</Text> : null}
      </View>
      <Text style={[styles.appToggleText, enabled && styles.appToggleTextOn]}>App</Text>
    </Pressable>
  );
}

export function ScreenShareButton() {
  const api = useScreenShareApi();
  if (!api) {
    return null;
  }
  return (
    <Pressable
      style={[styles.shareButton, api.sharing && styles.shareButtonActive]}
      onPress={api.sharing ? api.stopShare : api.startShare}
      disabled={api.busy}
      accessibilityLabel={api.sharing ? 'Stop sharing your screen' : 'Share your screen'}
    >
      <Text style={[styles.shareButtonText, api.sharing && styles.shareButtonActiveText]}>
        {api.sharing ? 'Stop' : 'Share'}
      </Text>
    </Pressable>
  );
}

export function ScreenShareNotices() {
  const api = useScreenShareApi();
  if (!api) {
    return null;
  }
  const others = api.shares.filter(
    share => !share.self && share.userId !== api.userId,
  );
  return (
    <View>
      {others.map(share => (
        <View key={share.shareId} style={styles.notice} accessibilityLiveRegion="polite">
          <Text style={styles.noticeText}>{otherShareLabel(share)}</Text>
          <Pressable
            style={styles.seeChip}
            onPress={() => api.watch(share)}
            accessibilityLabel={`See ${share.name || 'the'} shared screen`}
          >
            <Text style={styles.seeChipText}>See it</Text>
          </Pressable>
        </View>
      ))}
      <ShareViewer />
    </View>
  );
}

function SteadyFrame({ frame }: { frame: string }) {
  const uri = `data:image/jpeg;base64,${frame}`;
  const [slot, setSlot] = useState<[string, string | null]>([uri, null]);
  const [shown, setShown] = useState<0 | 1>(0);
  const shownRef = useRef<0 | 1>(0);
  const slotRef = useRef(slot);
  const decoding = useRef(false);
  const pending = useRef<string | null>(null);
  slotRef.current = slot;

  useEffect(() => {
    if (uri === slotRef.current[shownRef.current]) {
      return;
    }
    const hidden = (shownRef.current === 0 ? 1 : 0) as 0 | 1;
    if (decoding.current) {
      pending.current = uri;
      return;
    }
    decoding.current = true;
    setSlot(prev => {
      const next: [string, string | null] = [prev[0], prev[1]];
      next[hidden] = uri;
      return next;
    });
  }, [uri]);

  const onReady = (index: 0 | 1) => {
    if (index === shownRef.current) {
      return;
    }
    shownRef.current = index;
    setShown(index);
    const next = pending.current;
    pending.current = null;
    const hidden = (index === 0 ? 1 : 0) as 0 | 1;
    if (next && next !== slotRef.current[index]) {
      setSlot(prev => {
        const copy: [string, string | null] = [prev[0], prev[1]];
        copy[hidden] = next;
        return copy;
      });
      return;
    }
    decoding.current = false;
  };

  return (
    <View style={styles.viewerStage}>
      {slot.map((source, index) =>
        source ? (
          <Image
            key={index}
            source={{ uri: source }}
            fadeDuration={0}
            resizeMode="contain"
            style={[styles.viewerImage, { opacity: shown === index ? 1 : 0 }]}
            onLoad={() => onReady(index as 0 | 1)}
            onError={() => {
              if (index !== shownRef.current) {
                decoding.current = false;
                pending.current = null;
              }
            }}
          />
        ) : null,
      )}
    </View>
  );
}

function ShareViewer() {
  const api = useScreenShareApi();
  const share = api?.watching ?? null;
  const socket = api?.socket ?? null;
  const shareId = share?.shareId ?? null;
  const [frame, setFrame] = useState<string | null>(null);

  useEffect(() => {
    setFrame(null);
    if (!socket || !shareId) {
      return;
    }
    const onFrame = (payload: { shareId?: string; frame?: string }) => {
      if (payload?.shareId !== shareId || !payload.frame) {
        return;
      }
      setFrame(payload.frame);
    };
    socket.on('screen:frame', onFrame);
    return () => {
      socket.off('screen:frame', onFrame);
    };
  }, [socket, shareId]);

  if (!share) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={api?.closeWatch}
    >
      <View style={styles.viewer}>
        <Text style={styles.viewerTitle}>{otherShareLabel(share)}</Text>
        {frame ? (
          <SteadyFrame frame={frame} />
        ) : (
          <Text style={styles.viewerWait}>Waiting for the shared screen…</Text>
        )}
        <Pressable
          style={styles.viewerClose}
          onPress={api?.closeWatch}
          accessibilityLabel="Close shared screen"
        >
          <Text style={styles.viewerCloseText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  appToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2a3242',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    opacity: 0,
    display: 'none',
  },
  appBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#8a94a6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appBoxOn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  appTick: { color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 14 },
  appToggleText: { color: '#f5f7fa', fontSize: 13, fontWeight: '600' },
  appToggleTextOn: { color: '#bfdbfe' },
  shareButton: {
    borderWidth: 1,
    borderColor: '#2a3242',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  shareButtonActive: { borderColor: '#ef4444' },
  shareButtonText: { color: '#f5f7fa', fontSize: 13, fontWeight: '600' },
  shareButtonActiveText: { color: '#fca5a5' },
  error: { color: '#fca5a5', fontSize: 13, paddingHorizontal: 16, paddingTop: 8 },
  notice: {
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: '#1c2534',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noticeText: { color: '#f5f7fa', fontSize: 14, flex: 1 },
  seeChip: {
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  seeChipText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  stopChip: {
    backgroundColor: '#d3372f',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stopChipText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    paddingTop: Platform.OS === 'android' ? 36 : 54,
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  viewerTitle: { color: '#f5f7fa', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  viewerStage: { flex: 1, width: '100%', backgroundColor: '#000' },
  viewerImage: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  viewerWait: { color: '#8a94a6', fontSize: 14, marginTop: 24, textAlign: 'center' },
  viewerClose: {
    alignSelf: 'center',
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a3242',
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  viewerCloseText: { color: '#f5f7fa', fontWeight: '600' },
});
