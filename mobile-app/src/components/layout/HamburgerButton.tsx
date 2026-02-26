import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type HamburgerButtonProps = {
  onPress: () => void;
  color?: string;
  size?: number;
  accessibilityLabel?: string;
};

export function HamburgerButton({
  onPress,
  color = '#fff',
  size = 24,
  accessibilityLabel = 'Abrir menú',
}: HamburgerButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name="menu" size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  pressed: { opacity: 0.8 },
});
