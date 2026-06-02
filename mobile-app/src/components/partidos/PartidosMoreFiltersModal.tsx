import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FilterOptionRow } from './FilterOptionRow';
import { FilterApplyFooter } from '../filters/FilterApplyFooter';
import { filterTheme } from '../filters/filterTheme';
import type {
  PartidosCerramientoFilter,
  PartidosFiltersState,
  PartidosGenderFilter,
  PartidosMatchTypeFilter,
  PartidosParedesFilter,
  PartidosSizeFilter,
  PartidosSortBy,
} from '../../domain/partidosFilters';
import { theme } from '../../theme';

type PartidosMoreFiltersModalProps = {
  visible: boolean;
  filters: PartidosFiltersState;
  onClose: () => void;
  onApply: (filters: PartidosFiltersState) => void;
};

export function PartidosMoreFiltersModal({
  visible,
  filters,
  onClose,
  onApply,
}: PartidosMoreFiltersModalProps) {
  const insets = useSafeAreaInsets();
  const [local, setLocal] = useState(filters);

  useEffect(() => {
    if (visible) setLocal(filters);
  }, [visible, filters]);

  const setSort = (sortBy: PartidosSortBy) => setLocal((s) => ({ ...s, sortBy }));
  const setMatchType = (matchType: PartidosMatchTypeFilter) =>
    setLocal((s) => ({ ...s, matchType }));
  const setGender = (gender: PartidosGenderFilter) => setLocal((s) => ({ ...s, gender }));
  const toggleCerramiento = (id: PartidosCerramientoFilter) =>
    setLocal((s) => ({
      ...s,
      cerramiento: s.cerramiento === id ? 'all' : id,
    }));
  const toggleParedes = (id: PartidosParedesFilter) =>
    setLocal((s) => ({
      ...s,
      paredes: s.paredes === id ? 'all' : id,
    }));
  const toggleSize = (id: PartidosSizeFilter) =>
    setLocal((s) => ({
      ...s,
      size: s.size === id ? 'all' : id,
    }));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn} accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={22} color={filterTheme.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Más filtros</Text>
          <Pressable
            onPress={() =>
              setLocal((s) => ({
                ...s,
                sortBy: 'relevance',
                matchType: 'all',
                gender: 'all',
                cerramiento: 'all',
                paredes: 'all',
                size: 'all',
              }))
            }
            style={styles.headerBtn}
          >
            <Text style={styles.clearAll}>Borrar todo</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>Ordenar por</Text>
          <FilterOptionRow
            mode="radio"
            title="Relevancia"
            selected={local.sortBy === 'relevance'}
            onPress={() => setSort('relevance')}
          />
          <FilterOptionRow
            mode="radio"
            title="Más recientes"
            selected={local.sortBy === 'recent'}
            onPress={() => setSort('recent')}
          />
          <FilterOptionRow
            mode="radio"
            title="Número de jugadores"
            selected={local.sortBy === 'players'}
            onPress={() => setSort('players')}
          />
          <FilterOptionRow
            mode="radio"
            title="Más cercanos"
            selected={local.sortBy === 'distance'}
            onPress={() => setSort('distance')}
          />

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Tipo de partido</Text>
          <FilterOptionRow
            mode="radio"
            title="Todo"
            subtitle="Mostrar todos los partidos"
            selected={local.matchType === 'all'}
            onPress={() => setMatchType('all')}
          />
          <FilterOptionRow
            mode="radio"
            title="Competitivo"
            selected={local.matchType === 'competitive'}
            onPress={() => setMatchType('competitive')}
          />
          <FilterOptionRow
            mode="radio"
            title="Amistoso"
            selected={local.matchType === 'friendly'}
            onPress={() => setMatchType('friendly')}
          />

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Jugar con</Text>
          <FilterOptionRow
            mode="checkbox"
            title="Todos los jugadores"
            selected={local.gender === 'all'}
            onPress={() => setGender('all')}
          />
          <FilterOptionRow
            mode="checkbox"
            title="Solo hombres"
            subtitle="El partido solo admite hombres"
            selected={local.gender === 'male'}
            onPress={() => setGender('male')}
          />
          <FilterOptionRow
            mode="checkbox"
            title="Solo mujeres"
            subtitle="El partido solo admite mujeres"
            selected={local.gender === 'female'}
            onPress={() => setGender('female')}
          />
          <FilterOptionRow
            mode="checkbox"
            title="Mixto"
            subtitle="Un hombre y una mujer en cada equipo"
            selected={local.gender === 'mixed'}
            onPress={() => setGender('mixed')}
          />

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Cerramiento</Text>
          {(['indoor', 'outdoor', 'cubierta'] as const).map((id) => (
            <FilterOptionRow
              key={id}
              mode="checkbox"
              title={id === 'indoor' ? 'Interior' : id === 'outdoor' ? 'Exterior' : 'Cubierta'}
              selected={local.cerramiento === id}
              onPress={() => toggleCerramiento(id)}
            />
          ))}

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Paredes</Text>
          {(['muro', 'cristal', 'panoramico'] as const).map((id) => (
            <FilterOptionRow
              key={id}
              mode="checkbox"
              title={id === 'muro' ? 'Muro' : id === 'cristal' ? 'Cristal' : 'Panorámico'}
              selected={local.paredes === id}
              onPress={() => toggleParedes(id)}
            />
          ))}

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Tamaño</Text>
          <FilterOptionRow
            mode="checkbox"
            title="Dobles"
            selected={local.size === 'doubles'}
            onPress={() => toggleSize('doubles')}
          />
          <FilterOptionRow
            mode="checkbox"
            title="Individual"
            selected={local.size === 'individual'}
            onPress={() => toggleSize('individual')}
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <FilterApplyFooter
            label="Aplicar filtros"
            onPress={() => {
              onApply(local);
              onClose();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: filterTheme.sheetBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: filterTheme.sectionBorder,
  },
  headerBtn: { minWidth: 80 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: filterTheme.text,
  },
  clearAll: {
    textAlign: 'right',
    color: filterTheme.accent,
    fontWeight: '600',
    fontSize: theme.fontSize.sm,
  },
  scroll: { flex: 1, paddingHorizontal: theme.spacing.md },
  sectionLabel: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: filterTheme.text,
    marginTop: theme.spacing.md,
    marginBottom: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: filterTheme.sectionBorder,
    marginVertical: theme.spacing.md,
  },
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: filterTheme.sectionBorder,
    backgroundColor: filterTheme.sheetBg,
  },
});
