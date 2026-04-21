import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

const { width } = Dimensions.get('window');

export const FeedSkeleton = () => {
  return (
    <View style={styles.container}>
      {[1, 2].map((i) => (
        <View key={i} style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Skeleton width={32} height={32} borderRadius={16} variant="dark" />
            <View style={styles.headerText}>
              <Skeleton width={120} height={14} borderRadius={4} variant="dark" />
              <Skeleton width={80} height={10} borderRadius={4} variant="dark" style={{ marginTop: 4 }} />
            </View>
          </View>

          {/* Large Image Placeholder */}
          <Skeleton width={width} height={width} borderRadius={0} variant="dark" />

          {/* Actions */}
          <View style={styles.actions}>
            <View style={styles.leftActions}>
              <Skeleton width={26} height={26} borderRadius={13} variant="dark" style={{ marginRight: 16 }} />
              <Skeleton width={24} height={24} borderRadius={12} variant="dark" style={{ marginRight: 16 }} />
              <Skeleton width={24} height={24} borderRadius={12} variant="dark" />
            </View>
            <Skeleton width={24} height={24} borderRadius={4} variant="dark" />
          </View>

          {/* Details */}
          <View style={styles.details}>
            <Skeleton width={100} height={14} borderRadius={4} variant="dark" style={{ marginBottom: 8 }} />
            <Skeleton width="90%" height={12} borderRadius={4} variant="dark" style={{ marginBottom: 6 }} />
            <Skeleton width="60%" height={12} borderRadius={4} variant="dark" />
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F0F0F',
    flex: 1,
  },
  card: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  headerText: {
    marginLeft: 10,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
  },
  leftActions: {
    flexDirection: 'row',
  },
  details: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
});
