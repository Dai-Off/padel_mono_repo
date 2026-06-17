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
import { useTranslation } from '../../i18n';
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
  const { t } = useTranslation();
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
          <Pressable onPress={onClose} style={styles.headerBtn} accessibilityLabel={t('common.back')}>
            <Ionicons name="arrow-back" size={22} color={filterTheme.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('search.filtersTitle')}</Text>
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
            <Text style={styles.clearAll}>{t('common.discard')}</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>{t('search.sectionSortBy')}</Text>
          <FilterOptionRow
            mode="radio"
            title={t('common.relevance')}
            selected={local.sortBy === 'relevance'}
            onPress={() => setSort('relevance')}
          />
          <FilterOptionRow
            mode="radio"
            title={t('common.mostRecent')}
            selected={local.sortBy === 'recent'}
            onPress={() => setSort('recent')}
          />
          <FilterOptionRow
            mode="radio"
            title={t('common.playerCount')}
            selected={local.sortBy === 'players'}
            onPress={() => setSort('players')}
          />
          <FilterOptionRow
            mode="radio"
            title={t('common.nearest')}
            selected={local.sortBy === 'distance'}
            onPress={() => setSort('distance')}
          />

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>{t('partidos.createMatchType')}</Text>
          <FilterOptionRow
            mode="radio"
            title={t('partidos.moreFiltersAll')}
            subtitle={t('partidos.moreFiltersAllSub')}
            selected={local.matchType === 'all'}
            onPress={() => setMatchType('all')}
          />
          <FilterOptionRow
            mode="radio"
            title={t('partidos.moreFiltersCompetitive')}
            selected={local.matchType === 'competitive'}
            onPress={() => setMatchType('competitive')}
          />
          <FilterOptionRow
            mode="radio"
            title={t('partidos.moreFiltersFriendly')}
            selected={local.matchType === 'friendly'}
            onPress={() => setMatchType('friendly')}
          />

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>{t('partidos.createGenderSection')}</Text>
          <FilterOptionRow
            mode="checkbox"
            title={t('partidos.moreFiltersAllPlayers')}
            selected={local.gender === 'all'}
            onPress={() => setGender('all')}
          />
          <FilterOptionRow
            mode="checkbox"
            title={t('partidos.moreFiltersMenOnly')}
            subtitle={t('partidos.moreFiltersMenOnlySub')}
            selected={local.gender === 'male'}
            onPress={() => setGender('male')}
          />
          <FilterOptionRow
            mode="checkbox"
            title={t('partidos.moreFiltersWomenOnly')}
            subtitle={t('partidos.moreFiltersWomenOnlySub')}
            selected={local.gender === 'female'}
            onPress={() => setGender('female')}
          />
          <FilterOptionRow
            mode="checkbox"
            title={t('partidos.moreFiltersMixed')}
            subtitle={t('partidos.moreFiltersMixedSub')}
            selected={local.gender === 'mixed'}
            onPress={() => setGender('mixed')}
          />

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>{t('search.sectionEnclosure')}</Text>
          {(['indoor', 'outdoor', 'cubierta'] as const).map((id) => (
            <FilterOptionRow
              key={id}
              mode="checkbox"
              title={
                id === 'indoor'
                  ? t('common.interior')
                  : id === 'outdoor'
                    ? t('common.outdoor')
                    : t('common.covered')
              }
              selected={local.cerramiento === id}
              onPress={() => toggleCerramiento(id)}
            />
          ))}

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>{t('search.sectionWalls')}</Text>
          {(['muro', 'cristal', 'panoramico'] as const).map((id) => (
            <FilterOptionRow
              key={id}
              mode="checkbox"
              title={
                id === 'muro'
                  ? t('common.wallMuro')
                  : id === 'cristal'
                    ? t('common.wallCristal')
                    : t('common.wallPanoramico')
              }
              selected={local.paredes === id}
              onPress={() => toggleParedes(id)}
            />
          ))}

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>{t('common.playerCount')}</Text>
          <FilterOptionRow
            mode="checkbox"
            title={t('common.doubles')}
            selected={local.size === 'doubles'}
            onPress={() => toggleSize('doubles')}
          />
          <FilterOptionRow
            mode="checkbox"
            title={t('common.singles')}
            selected={local.size === 'individual'}
            onPress={() => toggleSize('individual')}
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <FilterApplyFooter
            label={t('common.applyFilters')}
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
