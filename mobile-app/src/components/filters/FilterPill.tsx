import { Pressable, StyleSheet, Text } from 'react-native';
import { theme } from '../../theme';
import { filterTheme } from './filterTheme';

type FilterPillProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** compact = chips en fila; date = día con número grande (estilo Playtomic). */
  variant?: 'chip' | 'date';
  dayNumber?: number;
};

export function FilterPill({
  label,
  selected,
  onPress,
  variant = 'chip',
  dayNumber,
}: FilterPillProps) {
  if (variant === 'date') {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.datePill,
          selected ? styles.datePillSelected : styles.datePillUnselected,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <Text style={[styles.dateWeekday, selected && styles.dateTextSelected]} numberOfLines={1}>
          {label}
        </Text>
        {dayNumber != null ? (
          <Text style={[styles.dateNumber, selected && styles.dateTextSelected]}>{dayNumber}</Text>
        ) : null}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : styles.chipUnselected,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : styles.chipTextUnselected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: filterTheme.pillSelectedBg,
    borderColor: filterTheme.pillSelectedBg,
  },
  chipUnselected: {
    backgroundColor: filterTheme.pillUnselectedBg,
    borderColor: filterTheme.pillUnselectedBorder,
  },
  chipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  chipTextSelected: { color: '#fff' },
  chipTextUnselected: { color: filterTheme.textMuted },
  datePill: {
    minWidth: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  datePillSelected: {
    backgroundColor: filterTheme.pillSelectedBg,
    borderColor: filterTheme.pillSelectedBg,
  },
  datePillUnselected: {
    backgroundColor: filterTheme.pillUnselectedBg,
    borderColor: filterTheme.pillUnselectedBorder,
  },
  dateWeekday: {
    fontSize: 10,
    fontWeight: '600',
    color: filterTheme.textMuted,
    textTransform: 'capitalize',
    marginBottom: 2,
  },
  dateNumber: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: filterTheme.text,
  },
  dateTextSelected: { color: '#fff' },
  pressed: { opacity: 0.88 },
});
