import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

/** Skeleton de fila horizontal (imagen + columnas) como PartidoOpenCard. */
export function PartidoOpenCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton variant="dark" width={112} height={112} borderRadius={12} />
        <View style={styles.body}>
          <Skeleton variant="dark" width="85%" height={16} borderRadius={4} />
          <Skeleton
            variant="dark"
            width="70%"
            height={12}
            borderRadius={4}
            style={{ marginTop: 8 }}
          />
          <View style={styles.badges}>
            <Skeleton variant="dark" width={56} height={18} borderRadius={6} />
            <Skeleton variant="dark" width={88} height={18} borderRadius={6} />
          </View>
          <View style={styles.slots}>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="dark" width={28} height={28} borderRadius={6} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  row: { flexDirection: 'row', gap: 14 },
  body: { flex: 1, minWidth: 0, gap: 0 },
  badges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  slots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
});
