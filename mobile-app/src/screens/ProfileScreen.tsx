import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import { fetchMyPlayerProfile, type MyPlayerProfile } from '../api/players';
import { formatPlayerLabel } from '../lib/username';
import { useHomeData } from '../contexts/HomeDataContext';
import { AvatarWithFrame, type FrameAttrs } from '../components/profile/AvatarWithFrame';
import { AnimatedTitle } from '../components/profile/AnimatedTitle';
import { ProfileCustomizationModal } from '../components/profile/ProfileCustomizationModal';
import { RARITY_CONFIG } from '../design/rarity';
import { LigaChip } from '../components/profile/LigaChip';
import type { Achievement } from '../design/achievements';
import {
  fetchCustomization,
  fetchUnlockables,
  type ProfileCustomization,
  type CatalogItem,
} from '../api/profileCustomization';
import { fetchAchievements } from '../api/unlockables';
import { theme } from '../theme';
import { AICoachSection } from '../components/profile/AICoachSection';
import { TrophyShowcaseSection } from '../components/profile/TrophyShowcaseSection';
import { LevelEvolutionCard } from '../components/profile/LevelEvolutionCard';
import { StatsCard } from '../components/profile/StatsCard';
import { PlayerPreferencesCard } from '../components/profile/PlayerPreferencesCard';
import { FrequentClubsCard } from '../components/profile/FrequentClubsCard';
import { FrequentPartnersCard } from '../components/profile/FrequentPartnersCard';
import { fetchFrequentClubs, fetchFrequentPartners, type FrequentClub, type FrequentPartner } from '../api/profileSocial';
import { CoachSkeleton } from '../components/profile/CoachSkeleton';
import { OnboardingLevelModal } from '../components/profile/OnboardingLevelModal';
import { fetchMyCoachAssessment, fetchMyCoachStats, type CoachAssessment, type CoachStats } from '../api/coachAssessment';
import { fetchMyPeerFeedbackInsight, type PeerFeedbackInsight } from '../api/peerFeedbackInsight';
import {
  fetchLevelHistory,
  fetchPlayerStats,
  type LevelHistory,
  type LevelHistoryLimit,
  type PlayerStats,
} from '../api/profileStats';
import {
  uploadPlayerCoverToStorage,
  type PickedImage,
} from '../api/playerAvatar';

import type { InfoScreenId } from '../content/infoContent';

type ProfileScreenProps = {
  onBack: () => void;
  onMenuPress: () => void;
  onEditProfilePress?: () => void;
  onPreferencesPress?: () => void;
  onNavigateToInfo?: (screenId: InfoScreenId) => void;
  // Si true, abre automáticamente el modal del cuestionario de nivelación al
  // montar. Usado cuando se llega aquí desde una feature bloqueada (Daily
  // Lesson) para que el usuario complete el onboarding sin un paso extra.
  autoOpenOnboarding?: boolean;
  // Callback para que el padre limpie su flag autoOpenOnboarding tras
  // consumirlo. Evita re-disparar el modal en re-renders.
  onOnboardingAutoOpened?: () => void;
  // Disparado cuando el usuario completa el cuestionario con éxito. Lo usa
  // MainApp para devolverlo a la sección desde la que llegó (lección diaria,
  // ia afinidad, etc.) en lugar de dejarlo en el perfil.
  onOnboardingCompleted?: () => void;
  /** Abre el detalle de un partido (desde el gráfico de evolución). */
  onOpenMatch?: (matchId: string) => void;
  /** Abre el perfil ajeno de otro jugador (desde "personas con las que juegas"). */
  onOpenPublicProfile?: (playerId: string) => void;
  /** Cada incremento hace scroll hasta la Vitrina de Logros (desde el modal de desbloqueo). */
  scrollToVitrinaNonce?: number;
};

function getInitials(firstName?: string | null, lastName?: string | null): string {
  if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase();
  if (firstName) return firstName.substring(0, 2).toUpperCase();
  return 'SN';
}

