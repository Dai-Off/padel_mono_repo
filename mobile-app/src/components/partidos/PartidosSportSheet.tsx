import { StyleSheet, View } from 'react-native';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';
import { FilterPill } from '../filters/FilterPill';
import type { PartidosSportFilter } from '../../domain/partidosFilters';
import { theme } from '../../theme';

const OPTIONS: { id: PartidosSportFilter; label: string }[] = [
  { id: 'padel', label: 'Pádel' },
  { id: 'tenis', label: 'Tenis' },
  { id: 'pickleball', label: 'Pickleball' },
  { id: 'all', label: 'Todos' },
];

type PartidosSportSheetProps = {
  visible: boolean;
  sport: PartidosSportFilter;
  onClose: () => void;
  onSelect: (sport: PartidosSportFilter) => void;
};

export function PartidosSportSheet({ visible, sport, onClose, onSelect }: PartidosSportSheetProps) {
  return (
    <FilterBottomSheet visible={visible} title="Deporte" onClose={onClose}>
      <View style={styles.row}>
        {OPTIONS.map((opt) => (
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
