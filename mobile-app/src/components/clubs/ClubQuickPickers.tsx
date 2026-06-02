import { StyleSheet, View } from 'react-native';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';
import { FilterPill } from '../filters/FilterPill';
import type { ClubMultiSelectFilters } from './ClubMultiSelectPicker';
import { theme } from '../../theme';

export type ClubQuickPickerKind = 'sport' | 'cerramiento' | null;

const SPORT_OPTIONS = [
  { id: 'all' as const, label: 'Todos' },
  { id: 'padel' as const, label: 'Pádel' },
  { id: 'tenis' as const, label: 'Tenis' },
  { id: 'pickleball' as const, label: 'Pickleball' },
];

const CERRAMIENTO_OPTIONS = [
  { id: 'all' as const, label: 'Todos' },
  { id: 'indoor' as const, label: 'Interior' },
  { id: 'outdoor' as const, label: 'Exterior' },
];

type ClubQuickPickersProps = {
  kind: ClubQuickPickerKind;
  filters: ClubMultiSelectFilters;
  onClose: () => void;
  onApply: (filters: ClubMultiSelectFilters) => void;
};

export function ClubQuickPickers({ kind, filters, onClose, onApply }: ClubQuickPickersProps) {
  const visible = kind != null;

  const pickSport = (sport: ClubMultiSelectFilters['sport']) => {
    onApply({ ...filters, sport });
    onClose();
  };

  const pickCerramiento = (cerramiento: ClubMultiSelectFilters['cerramiento']) => {
    onApply({ ...filters, cerramiento });
    onClose();
  };

  if (kind === 'sport') {
    return (
      <FilterBottomSheet visible={visible} title="Deporte" onClose={onClose}>
        <View style={styles.chipRow}>
          {SPORT_OPTIONS.map((opt) => (
            <FilterPill
              key={opt.id}
              label={opt.label}
              selected={filters.sport === opt.id}
              onPress={() => pickSport(opt.id)}
            />
          ))}
        </View>
      </FilterBottomSheet>
    );
  }

  if (kind === 'cerramiento') {
    return (
      <FilterBottomSheet visible={visible} title="Cerramiento" onClose={onClose}>
        <View style={styles.chipRow}>
          {CERRAMIENTO_OPTIONS.map((opt) => (
            <FilterPill
              key={opt.id}
              label={opt.label}
              selected={filters.cerramiento === opt.id}
              onPress={() => pickCerramiento(opt.id)}
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
