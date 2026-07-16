import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTranslation } from '../../i18n';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';
import { RARITY_CONFIG, type AchievementRarity } from '../../design/rarity';
import { resolveUnlockableIcon } from '../../design/unlockableIcons';
import { Pressable } from 'react-native';
import { AvatarWithFrame } from '../profile/AvatarWithFrame';
import { PlayerName } from '../profile/PlayerName';
import { ProfileThemeBackground } from '../profile/ProfileThemeBackground';
import type { SeasonPassTrackRewardDto } from '../../api/seasonPass';

export type RewardDetailTarget = {
  level: number;
  reward: SeasonPassTrackRewardDto;
};

type Props = {
  target: RewardDetailTarget | null;
  onClose: () => void;
  hasElite: boolean;
  currentLevel: number;
  playerAvatarUrl: string | null;
  playerInitials: string;
  onGetElite: () => void;
  onClaim?: (reward: SeasonPassTrackRewardDto) => void;
  claiming?: boolean;
  onGoToProfile?: () => void;
};

const EQUIPPABLE = ['title', 'frame', 'badge', 'trophy', 'name_color', 'theme'];

export const KIND_LABEL: Record<string, string> = {
  title: 'Título',
  frame: 'Marco',
  badge: 'Insignia',
  trophy: 'Trofeo',
  sp: 'Season Points',
  sp_boost: 'Boost de SP',
  reroll_token: 'Token de cambio',
  name_color: 'Color de nombre',
  theme: 'Tema de perfil',
};

/** Render fiel del cosmético/recompensa — tal como se verá en el perfil. */
export function BigReward({
  reward,
  avatarUrl,
  initials,
}: {
  reward: SeasonPassTrackRewardDto;
  avatarUrl: string | null;
  initials: string;
}) {
  const d = reward.display;
  const rarity = RARITY_CONFIG[(d.rarity as AchievementRarity) ?? 'common'] ?? RARITY_CONFIG.common;

  if (d.kind === 'frame') {
    // Marco animado real sobre el avatar del jugador (como quedará en su perfil).
    return (
      <AvatarWithFrame
        initials={initials}
        avatarUrl={avatarUrl}
        size={92}
        animate
        frame={{
          rarity: (d.rarity as AchievementRarity) ?? 'common',
          style: d.style,
          animationType: d.animation_type,
          colors: d.colors,
        }}
      />
    );
  }
  if (d.kind === 'title') {
    // El título con su color de rareza y glow (así se lee en el perfil).
    return (
      <Text
        style={{
          color: rarity.color,
          fontSize: 26,
          fontWeight: '900',
          textAlign: 'center',
          textShadowColor: rarity.glow,
          textShadowRadius: 16,
          textShadowOffset: { width: 0, height: 0 },
        }}
      >
        {d.label}
      </Text>
    );
  }
  if (d.kind === 'sp') {
    return (
      <LinearGradient
        colors={['#F8A94E', '#E95F32']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.spCoin}
      >
        <Text style={styles.spBig}>{d.label.replace(' SP', '')}</Text>
        <Text style={styles.spUnit}>SP</Text>
      </LinearGradient>
    );
  }
  if (d.kind === 'sp_boost') {
    return (
      <LinearGradient
        colors={['#F8A94E', '#E95F32']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.spCoin}
      >
        <Text style={{ fontSize: 40 }}>🚀</Text>
      </LinearGradient>
    );
  }
  if (d.kind === 'reroll_token') {
    return (
      <LinearGradient
        colors={['#F8A94E', '#E95F32']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.spCoin}
      >
        <Ionicons name="dice" size={44} color="#fff" />
      </LinearGradient>
    );
  }
  if (d.kind === 'name_color') {
    const cols = Array.isArray(d.colors) ? (d.colors as string[]) : null;
    return (
      <PlayerName
        name="Nombre"
        nameColor={cols ? { id: '', rarity: (d.rarity as AchievementRarity) ?? 'common', colors: cols } : null}
        style={{ fontSize: 30, fontWeight: '900', color: rarity.color }}
      />
    );
  }
  if (d.kind === 'theme') {
    const cols = Array.isArray(d.colors) ? (d.colors as string[]) : null;
    return (
      <View style={{ width: 168, height: 104, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: rarity.color }}>
        <ProfileThemeBackground
          theme={cols ? { id: '', rarity: (d.rarity as AchievementRarity) ?? 'common', colors: cols, animationType: d.animation_type ?? null } : null}
          scrim={false}
        />
      </View>
    );
  }
  // badge / trophy: icono grande con anillo + glow de rareza.
  return (
    <View
      style={[
        styles.badgeRing,
        {
          borderColor: rarity.color,
          backgroundColor: rarity.bg,
          shadowColor: rarity.glow,
        },
      ]}
    >
      <Ionicons name={resolveUnlockableIcon(d.icon)} size={44} color={rarity.color} />
    </View>
  );
}

