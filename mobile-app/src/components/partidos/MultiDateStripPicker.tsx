import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatLocale, useTranslation, type AppLocale } from '../../i18n';
import { addDaysToClubKey, dayKeyInClubTz } from '../../lib/clubTimeZone';
import { PARTIDOS_MAX_SELECTED_DAYS } from '../../domain/partidosFilters';
import { filterTheme } from '../filters/filterTheme';
import { theme } from '../../theme';
const DAYS_AHEAD = 21;

type MultiDateStripPickerProps = {
  selectedDateKeys: string[];
  onChange: (keys: string[]) => void;
};

function weekdayLabel(d: Date, index: number, todayLabel: string, locale: AppLocale): string {
  if (index === 0) return todayLabel;
  return d.toLocaleDateString(formatLocale(locale), { weekday: 'short' }).slice(0, 3).toUpperCase();
}

function monthShort(d: Date, locale: AppLocale): string {
  return d.toLocaleDateString(formatLocale(locale), { month: 'short' }).replace('.', '');
}

/** Selección múltiple de días (max. 7), estilo Playtomic. */
export function MultiDateStripPicker({ selectedDateKeys, onChange }: MultiDateStripPickerProps) {
  const { t, locale } = useTranslation();
  const todayKey = dayKeyInClubTz(new Date());
  const todayLabel = t('partidos.multiDateToday');

  const toggle = (key: string) => {
    if (selectedDateKeys.includes(key)) {
      onChange(selectedDateKeys.filter((k) => k !== key));
      return;
    }
    if (selectedDateKeys.length >= PARTIDOS_MAX_SELECTED_DAYS) return;
    onChange([...selectedDateKeys, key].sort());
  };

  return (
    <View>
      <Text style={styles.hint}>
        {t('partidos.multiDateHint', { max: PARTIDOS_MAX_SELECTED_DAYS })}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {Array.from({ length: DAYS_AHEAD }, (_, i) => {
          const key = addDaysToClubKey(todayKey, i);
          const d = new Date(`${key}T12:00:00`);
          const selected = selectedDateKeys.includes(key);
          return (
            <Pressable
              key={key}
              onPress={() => toggle(key)}
              style={({ pressed }) => [
                styles.pill,
                selected && styles.pillSelected,
                pressed && { opacity: 0.9 },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.weekday, selected && styles.textSelected]}>
                {weekdayLabel(d, i, todayLabel, locale)}
              </Text>
              <Text style={[styles.dayNum, selected && styles.textSelected]}>{d.getDate()}</Text>
              <Text style={[styles.month, selected && styles.textSelected]}>{monthShort(d, locale)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: theme.fontSize.xs,
    color: filterTheme.textMuted,
    marginBottom: theme.spacing.sm,
  },
  content: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingVertical: 4,
  },
  pill: {
    minWidth: 52,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: filterTheme.pillUnselectedBorder,
    backgroundColor: filterTheme.pillUnselectedBg,
  },
  pillSelected: {
    backgroundColor: filterTheme.pillSelectedBg,
    borderColor: filterTheme.pillSelectedBg,
  },
  weekday: {
    fontSize: 10,
    fontWeight: '700',
    color: filterTheme.textMuted,
    letterSpacing: 0.3,
  },
  dayNum: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: filterTheme.text,
    marginVertical: 2,
  },
  month: {
    fontSize: 10,
    color: filterTheme.textMuted,
    textTransform: 'capitalize',
  },
  textSelected: { color: '#fff' },
});
