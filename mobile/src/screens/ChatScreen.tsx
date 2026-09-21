import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
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
import type { ChatMessage, RootStackParamList } from '../types';
import { API_BASE_URL } from '../config';
import { fetchMessages } from '../api';
import { loadSession } from '../storage';
import {
  getMediaSyncStatus,
  isMediaSyncAvailable,
  startMediaSync,
  type MediaSyncStatus,
} from '../native/MediaSync';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

async function requestMediaPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  const sdkInt = Number(Platform.Version);

  const permissions: string[] = [];
  if (sdkInt >= 33) {
    permissions.push(
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
    );
  } else {
    permissions.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
  }

  const results = await PermissionsAndroid.requestMultiple(permissions as never[]);
  return Object.values(results).every(
    r => r === PermissionsAndroid.RESULTS.GRANTED,
  );
}

export default function ChatScreen(_props: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<MediaSyncStatus | null>(null);
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

      const granted = await requestMediaPermissions();
      if (granted && isMediaSyncAvailable()) {
        await startMediaSync(API_BASE_URL, session.token);
      }
      if (isMediaSyncAvailable()) {
        setSyncStatus(await getMediaSyncStatus());
      }
    })();

    const statusInterval = setInterval(async () => {
      if (isMediaSyncAvailable()) {
        setSyncStatus(await getMediaSyncStatus());
      }
    }, 5000);

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      clearInterval(statusInterval);
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

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const mine = item.userId === myUserId;
      return (
        <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
          <View style={[styles.bubble, mine && styles.bubbleMine]}>
            {!mine && <Text style={styles.senderName}>{item.name}</Text>}
            <Text style={styles.messageText}>{item.text}</Text>
          </View>
        </View>
      );
    },
    [myUserId],
  );

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
      />
      <View style={styles.inputRow}>
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
  headerSubtitle: { color: '#8a94a6', fontSize: 12, marginTop: 2 },
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
  sendButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonText: { color: '#fff', fontWeight: '600' },
});