export function RewardDetailSheet({
  target,
  onClose,
  hasElite,
  currentLevel,
  playerAvatarUrl,
  playerInitials,
  onGetElite,
  onClaim,
  claiming,
  onGoToProfile,
}: Props) {
  const { t } = useTranslation();
  const reward = target?.reward;
  const d = reward?.display;
  const equippable = d ? EQUIPPABLE.includes(d.kind) : false;
  const rarity = d ? RARITY_CONFIG[(d.rarity as AchievementRarity) ?? 'common'] ?? RARITY_CONFIG.common : null;
  const glowy = d?.rarity === 'epic' || d?.rarity === 'legendary';

  // Recompensa Elite bloqueada porque falta el pase (el nivel ya está alcanzado):
  // se muestra un CTA de compra en vez del típico "alcanza el nivel N".
  const needsElite =
    reward?.status === 'locked' &&
    reward.tier === 'elite' &&
    !hasElite &&
    (target?.level ?? 0) <= currentLevel;

  const isLocked = reward?.status === 'locked';
  const isClaimable = reward?.status === 'claimable';
  const statusLabel =
    reward?.status === 'claimed'
      ? t('alerts.seasonPass.rewardGranted')
      : isClaimable
        ? t('alerts.seasonPass.rewardClaimable')
        : needsElite
          ? t('alerts.seasonPass.rewardNeedsElite')
          : t('alerts.seasonPass.rewardLocked', { level: target?.level ?? 0 });
  const statusColor = isLocked ? '#9ca3af' : isClaimable ? '#F18F34' : '#34d399';

  return (
    <FilterBottomSheet
      visible={target !== null}
      title={t('alerts.seasonPass.rewardDetailTitle', { level: target?.level ?? 0 })}
      onClose={onClose}
    >
      {reward && d ? (
        <View style={styles.content}>
          {/* Halo de rareza detrás del premio: radial que se apaga dentro del
              área (con margen), así no deja bordes rectos. */}
          <View style={styles.heroArea}>
            {rarity ? (
              <View style={styles.haloWrap} pointerEvents="none">
                <Svg width="84%" height={118}>
                  <Defs>
                    <RadialGradient id="rarityHalo" cx="50%" cy="50%" rx="50%" ry="50%">
                      <Stop offset="0" stopColor={rarity.color} stopOpacity={glowy ? 0.4 : 0.24} />
                      <Stop offset="0.6" stopColor={rarity.color} stopOpacity={glowy ? 0.14 : 0.08} />
                      <Stop offset="1" stopColor={rarity.color} stopOpacity="0" />
                    </RadialGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="100%" fill="url(#rarityHalo)" />
                </Svg>
              </View>
            ) : null}
            <BigReward reward={reward} avatarUrl={playerAvatarUrl} initials={playerInitials} />
          </View>

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
              isLocked ? styles.statusLocked : isClaimable ? styles.statusClaimable : styles.statusGranted,
            ]}
          >
            <Ionicons
              name={isLocked ? 'lock-closed' : isClaimable ? 'gift' : 'checkmark-circle'}
              size={16}
              color={statusColor}
            />
            <Text style={[styles.statusTxt, { color: statusColor }]}>{statusLabel}</Text>
          </View>

          {isClaimable && onClaim ? (
            <Pressable
              onPress={() => onClaim(reward)}
              disabled={claiming}
              style={({ pressed }) => [styles.claimCta, claiming && { opacity: 0.7 }, pressed && !claiming && { opacity: 0.9 }]}
            >
              {claiming ? (
                <ActivityIndicator color="#0B1120" size="small" />
              ) : (
                <>
                  <Ionicons name="gift" size={16} color="#0B1120" />
                  <Text style={styles.claimCtaTxt}>{t('alerts.seasonPass.rewardClaim')}</Text>
                </>
              )}
            </Pressable>
          ) : null}

          {needsElite ? (
            <Pressable
              onPress={onGetElite}
              style={({ pressed }) => [styles.eliteCta, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="ribbon" size={16} color="#fff" />
              <Text style={styles.eliteCtaTxt}>{t('alerts.seasonPass.getEliteCta')}</Text>
            </Pressable>
          ) : null}

          {reward.status === 'claimed' && equippable && onGoToProfile ? (
            <Pressable
              onPress={() => {
                onClose();
                onGoToProfile();
              }}
              style={({ pressed }) => [styles.eliteCta, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="person-circle-outline" size={16} color="#fff" />
              <Text style={styles.eliteCtaTxt}>{t('alerts.seasonPass.rewardGoToProfile')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </FilterBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', paddingBottom: 8 },
  heroArea: { height: 128, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', marginBottom: 4 },
  haloWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  spCoin: {
    width: 92,
    height: 92,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#F18F34',
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  spBig: { color: '#fff', fontSize: 27, fontWeight: '900' },
  spUnit: { color: '#fff', fontSize: 13, fontWeight: '800', marginTop: -2 },
  badgeRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
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
  statusGranted: { backgroundColor: 'rgba(16,185,129,0.08)' },
  statusClaimable: { backgroundColor: 'rgba(241,143,52,0.1)' },
  statusLocked: { backgroundColor: 'rgba(255,255,255,0.05)' },
  statusTxt: { fontSize: 13, fontWeight: '700' },
  claimCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#F18F34',
  },
  claimCtaTxt: { color: '#0B1120', fontSize: 15, fontWeight: '800' },
  eliteCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#F18F34',
  },
  eliteCtaTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
