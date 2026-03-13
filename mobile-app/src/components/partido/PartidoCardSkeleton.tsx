import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';
import { theme } from '../../theme';

/** Skeleton que imita la estructura de PartidoCard durante la carga. */
export function PartidoCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Skeleton width={120} height={12} borderRadius={4} />
        <Skeleton width={80} height={20} borderRadius={8} />
      </View>
      <View style={styles.cardMeta}>
        <Skeleton width={100} height={10} borderRadius={4} />
        <Skeleton width={80} height={10} borderRadius={4} style={{ marginLeft: 8 }} />
      </View>
      <View style={styles.playersRow}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.playerSlot}>
            <Skeleton width={44} height={44} borderRadius={12} />
            <Skeleton width={36} height={9} borderRadius={4} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>
      <View style={styles.venueRow}>
        <Skeleton width={36} height={36} borderRadius={8} />
        <View style={styles.venueBody}>
          <Skeleton width="70%" height={12} borderRadius={4} />
          <Skeleton width="50%" height={10} borderRadius={4} style={{ marginTop: 4 }} />
        </View>
        <Skeleton width={48} height={20} borderRadius={4} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: theme.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  playersRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: theme.spacing.md,
  },
  playerSlot: { alignItems: 'center' },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  venueBody: { flex: 1, minWidth: 0 },
});
