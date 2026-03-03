import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';

const FILTER_BAR_RIGHT_INSET = 32;

type SearchFilterBarProps = {
  sportLabel: string;
  dateLabel: string;
  timeRangeLabel: string;
  onFiltersPress?: () => void;
  onSportPress?: () => void;
  onDatePress?: () => void;
  onTimeRangePress?: () => void;
};

/** Barra horizontal de filtros para el buscador de partidos. Scroll horizontal en pantallas pequeñas. */
export function SearchFilterBar({
  sportLabel,
  dateLabel,
  timeRangeLabel,
  onFiltersPress,
  onSportPress,
  onDatePress,
  onTimeRangePress,
}: SearchFilterBarProps) {
  const insets = useSafeAreaInsets();
  const rightInset = Math.max(FILTER_BAR_RIGHT_INSET, insets.right + 8);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      <Pressable
        onPress={onFiltersPress}
        style={({ pressed }) => [styles.filtersButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Filtros"
      >
        <Ionicons name="options" size={16} color="#1A1A1A" />
      </Pressable>

      <FilterChip label={sportLabel} onPress={onSportPress} />
      <FilterChip label={dateLabel} onPress={onDatePress} />
      <FilterChip label={timeRangeLabel} onPress={onTimeRangePress} />
      <View style={{ width: rightInset, flexShrink: 0 }} />
    </ScrollView>
  );
}

function FilterChip({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void;
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
      <Ionicons name="chevron-down" size={14} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingLeft: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  filtersButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
  },
  chipLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#fff',
  },
  pressed: {
    opacity: 0.8,
  },
});
