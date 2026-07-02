import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatLocale, useTranslation } from '../../i18n';
import { filterTheme } from '../filters/filterTheme';
import { theme } from '../../theme';
import { MultiDateStripPicker } from '../partidos/MultiDateStripPicker';
import {
  DAY_END_MIN,
  DAY_START_MIN,
  MATCH_DURATION_MIN,
  defaultRange,
  halfHourOptions,
  hhmmToMinutes,
  minutesToHhmm,
  type DaySlots,
  type TimeRange,
} from '../../lib/matchAvailabilityWindow';

const ACCENT = '#F18F34';

type Props = {
  value: DaySlots[];
  onChange: (next: DaySlots[]) => void;
};

/** Selector de disponibilidad: uno o varios días, con uno o varios tramos "desde/hasta" por día. */
export function AvailabilitySelector({ value, onChange }: Props) {
  const { t, locale } = useTranslation();
  const selectedDateKeys = value.map((d) => d.dateKey);

  const setDays = (keys: string[]) => {
    const existing = new Map(value.map((d) => [d.dateKey, d] as const));
    const next = [...keys]
      .sort()
      .map((k) => existing.get(k) ?? { dateKey: k, ranges: [defaultRange()] });
    onChange(next);
  };

  const updateRanges = (dateKey: string, ranges: TimeRange[]) => {
    onChange(value.map((d) => (d.dateKey === dateKey ? { ...d, ranges } : d)));
  };

  const dayLabel = (dateKey: string): string => {
    const d = new Date(`${dateKey}T12:00:00`);
    return d
      .toLocaleDateString(formatLocale(locale), { weekday: 'long', day: 'numeric', month: 'short' })
      .replace('.', '');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Ionicons name="time-outline" size={14} color={ACCENT} />
        <Text style={styles.title}>{t('competitive.screen.prefs.availabilityTitle')}</Text>
      </View>
      <Text style={styles.hint}>{t('competitive.screen.prefs.availabilityHint')}</Text>

      <MultiDateStripPicker selectedDateKeys={selectedDateKeys} onChange={setDays} />

      {value.map((day) => (
        <View key={day.dateKey} style={styles.dayCard}>
          <Text style={styles.dayLabel}>{dayLabel(day.dateKey)}</Text>
          {day.ranges.map((range, i) => (
            <TimeRangeRow
              key={i}
              range={range}
              removable={day.ranges.length > 1}
              onChange={(nr) => updateRanges(day.dateKey, day.ranges.map((x, j) => (j === i ? nr : x)))}
              onRemove={() => updateRanges(day.dateKey, day.ranges.filter((_, j) => j !== i))}
            />
          ))}
          <Pressable
            style={styles.addRange}
            onPress={() => updateRanges(day.dateKey, [...day.ranges, defaultRange()])}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={16} color={ACCENT} />
            <Text style={styles.addRangeText}>{t('competitive.screen.prefs.availabilityAddRange')}</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.note}>{t('competitive.screen.prefs.availabilityUntilNote')}</Text>
    </View>
  );
}

type RowProps = {
  range: TimeRange;
  removable: boolean;
  onChange: (r: TimeRange) => void;
  onRemove: () => void;
};

function TimeRangeRow({ range, removable, onChange, onRemove }: RowProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<null | 'from' | 'until'>(null);
  const fromMin = hhmmToMinutes(range.from);

  // "Desde": cualquier :00/:30 que deje hueco de 90 min antes del cierre.
  const fromOptions = halfHourOptions(DAY_START_MIN, DAY_END_MIN - MATCH_DURATION_MIN);
  // "Hasta": desde 90 min después del inicio hasta el cierre.
  const untilOptions = halfHourOptions(fromMin + MATCH_DURATION_MIN, DAY_END_MIN);

  const setFrom = (v: string) => {
    const vMin = hhmmToMinutes(v);
    let until = range.until;
    if (hhmmToMinutes(until) < vMin + MATCH_DURATION_MIN) until = minutesToHhmm(vMin + MATCH_DURATION_MIN);
    onChange({ from: v, until });
    setOpen(null);
  };
  const setUntil = (v: string) => {
    onChange({ ...range, until: v });
    setOpen(null);
  };

  return (
    <View style={styles.rangeWrap}>
      <View style={styles.rangeRow}>
        <TimeField
          label={t('competitive.screen.prefs.availabilityFrom')}
          value={range.from}
          active={open === 'from'}
          onPress={() => setOpen(open === 'from' ? null : 'from')}
        />
        <TimeField
          label={t('competitive.screen.prefs.availabilityUntil')}
          value={range.until}
          active={open === 'until'}
          onPress={() => setOpen(open === 'until' ? null : 'until')}
        />
        {removable ? (
          <Pressable style={styles.removeBtn} onPress={onRemove} accessibilityRole="button">
            <Ionicons name="close" size={16} color={filterTheme.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {open === 'from' ? <OptionsStrip options={fromOptions} value={range.from} onSelect={setFrom} /> : null}
      {open === 'until' ? <OptionsStrip options={untilOptions} value={range.until} onSelect={setUntil} /> : null}
    </View>
  );
}

function TimeField({
  label,
  value,
  active,
  onPress,
}: {
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.field, active && styles.fieldActive]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldValueRow}>
        <Text style={styles.fieldValue}>{value}</Text>
        <Ionicons name={active ? 'chevron-up' : 'chevron-down'} size={14} color={filterTheme.textMuted} />
      </View>
    </Pressable>
  );
}

function OptionsStrip({
  options,
  value,
  onSelect,
}: {
  options: string[];
  value: string;
  onSelect: (v: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onSelect(opt)}
            style={[styles.optionChip, selected && styles.optionChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.optionChipText, selected && styles.optionChipTextActive]}>{opt}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: theme.fontSize.sm, fontWeight: '700', color: filterTheme.text },
  hint: { fontSize: theme.fontSize.xs, color: filterTheme.textMuted },
  dayCard: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: filterTheme.chipBorder,
    backgroundColor: filterTheme.chipBg,
    gap: theme.spacing.xs,
  },
  dayLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: filterTheme.text,
    textTransform: 'capitalize',
  },
  rangeWrap: { gap: 6 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  field: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: filterTheme.pillUnselectedBorder,
    backgroundColor: filterTheme.pillUnselectedBg,
  },
  fieldActive: { borderColor: filterTheme.accentBorder, backgroundColor: filterTheme.accentMuted },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: filterTheme.textMuted, letterSpacing: 0.3 },
  fieldValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  fieldValue: { fontSize: theme.fontSize.base, fontWeight: '700', color: filterTheme.text },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: filterTheme.chipBorder,
  },
  strip: { flexDirection: 'row', gap: theme.spacing.xs, paddingVertical: 4 },
  optionChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: filterTheme.pillUnselectedBorder,
    backgroundColor: filterTheme.pillUnselectedBg,
  },
  optionChipActive: { backgroundColor: filterTheme.pillSelectedBg, borderColor: filterTheme.pillSelectedBg },
  optionChipText: { fontSize: theme.fontSize.sm, fontWeight: '600', color: filterTheme.text },
  optionChipTextActive: { color: '#fff' },
  addRange: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  addRangeText: { fontSize: theme.fontSize.sm, fontWeight: '700', color: ACCENT },
  note: { fontSize: theme.fontSize.xs, color: filterTheme.textMuted, fontStyle: 'italic' },
});
