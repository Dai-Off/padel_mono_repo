import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';
import type { SeasonPassBoostsDto } from '../../api/seasonPass';

const ACCENT = '#F18F34';

type SourceMeta = { icon: keyof typeof Ionicons.glyphMap; labelKey: string; descKey: string };

const SOURCE_META: Record<string, SourceMeta> = {
  lesson_streak: {
    icon: 'flame',
    labelKey: 'home.seasonPass.boostSourceStreak',
    descKey: 'home.seasonPass.boostSourceStreakDesc',
  },
  pass_reward: {
    icon: 'rocket',
    labelKey: 'home.seasonPass.boostSourceBooster',
    descKey: 'home.seasonPass.boostSourceBoosterDesc',
  },
  catch_up: {
    icon: 'hourglass',
    labelKey: 'home.seasonPass.boostSourceCatchUp',
    descKey: 'home.seasonPass.boostSourceCatchUpDesc',
  },
  event: {
    icon: 'sparkles',
    labelKey: 'home.seasonPass.boostSourceEvent',
    descKey: 'home.seasonPass.boostSourceEventDesc',
  },
};

type Props = {
  visible: boolean;
  onClose: () => void;
  totalPct: number;
  breakdown: SeasonPassBoostsDto['breakdown'];
};

/** Explica el boost de SP activo: cada fuente, cuánto aporta y por qué la tienes. */
export function BoostDetailSheet({ visible, onClose, totalPct, breakdown }: Props) {
  const { t } = useTranslation();
  const tr = t as unknown as (key: string, params?: Record<string, unknown>) => string;

  const expiresLabel = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return null;
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return tr('home.seasonPass.boostExpiresIn', { time: h >= 1 ? `${h}h` : `${m}min` });
  };

  return (
    <FilterBottomSheet visible={visible} title={tr('home.seasonPass.boostDetailTitle')} onClose={onClose}>
      <View style={styles.content}>
        <View style={styles.totalRow}>
          <Ionicons name="flash" size={18} color={ACCENT} />
          <Text style={styles.totalTxt}>+{totalPct}% SP</Text>
        </View>
        <Text style={styles.intro}>{tr('home.seasonPass.boostDetailIntro')}</Text>

        <View style={styles.list}>
          {breakdown.map((b, i) => {
            const meta = SOURCE_META[b.source] ?? SOURCE_META.event;
            const exp = expiresLabel(b.expires_at);
            return (
              <View key={`${b.source}-${i}`} style={styles.row}>
                <View style={styles.rowIcon}>
                  <Ionicons name={meta.icon} size={16} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.rowLabel}>{tr(meta.labelKey)}</Text>
                    <Text style={styles.rowPct}>+{Math.round(b.bonus * 100)}%</Text>
                  </View>
                  <Text style={styles.rowDesc}>{tr(meta.descKey)}</Text>
                  {exp ? <Text style={styles.rowExp}>{exp}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </FilterBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 8 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 6 },
  totalTxt: { color: ACCENT, fontSize: 24, fontWeight: '900' },
  intro: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 18 },
  list: { gap: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(241,143,52,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { color: '#fff', fontSize: 14, fontWeight: '800' },
  rowPct: { color: ACCENT, fontSize: 14, fontWeight: '900' },
  rowDesc: { color: '#9CA3AF', fontSize: 12, lineHeight: 16, marginTop: 2 },
  rowExp: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '600', marginTop: 4 },
});
