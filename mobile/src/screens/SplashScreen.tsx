import React, { useEffect, useRef } from 'react';
import { Animated, AppState, Easing, Pressable, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { takeLockTarget } from '../appLock';
import type { RootStackParamList } from '../types';
import { SPLASH_BACKGROUND, SPLASH_DURATION_MS, SPLASH_TEXT_COLOR } from '../config';
import { hidePrivacyCover } from '../native/privacy';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

// Tapping the loading screen this many times opens the chat PIN screen
// instead of continuing on to the browser. Everyone on the shared device
// knows the gesture — it's just kept off the browsing view.
const UNLOCK_TAP_COUNT = 4;

export default function SplashScreen({ navigation, route }: Props) {
  const tapCount = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const dotOpacity = useRef(new Animated.Value(0)).current;
  const locked = route.params?.locked === true;
  const splashKey = route.params?.key;
  const arm = route.params?.arm === true;

  useEffect(() => {
    let cancelled = false;
    let appSub: { remove(): void } | null = null;

    const openNext = () => {
      if (locked) {
        navigation.replace('Pin', { returnTo: takeLockTarget() });
        return;
      }
      navigation.replace('WebView');
    };

    const run = () => {
      if (cancelled) {
        return;
      }
      hidePrivacyCover();
      logoOpacity.setValue(0);
      logoScale.setValue(0.85);
      dotOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 550,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]).start();

      loopRef.current?.stop();
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(dotOpacity, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dotOpacity, {
            toValue: 0.3,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loopRef.current.start();

      timerRef.current = setTimeout(openNext, SPLASH_DURATION_MS);
    };

    if (AppState.currentState !== 'active') {
      appSub = AppState.addEventListener('change', state => {
        if (state === 'active') {
          appSub?.remove();
          appSub = null;
          run();
        }
      });
    } else if (arm) {
      let left = false;
      appSub = AppState.addEventListener('change', state => {
        if (state === 'background' || state === 'inactive') {
          left = true;
        }
        if (left && state === 'active') {
          appSub?.remove();
          appSub = null;
          run();
        }
      });
    } else {
      run();
    }

    return () => {
      cancelled = true;
      appSub?.remove();
      loopRef.current?.stop();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [navigation, locked, splashKey, arm, logoOpacity, logoScale, dotOpacity]);

  const handleTap = () => {
    tapCount.current += 1;
    if (tapCount.current < UNLOCK_TAP_COUNT) {
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    navigation.replace('Pin', locked ? { returnTo: takeLockTarget() } : undefined);
  };

  return (
    <Pressable style={styles.container} onPress={handleTap}>
      <Animated.Image
        source={require('../assets/logo.png')}
        style={[
          styles.logo,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
        resizeMode="contain"
      />
      <Animated.Text style={[styles.title, { opacity: logoOpacity }]}>
        Anadolu İmam Hatip Lisesi
      </Animated.Text>
      <Animated.View style={[styles.dotsRow, { opacity: dotOpacity }]}>
        <Text style={styles.label}>Yükleniyor…</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SPLASH_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    width: 128,
    height: 128,
    marginBottom: 20,
  },
  title: {
    color: SPLASH_TEXT_COLOR,
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  dotsRow: {
    marginTop: 18,
  },
  label: {
    color: SPLASH_TEXT_COLOR,
    fontSize: 14,
    opacity: 0.75,
  },
});
