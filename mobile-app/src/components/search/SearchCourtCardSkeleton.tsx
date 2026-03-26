import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

/** Skeleton alineado a SearchCourtCard (tema oscuro / glass). */
export function SearchCourtCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton
          width={112}
          height={112}
          borderRadius={12}
          variant="dark"
        />
        <View style={styles.body}>
          <Skeleton width="90%" height={18} borderRadius={6} variant="dark" />
          <Skeleton width="70%" height={14} borderRadius={4} variant="dark" style={styles.gapSm} />
          <View style={styles.tags}>
            <Skeleton width={56} height={22} borderRadius={6} variant="dark" />
            <Skeleton width={64} height={22} borderRadius={6} variant="dark" />
          </View>
          <View style={styles.slots}>
            <Skeleton width={48} height={28} borderRadius={8} variant="dark" />
            <Skeleton width={48} height={28} borderRadius={8} variant="dark" />
            <Skeleton width={48} height={28} borderRadius={8} variant="dark" />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 14,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  gapSm: {
    marginTop: 8,
  },
  tags: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  slots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
});
