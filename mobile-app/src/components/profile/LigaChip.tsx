import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getLigaStyle } from '../../design/ligas';

/**
 * Chip de la liga del jugador con su color. Si no hay liga (no nivelado), muestra
 * "Sin liga" en gris. Componente contextual (NO va dentro del pack del avatar).
 */
export const LigaChip: React.FC<{ liga: string | null | undefined; style?: ViewStyle }> = ({ liga, style }) => {
  const ligaStyle = getLigaStyle(liga);
  const color = ligaStyle?.color ?? '#6B7280';
  const icon: keyof typeof Ionicons.glyphMap = ligaStyle?.icon ?? 'shield-outline';
  const text = ligaStyle ? ligaStyle.label : 'Sin liga';
  return (
    <View style={[styles.chip, { borderColor: color, backgroundColor: color + '26' }, style]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.text, { color }]}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
});
