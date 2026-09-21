import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { setName as setNameApi } from '../api';
import { loadSession, saveSession } from '../storage';

type Props = NativeStackScreenProps<RootStackParamList, 'Name'>;

export default function NameScreen({ navigation, route }: Props) {
  const { token, userId } = route.params;
  const [name, setNameValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const user = await setNameApi(token, trimmed);
      const session = await loadSession();
      await saveSession({ token, user: session?.user ?? { id: userId, name: user.name } });
      navigation.reset({ index: 0, routes: [{ name: 'Chat' }] });
    } catch {
      setError('Could not save your name. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Enter Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setNameValue}
        placeholder="Anonymous"
        placeholderTextColor="#8a94a6"
        maxLength={40}
        autoFocus
        onSubmitEditing={submit}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, (loading || !name.trim()) && styles.buttonDisabled]}
        onPress={submit}
        disabled={loading || !name.trim()}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Continue</Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1220',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { color: '#f5f7fa', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: {
    color: '#8a94a6',
    fontSize: 13,
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#2a3242',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#f5f7fa',
    marginBottom: 12,
  },
  error: { color: '#ff6b6b', marginBottom: 12 },
  button: {
    width: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
