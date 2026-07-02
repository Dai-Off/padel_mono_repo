import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  dominantHand: 'left' | 'right' | null;
  preferredSide: 'right' | 'left' | 'both';
  preferredPlayStyle: 'competitive' | 'social' | 'learning' | 'balanced';
}

const HAND: Record<string, string> = { left: 'Izquierda', right: 'Derecha' };
const SIDE: Record<string, string> = { right: 'Derecha', left: 'Izquierda', both: 'Ambos lados' };
const STYLE: Record<string, string> = {
  competitive: 'Competitivo',
  social: 'Social',
  learning: 'Aprendizaje',
  balanced: 'Equilibrado',
};

/** Card con las preferencias clave del jugador (mano, posición, tipo de partido). */
export const PlayerPreferencesCard: React.FC<Props> = ({ dominantHand, preferredSide, preferredPlayStyle }) => {
  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }[] = [
    { icon: 'hand-left-outline', label: 'Mano preferida', value: dominantHand ? HAND[dominantHand] : 'Sin definir' },
    { icon: 'navigate-outline', label: 'Posición en pista', value: SIDE[preferredSide] ?? 'Ambos lados' },
    { icon: 'game-controller-outline', label: 'Tipo de partido', value: STYLE[preferredPlayStyle] ?? 'Equilibrado' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="options-outline" size={16} color="#F18F34" />
          <Text style={styles.title}>Preferencias de jugador</Text>
        </View>
        {rows.map((r, i) => (
          <View key={r.label} style={[styles.row, i > 0 && styles.rowBorder]}>
            <View style={styles.iconBox}>
              <Ionicons name={r.icon} size={16} color="#9CA3AF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{r.label}</Text>
              <Text style={styles.value}>{r.value}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginTop: 16 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  label: { fontSize: 11, color: '#6B7280' },
  value: { fontSize: 14, fontWeight: '600', color: '#fff', marginTop: 1 },
});
