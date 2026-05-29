import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ClubMultiSelectFilters } from './ClubMultiSelectPicker';

const FILTER_BAR_RIGHT_INSET = 24;

type ClubFilterBarProps = {
  filters: ClubMultiSelectFilters;
  sportLabel: string;
  cerramientoLabel: string;
  onSportPress: () => void;
  onCerramientoPress: () => void;
  hasActiveFilters: boolean;
};

export function ClubFilterBar({
  sportLabel,
  cerramientoLabel,
  onSportPress,
  onCerramientoPress,
  hasActiveFilters,
}: ClubFilterBarProps) {
  const insets = useSafeAreaInsets();
  const rightInset = Math.max(FILTER_BAR_RIGHT_INSET, insets.right + 8);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <FilterChip label={sportLabel} onPress={onSportPress} />
      <FilterChip label={cerramientoLabel} onPress={onCerramientoPress} />
      {hasActiveFilters ? (
        <View style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>Activos</Text>
        </View>
      ) : null}
      <View style={{ width: rightInset, flexShrink: 0 }} />
    </ScrollView>
  );
}

function FilterChip({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.chipLabel} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.75)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    maxWidth: 160,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    flexShrink: 1,
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(241,143,52,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.25)',
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F18F34',
    textTransform: 'uppercase',
  },
  pressed: { opacity: 0.85 },
});
