import { useEffect, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';
import { FilterApplyFooter } from '../filters/FilterApplyFooter';
import { FilterPill } from '../filters/FilterPill';
import { DateStripPicker } from '../filters/DateStripPicker';
import { filterTheme } from '../filters/filterTheme';
import {
  CERRAMIENTO_OPTIONS,
  countAdvancedSearchFilters,
  DURATION_OPTIONS,
  getInitialSearchFilters,
  PAREDES_OPTIONS,
  SEARCH_DISTANCE_MAX_KM,
  SPORT_OPTIONS,
  TIME_RANGE_PRESETS,
  type SearchFiltersState,
} from '../../domain/searchFilters';
import { timeRangePresetMatches } from '../../utils/formatSearch';
import { theme } from '../../theme';

export type { SearchFiltersState };
export { getInitialSearchFilters as getInitialFilters };

type SearchFiltersSheetProps = {
  visible: boolean;
  onClose: () => void;
  onApply?: (filters: SearchFiltersState) => void;
  onClear?: () => void;
  initialFilters?: SearchFiltersState;
  resultCount: number;
  resultCountKind?: 'clubs' | 'results';
};

function formatResultCtaLabel(n: number, kind: 'clubs' | 'results') {
  if (kind === 'clubs') {
    return n === 1 ? 'Ver 1 club' : `Ver ${n} clubes`;
  }
  return `Ver ${n} resultados`;
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

/** Hoja completa de filtros avanzados (icono de opciones en buscador de pistas). */
export function SearchFiltersSheet({
  visible,
  onClose,
  onApply,
  onClear,
  initialFilters,
  resultCount,
  resultCountKind = 'results',
}: SearchFiltersSheetProps) {
  const [filters, setFilters] = useState<SearchFiltersState>(() =>
    initialFilters ?? getInitialSearchFilters(),
  );

  useEffect(() => {
    if (visible && initialFilters) {
      setFilters(initialFilters);
    }
  }, [visible, initialFilters]);

  const handleClear = () => {
    const cleared = getInitialSearchFilters();
    setFilters(cleared);
    onClear?.();
  };

  const handleApply = () => {
    onApply?.(filters);
    onClose();
  };

  const advancedCount = countAdvancedSearchFilters(filters);

  const footer = (
    <FilterApplyFooter
      resultCount={resultCount}
      singularLabel={
        resultCountKind === 'clubs' ? 'Ver 1 club' : 'Ver 1 resultado'
      }
      pluralLabel={formatResultCtaLabel(resultCount, resultCountKind)}
      onPress={handleApply}
    />
  );

  return (
    <FilterBottomSheet
      visible={visible}
      title={advancedCount > 0 ? `Filtros (${advancedCount})` : 'Filtros'}
      onClose={onClose}
      onClear={handleClear}
      footer={footer}
      contentStyle={styles.sheetBody}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SectionTitle>Deporte</SectionTitle>
        <View style={styles.chipRow}>
          <FilterPill
            label="Todos"
            selected={filters.sport == null}
            onPress={() => setFilters((s) => ({ ...s, sport: null }))}
          />
          {SPORT_OPTIONS.map((opt) => (
            <FilterPill
              key={opt.id}
              label={opt.label}
              selected={filters.sport === opt.id}
              onPress={() =>
                setFilters((s) => ({
                  ...s,
                  sport: s.sport === opt.id ? null : opt.id,
                }))
              }
            />
          ))}
        </View>

        <View style={styles.sectionDivider}>
          <SectionTitle>Fecha</SectionTitle>
          <DateStripPicker
            selectedDate={filters.date}
            onSelect={(date) => setFilters((s) => ({ ...s, date }))}
          />
        </View>

        <View style={styles.sectionDivider}>
          <SectionTitle>Franja horaria</SectionTitle>
          <View style={styles.chipRow}>
            {TIME_RANGE_PRESETS.map((preset) => (
              <FilterPill
                key={preset.id}
                label={preset.label}
                selected={timeRangePresetMatches(preset.id, filters.timeRange)}
                onPress={() =>
                  setFilters((s) => ({
                    ...s,
                    timeRange: preset.range,
                  }))
                }
              />
            ))}
          </View>
        </View>

        <View style={[styles.sectionDivider, styles.toggleRow]}>
          <Text style={styles.toggleLabel}>Solo horarios reservables</Text>
          <Switch
            value={!filters.showUnavailable}
            onValueChange={(v) => setFilters((s) => ({ ...s, showUnavailable: !v }))}
            trackColor={{ false: 'rgba(255,255,255,0.15)', true: filterTheme.accent }}
            thumbColor="#fff"
            accessibilityLabel="Solo horarios reservables para la duración seleccionada"
          />
        </View>

        <View style={styles.sectionDivider}>
          <SectionTitle>Ordenar por</SectionTitle>
          <View style={styles.chipRow}>
            <FilterPill
              label="Distancia"
              selected={filters.sortBy === 'distancia'}
              onPress={() => setFilters((s) => ({ ...s, sortBy: 'distancia' }))}
            />
            <FilterPill
              label="Precio"
              selected={filters.sortBy === 'precio'}
              onPress={() => setFilters((s) => ({ ...s, sortBy: 'precio' }))}
            />
          </View>
        </View>

        <View style={styles.sectionDivider}>
          <View style={styles.distanceHeader}>
            <SectionTitle>Distancia máxima</SectionTitle>
            <Text style={styles.distanceValue}>
              {filters.maxDistanceKm >= SEARCH_DISTANCE_MAX_KM
                ? 'Sin límite'
                : `${filters.maxDistanceKm} km`}
            </Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={5}
            maximumValue={SEARCH_DISTANCE_MAX_KM}
            step={1}
            value={filters.maxDistanceKm}
            onValueChange={(v) => setFilters((s) => ({ ...s, maxDistanceKm: v }))}
            minimumTrackTintColor={filterTheme.accent}
            maximumTrackTintColor="rgba(255,255,255,0.12)"
            thumbTintColor={filterTheme.accent}
            accessibilityLabel="Distancia máxima en kilómetros"
          />
        </View>

        <View style={styles.sectionDivider}>
          <SectionTitle>Duración</SectionTitle>
          <View style={styles.chipRow}>
            {DURATION_OPTIONS.map((m) => (
              <FilterPill
                key={m}
                label={`${m} min`}
                selected={filters.duration === m}
                onPress={() => setFilters((s) => ({ ...s, duration: m }))}
              />
            ))}
          </View>
        </View>

        <View style={styles.sectionDivider}>
          <SectionTitle>Cerramiento</SectionTitle>
          <View style={styles.chipRow}>
            {CERRAMIENTO_OPTIONS.map((opt) => (
              <FilterPill
                key={opt.id}
                label={opt.label}
                selected={filters.cerramiento === opt.id}
                onPress={() =>
                  setFilters((s) => ({
                    ...s,
                    cerramiento: s.cerramiento === opt.id ? null : opt.id,
                  }))
                }
              />
            ))}
          </View>
        </View>

        <View style={styles.sectionDivider}>
          <SectionTitle>Paredes</SectionTitle>
          <View style={styles.chipRow}>
            {PAREDES_OPTIONS.map((opt) => (
              <FilterPill
                key={opt.id}
                label={opt.label}
                selected={filters.paredes === opt.id}
                onPress={() =>
                  setFilters((s) => ({
                    ...s,
                    paredes: s.paredes === opt.id ? null : opt.id,
                  }))
                }
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </FilterBottomSheet>
  );
}

const scrollMaxHeight = Dimensions.get('window').height * 0.52;

const styles = StyleSheet.create({
  sheetBody: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  scroll: {
    maxHeight: scrollMaxHeight,
  },
  scrollContent: {
    paddingBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: filterTheme.text,
    marginBottom: theme.spacing.sm,
  },
  sectionDivider: {
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: filterTheme.sectionBorder,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: filterTheme.textMuted,
    marginRight: theme.spacing.sm,
  },
  distanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  distanceValue: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: filterTheme.accent,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  pressed: { opacity: 0.88 },
});
