import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type AppHeaderProps = {
  title?: string;
  leftSlot?: ReactNode;
  centerSlot?: ReactNode;
  rightSlot?: ReactNode;
};

export function AppHeader({ title, leftSlot, centerSlot, rightSlot }: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.slot}>{leftSlot}</View>
      {centerSlot ? (
        <View style={styles.centerSlot}>{centerSlot}</View>
      ) : title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.spacer} />
      )}
      <View style={[styles.slot, styles.right]}>{rightSlot}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 16,
  },
  slot: { alignItems: 'center', justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  centerSlot: { flex: 1, maxWidth: 400, minWidth: 0, marginHorizontal: 8 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },
  spacer: { flex: 1 },
});
