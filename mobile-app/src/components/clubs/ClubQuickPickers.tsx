import { StyleSheet, View } from 'react-native';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';
import { FilterPill } from '../filters/FilterPill';
import type { ClubMultiSelectFilters } from './ClubMultiSelectPicker';
import { useTranslation } from '../../i18n';
import { theme } from '../../theme';

export type ClubQuickPickerKind = 'sport' | 'cerramiento' | null;

type ClubQuickPickersProps = {
  kind: ClubQuickPickerKind;
  filters: ClubMultiSelectFilters;
  onClose: () => void;
  onApply: (filters: ClubMultiSelectFilters) => void;
};

export function ClubQuickPickers({ kind, filters, onClose, onApply }: ClubQuickPickersProps) {
  const { t } = useTranslation();
  const visible = kind != null;

  const sportOptions = [
    { id: 'all' as const, label: t('common.sportAll') },
    { id: 'padel' as const, label: t('common.sportPadel') },
    { id: 'tenis' as const, label: t('common.sportTenis') },
    { id: 'pickleball' as const, label: t('common.sportPickleball') },
  ];

  const cerramientoOptions = [
    { id: 'all' as const, label: t('common.sportAll') },
    { id: 'indoor' as const, label: t('common.interior') },
    { id: 'outdoor' as const, label: t('common.outdoor') },
  ];

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
      <FilterBottomSheet visible={visible} title={t('search.filterSport')} onClose={onClose}>
        <View style={styles.chipRow}>
          {sportOptions.map((opt) => (
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
      <FilterBottomSheet visible={visible} title={t('search.sectionEnclosure')} onClose={onClose}>
        <View style={styles.chipRow}>
          {cerramientoOptions.map((opt) => (
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
