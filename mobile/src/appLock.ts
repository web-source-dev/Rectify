import { createNavigationContainerRef } from '@react-navigation/native';
import { Keyboard } from 'react-native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let locking = false;
let returnToWebView = false;
let splashKey = 0;
let concealBrowser: () => void = () => {};
let restoreBrowser: () => void = () => {};

export function registerBrowserLock(conceal: () => void, restore: () => void) {
  concealBrowser = conceal;
  restoreBrowser = restore;
}

function showSplash(locked: boolean) {
  splashKey += 1;
  navigationRef.reset({
    index: 0,
    routes: [{ name: 'Splash', params: { locked, key: splashKey, arm: true } }],
  });
}

export function beginLock() {
  if (!navigationRef.isReady()) {
    return;
  }
  const route = navigationRef.getCurrentRoute();
  if (!route) {
    return;
  }
  const onSplash = route.name === 'Splash';
  const lockedSplash = onSplash && route.params?.locked === true;
  if (route.name === 'Pin') {
    returnToWebView = route.params?.returnTo === 'WebView';
    Keyboard.dismiss();
  } else if (!onSplash) {
    returnToWebView = route.name === 'WebView';
    Keyboard.dismiss();
    concealBrowser();
  }
  if (onSplash && !lockedSplash) {
    showSplash(false);
    return;
  }
  locking = true;
  showSplash(true);
}

export function takeLockTarget(): 'WebView' | 'Chat' {
  const target = returnToWebView ? 'WebView' : 'Chat';
  returnToWebView = false;
  locking = false;
  return target;
}

export function restoreLockedBrowser() {
  restoreBrowser();
}
