import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';
import { FilterOptionRow } from './FilterOptionRow';
import { MultiDateStripPicker } from './MultiDateStripPicker';
import { FilterApplyFooter } from '../filters/FilterApplyFooter';
import { filterTheme } from '../filters/filterTheme';
import type { PartidosFiltersState } from '../../domain/partidosFilters';
import { TIME_RANGE_PRESETS, timeRangePresetMatches } from '../../utils/formatSearch';
import { useTranslation } from '../../i18n';
import { theme } from '../../theme';

type PartidosWhenSheetProps = {
  visible: boolean;
  draft: PartidosFiltersState;
  getResultCount: (draft: PartidosFiltersState) => number;
  onClose: () => void;
  onApply: (patch: Partial<PartidosFiltersState>) => void;
};

export function PartidosWhenSheet({
  visible,
  draft,
  getResultCount,
  onClose,
  onApply,
}: PartidosWhenSheetProps) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(draft);

  useEffect(() => {
    if (visible) setLocal(draft);
  }, [visible, draft]);

  const preview = getResultCount(local);

  const footer = (
    <FilterApplyFooter
      resultCount={preview}
      onPress={() => {
        onApply({
          selectedDateKeys: local.selectedDateKeys,
          timeRange: local.timeRange,
        });
        onClose();
      }}
    />
  );

  return (
    <FilterBottomSheet
      visible={visible}
      title={t('partidos.sheetWhenTitle')}
      onClose={onClose}
      onClear={() => setLocal((s) => ({ ...s, selectedDateKeys: [], timeRange: null }))}
      footer={footer}
      contentStyle={styles.body}
    >
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        <Text style={styles.sectionTitle}>
          {t('partidos.multiDateHint', { max: 7 })}
        </Text>
        <MultiDateStripPicker
          selectedDateKeys={local.selectedDateKeys}
          onChange={(keys) => setLocal((s) => ({ ...s, selectedDateKeys: keys }))}
        />

        <Text style={[styles.sectionTitle, styles.sectionGap]}>{t('search.filterTime')}</Text>
        {TIME_RANGE_PRESETS.map((preset) => {
          const presetLabel =
            preset.id === 'allday'
              ? t('search.timePresetAllDay')
              : preset.id === 'morning'
                ? t('search.timePresetMorning')
                : preset.id === 'afternoon'
                  ? t('search.timePresetAfternoon')
                  : t('search.timePresetEvening');
          return (
          <FilterOptionRow
            key={preset.id}
            mode="radio"
            title={presetLabel.split(' (')[0]}
            subtitle={
              preset.range
                ? t('search.timeRangeFormat', { start: preset.range.start, end: preset.range.end })
                : undefined
            }
            selected={timeRangePresetMatches(preset.id, local.timeRange)}
            onPress={() =>
              setLocal((s) => ({
                ...s,
                timeRange: preset.range,
              }))
            }
          />
        );
        })}
      </ScrollView>
    </FilterBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 0, maxHeight: 420 },
  scroll: { maxHeight: 380 },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: filterTheme.text,
    marginBottom: theme.spacing.sm,
  },
  sectionGap: { marginTop: theme.spacing.lg },
});
