import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

/**
 * Placeholder con altura ≈ la del AICoachSection cargado, para reservar el
 * espacio mientras carga el Coach IA y minimizar el "salto" del layout
 * (el resto lo afina una corrección de scroll mínima). Forma aproximada:
 * tarjeta de stats + tabs + tarjeta de análisis (radar + recomendación).
 */
export const CoachSkeleton: React.FC = () => {
  return (
    <View style={styles.container}>
      {/* Tarjeta resumen: header + 3 stats */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Skeleton width={40} height={40} borderRadius={12} variant="dark" />
          <View style={styles.headerTexts}>
            <Skeleton width={120} height={14} variant="dark" />
            <Skeleton width={160} height={10} variant="dark" style={{ marginTop: 6 }} />
          </View>
        </View>
        <View style={styles.statsRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.statBox}>
              <Skeleton width={28} height={28} borderRadius={8} variant="dark" />
              <Skeleton width={40} height={16} variant="dark" style={{ marginTop: 8 }} />
              <Skeleton width={50} height={9} variant="dark" style={{ marginTop: 6 }} />
            </View>
          ))}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Skeleton width="48%" height={36} borderRadius={10} variant="dark" />
        <Skeleton width="48%" height={36} borderRadius={10} variant="dark" />
      </View>

      {/* Tarjeta de análisis: título + radar + recomendación */}
      <View style={styles.card}>
        <Skeleton width={180} height={14} variant="dark" />
        <View style={styles.radarWrap}>
          <Skeleton width={220} height={220} borderRadius={110} variant="dark" />
        </View>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width="100%" height={10} variant="dark" style={{ marginTop: 10 }} />
        ))}
        <View style={styles.recBox}>
          <Skeleton width="60%" height={10} variant="dark" />
          <Skeleton width="100%" height={10} variant="dark" style={{ marginTop: 8 }} />
          <Skeleton width="90%" height={10} variant="dark" style={{ marginTop: 6 }} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  headerTexts: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    paddingVertical: 14,
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 16,
  },
  radarWrap: {
    alignItems: 'center',
    marginVertical: 16,
  },
  recBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
});
