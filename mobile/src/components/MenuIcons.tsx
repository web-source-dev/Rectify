import React from 'react';
import { StyleSheet, View } from 'react-native';

export function YouTubeIcon() {
  return (
    <View style={styles.youtube}>
      <View style={styles.play} />
    </View>
  );
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

export function DiscordIcon() {
  return (
    <View style={styles.discord}>
      <View style={styles.eyes}>
        <View style={styles.eye} />
        <View style={styles.eye} />
      </View>
      <View style={styles.smile} />
    </View>
  );
}

const styles = StyleSheet.create({
  youtube: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ff0000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 0,
    height: 0,
    marginLeft: 3,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#fff',
  },
  piano: {
    width: 36,
    height: 36,
    borderRadius: 8,
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
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  roof: {
    width: 0,
    height: 0,
    borderLeftWidth: 16,
    borderRightWidth: 16,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#f5f7fa',
  },
  walls: {
    width: 22,
    height: 14,
    backgroundColor: '#f5f7fa',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  door: {
    width: 7,
    height: 8,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: '#121826',
  },
  discord: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#5865f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyes: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 3,
  },
  eye: {
    width: 5,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  smile: {
    width: 16,
    height: 8,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: '#fff',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
});
