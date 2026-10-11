import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { SITE_URL } from '../config';

type Props = NativeStackScreenProps<RootStackParamList, 'WebView'>;

const BROWSER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export default function WebViewScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const url = route.params?.url || SITE_URL;
  const title = route.params?.title;
  const showBack = navigation.canGoBack();
  const [barHidden, setBarHidden] = useState(false);
  const browserSite = url.includes('youtube.com') || url.includes('discord.com');

  return (
    <View style={styles.container}>
      {showBack && !barHidden ? (
        <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
          <Pressable
            style={styles.iconButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Back to chat"
          >
            <View style={styles.backChevron} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {title || 'Browser'}
          </Text>
          <Pressable
            style={styles.iconButton}
            onPress={() => setBarHidden(true)}
            accessibilityLabel="Hide header"
          >
            <Text style={styles.iconText}>▴</Text>
          </Pressable>
        </View>
      ) : null}
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        cacheEnabled
        cacheMode="LOAD_DEFAULT"
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        userAgent={browserSite ? BROWSER_AGENT : undefined}
      />
      {showBack && barHidden ? (
        <Pressable
          style={[styles.showBar, { top: insets.top + 8 }]}
          onPress={() => setBarHidden(false)}
          accessibilityLabel="Show header"
        >
          <Text style={styles.showBarText}>▾</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' },
  webview: { flex: 1 },
  bar: {
    paddingBottom: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1c2534',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0b1220',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: {
    width: 12,
    height: 12,
    marginLeft: 4,
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: '#f5f7fa',
    transform: [{ rotate: '45deg' }],
  },
  iconText: { color: '#f5f7fa', fontSize: 18, fontWeight: '700' },
  title: { color: '#f5f7fa', fontSize: 16, fontWeight: '700', flex: 1 },
  showBar: {
    position: 'absolute',
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(18,24,38,0.92)',
    borderWidth: 1,
    borderColor: '#2a3242',
    alignItems: 'center',
    justifyContent: 'center',
  },
  showBarText: { color: '#f5f7fa', fontSize: 16, fontWeight: '700' },
});
