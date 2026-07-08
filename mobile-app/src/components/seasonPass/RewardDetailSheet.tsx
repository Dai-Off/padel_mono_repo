import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../../i18n';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';
import { RARITY_CONFIG, type AchievementRarity } from '../../design/rarity';
import { resolveUnlockableIcon } from '../../design/unlockableIcons';
import type { SeasonPassTrackRewardDto } from '../../api/seasonPass';

export type RewardDetailTarget = {
  level: number;
  reward: SeasonPassTrackRewardDto;
};

type Props = {
  target: RewardDetailTarget | null;
  onClose: () => void;
};

const KIND_LABEL: Record<string, string> = {
  title: 'Título',
  frame: 'Marco',
  badge: 'Insignia',
  trophy: 'Trofeo',
  sp: 'Season Points',
  sp_boost: 'Boost de SP',
};

/** Render grande del cosmético/recompensa (mismo lenguaje visual que el thumb). */
function BigReward({ reward }: { reward: SeasonPassTrackRewardDto }) {
  const d = reward.display;
  const rarity = RARITY_CONFIG[(d.rarity as AchievementRarity) ?? 'common'] ?? RARITY_CONFIG.common;
  const SIZE = 96;

  if (d.kind === 'frame') {
    const palette =
      Array.isArray(d.colors) && d.colors.length >= 2
        ? (d.colors as [string, string, ...string[]])
        : ([rarity.color, rarity.border] as [string, string]);
    return (
      <LinearGradient
        colors={palette}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.big, { borderRadius: SIZE / 2 }]}
      >
        <View style={{ width: SIZE - 26, height: SIZE - 26, borderRadius: (SIZE - 26) / 2, backgroundColor: '#0F0F0F' }} />
      </LinearGradient>
    );
  }
  if (d.kind === 'sp') {
    return (
      <View style={[styles.big, { backgroundColor: 'rgba(241,143,52,0.12)', borderColor: 'rgba(241,143,52,0.3)', borderWidth: 1 }]}>
        <Text style={{ color: '#F18F34', fontSize: 22, fontWeight: '900' }}>{d.label.replace(' SP', '')}</Text>
        <Text style={{ color: '#F18F34', fontSize: 12, fontWeight: '700' }}>SP</Text>
      </View>
    );
  }
  if (d.kind === 'sp_boost') {
    return (
      <View style={[styles.big, { backgroundColor: 'rgba(241,143,52,0.12)', borderColor: 'rgba(241,143,52,0.3)', borderWidth: 1 }]}>
        <Text style={{ fontSize: 34 }}>🚀</Text>
      </View>
    );
  }
  // title / badge / trophy
  return (
    <View style={[styles.big, { backgroundColor: rarity.bg, borderColor: rarity.border, borderWidth: 1 }]}>
      <Ionicons name={resolveUnlockableIcon(d.icon)} size={40} color={rarity.color} />
    </View>
  );
}

export function RewardDetailSheet({ target, onClose }: Props) {
  const { t } = useTranslation();
  const reward = target?.reward;
  const d = reward?.display;
  const rarity = d ? RARITY_CONFIG[(d.rarity as AchievementRarity) ?? 'common'] ?? RARITY_CONFIG.common : null;

  const statusLabel =
    reward?.status === 'granted'
      ? t('alerts.seasonPass.rewardGranted')
      : reward?.status === 'unlocked'
        ? t('alerts.seasonPass.rewardUnlocked')
        : t('alerts.seasonPass.rewardLocked', { level: target?.level ?? 0 });

  return (
    <FilterBottomSheet
      visible={target !== null}
      title={t('alerts.seasonPass.rewardDetailTitle', { level: target?.level ?? 0 })}
      onClose={onClose}
    >
      {reward && d ? (
        <View style={styles.content}>
          <BigReward reward={reward} />

          <Text style={styles.name}>{d.label || KIND_LABEL[d.kind] || '—'}</Text>

          <View style={styles.chips}>
            <View style={[styles.chip, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <Text style={styles.chipTxt}>{KIND_LABEL[d.kind] ?? d.kind}</Text>
            </View>
            {rarity && d.rarity ? (
              <View style={[styles.chip, { backgroundColor: rarity.bg, borderColor: rarity.border, borderWidth: 1 }]}>
                <Text style={[styles.chipTxt, { color: rarity.color }]}>{rarity.label}</Text>
              </View>
            ) : null}
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: reward.tier === 'elite' ? 'rgba(250,204,21,0.12)' : 'rgba(255,255,255,0.06)',
                  borderColor: reward.tier === 'elite' ? 'rgba(250,204,21,0.35)' : 'transparent',
                  borderWidth: reward.tier === 'elite' ? 1 : 0,
                },
              ]}
            >
              <Text style={[styles.chipTxt, reward.tier === 'elite' && { color: '#facc15' }]}>
                {reward.tier === 'elite' ? t('alerts.seasonPass.legendElite') : t('alerts.seasonPass.legendFree')}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.statusRow,
              reward.status === 'granted'
                ? styles.statusGranted
                : reward.status === 'unlocked'
                  ? styles.statusUnlocked
                  : styles.statusLocked,
            ]}
          >
            <Ionicons
              name={reward.status === 'locked' ? 'lock-closed' : 'checkmark-circle'}
              size={16}
              color={reward.status === 'locked' ? '#9ca3af' : '#34d399'}
            />
            <Text
              style={[
                styles.statusTxt,
                { color: reward.status === 'locked' ? '#9ca3af' : '#34d399' },
              ]}
            >
              {statusLabel}
            </Text>
          </View>
        </View>
      ) : null}
    </FilterBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', paddingBottom: 8 },
  big: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  name: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  chipTxt: { color: '#d1d5db', fontSize: 12, fontWeight: '700' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  statusGranted: { backgroundColor: 'rgba(16,185,129,0.1)' },
  statusUnlocked: { backgroundColor: 'rgba(16,185,129,0.08)' },
  statusLocked: { backgroundColor: 'rgba(255,255,255,0.05)' },
  statusTxt: { fontSize: 13, fontWeight: '700' },
});
