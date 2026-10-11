import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthSession } from './types';

// AsyncStorage is not encrypted at rest. For a 2-3 person private family app
// this is an acceptable tradeoff for simplicity; if you want the JWT stored
// in the Android Keystore instead, swap this module for react-native-keychain.
const SESSION_KEY = 'familychat.session';
const BACKUP_ENABLED_KEY = 'familychat.backupEnabled';
const INNER_SHARE_KEY = 'familychat.innerShare';

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

// Backup defaults to on; it only actually runs once media permission is granted.
export async function loadBackupEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BACKUP_ENABLED_KEY)) !== 'false';
}

export async function saveBackupEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BACKUP_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function loadInnerShareEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(INNER_SHARE_KEY);
  if (stored == null) {
    await AsyncStorage.setItem(INNER_SHARE_KEY, 'true');
    return true;
  }
  return stored !== 'false';
}

export async function saveInnerShareEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(INNER_SHARE_KEY, enabled ? 'true' : 'false');
}
