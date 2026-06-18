import { StyleSheet, View } from 'react-native';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';
import { FilterPill } from '../filters/FilterPill';
import type { PartidosSportFilter } from '../../domain/partidosFilters';
import { useTranslation } from '../../i18n';
import { theme } from '../../theme';

type PartidosSportSheetProps = {
  visible: boolean;
  sport: PartidosSportFilter;
  onClose: () => void;
  onSelect: (sport: PartidosSportFilter) => void;
};

export function PartidosSportSheet({ visible, sport, onClose, onSelect }: PartidosSportSheetProps) {
  const { t } = useTranslation();
  const options: { id: PartidosSportFilter; label: string }[] = [
    { id: 'padel', label: t('common.sportPadel') },
    { id: 'tenis', label: t('common.sportTenis') },
    { id: 'pickleball', label: t('common.sportPickleball') },
    { id: 'all', label: t('common.sportAll') },
  ];

  return (
    <FilterBottomSheet visible={visible} title={t('partidos.sheetSportTitle')} onClose={onClose}>
      <View style={styles.row}>
        {options.map((opt) => (
          <FilterPill
            key={opt.id}
            label={opt.label}
            selected={sport === opt.id}
            onPress={() => {
              onSelect(opt.id);
              onClose();
            }}
          />
        ))}
      </View>
    </FilterBottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.md,
  },
});
