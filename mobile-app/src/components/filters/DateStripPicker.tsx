import { ScrollView, StyleSheet, View } from 'react-native';
import { addDaysLocal, dateKeyLocal, startOfLocalDay } from '../../utils/formatSearch';
import { theme } from '../../theme';
import { FilterPill } from './FilterPill';

const DEFAULT_DAYS = 14;

type DateStripPickerProps = {
  selectedDate: Date | null;
  onSelect: (date: Date | null) => void;
  daysCount?: number;
};

function weekdayShort(d: Date, index: number): string {
  if (index === 0) return 'Hoy';
  if (index === 1) return 'Mañ';
  return d.toLocaleDateString('es', { weekday: 'short' }).replace('.', '');
}

/** Franja horizontal de fechas (estilo Playtomic). `null` = hoy. */
export function DateStripPicker({
  selectedDate,
  onSelect,
  daysCount = DEFAULT_DAYS,
}: DateStripPickerProps) {
  const todayBase = startOfLocalDay(new Date());

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      {Array.from({ length: daysCount }, (_, i) => {
        const d = addDaysLocal(todayBase, i);
        const selected =
          i === 0
            ? selectedDate == null || dateKeyLocal(selectedDate) === dateKeyLocal(todayBase)
            : selectedDate != null && dateKeyLocal(selectedDate) === dateKeyLocal(d);
        return (
          <View key={dateKeyLocal(d)} style={styles.item}>
            <FilterPill
              variant="date"
              label={weekdayShort(d, i)}
              dayNumber={d.getDate()}
              selected={selected}
              onPress={() => onSelect(i === 0 ? null : d)}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: 4,
  },
  item: { flexShrink: 0 },
});
