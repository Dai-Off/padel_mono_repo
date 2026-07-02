import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { FilterBottomSheet } from '../../filters/FilterBottomSheet';
import { FilterApplyFooter } from '../../filters/FilterApplyFooter';
import { FilterOptionRow } from '../../partidos/FilterOptionRow';
import { filterTheme } from '../../filters/filterTheme';
import { useTranslation } from '../../../i18n';
import { theme } from '../../../theme';
import {
  filterHomeActivityItems,
  type HomeActivityItem,
  type HomeActivityType,
} from './homeActivityFilters';

type Props = {
  visible: boolean;
  allItems: HomeActivityItem[];
  typeFilters: HomeActivityType[];
  showFinished: boolean;
  onClose: () => void;
  onApply: (typeFilters: HomeActivityType[], showFinished: boolean) => void;
};

export function MisActividadesFiltersSheet({
  visible,
  allItems,
  typeFilters,
  showFinished,
  onClose,
  onApply,
}: Props) {
  const { t } = useTranslation();
  const [draftTypes, setDraftTypes] = useState<HomeActivityType[]>(typeFilters);
  const [draftFinished, setDraftFinished] = useState(showFinished);

  useEffect(() => {
    if (!visible) return;
    setDraftTypes(typeFilters);
    setDraftFinished(showFinished);
  }, [visible, typeFilters, showFinished]);

  const previewCount = useMemo(
    () =>
      filterHomeActivityItems(allItems, {
        typeFilters: draftTypes,
        showFinished: draftFinished,
      }).length,
    [allItems, draftTypes, draftFinished],
  );

  const toggleType = (type: HomeActivityType) => {
    setDraftTypes((prev) =>
      prev.includes(type) ? prev.filter((x) => x !== type) : [...prev, type],
    );
  };

  const handleClear = () => {
    setDraftTypes([]);
    setDraftFinished(false);
  };

  return (
    <FilterBottomSheet
      visible={visible}
      title={t('search.filtersTitle')}
      onClose={onClose}
      onClear={handleClear}
      clearLabel={t('home.misActividades.filtersClear')}
      footer={
        <FilterApplyFooter
          onPress={() => {
            onApply(draftTypes, draftFinished);
            onClose();
          }}
          resultCount={previewCount}
          singularLabel={t('home.misActividades.oneItem')}
          pluralLabel={t('home.misActividades.manyItems', { count: previewCount })}
        />
      }
    >
      <Text style={styles.sectionLabel}>{t('home.misActividades.filtersSectionType')}</Text>
      <FilterOptionRow
        mode="checkbox"
        title={t('home.misActividades.filterOpen')}
        selected={draftTypes.includes('open')}
        onPress={() => toggleType('open')}
      />
      <FilterOptionRow
        mode="checkbox"
        title={t('home.misActividades.filterClosed')}
        selected={draftTypes.includes('closed')}
        onPress={() => toggleType('closed')}
      />
      <FilterOptionRow
        mode="checkbox"
        title={t('home.misActividades.filterReservation')}
        selected={draftTypes.includes('reservation')}
        onPress={() => toggleType('reservation')}
      />
      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
        {t('home.misActividades.filtersSectionStatus')}
      </Text>
      <FilterOptionRow
        mode="checkbox"
        title={t('home.misActividades.filterFinished')}
        selected={draftFinished}
        onPress={() => setDraftFinished((v) => !v)}
      />
    </FilterBottomSheet>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: filterTheme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  sectionLabelSpaced: {
    marginTop: theme.spacing.md,
  },
});
