import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';

type BackHeaderProps = {
  title: string;
  onBack: () => void;
  rightSlot?: ReactNode;
  /** Fondo oscuro (p. ej. pantalla Partidos con layout negro). */
  tone?: 'light' | 'dark';
};

/** Header reutilizable con botón atrás, título centrado y slot derecho opcional. */
export function BackHeader({
  title,
  onBack,
  rightSlot,
  tone = 'light',
}: BackHeaderProps) {
  const dark = tone === 'dark';
  return (
    <View style={[styles.container, dark && styles.containerDark]}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [
          styles.backButton,
          dark && styles.backButtonDark,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Volver"
      >
        <Ionicons name="arrow-back" size={20} color={dark ? '#fff' : '#1A1A1A'} />
      </Pressable>
      <Text style={[styles.title, dark && styles.titleDark]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.rightSlot}>
        {rightSlot ?? <View style={styles.placeholder} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    ...theme.headerPadding,
    backgroundColor: '#fff',
  },
  containerDark: {
    backgroundColor: '#000000',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pressed: {
    opacity: 0.8,
  },
  title: {
    flex: 1,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  titleDark: {
    color: '#ffffff',
  },
  rightSlot: {
    width: 40,
    alignItems: 'flex-end',
  },
  placeholder: {
    width: 40,
    height: 40,
  },
});
