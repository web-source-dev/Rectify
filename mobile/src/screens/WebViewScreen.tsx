import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { SITE_URL } from '../config';

type Props = NativeStackScreenProps<RootStackParamList, 'WebView'>;

export default function WebViewScreen(_props: Props) {
  return (
    <View style={styles.container}>
      <WebView source={{ uri: SITE_URL }} style={styles.webview} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});
