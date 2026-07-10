import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import { fetchPublicPlayerProfile, type PublicPlayerProfile } from '../api/players';
import {
  fetchPlayerLevelHistory,
  fetchPlayerStats,
  type LevelHistory,
  type LevelHistoryLimit,
  type PlayerStats,
} from '../api/profileStats';
import { fetchPlayerPublicCustomization, type PublicProfileCustomization } from '../api/profileCustomization';
import { PlayerName } from '../components/profile/PlayerName';
import { AvatarWithFrame } from '../components/profile/AvatarWithFrame';
import { AnimatedTitle } from '../components/profile/AnimatedTitle';
import { LigaChip } from '../components/profile/LigaChip';
import { LevelEvolutionCard } from '../components/profile/LevelEvolutionCard';
import { SkillRadarCard } from '../components/profile/SkillRadarCard';
import { StatsCard } from '../components/profile/StatsCard';
import { TrophyShowcaseSection } from '../components/profile/TrophyShowcaseSection';
import { PlayerPreferencesCard } from '../components/profile/PlayerPreferencesCard';
import { FrequentClubsCard } from '../components/profile/FrequentClubsCard';
import { FrequentPartnersCard } from '../components/profile/FrequentPartnersCard';
import { fetchFrequentClubs, fetchFrequentPartners, type FrequentClub, type FrequentPartner } from '../api/profileSocial';
import { RARITY_CONFIG } from '../design/rarity';
import { isFeatureHidden } from '../config';

type PublicProfileScreenProps = {
  playerId: string;
  onBack: () => void;
  onChatPress?: (playerId: string, name: string) => void;
  onOpenMatch?: (matchId: string) => void;
  onOpenPlayer?: (playerId: string) => void;
};

function getInitials(firstName?: string | null, lastName?: string | null): string {
  if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase();
  if (firstName) return firstName.substring(0, 2).toUpperCase();
  return '??';
}

