import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

/** Skeleton alineado a `PartidoOpenCard` (thumb 112, body gap 4, badges en columna, slots). */
export function PartidoOpenCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.inner}>
        <View style={styles.row}>
          <Skeleton variant="dark" width={112} height={112} borderRadius={12} />
          <View style={styles.body}>
            <Skeleton variant="dark" width="88%" height={20} borderRadius={4} />
            <Skeleton variant="dark" width="72%" height={12} borderRadius={4} />
            <View style={styles.badgesColumn}>
              <Skeleton variant="dark" width="100%" height={19} borderRadius={6} />
              <Skeleton variant="dark" width="100%" height={19} borderRadius={6} />
            </View>
            <View style={styles.slotsRow}>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} variant="dark" width={28} height={28} borderRadius={6} />
              ))}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  inner: {
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  badgesColumn: {
    alignSelf: 'stretch',
    gap: 6,
    marginBottom: 4,
    minHeight: 54,
  },
  slotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    paddingRight: 4,
  },
});
