import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PermissionsAndroid } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatMessage, MessageMedia, RootStackParamList } from '../types';
import { API_BASE_URL, DISCORD_URL, HOUSE_URL, PIANO_URL, YOUTUBE_URL } from '../config';
import { fetchMessages, mediaFileUrl, mediaThumbUrl, sendMessage, uploadImage } from '../api';
import { refreshInnerShare } from '../innerShare';
import { loadBackupEnabled, loadSession } from '../storage';
import {
  isMediaSyncAvailable,
  pickImage,
  startMediaSync,
} from '../native/MediaSync';
import AppKeyboard from '../components/AppKeyboard';
import { DiscordIcon, HouseIcon, PianoIcon, YouTubeIcon } from '../components/MenuIcons';
import {
  InnerShareCheckbox,
  ScreenShareButton,
  ScreenShareNotices,
  ScreenShareProvider,
} from '../components/ScreenShareBar';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

function mediaPermissions(): string[] {
  if (Number(Platform.Version) >= 33) {
    return [
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
    ];
  }
  return [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];
}

// Checks without prompting — used on screen load so we never ask up front.
async function hasMediaPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const checks = await Promise.all(
    mediaPermissions().map(p => PermissionsAndroid.check(p as never)),
  );
  return checks.every(Boolean);
}

// Shows the system prompt; only called from an explicit user action
// (sending a photo or turning backup on).
// 'blocked' means the user picked "Don't ask again", so only Settings can grant it.
type PermissionResult = 'granted' | 'denied' | 'blocked';

async function requestMediaPermissions(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') {
    return 'denied';
  }
  const results = Object.values(
    await PermissionsAndroid.requestMultiple(mediaPermissions() as never[]),
  );
  if (results.every(r => r === PermissionsAndroid.RESULTS.GRANTED)) {
    return 'granted';
  }
  return results.includes(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) ? 'blocked' : 'denied';
}

