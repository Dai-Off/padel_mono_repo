import { ScrollView, StyleSheet, View } from 'react-native';
import { formatLocale, useTranslation, type AppLocale } from '../../i18n';
import { addDaysLocal, dateKeyLocal, startOfLocalDay } from '../../utils/formatSearch';
import { theme } from '../../theme';
import { FilterPill } from './FilterPill';

const DEFAULT_DAYS = 14;

type DateStripPickerProps = {
  selectedDate: Date | null;
  onSelect: (date: Date | null) => void;
  daysCount?: number;
};

function weekdayShort(d: Date, index: number, todayLabel: string, locale: AppLocale): string {
  if (index === 0) return todayLabel;
  if (index === 1) return d.toLocaleDateString(formatLocale(locale), { weekday: 'short' }).slice(0, 3);
  return d.toLocaleDateString(formatLocale(locale), { weekday: 'short' }).replace('.', '');
}

/** Franja horizontal de fechas (estilo Playtomic). `null` = hoy. */
export function DateStripPicker({
  selectedDate,
  onSelect,
  daysCount = DEFAULT_DAYS,
}: DateStripPickerProps) {
  const { t, locale } = useTranslation();
  const todayBase = startOfLocalDay(new Date());
  const todayLabel = t('common.today');

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
              label={weekdayShort(d, i, todayLabel, locale)}
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
