import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../ui/Skeleton';
import { CoachSkeleton } from './CoachSkeleton';

/**
 * Skeleton del contenido del perfil (cover + hero + Coach) mientras se espera
 * el perfil base + bundle de personalización. Calca las dimensiones del hero
 * real (cover 128, card solapada -40, avatar 80) para que el swap no salte.
 * El header fijo de la pantalla se mantiene real por encima.
 */
export const ProfileSkeleton: React.FC = () => {
  return (
    <View style={styles.container}>
      {/* Cover */}
      <View style={styles.cover} />

      {/* Card del hero solapada al cover */}
      <View style={styles.cardWrap}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.avatarCol}>
              <Skeleton width={80} height={80} borderRadius={20} variant="dark" />
              <Skeleton width={64} height={18} borderRadius={9} variant="dark" style={{ marginTop: 16 }} />
            </View>
            <View style={styles.infoCol}>
              <Skeleton width={140} height={18} variant="dark" />
              <Skeleton width={90} height={12} variant="dark" style={{ marginTop: 8 }} />
            </View>
          </View>

          {/* Stats: partidos / seguidores / seguidos */}
          <View style={styles.statsRow}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.statItem}>
                <Skeleton width={32} height={20} variant="dark" />
                <Skeleton width={56} height={10} variant="dark" style={{ marginTop: 6 }} />
              </View>
            ))}
          </View>

          {/* Botones editar / personalizar */}
          <View style={styles.buttonsRow}>
            <Skeleton width="48%" height={40} borderRadius={12} variant="dark" />
            <Skeleton width="48%" height={40} borderRadius={12} variant="dark" />
          </View>
        </View>
      </View>

      <CoachSkeleton />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  cover: {
    height: 128,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cardWrap: {
    paddingHorizontal: 16,
    marginTop: -40,
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
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  avatarCol: {
    marginTop: -40,
    alignItems: 'center',
  },
  infoCol: {
    flex: 1,
    paddingTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