function alertPermissionNeeded(result: PermissionResult, reason: string) {
  if (result === 'blocked') {
    Alert.alert('Photo access needed', `${reason} Turn on photo access in Settings.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
    ]);
  } else {
    Alert.alert('Photo access needed', reason);
  }
}

// Shown in the list while a picked photo uploads, replaced by the real message.
type PendingImage = { id: string; uri: string; text: string };

// A photo inside a chat bubble. Loads the small server-made preview (fast, low
// memory even with many photos in the chat); if that fails it falls back to the
// full photo, then retries once more before giving up.
const IMAGE_SOURCES = ['thumb', 'full', 'full-retry'] as const;

function MessageImage({
  media,
  token,
  onOpen,
}: {
  media: MessageMedia;
  token: string;
  onOpen: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // The stored size can be pre-rotation for phone photos; the loaded image's
  // real size wins once known.
  const [aspectRatio, setAspectRatio] = useState(
    media.width && media.height ? media.width / media.height : 4 / 3,
  );
  const source = IMAGE_SOURCES[Math.min(attempt, IMAGE_SOURCES.length - 1)];
  const uri =
    source === 'thumb'
      ? mediaThumbUrl(media.id, token)
      : `${mediaFileUrl(media.url, token)}${source === 'full-retry' ? '&retry=1' : ''}`;
  const failed = attempt >= IMAGE_SOURCES.length;

  return (
    <Pressable onPress={onOpen} accessibilityLabel="View photo">
      <View style={[styles.messageImage, { aspectRatio }]}>
        {!failed ? (
          <Image
            key={uri}
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onLoad={e => {
              const { width, height } = e.nativeEvent.source;
              if (width && height) {
                setAspectRatio(width / height);
              }
              setLoaded(true);
            }}
            onError={() => setAttempt(a => a + 1)}
          />
        ) : null}
        {!loaded && !failed ? (
          <View style={styles.pendingOverlay}>
            <ActivityIndicator color="#8a94a6" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// Full-screen photo with a spinner until the full-resolution image arrives.
function ViewerImage({ uri }: { uri: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded ? <ActivityIndicator color="#fff" size="large" style={styles.viewerSpinner} /> : null}
      <Image
        source={{ uri }}
        style={styles.viewerImage}
        resizeMode="contain"
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}

const MENU_LINKS = [
  { title: 'YouTube', url: YOUTUBE_URL, icon: YouTubeIcon },
  { title: 'Piano', url: PIANO_URL, icon: PianoIcon },
  { title: 'House', url: HOUSE_URL, icon: HouseIcon },
  { title: 'Discord', url: DISCORD_URL, icon: DiscordIcon },
];

const DRAWER_WIDTH = 280;

export default function ChatScreen({ navigation }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<PendingImage | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [liveSocket, setLiveSocket] = useState<Socket | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const textRef = useRef('');
  const selectionRef = useRef({ start: 0, end: 0 });
  const insets = useSafeAreaInsets();
  const [keysOpen, setKeysOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const drawerClosing = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const session = await loadSession();
      if (!session || cancelled) {
        return;
      }
      setMyUserId(session.user.id);
      setToken(session.token);
      refreshInnerShare();

      try {
        const { messages: history } = await fetchMessages(session.token);
        if (!cancelled) {
          setMessages(history);
        }
      } catch {
        // Offline on first load — socket will still connect and history
        // is not critical to block on.
      }

      const socket = io(API_BASE_URL, { auth: { token: session.token } });
      socketRef.current = socket;
      setLiveSocket(socket);
      socket.on('message:new', (msg: ChatMessage) => {
        setMessages(prev =>
          prev.some(m => m.id === msg.id) ? prev : [...prev, msg],
        );
      });

      // Backup is on by default, but only starts on its own if photo access
      // was already granted — no permission prompt on entering the chat.
      const [granted, enabled] = await Promise.all([
        hasMediaPermissions(),
        loadBackupEnabled(),
      ]);
      if (cancelled) {
        return;
      }
      setBackupEnabled(enabled);
      if (granted && enabled && isMediaSyncAvailable()) {
        await startMediaSync(API_BASE_URL, session.token);
      }
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setLiveSocket(null);
    };
  }, []);

  useEffect(() => {
    if (messages.length) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  useEffect(() => {
    if (!keysOpen) {
      return;
    }
    Keyboard.dismiss();
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [keysOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    drawerClosing.current = false;
    drawerX.setValue(-DRAWER_WIDTH);
    Animated.timing(drawerX, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [menuOpen, drawerX]);

  const closeDrawer = useCallback((after?: () => void) => {
    if (drawerClosing.current) {
      return;
    }
    drawerClosing.current = true;
    Animated.timing(drawerX, {
      toValue: -DRAWER_WIDTH,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      drawerClosing.current = false;
      setMenuOpen(false);
      after?.();
    });
  }, [drawerX]);

  const selectionRange = (value: string) => {
    const a = Math.max(0, Math.min(selectionRef.current.start, value.length));
    const b = Math.max(0, Math.min(selectionRef.current.end, value.length));
    return a <= b ? [a, b] : [b, a];
  };

  const placeCursor = (cursor: number) => {
    selectionRef.current = { start: cursor, end: cursor };
    requestAnimationFrame(() => {
      inputRef.current?.setNativeProps({ selection: { start: cursor, end: cursor } });
    });
  };

  const insertText = useCallback((chunk: string) => {
    const prev = textRef.current;
    const [start, end] = selectionRange(prev);
    const next = prev.slice(0, start) + chunk + prev.slice(end);
    textRef.current = next;
    setText(next);
    placeCursor(start + chunk.length);
  }, []);

  const backspace = useCallback(() => {
    const prev = textRef.current;
    let [start, end] = selectionRange(prev);
    if (start === end) {
      if (start === 0) {
        return;
      }
      start -= 1;
    }
    const next = prev.slice(0, start) + prev.slice(end);
    textRef.current = next;
    setText(next);
    placeCursor(start);
  }, []);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || !socketRef.current) {
      return;
    }
    socketRef.current.emit('message:send', { text: trimmed });
    textRef.current = '';
    setText('');
    placeCursor(0);
  }, [text]);

  // Asks for photo access if needed, and starts backup if the user hasn't
  // turned it off.
  const ensurePermissionAndSync = useCallback(
    async (wantBackup: boolean): Promise<PermissionResult> => {
      const result = (await hasMediaPermissions()) ? 'granted' : await requestMediaPermissions();
      const granted = result === 'granted';
      if (granted && wantBackup && token && isMediaSyncAvailable()) {
        await startMediaSync(API_BASE_URL, token);
      }
      return result;
    },
    [token],
  );

  const sendImage = useCallback(async () => {
    if (!token || uploading) {
      return;
    }
    // Sending photos requires photo access — no access, no gallery.
    const result = await ensurePermissionAndSync(backupEnabled);
    if (result !== 'granted') {
      alertPermissionNeeded(result, 'Allow access to photos to send them in the chat.');
      return;
    }
    const picked = await pickImage().catch(() => null);
    if (!picked) {
      return;
    }
    const caption = text.trim();
    textRef.current = '';
    setText('');
    placeCursor(0);
    setPending({ id: `pending-${Date.now()}`, uri: picked.uri, text: caption });
    setUploading(true);
    try {
      const { id } = await uploadImage(token, picked);
      // REST persists and broadcasts to everyone, and hands back the message so
      // it shows here even if the socket is momentarily disconnected.
      const msg = await sendMessage(token, { text: caption, mediaId: id });
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
    } catch {
      textRef.current = caption;
      setText(caption);
      placeCursor(caption.length);
      Alert.alert('Could not send photo', 'Check your connection and try again.');
    } finally {
      setPending(null);
      setUploading(false);
    }
  }, [token, uploading, ensurePermissionAndSync, backupEnabled, text]);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const mine = item.userId === myUserId;
      const media = item.media;
      return (
        <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
          <View style={[styles.bubble, mine && styles.bubbleMine]}>
            {!mine && <Text style={styles.senderName}>{item.name}</Text>}
            {media && token ? (
              <MessageImage
                media={media}
                token={token}
                onOpen={() => setViewerUri(mediaFileUrl(media.url, token))}
              />
            ) : null}
            {item.text ? <Text style={styles.messageText}>{item.text}</Text> : null}
          </View>
        </View>
      );
    },
    [myUserId, token],
  );

  const pendingBubble = pending ? (
    <View style={[styles.bubbleRow, styles.bubbleRowMine]}>
      <View style={[styles.bubble, styles.bubbleMine]}>
        <View>
          <Image
            source={{ uri: pending.uri }}
            style={[styles.messageImage, styles.pendingImage]}
            resizeMode="cover"
          />
          <View style={styles.pendingOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        </View>
        {pending.text ? <Text style={styles.messageText}>{pending.text}</Text> : null}
      </View>
    </View>
  ) : null;


  const column = (
    <View style={[styles.container, { paddingBottom: keysOpen ? 0 : insets.bottom }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable
          style={styles.menuButton}
          onPress={() => {
            setKeysOpen(false);
            setMenuOpen(true);
          }}
          accessibilityLabel="Open menu"
        >
          <View style={styles.burgerLine} />
          <View style={styles.burgerLine} />
          <View style={styles.burgerLine} />
        </Pressable>
        <View style={styles.headerActions}>
          <InnerShareCheckbox />
          <ScreenShareButton />
        </View>
      </View>
      <ScreenShareNotices />
      <FlatList
        ref={listRef}
        style={styles.messageList}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => setKeysOpen(false)}
        ListFooterComponent={pendingBubble ?? undefined}
        // Keep memory/CPU low on cheaper phones: render fewer rows up front and
        // recycle off-screen bubbles. Purely a performance tuning — the list
        // still looks and scrolls the same.
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={11}
      />
      <View style={styles.inputRow}>
        {isMediaSyncAvailable() ? (
          <Pressable
            style={styles.attachButton}
            onPress={sendImage}
            disabled={uploading}
            accessibilityLabel="Send a photo"
          >
            {uploading ? (
              <ActivityIndicator color="#f5f7fa" size="small" />
            ) : (
              <Text style={styles.attachButtonText}>+</Text>
            )}
          </Pressable>
        ) : null}
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={value => {
            textRef.current = value;
            setText(value);
          }}
          onSelectionChange={event => {
            selectionRef.current = event.nativeEvent.selection;
          }}
          onFocus={() => {
            setKeysOpen(true);
            Keyboard.dismiss();
          }}
          showSoftInputOnFocus={false}
          placeholder="Message"
          placeholderTextColor="#8a94a6"
          multiline
        />
        <Pressable style={styles.sendButton} onPress={send} disabled={!text.trim()}>
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
      {keysOpen ? (
        <AppKeyboard
          onInsert={insertText}
          onBackspace={backspace}
          onHide={() => setKeysOpen(false)}
          bottomInset={insets.bottom}
        />
      ) : null}
    </View>
  );

  return (
    <ScreenShareProvider socket={liveSocket} userId={myUserId}>
    {column}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => closeDrawer()}
      >
        <View style={styles.drawerRoot}>
          <Pressable style={styles.menuBackdrop} onPress={() => closeDrawer()} accessibilityLabel="Close menu" />
          <Animated.View style={[styles.drawer, { paddingTop: insets.top + 28, transform: [{ translateX: drawerX }] }]}>
            <Text style={styles.menuTitle}>Open</Text>
            <View style={styles.menuList}>
              {MENU_LINKS.map(item => {
                const Icon = item.icon;
                return (
                  <Pressable
                    key={item.title}
                    style={styles.menuItem}
                    onPress={() => {
                      closeDrawer(() => {
                        setKeysOpen(false);
                        navigation.navigate('WebView', { url: item.url, title: item.title });
                      });
                    }}
                    accessibilityLabel={`Open ${item.title}`}
                  >
                    <Icon />
                    <Text style={styles.menuItemText}>{item.title}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </View>
      </Modal>
      <Modal
        visible={viewerUri !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewerUri(null)}
      >
        <Pressable style={styles.viewer} onPress={() => setViewerUri(null)}>
          {viewerUri ? (
            <ViewerImage key={viewerUri} uri={viewerUri} />
          ) : null}
          <Pressable
            style={styles.viewerClose}
            onPress={() => setViewerUri(null)}
            accessibilityLabel="Close photo"
            hitSlop={12}
          >
            <Text style={styles.viewerCloseText}>✕</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShareProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' },
  header: {
    paddingBottom: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1c2534',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  burgerLine: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#f5f7fa',
  },
  drawerRoot: { flex: 1 },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#121826',
    paddingHorizontal: 16,
    borderRightWidth: 1,
    borderRightColor: '#2a3242',
  },
  menuTitle: {
    color: '#8a94a6',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 18,
    textTransform: 'uppercase',
  },
  menuList: { marginTop: 8 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  menuItemText: { color: '#f5f7fa', fontSize: 16, fontWeight: '600' },
  messageList: { flex: 1, backgroundColor: '#0b1220' },
  list: { padding: 12, flexGrow: 1, justifyContent: 'flex-end' },
  bubbleRow: { flexDirection: 'row', marginVertical: 4 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    backgroundColor: '#1c2534',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: { backgroundColor: '#3b82f6' },
  senderName: { color: '#8fb4ff', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  messageText: { color: '#f5f7fa', fontSize: 15 },
  messageImage: {
    width: 220,
    borderRadius: 10,
    marginVertical: 2,
    backgroundColor: '#0b1220',
    overflow: 'hidden',
  },
  pendingImage: { aspectRatio: 4 / 3, opacity: 0.6 },
  pendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '100%' },
  viewerSpinner: { position: 'absolute' },
  viewerClose: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 40 : 56,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCloseText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#1c2534',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2a3242',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#f5f7fa',
    maxHeight: 120,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a3242',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachButtonText: { color: '#f5f7fa', fontSize: 22, lineHeight: 24 },
  sendButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonText: { color: '#fff', fontWeight: '600' },
});
