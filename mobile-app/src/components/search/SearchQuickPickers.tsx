import { StyleSheet, View } from 'react-native';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';
import { FilterPill } from '../filters/FilterPill';
import { DateStripPicker } from '../filters/DateStripPicker';
import type { SearchFiltersState } from '../../domain/searchFilters';
import { SPORT_OPTIONS, TIME_RANGE_PRESETS } from '../../domain/searchFilters';
import { timeRangePresetMatches } from '../../utils/formatSearch';
import { useTranslation } from '../../i18n';
import { theme } from '../../theme';

export type SearchQuickPickerKind = 'sport' | 'date' | 'time' | null;

type SearchQuickPickersProps = {
  kind: SearchQuickPickerKind;
  filters: SearchFiltersState;
  onClose: () => void;
  onApply: (patch: Partial<SearchFiltersState>) => void;
};

/** Pickers rápidos al tocar cada chip de la barra (patrón Playtomic). */
export function SearchQuickPickers({ kind, filters, onClose, onApply }: SearchQuickPickersProps) {
  const { t } = useTranslation();
  const visible = kind != null;

  const applyAndClose = (patch: Partial<SearchFiltersState>) => {
    onApply(patch);
    onClose();
  };

  if (kind === 'sport') {
    return (
      <FilterBottomSheet
        visible={visible}
        title={t('search.filterSport')}
        onClose={onClose}
        onClear={() => applyAndClose({ sport: null })}
      >
        <View style={styles.chipRow}>
          <FilterPill
            label={t('common.sportAll')}
            selected={filters.sport == null}
            onPress={() => applyAndClose({ sport: null })}
          />
          {SPORT_OPTIONS.map((opt) => (
            <FilterPill
              key={opt.id}
              label={
                opt.id === 'padel'
                  ? t('common.sportPadel')
                  : opt.id === 'tenis'
                    ? t('common.sportTenis')
                    : t('common.sportPickleball')
              }
              selected={filters.sport === opt.id}
              onPress={() => applyAndClose({ sport: opt.id })}
            />
          ))}
        </View>
      </FilterBottomSheet>
    );
  }

  if (kind === 'date') {
    return (
      <FilterBottomSheet
        visible={visible}
        title={t('search.filterDate')}
        onClose={onClose}
        onClear={() => applyAndClose({ date: null })}
      >
        <DateStripPicker
          selectedDate={filters.date}
          onSelect={(date) => applyAndClose({ date })}
        />
      </FilterBottomSheet>
    );
  }

  if (kind === 'time') {
    return (
      <FilterBottomSheet
        visible={visible}
        title={t('search.filterTime')}
        onClose={onClose}
        onClear={() => applyAndClose({ timeRange: null })}
      >
        <View style={styles.chipRow}>
          {TIME_RANGE_PRESETS.map((preset) => (
            <FilterPill
              key={preset.id}
              label={
                preset.id === 'allday'
                  ? t('search.timePresetAllDay')
                  : preset.id === 'morning'
                    ? t('search.timePresetMorning')
                    : preset.id === 'afternoon'
                      ? t('search.timePresetAfternoon')
                      : t('search.timePresetEvening')
              }
              selected={timeRangePresetMatches(preset.id, filters.timeRange)}
              onPress={() => applyAndClose({ timeRange: preset.range })}
            />
          ))}
        </View>
      </FilterBottomSheet>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.md,
  },
});
