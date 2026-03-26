import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';

const FILTER_BAR_RIGHT_INSET = 24;
const ACCENT = theme.auth.accent;

type SearchFilterBarProps = {
  sportLabel: string;
  dateLabel: string;
  timeRangeLabel: string;
  onSportPress?: () => void;
  onDatePress?: () => void;
  onTimeRangePress?: () => void;
  /** Badge “Cerca” cuando el orden es por distancia (referencia BuscadorScreen). */
  showCercaBadge?: boolean;
};

/** Fila horizontal de chips (deporte, fecha, hora) + badge Cerca. */
export function SearchFilterBar({
  sportLabel,
  dateLabel,
  timeRangeLabel,
  onSportPress,
  onDatePress,
  onTimeRangePress,
  showCercaBadge = true,
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
      <FilterChip label={sportLabel} onPress={onSportPress} />
      <FilterChip label={dateLabel} onPress={onDatePress} />
      <FilterChip
        label={timeRangeLabel}
        onPress={onTimeRangePress}
        icon="time-outline"
      />
      {showCercaBadge && (
        <View style={styles.cercaBadge} accessibilityLabel="Orden: cercanía">
          <Ionicons name="trending-up" size={12} color={ACCENT} />
          <Text style={styles.cercaText}>Cerca</Text>
        </View>
      )}
      <View style={{ width: rightInset, flexShrink: 0 }} />
    </ScrollView>
  );
}

function FilterChip({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon ? (
        <Ionicons name={icon} size={12} color="rgba(255,255,255,0.9)" />
      ) : null}
      <Text style={styles.chipLabel} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.75)" />
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
    gap: 8,
    paddingLeft: 0,
    paddingBottom: 0,
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
    maxWidth: 200,
  },
  chipLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#fff',
    flexShrink: 1,
  },
  cercaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(241,143,52,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.2)',
  },
  cercaText: {
    fontSize: 10,
    fontWeight: '700',
    color: ACCENT,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  pressed: {
    opacity: 0.85,
  },
});
