import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatMessage, MessageMedia, RootStackParamList } from '../types';
import { API_BASE_URL } from '../config';
import { fetchMessages, mediaFileUrl, mediaThumbUrl, sendMessage, uploadImage } from '../api';
import { loadBackupEnabled, loadSession } from '../storage';
import {
  isMediaSyncAvailable,
  pickImage,
  startMediaSync,
} from '../native/MediaSync';

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

export default function ChatScreen(_props: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<PendingImage | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const session = await loadSession();
      if (!session || cancelled) {
        return;
      }
      setMyUserId(session.user.id);
      setToken(session.token);

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
    };
  }, []);

  useEffect(() => {
    if (messages.length) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  useEffect(() => {
    // The keyboard opening shrinks the list's available height without
    // changing its content size, so FlatList won't auto-scroll on its own —
    // nudge it back to the bottom whenever the keyboard shows.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    });
    return () => sub.remove();
  }, []);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || !socketRef.current) {
      return;
    }
    socketRef.current.emit('message:send', { text: trimmed });
    setText('');
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
    setText('');
    setPending({ id: `pending-${Date.now()}`, uri: picked.uri, text: caption });
    setUploading(true);
    try {
      const { id } = await uploadImage(token, picked);
      // REST persists and broadcasts to everyone, and hands back the message so
      // it shows here even if the socket is momentarily disconnected.
      const msg = await sendMessage(token, { text: caption, mediaId: id });
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
    } catch {
      setText(caption);
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


  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat</Text>
      </View>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        ListFooterComponent={pendingBubble ?? undefined}
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
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor="#8a94a6"
          multiline
        />
        <Pressable style={styles.sendButton} onPress={send} disabled={!text.trim()}>
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' },
  header: {
    paddingTop: Platform.OS === 'android' ? 36 : 54,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1c2534',
  },
  headerTitle: { color: '#f5f7fa', fontSize: 18, fontWeight: '700' },
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
    ...StyleSheet.absoluteFill,
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
