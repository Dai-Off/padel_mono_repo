import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';
import { theme } from '../../theme';

/** Skeleton que imita la estructura de SearchCourtCard durante la carga. */
export function SearchCourtCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.imageWrap}>
        <Skeleton
          width="100%"
          height={160}
          borderRadius={0}
          variant="light"
          style={styles.image}
        />
      </View>
      <View style={styles.body}>
        <View style={styles.tags}>
          <Skeleton width={64} height={24} borderRadius={8} variant="light" />
          <Skeleton width={72} height={24} borderRadius={8} variant="light" />
        </View>
        <View style={styles.slots}>
          <Skeleton width={56} height={36} borderRadius={12} variant="light" />
          <Skeleton width={56} height={36} borderRadius={12} variant="light" />
          <Skeleton width={56} height={36} borderRadius={12} variant="light" />
          <Skeleton width={56} height={36} borderRadius={12} variant="light" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  imageWrap: {
    height: 160,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  body: {
    padding: theme.spacing.md,
  },
  tags: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  slots: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
});