export function PublicProfileScreen({ playerId, onBack, onChatPress, onOpenMatch, onOpenPlayer }: PublicProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { t } = useTranslation();
  const token = session?.access_token ?? null;

  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [customization, setCustomization] = useState<PublicProfileCustomization | null>(null);
  const [levelHistory, setLevelHistory] = useState<LevelHistory | null>(null);
  const [levelLimit, setLevelLimit] = useState<LevelHistoryLimit>('5');
  const [levelLoading, setLevelLoading] = useState(true);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [frequentClubs, setFrequentClubs] = useState<FrequentClub[]>([]);
  const [frequentPartners, setFrequentPartners] = useState<FrequentPartner[]>([]);
  const [socialLoading, setSocialLoading] = useState(true);

  // Datos base + personalización (gate del spinner)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchPublicPlayerProfile(playerId, token), fetchPlayerPublicCustomization(playerId)])
      .then(([p, c]) => {
        if (cancelled) return;
        setProfile(p);
        setCustomization(c);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId, token]);

  // Estadísticas (independiente)
  useEffect(() => {
    let cancelled = false;
    fetchPlayerStats(token, playerId).then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, [playerId, token]);

  // Clubs y compañeros frecuentes (públicos)
  useEffect(() => {
    let cancelled = false;
    setSocialLoading(true);
    Promise.all([fetchFrequentClubs(playerId), fetchFrequentPartners(playerId)])
      .then(([c, p]) => {
        if (cancelled) return;
        setFrequentClubs(c);
        setFrequentPartners(p);
      })
      .finally(() => {
        if (!cancelled) setSocialLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  // Evolución del nivel (recarga al cambiar el límite)
  useEffect(() => {
    let cancelled = false;
    setLevelLoading(true);
    fetchPlayerLevelHistory(playerId, levelLimit)
      .then((h) => {
        if (!cancelled) setLevelHistory(h);
      })
      .finally(() => {
        if (!cancelled) setLevelLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId, levelLimit]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#F18F34" size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{t('profile.publicProfileLoadFail')}</Text>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{t('profile.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const initials = getInitials(profile.firstName, profile.lastName);
  const displayName = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || t('profile.playerFallback');
  const usernameLine = profile.username ? `@${profile.username}` : null;
  const pinnedBadges = customization?.pinnedBadges ?? [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.headerContent}>
          <Pressable onPress={onBack} style={styles.headerIconBtn} accessibilityLabel={t('profile.back')}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('profile.publicProfileHeaderTitle', { name: profile.firstName ?? '' })}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover del jugador */}
        <View style={styles.coverWrap}>
          {profile.coverUrl?.trim() ? (
            <Image source={{ uri: profile.coverUrl }} style={styles.coverImg} resizeMode="cover" />
          ) : (
            <LinearGradient colors={['#1a1a1a', '#0F0F0F', '#0F0F0F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.coverImg} />
          )}
          <LinearGradient colors={['rgba(241,143,52,0.25)', 'transparent', '#0F0F0F']} style={StyleSheet.absoluteFill} />
        </View>

        {/* Hero */}
        <View style={styles.heroWrap}>
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                <AvatarWithFrame
                  avatarUrl={profile.avatarUrl}
                  initials={initials}
                  size={80}
                  frame={customization?.frame ?? null}
                  level={profile.eloRating != null && Number.isFinite(profile.eloRating) ? profile.eloRating : null}
                />
                <LigaChip liga={profile.liga} style={{ marginTop: 16 }} />
              </View>
              <View style={styles.profileInfo}>
                {customization?.titleId ? (
                  <View style={{ marginBottom: 2 }}>
                    <AnimatedTitle titleId={customization.titleId} />
                  </View>
                ) : null}
                <PlayerName
                  name={displayName}
                  nameColor={customization?.nameColor}
                  style={styles.profileName}
                />
                {usernameLine ? <Text style={styles.usernameText}>{usernameLine}</Text> : null}
                {pinnedBadges.length > 0 ? (
                  <View style={styles.pinnedRow}>
                    {pinnedBadges.map((b) => {
                      const conf = RARITY_CONFIG[b.rarity];
                      return (
                        <View key={b.id} style={[styles.pinnedBadge, { backgroundColor: conf.bg, borderColor: conf.border }]}>
                          <Ionicons name={b.icon as keyof typeof Ionicons.glyphMap} size={12} color={conf.color} />
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profile.matchesPlayedTotal ?? 0}</Text>
                <Text style={styles.statLabel}>{t('profile.matchesStat')}</Text>
              </View>
              {!isFeatureHidden('profile.followCounts') && (
                <>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>--</Text>
                    <Text style={styles.statLabel}>{t('profile.followersStat')}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>--</Text>
                    <Text style={styles.statLabel}>{t('profile.followingStat')}</Text>
                  </View>
                </>
              )}
            </View>

            {/* Acciones: Seguir (placeholder) + Mensaje (chat) */}
            <View style={styles.actionButtonsRow}>
              {!isFeatureHidden('profile.follow') && (
                <Pressable style={styles.followBtn} onPress={() => {}}>
                  <Text style={styles.followText}>{t('profile.followBtn')}</Text>
                </Pressable>
              )}
              <Pressable style={styles.messageBtn} onPress={() => onChatPress?.(profile.id, displayName)}>
                <Ionicons name="chatbubble-outline" size={14} color="#F18F34" />
                <Text style={styles.messageText}>{t('profile.messageBtn')}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Radar de nivel (identidad del jugador; el perfil ajeno solo muestra esto del Coach) */}
        {profile.coachAssessment?.skills ? (
          <SkillRadarCard
            skills={profile.coachAssessment.skills}
            levelName={profile.coachAssessment.level_name}
          />
        ) : null}

        {/* Evolución del nivel */}
        <LevelEvolutionCard
          matches={levelHistory?.matches ?? []}
          currentElo={levelHistory?.currentElo ?? profile.eloRating ?? 0}
          limit={levelLimit}
          onChangeLimit={setLevelLimit}
          loading={levelLoading}
          onOpenMatch={onOpenMatch}
        />

        {/* Estadísticas */}
        <StatsCard stats={stats} loading={stats == null} />

        {/* Vitrina de logros (solo visibles) */}
        <TrophyShowcaseSection playerId={playerId} />

        {/* Preferencias de jugador */}
        <PlayerPreferencesCard
          dominantHand={profile.dominantHand}
          preferredSide={profile.preferredSide}
          preferredPlayStyle={profile.preferredPlayStyle}
        />

        {/* Personas con las que juega */}
        <FrequentPartnersCard
          title={t('profile.publicPartnersTitle', { name: profile.firstName ?? '' }).trim()}
          partners={frequentPartners}
          loading={socialLoading}
          onOpenPlayer={onOpenPlayer}
        />

        {/* Clubs donde juega (al final) */}
        <FrequentClubsCard
          title={t('profile.publicClubsTitle', { name: profile.firstName ?? '' }).trim()}
          clubs={frequentClubs}
          loading={socialLoading}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { zIndex: 100, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerIconBtn: { padding: 8, borderRadius: 12 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff', marginLeft: 12 },
  scroll: { flex: 1 },
  coverWrap: { position: 'relative', height: 128, overflow: 'hidden' },
  coverImg: { width: '100%', height: 128 },
  heroWrap: { paddingHorizontal: 16, marginTop: -40, zIndex: 10 },
  profileCard: {
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
  },
  profileHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  avatarContainer: { marginTop: -40, alignItems: 'center' },
  profileInfo: { flex: 1, paddingTop: 2 },
  profileName: { fontSize: 18, fontWeight: '700', color: '#fff' },
  usernameText: { fontSize: 13, color: '#F18F34', marginTop: 2, marginBottom: 2 },
  pinnedRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  pinnedBadge: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 10, color: '#6B7280', fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.08)' },
  actionButtonsRow: { flexDirection: 'row', gap: 10 },
  followBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F18F34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  messageBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.3)',
    backgroundColor: 'rgba(241,143,52,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  messageText: { color: '#F18F34', fontSize: 14, fontWeight: '600' },
  errorText: { color: '#EF4444', marginBottom: 20 },
  backBtn: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#F18F34', borderRadius: 10 },
  backBtnText: { color: '#fff', fontWeight: '600' },
});