export function ProfileScreen({
  onBack,
  onMenuPress,
  onEditProfilePress,
  onPreferencesPress,
  onNavigateToInfo,
  autoOpenOnboarding = false,
  onOnboardingAutoOpened,
  onOnboardingCompleted,
  onOpenMatch,
  onOpenPublicProfile,
  scrollToVitrinaNonce = 0,
}: ProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const vitrinaY = useRef(0);
  // Mientras esté "armado", el scroll persigue a la Vitrina (que baja a medida que
  // el contenido de arriba —coach, evolución, stats— termina de cargar). Se desarma
  // al arrastrar el usuario o por seguridad a los 8s.
  const wantVitrina = useRef(false);

  const scrollToVitrina = React.useCallback(() => {
    if (wantVitrina.current && vitrinaY.current > 0) {
      scrollRef.current?.scrollTo({ y: Math.max(0, vitrinaY.current - 8), animated: true });
    }
  }, []);
  const { session } = useAuth();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<MyPlayerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  // Evolución del nivel + estadísticas
  const [levelHistory, setLevelHistory] = useState<LevelHistory | null>(null);
  const [levelLoading, setLevelLoading] = useState(true);
  const [levelLimit, setLevelLimit] = useState<LevelHistoryLimit>('5');
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [frequentClubs, setFrequentClubs] = useState<FrequentClub[]>([]);
  const [frequentPartners, setFrequentPartners] = useState<FrequentPartner[]>([]);
  const [socialLoading, setSocialLoading] = useState(true);
  // Personalización (título/marco/insignias equipados) + catálogos para resolverlos
  const [customization, setCustomization] = useState<ProfileCustomization | null>(null);
  const [framesCatalog, setFramesCatalog] = useState<CatalogItem[]>([]);
  // Lista completa de logros: alimenta a la vez las insignias del hero y la
  // Vitrina (dedupe: un solo fetch compartido en vez de dos).
  const [allAchievements, setAllAchievements] = useState<Achievement[]>([]);
  const [showCustomize, setShowCustomize] = useState(false);
  const [customizationReady, setCustomizationReady] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Auto-abrir el modal del cuestionario de nivelación cuando el padre lo pide
  // (p.ej. el usuario viene desde la pantalla bloqueada de Daily Lesson). Una
  // vez consumido, avisamos al padre para que limpie su flag.
  useEffect(() => {
    if (autoOpenOnboarding) {
      setShowOnboardingModal(true);
      onOnboardingAutoOpened?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenOnboarding]);
  const [assessment, setAssessment] = useState<CoachAssessment | null>(null);
  // Stats del Coach (A1): se piden aparte del radar y se fusionan al render, para
  // que el radar pinte de inmediato y las cifras rellenen cuando lleguen.
  const [coachStats, setCoachStats] = useState<CoachStats | null>(null);
  // Distingue "cargando" de "cargado pero vacío" para no quedarse en el spinner.
  const [assessmentLoaded, setAssessmentLoaded] = useState(false);
  const [peerInsight, setPeerInsight] = useState<PeerFeedbackInsight | null>(null);
  // Invalidar el cache global del HomeDataContext tras completar onboarding /
  // editar el profile, para que el resto de pantallas (DailyLessonCard,
  // CompetitiveLeague, etc.) vean el dato fresco sin re-fetch local.
  const { refreshProfile: refreshGlobalProfile } = useHomeData();

  const loadProfile = React.useCallback(async (token: string, attempt = 0) => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const p = await fetchMyPlayerProfile(token);
      if (p) {
        setProfile(p);
        setCoverUrl(p.coverUrl);
        fetchMyPeerFeedbackInsight(token, p.id).then(setPeerInsight).catch(() => {});
        setProfileLoading(false);
        return;
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500));
        return loadProfile(token, attempt + 1);
      }
      setProfileError(t('profile.profileLoadError'));
    } catch {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500));
        return loadProfile(token, attempt + 1);
      }
      setProfileError(t('profile.profileLoadFail'));
    } finally {
      setProfileLoading(false);
    }
  }, [t]);

  // Carga el Coach: radar (rápido, ruta crítica) y stats por separado (A1). El
  // radar marca assessmentLoaded; las stats rellenan aparte cuando llegan.
  const loadCoach = React.useCallback((token: string) => {
    setAssessmentLoaded(false);
    fetchMyCoachAssessment(token)
      .then(setAssessment)
      .catch(() => {})
      .finally(() => setAssessmentLoaded(true));
    fetchMyCoachStats(token)
      .then(setCoachStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) {
      setProfileLoading(false);
      setProfileError(t('profile.loginToSeeProfile'));
      return;
    }
    void loadProfile(token);
    loadCoach(token);
  }, [session?.access_token, loadProfile, loadCoach]);

  // Evolución del nivel (refetch al cambiar el filtro 5/10/Todos)
  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    setLevelLoading(true);
    fetchLevelHistory(token, levelLimit)
      .then((h) => {
        if (!cancelled) setLevelHistory(h);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLevelLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, levelLimit]);

  // Estadísticas (depende del id del jugador)
  useEffect(() => {
    const token = session?.access_token;
    const playerId = profile?.id;
    if (!token || !playerId) return;
    let cancelled = false;
    fetchPlayerStats(token, playerId)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, profile?.id]);

  // Clubs y compañeros frecuentes (depende del id del jugador)
  useEffect(() => {
    const playerId = profile?.id;
    if (!playerId) return;
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
  }, [profile?.id]);

  // Personalización equipada + catálogos para el hero. En paralelo con el perfil
  // (endpoints /me, solo necesitan token) para que todo aparezca a la vez.
  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    Promise.all([fetchCustomization(token), fetchUnlockables(token, ['frame']), fetchAchievements(token)])
      .then(([c, frames, achievements]) => {
        if (cancelled) return;
        setCustomization(c ?? { titleId: null, frameId: null, pinnedBadgeIds: [] });
        setFramesCatalog(frames);
        setAllAchievements(achievements);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCustomizationReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const equippedFrame = useMemo<FrameAttrs | null>(() => {
    const fid = customization?.frameId;
    if (!fid) return null;
    const f = framesCatalog.find((x) => x.id === fid);
    return f ? { rarity: f.rarity, style: f.style, animationType: f.animationType, colors: f.colors } : null;
  }, [customization?.frameId, framesCatalog]);

  // Insignias del hero (no-cursos) derivadas de la lista completa compartida.
  const heroBadges = useMemo<Achievement[]>(
    () => allAchievements.filter((a) => a.type !== 'course'),
    [allAchievements],
  );

  const pinnedBadges = useMemo<Achievement[]>(() => {
    const ids = customization?.pinnedBadgeIds ?? [];
    return ids
      .map((id) => heroBadges.find((b) => b.id === id))
      .filter((b): b is Achievement => b != null);
  }, [customization?.pinnedBadgeIds, heroBadges]);

  // Radar + stats fusionados (A1): el Coach recibe el radar en cuanto llega y las
  // cifras se completan cuando resuelven las stats, sin bloquear el pintado.
  const coachAssessment = useMemo<CoachAssessment | null>(
    () => (assessment ? { ...assessment, stats: coachStats ?? assessment.stats } : null),
    [assessment, coachStats],
  );

  // Scroll a la Vitrina cuando el modal de desbloqueo pide "Ir a mi vitrina".
  // Arma el objetivo y reintenta; el onLayout de la Vitrina y el efecto de carga
  // (de abajo) lo re-ajustan a medida que el contenido de arriba se asienta.
  useEffect(() => {
    if (!scrollToVitrinaNonce) return;
    wantVitrina.current = true;
    const timers = [80, 400, 900].map((ms) => setTimeout(scrollToVitrina, ms));
    const disarm = setTimeout(() => {
      wantVitrina.current = false;
    }, 8000);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(disarm);
    };
  }, [scrollToVitrinaNonce, scrollToVitrina]);

  // Re-scroll cuando el contenido de arriba termina de cargar (Coach IA tarda):
  // al crecer, la Vitrina baja y volvemos a centrarla mientras siga armado.
  useEffect(() => {
    if (!wantVitrina.current) return;
    const t = setTimeout(scrollToVitrina, 80);
    return () => clearTimeout(t);
  }, [assessment, assessmentLoaded, levelLoading, levelHistory, stats, scrollToVitrina]);

  const initials = getInitials(profile?.firstName, profile?.lastName);
  const displayName = profile
    ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() ||
      formatPlayerLabel(profile)
    : profileLoading
      ? t('profile.loadingLabel')
      : t('profile.publicProfileFallback');
  const usernameLine = profile?.username ? `@${profile.username}` : null;

  const needsLevelOnboarding = profile != null && profile.onboardingCompleted === false;

  const refreshProfileAndCoach = () => {
    if (!session?.access_token) return;
    void loadProfile(session.access_token);
    loadCoach(session.access_token);
    // Invalidamos también la cache global para que el resto de pantallas se
    // entere del cambio (ej. tras completar onboarding la card de Daily
    // Lesson en Home deja de salir bloqueada).
    void refreshGlobalProfile({ force: true });
  };

  const applyCoverImage = async (image: PickedImage) => {
    if (!session?.user?.id || !session.access_token || !session.refresh_token) {
      Alert.alert(t('profile.sessionAlertTitle'), t('profile.coverLoginRequired'));
      return;
    }
    setCoverUrl(image.uri);
    setUploadingCover(true);
    try {
      const publicUrl = await uploadPlayerCoverToStorage(
        session.user.id,
        session.access_token,
        session.refresh_token,
        image,
      );
      setCoverUrl(publicUrl);
      setProfile((prev) => (prev ? { ...prev, coverUrl: publicUrl } : prev));
      void refreshGlobalProfile({ force: true });
    } catch (err) {
      setCoverUrl(profile?.coverUrl ?? null);
      Alert.alert(t('profile.errorAlertTitle'), err instanceof Error ? err.message : t('profile.coverUploadFail'));
    } finally {
      setUploadingCover(false);
    }
  };

  const pickCoverImage = async (source: 'library' | 'camera') => {
    if (source === 'library') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permissionDeniedTitle'), t('profile.galleryPermissionBody'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;
      await applyCoverImage({
        uri: result.assets[0].uri,
        mimeType: result.assets[0].mimeType,
        fileName: result.assets[0].fileName,
      });
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('profile.permissionDeniedTitle'), t('profile.cameraPermissionBody'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    await applyCoverImage({
      uri: result.assets[0].uri,
      mimeType: result.assets[0].mimeType,
      fileName: result.assets[0].fileName,
    });
  };

  const handleChangeCover = () => {
    if (uploadingCover) return;
    Alert.alert(t('profile.coverPhotoAlert'), t('profile.coverPhotoAlertChoose'), [
      { text: t('profile.galleryBtn'), onPress: () => void pickCoverImage('library') },
      { text: t('profile.cameraBtn'), onPress: () => void pickCoverImage('camera') },
      { text: t('profile.cancelBtn'), style: 'cancel' },
    ]);
  };

  // Gate mínimo (C7): el hero solo espera al perfil. La personalización (marco,
  // título, insignias) es opcional en el render y entra en cuanto llega, sin
  // bloquear el pintado de la pantalla.
  if (profileLoading && !profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#F18F34" />
      </View>
    );
  }

  if (profileError && !profile) {
    return (
      <View style={[styles.container, styles.centered, { paddingHorizontal: 24 }]}>
        <Ionicons name="alert-circle-outline" size={40} color="#F18F34" />
        <Text style={[styles.profileName, { marginTop: 16, textAlign: 'center' }]}>{profileError}</Text>
        {session?.access_token ? (
          <Pressable
            style={[styles.editBtn, { marginTop: 20, paddingHorizontal: 24 }]}
            onPress={() => void loadProfile(session.access_token!)}
          >
            <Text style={styles.editBtnText}>{t('profile.retryBtn')}</Text>
          </Pressable>
        ) : null}
        <Pressable style={{ marginTop: 16 }} onPress={onBack}>
          <Text style={{ color: '#9CA3AF' }}>{t('profile.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header fijo (fuera del scroll) */}
      <View style={styles.header}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.headerContent}>
          <Pressable onPress={onBack} style={styles.headerIconBtn} accessibilityLabel={t('profile.back')}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>{t('profile.title')}</Text>
          <View style={styles.headerActions}>
            <Pressable style={styles.headerIconBtn}>
              <Ionicons name="chatbubble-outline" size={20} color="#fff" />
            </Pressable>
            <Pressable style={styles.headerIconBtn}>
              <Ionicons name="notifications-outline" size={20} color="#fff" />
            </Pressable>
            <Pressable style={styles.headerIconBtn}>
              <Ionicons name="people-outline" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => {
          wantVitrina.current = false;
        }}
      >
        {/* Cover */}
        <View style={styles.coverWrap}>
          {coverUrl?.trim() ? (
            <Image source={{ uri: coverUrl }} style={styles.coverImg} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={['#1a1a1a', '#0F0F0F', '#0F0F0F']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.coverImg}
            />
          )}
          <LinearGradient
            colors={['rgba(241,143,52,0.25)', 'transparent', '#0F0F0F']}
            style={StyleSheet.absoluteFill}
          />
          {uploadingCover ? (
            <View style={styles.coverLoading}>
              <ActivityIndicator color="#F18F34" />
            </View>
          ) : null}
          <Pressable
            style={styles.cameraBtn}
            onPress={handleChangeCover}
            disabled={uploadingCover}
            accessibilityLabel={t('profile.coverChangeA11y')}
          >
            <Ionicons name="camera-outline" size={14} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>

        {/* Profile Details Card */}
        <View style={styles.profileCardWrap}>
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                <AvatarWithFrame
                  avatarUrl={profile?.avatarUrl}
                  initials={initials}
                  size={80}
                  frame={equippedFrame}
                  level={
                    profile?.onboardingCompleted && profile?.eloRating != null && Number.isFinite(profile.eloRating)
                      ? profile.eloRating
                      : null
                  }
                />
                {profile ? <LigaChip liga={profile.liga} style={{ marginTop: 16 }} /> : null}
              </View>
              <View style={styles.profileInfo}>
                {customization?.titleId ? (
                  <View style={{ marginBottom: 2 }}>
                    <AnimatedTitle titleId={customization.titleId} />
                  </View>
                ) : null}
                <Text style={styles.profileName}>{displayName}</Text>
                {usernameLine ? (
                  <Text style={styles.usernameText}>{usernameLine}</Text>
                ) : null}
                {pinnedBadges.length > 0 ? (
                  <View style={styles.pinnedRow}>
                    {pinnedBadges.map((b) => {
                      const conf = RARITY_CONFIG[b.rarity];
                      return (
                        <View
                          key={b.id}
                          style={[styles.pinnedBadge, { backgroundColor: conf.bg, borderColor: conf.border }]}
                        >
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
                <Text style={styles.statValue}>{profile?.matchesPlayedTotal ?? 0}</Text>
                <Text style={styles.statLabel}>{t('profile.matchesStat')}</Text>
              </View>
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
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              <Pressable style={styles.editBtn} onPress={() => onEditProfilePress?.()}>
                <Text style={styles.editBtnText}>{t('profile.editProfileBtn')}</Text>
              </Pressable>
              <Pressable style={styles.personalizeBtn} onPress={() => setShowCustomize(true)}>
                <Ionicons name="sparkles-outline" size={14} color="#F18F34" />
                <Text style={styles.personalizeBtnText}>{t('profile.personalizeBtn')}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Virtual Coach Card / Analysis */}
        {needsLevelOnboarding ? (
          <View style={styles.coachCardContainer}>
            <View style={styles.coachCard}>
              <View style={styles.coachGlow} />
              <View style={styles.coachContent}>
                <View style={styles.brainIconContainer}>
                  <LinearGradient 
                    colors={['#F18F34', '#E95F32']} 
                    style={styles.brainIconGradient}
                  >
                    <Ionicons name="bulb-outline" size={28} color="#fff" />
                  </LinearGradient>
                </View>
                <Text style={styles.coachTitle}>
                  {needsLevelOnboarding ? t('profile.onboardingInitialTitle') : t('profile.coachVirtualIa')}
                </Text>
                <Text style={styles.coachDesc}>
                  {needsLevelOnboarding
                    ? t('profile.onboardingInitialDesc')
                    : t('profile.coachMeasureDesc')}
                </Text>
                <Pressable style={styles.coachCtaBtn} onPress={() => setShowOnboardingModal(true)}>
                  <Ionicons name="locate-outline" size={16} color="#fff" />
                  <Text style={styles.coachCtaText}>{t('profile.onboardingStartBtn')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : coachAssessment ? (
          <AICoachSection assessment={coachAssessment} peerInsight={peerInsight} />
        ) : assessmentLoaded ? (
          <View style={styles.coachCardContainer}>
            <View style={styles.coachCard}>
              <View style={styles.coachGlow} />
              <View style={styles.coachContent}>
                <Ionicons name="cloud-offline-outline" size={28} color="#6B7280" />
                <Text style={[styles.coachDesc, { marginTop: 12 }]}>
                  {t('profile.coachLoadFail')}
                </Text>
                <Pressable
                  style={styles.coachCtaBtn}
                  onPress={() => {
                    if (!session?.access_token) return;
                    loadCoach(session.access_token);
                  }}
                >
                  <Ionicons name="refresh-outline" size={16} color="#fff" />
                  <Text style={styles.coachCtaText}>{t('profile.retryBtn')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <CoachSkeleton />
        )}

        {/* Evolución del nivel + Estadísticas (solo si ya está nivelado) */}
        {!needsLevelOnboarding ? (
          <>
            <LevelEvolutionCard
              matches={levelHistory?.matches ?? []}
              currentElo={levelHistory?.currentElo ?? profile?.eloRating ?? 0}
              limit={levelLimit}
              onChangeLimit={setLevelLimit}
              loading={levelLoading}
              onOpenMatch={onOpenMatch}
            />
            <StatsCard stats={stats} loading={stats == null} />
          </>
        ) : null}

        {/* Vitrina de Logros (datos reales; gestiona sus propios estados) */}
        {!needsLevelOnboarding ? (
          <View
            onLayout={(e) => {
              vitrinaY.current = e.nativeEvent.layout.y;
              scrollToVitrina();
            }}
          >
            <TrophyShowcaseSection achievements={allAchievements} loading={!customizationReady} />
          </View>
        ) : null}

        {/* Preferencias de jugador */}
        {profile ? (
          <PlayerPreferencesCard
            dominantHand={profile.preferences.dominantHand}
            preferredSide={profile.preferences.preferredSide}
            preferredPlayStyle={profile.preferences.preferredPlayStyle}
          />
        ) : null}

        {/* Personas con las que juegas */}
        <FrequentPartnersCard
          title={t('profile.partnersTitleOwn')}
          partners={frequentPartners}
          loading={socialLoading}
          onOpenPlayer={onOpenPublicProfile}
        />

        {/* Clubs donde sueles jugar (al final) */}
        <FrequentClubsCard title={t('profile.clubsTitleOwn')} clubs={frequentClubs} loading={socialLoading} />

      </ScrollView>

      <OnboardingLevelModal
        visible={showOnboardingModal}
        accessToken={session?.access_token ?? null}
        savedEloRating={profile?.eloRating ?? null}
        onClose={() => setShowOnboardingModal(false)}
        onCompleted={() => {
          refreshProfileAndCoach();
          onOnboardingCompleted?.();
        }}
      />

      {customization ? (
        <ProfileCustomizationModal
          visible={showCustomize}
          onClose={() => setShowCustomize(false)}
          initials={initials}
          avatarUrl={profile?.avatarUrl}
          current={customization}
          onSaved={(c) => setCustomization(c)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  header: {
    zIndex: 100,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerIconBtn: {
    padding: 8,
    borderRadius: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scroll: {
    flex: 1,
  },
  coverImg: {
    width: '100%',
    height: 128,
  },
  coverWrap: {
    position: 'relative',
    height: 128,
    overflow: 'hidden',
  },
  coverLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cameraBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  profileCardWrap: {
    paddingHorizontal: 16,
    marginTop: -40,
    zIndex: 10,
  },
  profileCard: {
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  avatarContainer: {
    marginTop: -40,
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
    paddingTop: 2,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    maxWidth: '100%',
  },
  emailText: {
    fontSize: 12,
    color: '#9CA3AF',
    flex: 1,
  },
  usernameText: {
    fontSize: 13,
    color: '#F18F34',
    marginTop: 2,
    marginBottom: 2,
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
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  editBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  personalizeBtn: {
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
  personalizeBtnText: {
    color: '#F18F34',
    fontSize: 14,
    fontWeight: '600',
  },
  pinnedRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  pinnedBadge: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachCardContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  coachCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    overflow: 'hidden',
  },
  coachGlow: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 160,
    height: 160,
    backgroundColor: '#F18F34',
    borderRadius: 80,
    opacity: 0.08,
    // Note: React Native doesn't have blur for views directly without external libs, 
    // but opacity and context often suffice for "premium" look.
  },
  coachContent: {
    alignItems: 'center',
    zIndex: 1,
  },
  brainIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 21,
    elevation: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  brainIconGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  coachDesc: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  coachCtaBtn: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    // Using simple colored backgrounds since we don't have separate component for gradient buttons here
    backgroundColor: '#F18F34',
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  coachCtaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  levelCompletedBadge: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.35)',
    backgroundColor: 'rgba(52,211,153,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  levelCompletedText: {
    color: '#A7F3D0',
    fontSize: 13,
    fontWeight: '600',
  },
  menuContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  menuCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
});
