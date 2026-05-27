import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';
import { TuActividadHeader } from './TuActividadHeader';

type TuActividadListSkeletonProps = {
  title: string;
  onBack: () => void;
  rows?: number;
};

function ListCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Skeleton variant="dark" width={40} height={40} borderRadius={12} />
        <View style={styles.cardText}>
          <Skeleton variant="dark" width="70%" height={15} borderRadius={4} />
          <Skeleton variant="dark" width="50%" height={12} borderRadius={4} style={styles.gap} />
        </View>
      </View>
      <Skeleton variant="dark" width="55%" height={12} borderRadius={4} style={styles.meta} />
    </View>
  );
}

export function TuActividadListSkeleton({
  title,
  onBack,
  rows = 4,
}: TuActividadListSkeletonProps) {
  return (
    <View style={styles.container}>
      <TuActividadHeader title={title} onBack={onBack} />
      <View style={styles.list}>
        <Skeleton variant="dark" width="40%" height={13} borderRadius={4} style={styles.summary} />
        {Array.from({ length: rows }).map((_, i) => (
          <ListCardSkeleton key={i} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  summary: { marginBottom: 12, marginLeft: 4 },
  card: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardText: { flex: 1, minWidth: 0 },
  gap: { marginTop: 6 },
  meta: { marginTop: 12, marginLeft: 52 },
});
