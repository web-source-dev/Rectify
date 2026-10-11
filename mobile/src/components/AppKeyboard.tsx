import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const LETTERS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const NUMBERS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['-', '/', ':', ';', '(', ')', '&', '@', '"'],
  ['.', ',', '?', '!', "'", '+', '='],
];

type Props = {
  onInsert: (text: string) => void;
  onBackspace: () => void;
  onHide: () => void;
  bottomInset: number;
};

function KeyButton({
  label,
  onPress,
  onPressIn,
  onPressOut,
  flex = 1,
  filled = false,
  on = false,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  flex?: number;
  filled?: boolean;
  on?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      style={[styles.key, { flex }, filled && styles.keyFilled, on && styles.keyOn]}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityLabel={accessibilityLabel || label}
    >
      <Text style={styles.keyText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AppKeyboard({ onInsert, onBackspace, onHide, bottomInset }: Props) {
  const [shifted, setShifted] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const rows = numbers ? NUMBERS : LETTERS;

  useEffect(() => {
    return () => {
      if (repeat.current) {
        clearInterval(repeat.current);
      }
    };
  }, []);

  const typeKey = (key: string) => {
    onInsert(!numbers && shifted ? key.toUpperCase() : key);
  };

  const startBackspace = () => {
    onBackspace();
    if (repeat.current) {
      clearInterval(repeat.current);
    }
    repeat.current = setInterval(onBackspace, 70);
  };

  const stopBackspace = () => {
    if (repeat.current) {
      clearInterval(repeat.current);
      repeat.current = null;
    }
  };

  return (
    <View style={[styles.board, { paddingBottom: Math.max(bottomInset, 8) }]}>
      {rows.map((row, index) => (
        <View key={numbers ? `n${index}` : `l${index}`} style={styles.row}>
          {index === 1 ? <View style={styles.sideGap} /> : null}
          {index === 2 && !numbers ? (
            <KeyButton
              label="⇧"
              flex={1.35}
              filled
              on={shifted}
              onPress={() => setShifted(value => !value)}
              accessibilityLabel={shifted ? 'Shift on' : 'Shift'}
            />
          ) : null}
          {row.map(key => (
            <KeyButton
              key={key}
              label={!numbers && shifted ? key.toUpperCase() : key}
              onPress={() => typeKey(key)}
            />
          ))}
          {index === 2 ? (
            <KeyButton
              label="⌫"
              flex={1.35}
              filled
              onPressIn={startBackspace}
              onPressOut={stopBackspace}
              accessibilityLabel="Delete"
            />
          ) : null}
          {index === 1 ? <View style={styles.sideGap} /> : null}
        </View>
      ))}
      <View style={styles.row}>
        <KeyButton
          label={numbers ? 'ABC' : '123'}
          flex={1.4}
          filled
          onPress={() => setNumbers(value => !value)}
          accessibilityLabel={numbers ? 'Letters' : 'Numbers'}
        />
        <KeyButton label="space" flex={4} onPress={() => onInsert(' ')} accessibilityLabel="Space" />
        <KeyButton label="Hide" flex={1.4} filled onPress={onHide} accessibilityLabel="Hide keyboard" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    backgroundColor: '#151c28',
    paddingTop: 8,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#2a3242',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sideGap: { width: 12 },
  key: {
    marginHorizontal: 2,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: '#2c3546',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  keyFilled: { backgroundColor: '#3d485c' },
  keyOn: { backgroundColor: '#3b82f6' },
  keyText: { color: '#f5f7fa', fontSize: 16, fontWeight: '600' },
});
