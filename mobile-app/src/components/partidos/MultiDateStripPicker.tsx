import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addDaysLocal, dateKeyLocal, startOfLocalDay } from '../../utils/formatSearch';
import { PARTIDOS_MAX_SELECTED_DAYS } from '../../domain/partidosFilters';
import { filterTheme } from '../filters/filterTheme';
import { theme } from '../../theme';
const DAYS_AHEAD = 21;

type MultiDateStripPickerProps = {
  selectedDateKeys: string[];
  onChange: (keys: string[]) => void;
};

function weekdayLabel(d: Date, index: number): string {
  if (index === 0) return 'HOY';
  return d.toLocaleDateString('es', { weekday: 'short' }).slice(0, 3).toUpperCase();
}

function monthShort(d: Date): string {
  return d.toLocaleDateString('es', { month: 'short' }).replace('.', '');
}

/** Selección múltiple de días (max. 7), estilo Playtomic. */
export function MultiDateStripPicker({ selectedDateKeys, onChange }: MultiDateStripPickerProps) {
  const todayBase = startOfLocalDay(new Date());

  const toggle = (key: string) => {
    if (selectedDateKeys.includes(key)) {
      onChange(selectedDateKeys.filter((k) => k !== key));
      return;
    }
    if (selectedDateKeys.length >= PARTIDOS_MAX_SELECTED_DAYS) return;
    onChange([...selectedDateKeys, key].sort());
  };

  return (
    <View>
      <Text style={styles.hint}>Puedes seleccionar hasta {PARTIDOS_MAX_SELECTED_DAYS} días</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {Array.from({ length: DAYS_AHEAD }, (_, i) => {
          const d = addDaysLocal(todayBase, i);
          const key = dateKeyLocal(d);
          const selected = selectedDateKeys.includes(key);
          return (
            <Pressable
              key={key}
              onPress={() => toggle(key)}
              style={({ pressed }) => [
                styles.pill,
                selected && styles.pillSelected,
                pressed && { opacity: 0.9 },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.weekday, selected && styles.textSelected]}>
                {weekdayLabel(d, i)}
              </Text>
              <Text style={[styles.dayNum, selected && styles.textSelected]}>{d.getDate()}</Text>
              <Text style={[styles.month, selected && styles.textSelected]}>{monthShort(d)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: theme.fontSize.xs,
    color: filterTheme.textMuted,
    marginBottom: theme.spacing.sm,
  },
  content: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingVertical: 4,
  },
  pill: {
    minWidth: 52,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: filterTheme.pillUnselectedBorder,
    backgroundColor: filterTheme.pillUnselectedBg,
  },
  pillSelected: {
    backgroundColor: filterTheme.pillSelectedBg,
    borderColor: filterTheme.pillSelectedBg,
  },
  weekday: {
    fontSize: 10,
    fontWeight: '700',
    color: filterTheme.textMuted,
    letterSpacing: 0.3,
  },
  dayNum: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: filterTheme.text,
    marginVertical: 2,
  },
  month: {
    fontSize: 10,
    color: filterTheme.textMuted,
    textTransform: 'capitalize',
  },
  textSelected: { color: '#fff' },
});
