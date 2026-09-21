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
import { verifyPin, ApiError } from '../api';
import { loadSession, saveSession } from '../storage';

type Props = NativeStackScreenProps<RootStackParamList, 'Pin'>;

export default function PinScreen({ navigation }: Props) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!pin.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const existing = await loadSession();
      const { token, user } = await verifyPin(pin.trim(), existing?.token);
      await saveSession({ token, user });
      if (user.name) {
        navigation.reset({ index: 0, routes: [{ name: 'Chat' }] });
      } else {
        navigation.replace('Name', { token, userId: user.id });
      }
    } catch (e) {
      if (e instanceof ApiError && e.message === 'invalid_pin') {
        setError('Wrong PIN — try again.');
      } else if (e instanceof ApiError && e.message === 'too_many_attempts') {
        setError('Too many attempts. Wait a few minutes and try again.');
      } else {
        setError('Could not reach the server. Check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        placeholder="PIN"
        placeholderTextColor="#8a94a6"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={12}
        autoFocus
        onSubmitEditing={submit}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, (loading || !pin.trim()) && styles.buttonDisabled]}
        onPress={submit}
        disabled={loading || !pin.trim()}
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
  title: { color: '#f5f7fa', fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#8a94a6', fontSize: 14, marginBottom: 24 },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#2a3242',
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    color: '#f5f7fa',
    textAlign: 'center',
    letterSpacing: 4,
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
