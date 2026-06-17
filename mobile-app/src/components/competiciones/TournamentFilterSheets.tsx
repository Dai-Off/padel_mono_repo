import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';
import { FilterApplyFooter } from '../filters/FilterApplyFooter';
import { FilterOptionRow } from '../partidos/FilterOptionRow';
import { FilterPill } from '../filters/FilterPill';
import { filterTheme } from '../filters/filterTheme';
import type { TournamentFiltersState } from '../../domain/tournamentFilters';
import {
  formatFormatLabel,
  type TournamentFormatFilter,
  type TournamentLevelFilter,
} from '../../domain/tournamentDisplay';
import { TOURNAMENT_FORMAT_OPTIONS, TOURNAMENT_LEVEL_OPTIONS } from '../../domain/tournamentFilters';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';

export type TournamentSheetKind = 'format' | 'level' | 'all' | null;

type TournamentFilterSheetsProps = {
  kind: TournamentSheetKind;
  draft: TournamentFiltersState;
  showJoinableSection: boolean;
  resultCount: number;
  onClose: () => void;
  onApply: (next: TournamentFiltersState) => void;
};

function levelLabel(key: TournamentLevelFilter, t: (key: string) => string): string {
  if (key === 'all') return t('common.allOption');
  if (key === 'principiante') return t('torneos.filterLevelBeginner');
  if (key === 'medio') return t('torneos.filterLevelMedium');
  return t('torneos.filterLevelAdvanced');
}

export function TournamentFilterSheets({
  kind,
  draft,
  showJoinableSection,
  resultCount,
  onClose,
  onApply,
}: TournamentFilterSheetsProps) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(draft);
  const visible = kind != null;

  useEffect(() => {
    if (visible) setLocal(draft);
  }, [visible, draft]);

  const applyAndClose = (next: TournamentFiltersState) => {
    onApply(next);
    onClose();
  };

  const footer = (next: TournamentFiltersState) => (
    <FilterApplyFooter
      resultCount={resultCount}
      singularLabel={t('torneos.seeOneTournament')}
      pluralLabel={t('torneos.seeManyTournaments', { count: resultCount })}
      onPress={() => applyAndClose(next)}
    />
  );

  if (kind === 'format') {
    return (
      <FilterBottomSheet
        visible={visible}
        title={t('torneos.filterFormatDefault')}
        onClose={onClose}
        footer={footer(local)}
      >
        <View style={styles.chipRow}>
          {TOURNAMENT_FORMAT_OPTIONS.map((key) => (
            <FilterPill
              key={key}
              label={key === 'all' ? t('common.allOption') : formatFormatLabel(key, t)}
              selected={local.format === key}
              onPress={() => applyAndClose({ ...local, format: key })}
            />
          ))}
        </View>
      </FilterBottomSheet>
    );
  }

  if (kind === 'level') {
    return (
      <FilterBottomSheet
        visible={visible}
        title={t('torneos.filterLevelDefault')}
        onClose={onClose}
        footer={footer(local)}
      >
        <View style={styles.chipRow}>
          {TOURNAMENT_LEVEL_OPTIONS.map((key) => (
            <FilterPill
              key={key}
              label={levelLabel(key, t)}
              selected={local.level === key}
              onPress={() => applyAndClose({ ...local, level: key })}
            />
          ))}
        </View>
      </FilterBottomSheet>
    );
  }

  if (kind === 'all') {
    return (
      <FilterBottomSheet
        visible={visible}
        title={t('torneos.filterTitle')}
        onClose={onClose}
        onClear={() =>
          setLocal({
            format: 'all',
            level: 'all',
            joinableOnly: showJoinableSection,
          })
        }
        footer={footer(local)}
      >
        <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
          <Text style={styles.sectionTitle}>{t('torneos.filterFormatDefault')}</Text>
          <View style={styles.chipRow}>
            {TOURNAMENT_FORMAT_OPTIONS.map((key) => (
              <FilterPill
                key={key}
                label={key === 'all' ? t('common.allOption') : formatFormatLabel(key, t)}
                selected={local.format === key}
                onPress={() => setLocal((s) => ({ ...s, format: key }))}
              />
            ))}
          </View>

          <Text style={[styles.sectionTitle, styles.sectionGap]}>{t('torneos.filterLevelDefault')}</Text>
          <View style={styles.chipRow}>
            {TOURNAMENT_LEVEL_OPTIONS.map((key) => (
              <FilterPill
                key={key}
                label={levelLabel(key, t)}
                selected={local.level === key}
                onPress={() => setLocal((s) => ({ ...s, level: key }))}
              />
            ))}
          </View>

          {showJoinableSection ? (
            <>
              <Text style={[styles.sectionTitle, styles.sectionGap]}>{t('torneos.filterAvailability')}</Text>
              <FilterOptionRow
                mode="radio"
                title={t('torneos.filterJoinableOption')}
                selected={local.joinableOnly}
                onPress={() => setLocal((s) => ({ ...s, joinableOnly: true }))}
              />
              <FilterOptionRow
                mode="radio"
                title={t('torneos.filterShowAll')}
                subtitle={t('torneos.filterShowAllSub')}
                selected={!local.joinableOnly}
                onPress={() => setLocal((s) => ({ ...s, joinableOnly: false }))}
              />
            </>
          ) : null}
        </ScrollView>
      </FilterBottomSheet>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 400 },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: filterTheme.text,
    marginBottom: theme.spacing.sm,
  },
  sectionGap: { marginTop: theme.spacing.lg },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.md,
  },
});
