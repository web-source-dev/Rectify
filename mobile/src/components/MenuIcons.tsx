import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const youtube = require('../assets/icons/youtube.png');
const chatgpt = require('../assets/icons/chatgpt.png');
const discord = require('../assets/icons/discord.png');
const google = require('../assets/icons/google.png');

export function SearchIcon({ tile = false }: { tile?: boolean }) {
  return (
    <View style={tile ? styles.searchTile : styles.searchPlain}>
      <View style={styles.searchMark}>
        <View style={styles.searchRing} />
        <View style={styles.searchHandle} />
      </View>
    </View>
  );
}

function BrandIcon({ source, tile }: { source: number; tile: string }) {
  return (
    <View style={[styles.brandTile, { backgroundColor: tile }]}>
      <Image source={source} style={styles.brand} resizeMode="contain" />
    </View>
  );
}

export function YouTubeIcon() {
  return <BrandIcon source={youtube} tile="#ff0000" />;
}

export function ChatGptIcon() {
  return <BrandIcon source={chatgpt} tile="#10a37f" />;
}

export function DiscordIcon() {
  return <BrandIcon source={discord} tile="#5865f2" />;
}

export function GoogleIcon() {
  return <BrandIcon source={google} tile="#ffffff" />;
}

export function PianoIcon() {
  return (
    <View style={styles.piano}>
      {Array.from({ length: 7 }, (_, index) => (
        <View key={index} style={styles.whiteKey} />
      ))}
      <View style={styles.blackKeys} pointerEvents="none">
        {[4, 9, 19, 24, 29].map(left => (
          <View key={left} style={[styles.blackKey, { left }]} />
        ))}
      </View>
    </View>
  );
}

export function HouseIcon() {
  return (
    <View style={styles.house}>
      <View style={styles.roof} />
      <View style={styles.walls}>
        <View style={styles.door} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPlain: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchMark: { width: 16, height: 16 },
  searchRing: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#fff',
  },
  searchHandle: {
    position: 'absolute',
    width: 7,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#fff',
    right: 0,
    bottom: 1,
    transform: [{ rotate: '45deg' }],
  },
  brandTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    width: 36,
    height: 36,
  },
  piano: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0b1220',
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d7dde8',
  },
  whiteKey: {
    flex: 1,
    backgroundColor: '#f5f7fa',
    borderRightWidth: 1,
    borderRightColor: '#9aa3b2',
  },
  blackKeys: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  blackKey: {
    position: 'absolute',
    top: 0,
    width: 3,
    height: 18,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
    backgroundColor: '#121826',
  },
  house: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1c2534',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
  },
  roof: {
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#f5f7fa',
  },
  walls: {
    width: 20,
    height: 12,
    backgroundColor: '#f5f7fa',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  door: {
    width: 6,
    height: 7,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: '#121826',
  },
});
