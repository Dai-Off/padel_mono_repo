import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';
import { FilterOptionRow } from './FilterOptionRow';
import { MultiDateStripPicker } from './MultiDateStripPicker';
import { FilterApplyFooter } from '../filters/FilterApplyFooter';
import { filterTheme } from '../filters/filterTheme';
import type { PartidosFiltersState } from '../../domain/partidosFilters';
import { TIME_RANGE_PRESETS, timeRangePresetMatches } from '../../utils/formatSearch';
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
      title="¿Cuándo quieres jugar?"
      onClose={onClose}
      onClear={() => setLocal((s) => ({ ...s, selectedDateKeys: [], timeRange: null }))}
      footer={footer}
      contentStyle={styles.body}
    >
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        <Text style={styles.sectionTitle}>Selecciona tus días (máx. 7)</Text>
        <MultiDateStripPicker
          selectedDateKeys={local.selectedDateKeys}
          onChange={(keys) => setLocal((s) => ({ ...s, selectedDateKeys: keys }))}
        />

        <Text style={[styles.sectionTitle, styles.sectionGap]}>Selecciona tu hora</Text>
        {TIME_RANGE_PRESETS.map((preset) => (
          <FilterOptionRow
            key={preset.id}
            mode="radio"
            title={preset.label.split(' (')[0]}
            subtitle={
              preset.range
                ? `${preset.range.start} - ${preset.range.end}`
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
        ))}
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
