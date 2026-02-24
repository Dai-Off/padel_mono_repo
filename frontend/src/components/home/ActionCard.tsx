import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ActionCardVariant = 'cyan' | 'blue' | 'green';

const VARIANT = {
  cyan: {
    border: 'rgba(6, 182, 212, 0.3)',
    icon: '#22d3ee',
  },
  blue: {
    border: 'rgba(59, 130, 246, 0.3)',
    icon: '#60a5fa',
  },
  green: {
    border: 'rgba(34, 197, 94, 0.3)',
    icon: '#4ade80',
  },
};

type ActionCardProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  xpBonus: string;
  variant?: ActionCardVariant;
  onPress?: () => void;
};

export function ActionCard({
  icon,
  label,
  xpBonus,
  variant = 'cyan',
  onPress,
}: ActionCardProps) {
  const v = VARIANT[variant];
  return (
    <Pressable
      style={({ pressed }) => [styles.card, { borderColor: v.border }, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.deco} />
      <View style={styles.header}>
        <Ionicons name={icon} size={32} color={v.icon} />
        <View style={[styles.xpBadge, { borderColor: v.border }]}>
          <Text style={[styles.xpText, { color: v.icon }]}>{xpBonus}</Text>
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 128,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    backgroundColor: '#27272a',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  pressed: { opacity: 0.9 },
  deco: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 96,
    height: 96,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  xpBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
  },
  xpText: {
    fontSize: 11,
    fontWeight: '900',
  },
  label: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
