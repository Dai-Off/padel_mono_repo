import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';
import { TuActividadHeader } from './TuActividadHeader';

type TuActividadMenuSkeletonProps = {
  title: string;
  onBack: () => void;
};

function MenuRowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton variant="dark" width={40} height={40} borderRadius={12} />
      <View style={styles.rowText}>
        <Skeleton variant="dark" width="45%" height={15} borderRadius={4} />
        <Skeleton variant="dark" width="65%" height={12} borderRadius={4} style={styles.subtitle} />
      </View>
      <Skeleton variant="dark" width={16} height={16} borderRadius={4} />
    </View>
  );
}

export function TuActividadMenuSkeleton({ title, onBack }: TuActividadMenuSkeletonProps) {
  return (
    <View style={styles.container}>
      <TuActividadHeader title={title} onBack={onBack} />
      <View style={styles.list}>
        {Array.from({ length: 5 }).map((_, i) => (
          <MenuRowSkeleton key={i} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  list: { paddingHorizontal: 16, paddingTop: 8, gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  rowText: { flex: 1, minWidth: 0 },
  subtitle: { marginTop: 6 },
});
