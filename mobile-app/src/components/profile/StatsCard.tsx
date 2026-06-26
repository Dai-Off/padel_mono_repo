import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import type { PlayerStats } from '../../api/profileStats';

interface StatsCardProps {
  stats: PlayerStats | null;
  loading?: boolean;
}

const RING_SIZE = 112;
const RING_RADIUS = 42;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

export const StatsCard: React.FC<StatsCardProps> = ({ stats, loading }) => {
  const totalMatches = stats?.totalMatches ?? 0;
  const totalWins = stats?.totalWins ?? 0;
  const recentN = stats?.recentN ?? 0;
  const recentWins = stats?.recentWins ?? 0;
  const winPct = Math.round((stats?.winRateLast8 ?? 0) * 100);
  const dash = (winPct / 100) * RING_CIRC;

  const items: { n: number; label: string; color: string }[] = [
    { n: totalMatches, label: 'Totales', color: '#fff' },
    { n: totalWins, label: 'Ganados', color: '#34D399' },
    { n: recentN, label: 'Últimos', color: '#fff' },
    { n: recentWins, label: 'Ganados', color: '#34D399' },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Estadísticas</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.grid}>
            {items.map((s, i) => (
              <View key={i} style={styles.gridItem}>
                <Text style={[styles.gridNumber, { color: s.color }]}>
                  {loading ? '–' : s.n}
                </Text>
                <Text style={styles.gridLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.ringWrap}>
            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Defs>
                <LinearGradient id="effRing" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#F18F34" />
                  <Stop offset="1" stopColor="#E95F32" />
                </LinearGradient>
              </Defs>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth={11}
                fill="none"
              />
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="url(#effRing)"
                strokeWidth={11}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${dash} ${RING_CIRC}`}
                transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              />
            </Svg>
            <View style={styles.ringCenter} pointerEvents="none">
              <Text style={styles.ringPct}>{winPct}%</Text>
              <Text style={styles.ringCaption}>Eficacia{'\n'}Últimos {recentN || 8}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#1C1C1C',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '50%',
    marginBottom: 14,
  },
  gridNumber: {
    fontSize: 28,
    fontWeight: '900',
  },
  gridLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPct: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
  },
  ringCaption: {
    fontSize: 9,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 11,
    marginTop: 2,
  },
});
