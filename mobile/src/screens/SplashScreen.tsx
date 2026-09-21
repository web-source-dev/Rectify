import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { SPLASH_BACKGROUND, SPLASH_DURATION_MS, SPLASH_TEXT_COLOR } from '../config';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

// Tapping the loading screen this many times opens the chat PIN screen
// instead of continuing on to the browser. Everyone on the shared device
// knows the gesture — it's just kept off the browsing view.
const UNLOCK_TAP_COUNT = 4;

export default function SplashScreen({ navigation }: Props) {
  const tapCount = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const dotOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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

    Animated.loop(
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
    ).start();

    timerRef.current = setTimeout(() => {
      navigation.replace('WebView');
    }, SPLASH_DURATION_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [navigation, logoOpacity, logoScale, dotOpacity]);

  const handleTap = () => {
    tapCount.current += 1;
    if (tapCount.current >= UNLOCK_TAP_COUNT) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      navigation.replace('Pin');
    }
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
