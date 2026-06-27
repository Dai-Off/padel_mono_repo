import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { RARITY_CONFIG, type AchievementRarity } from '../../design/rarity';

interface RarityBadgeProps {
  rarity: AchievementRarity;
  style?: ViewStyle;
}

/** Chip compacto que muestra la rareza con su color (●/◆/✦ + etiqueta). */
export const RarityBadge: React.FC<RarityBadgeProps> = ({ rarity, style }) => {
  const conf = RARITY_CONFIG[rarity];
  return (
    <View style={[styles.badge, { backgroundColor: conf.bg, borderColor: conf.border }, style]}>
      {conf.symbol ? <Text style={[styles.symbol, { color: conf.color }]}>{conf.symbol}</Text> : null}
      <Text style={[styles.label, { color: conf.color }]}>{conf.label.toUpperCase()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  symbol: {
    fontSize: 9,
    fontWeight: '900',
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
