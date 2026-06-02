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

export type TournamentSheetKind = 'format' | 'level' | 'all' | null;

type TournamentFilterSheetsProps = {
  kind: TournamentSheetKind;
  draft: TournamentFiltersState;
  showJoinableSection: boolean;
  resultCount: number;
  onClose: () => void;
  onApply: (next: TournamentFiltersState) => void;
};

function levelLabel(key: TournamentLevelFilter): string {
  if (key === 'all') return 'Todos';
  if (key === 'principiante') return 'Principiante';
  if (key === 'medio') return 'Medio';
  return 'Avanzado';
}

export function TournamentFilterSheets({
  kind,
  draft,
  showJoinableSection,
  resultCount,
  onClose,
  onApply,
}: TournamentFilterSheetsProps) {
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
      singularLabel="Ver 1 torneo"
      pluralLabel={`Ver ${resultCount} torneos`}
      onPress={() => applyAndClose(next)}
    />
  );

  if (kind === 'format') {
    return (
      <FilterBottomSheet
        visible={visible}
        title="Formato"
        onClose={onClose}
        footer={footer(local)}
      >
        <View style={styles.chipRow}>
          {TOURNAMENT_FORMAT_OPTIONS.map((key) => (
            <FilterPill
              key={key}
              label={key === 'all' ? 'Todos' : formatFormatLabel(key)}
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
        title="Nivel"
        onClose={onClose}
        footer={footer(local)}
      >
        <View style={styles.chipRow}>
          {TOURNAMENT_LEVEL_OPTIONS.map((key) => (
            <FilterPill
              key={key}
              label={levelLabel(key)}
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
        title="Filtros"
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
          <Text style={styles.sectionTitle}>Formato</Text>
          <View style={styles.chipRow}>
            {TOURNAMENT_FORMAT_OPTIONS.map((key) => (
              <FilterPill
                key={key}
                label={key === 'all' ? 'Todos' : formatFormatLabel(key)}
                selected={local.format === key}
                onPress={() => setLocal((s) => ({ ...s, format: key }))}
              />
            ))}
          </View>

          <Text style={[styles.sectionTitle, styles.sectionGap]}>Nivel</Text>
          <View style={styles.chipRow}>
            {TOURNAMENT_LEVEL_OPTIONS.map((key) => (
              <FilterPill
                key={key}
                label={levelLabel(key)}
                selected={local.level === key}
                onPress={() => setLocal((s) => ({ ...s, level: key }))}
              />
            ))}
          </View>

          {showJoinableSection ? (
            <>
              <Text style={[styles.sectionTitle, styles.sectionGap]}>Disponibilidad</Text>
              <FilterOptionRow
                mode="radio"
                title="Solo torneos a los que me puedo unir"
                selected={local.joinableOnly}
                onPress={() => setLocal((s) => ({ ...s, joinableOnly: true }))}
              />
              <FilterOptionRow
                mode="radio"
                title="Mostrar todos"
                subtitle="Incluye torneos fuera de mi nivel o completos"
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
