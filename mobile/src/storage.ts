import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthSession } from './types';

// AsyncStorage is not encrypted at rest. For a 2-3 person private family app
// this is an acceptable tradeoff for simplicity; if you want the JWT stored
// in the Android Keystore instead, swap this module for react-native-keychain.
const SESSION_KEY = 'familychat.session';

export async function saveSession(session: AuthSession): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<AuthSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}
