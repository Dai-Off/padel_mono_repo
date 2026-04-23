import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyPlayerProfile, type MyPlayerProfile } from '../api/players';
import { theme } from '../theme';
import { AICoachSection } from '../components/profile/AICoachSection';
import { TrophyShowcaseSection } from '../components/profile/TrophyShowcaseSection';
import { OnboardingLevelModal } from '../components/profile/OnboardingLevelModal';
import { fetchMyCoachAssessment, type CoachAssessment } from '../api/coachAssessment';
import { fetchMyPeerFeedbackInsight, type PeerFeedbackInsight } from '../api/peerFeedbackInsight';

type ProfileScreenProps = {
  onBack: () => void;
  onMenuPress: () => void;
  onPreferencesPress?: () => void;
};

function getInitials(firstName?: string | null, lastName?: string | null): string {
  if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase();
  if (firstName) return firstName.substring(0, 2).toUpperCase();
  return 'SN';
}

export function ProfileScreen({ onBack, onMenuPress, onPreferencesPress }: ProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [profile, setProfile] = useState<MyPlayerProfile | null>(null);
  const [activeSport, setActiveSport] = useState('Pádel');
  const [activeLogroTab, setActiveLogroTab] = useState('Todos');
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [assessment, setAssessment] = useState<CoachAssessment | null>(null);
  const [peerInsight, setPeerInsight] = useState<PeerFeedbackInsight | null>(null);

  useEffect(() => {
    if (session?.access_token) {
      fetchMyPlayerProfile(session.access_token).then((p) => {
        setProfile(p);
        if (p?.id) {
          fetchMyPeerFeedbackInsight(session.access_token, p.id).then(setPeerInsight);
        }
      });
      fetchMyCoachAssessment(session.access_token).then(setAssessment);
    }
  }, [session?.access_token]);

  const initials = getInitials(profile?.firstName, profile?.lastName);
  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : 'Cargando...';

  const needsLevelOnboarding = profile != null && profile.onboardingCompleted === false;

  const refreshProfileAndCoach = () => {
    if (!session?.access_token) return;
    fetchMyPlayerProfile(session.access_token).then((p) => {
      setProfile(p);
      if (p?.id) {
        fetchMyPeerFeedbackInsight(session.access_token, p.id).then(setPeerInsight);
      }
    });
    fetchMyCoachAssessment(session.access_token).then(setAssessment);
  };

  return (
    <View style={styles.container}>
      {/* Header fijo (fuera del scroll) */}
      <View style={styles.header}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.headerContent}>
          <Pressable onPress={onMenuPress} style={styles.headerIconBtn}>
            <Ionicons name="menu" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Perfil</Text>
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
        style={styles.scroll} 
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover Photo */}
        <View style={styles.coverWrap}>
          <Image 
            source={{ uri: 'https://images.unsplash.com/photo-1657704358775-ed705c7388d2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwYWRlbCUyMHNwb3J0JTIwcmFja2V0JTIwY291cnR8ZW58MXx8fHwxNzczNjEwMzA3fDA&ixlib=rb-4.1.0&q=80&w=1080' }} 
            style={styles.coverImg} 
          />
          <LinearGradient 
            colors={['rgba(15,15,15,0.6)', 'transparent', '#0F0F0F']} 
            style={StyleSheet.absoluteFill} 
          />
          <Pressable style={styles.cameraBtn}>
            <Ionicons name="camera-outline" size={14} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>

        {/* Profile Details Card */}
        <View style={styles.profileCardWrap}>
          <View style={styles.profileCard}>
            <View style={styles.eloBadge}>
              <Text style={styles.eloLabel}>NIVEL</Text>
              <Text style={styles.eloValue}>
                {profile?.onboardingCompleted && profile?.eloRating != null && Number.isFinite(profile.eloRating)
                  ? profile.eloRating.toFixed(2)
                  : '--'}
              </Text>
            </View>
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                <LinearGradient 
                  colors={['#F18F34', '#E95F32']} 
                  style={styles.avatar}
                >
                  <Text style={styles.avatarText}>{initials}</Text>
                </LinearGradient>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{displayName}</Text>
                <Pressable style={styles.locationBtn}>
                  <Ionicons name="location-outline" size={12} color="#F18F34" />
                  <Text style={styles.locationText}>Añadir mi localización</Text>
                </Pressable>
              </View>
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profile?.matchesPlayedMatchmaking ?? 0}</Text>
                <Text style={styles.statLabel}>PARTIDOS</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>--</Text>
                <Text style={styles.statLabel}>SEGUIDORES</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>--</Text>
                <Text style={styles.statLabel}>SEGUIDOS</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              <Pressable style={styles.editBtn}>
                <Text style={styles.editBtnText}>Editar perfil</Text>
              </Pressable>
              <Pressable style={styles.personalizeBtn}>
                <Ionicons name="color-palette-outline" size={14} color="#F18F34" />
                <Text style={styles.personalizeBtnText}>Personalizar</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Sport Tabs */}
        <View style={styles.sportTabsContainer}>
          <View style={styles.sportTabsBackground}>
            {['Pádel', 'Tenis', 'Pickleball'].map(sport => (
              <Pressable 
                key={sport} 
                onPress={() => setActiveSport(sport)}
                style={[styles.sportTabItem, activeSport === sport && styles.sportTabItemActive]}
              >
                {activeSport === sport && <View style={styles.sportTabHighlight} />}
                <Text style={[styles.sportTabText, activeSport === sport ? styles.sportTabTextActive : styles.sportTabTextInactive]}>
                  {sport}
                </Text>
              </Pressable>
            ))}
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
                  {needsLevelOnboarding ? 'Nivelación inicial' : 'Coach Virtual IA'}
                </Text>
                <Text style={styles.coachDesc}>
                  {needsLevelOnboarding
                    ? 'Responde al cuestionario oficial para calcular tu nivel inicial (0–7) y desbloquear matchmaking y el resto de funciones.'
                    : 'Mide tu nivel de Pádel para desbloquear análisis personalizados y recomendaciones del Coach IA'}
                </Text>
                <Pressable style={styles.coachCtaBtn} onPress={() => setShowOnboardingModal(true)}>
                  <Ionicons name="locate-outline" size={16} color="#fff" />
                  <Text style={styles.coachCtaText}>Comenzar nivelación</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : assessment ? (
          <AICoachSection assessment={assessment} peerInsight={peerInsight} />
        ) : (
          <View style={styles.coachCardContainer}>
            <View style={styles.coachCard}>
              <View style={styles.coachGlow} />
              <View style={styles.coachContent}>
                <ActivityIndicator color="#F18F34" />
                <Text style={styles.coachDesc}>Cargando status de nivelación…</Text>
              </View>
            </View>
          </View>
        )}

        {/* Achievements Section */}
        {assessment ? (
          <TrophyShowcaseSection />
        ) : (
          <View style={styles.achievementsContainer}>
            <View style={styles.achievementsCard}>
              <View style={styles.achievementsHeader}>
                <View style={styles.achievementsTitleWrap}>
                  <LinearGradient 
                    colors={['#F18F34', '#E95F32']} 
                    style={styles.achievementTrophyIcon}
                  >
                    <Ionicons name="trophy-outline" size={16} color="#fff" />
                  </LinearGradient>
                  <View>
                    <Text style={styles.achievementsTitle}>Vitrina de Logros</Text>
                    <Text style={styles.achievementsCount}>Sin logros disponibles todavía</Text>
                  </View>
                </View>
              </View>
              <View style={styles.emptyAchievementsBox}>
                <Ionicons name="trophy-outline" size={24} color="#6B7280" />
                <Text style={styles.emptyAchievementsText}>
                  Aun no hay datos reales de logros para mostrar.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Bottom Menu Actions */}
        <View style={styles.menuContainer}>
          <View style={styles.menuCard}>
            {[
              { title: 'Preferencias', icon: 'locate-outline' },
              { title: 'Configuración', icon: 'settings-outline' },
              { title: 'Ayuda y soporte', icon: 'people-outline' },
              { title: 'Términos y condiciones', icon: 'document-text-outline' },
            ].map((item, idx, arr) => (
              <Pressable
                key={item.title}
                style={[styles.menuItem, idx === arr.length - 1 && styles.menuItemLast]}
                onPress={() => {
                  if (item.title === 'Preferencias') {
                    onPreferencesPress?.();
                    return;
                  }
                  Alert.alert(item.title, `Navegando a ${item.title}`);
                }}
              >
                <View style={styles.menuIconBox}>
                  <Ionicons name={item.icon as any} size={16} color="#9CA3AF" />
                </View>
                <Text style={styles.menuText}>{item.title}</Text>
                <Ionicons name="chevron-forward" size={16} color="#4B5563" />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <OnboardingLevelModal
        visible={showOnboardingModal}
        accessToken={session?.access_token ?? null}
        savedEloRating={profile?.eloRating ?? null}
        onClose={() => setShowOnboardingModal(false)}
        onCompleted={() => {
          refreshProfileAndCoach();
        }}
      />

      {/* Navigation Dummy - matching Figma layout z-index */}
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
  eloBadge: {
    position: 'absolute',
    top: -24,
    right: 14,
    minWidth: 74,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F18F34',
    backgroundColor: '#F18F34',
    zIndex: 2,
  },
  eloLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: '#fff',
  },
  eloValue: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 20,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  locationText: {
    fontSize: 12,
    color: '#F18F34',
    fontWeight: '500',
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
  sportTabsContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sportTabsBackground: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sportTabItem: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sportTabItemActive: {
    // background handled by highlight view; keep for layout/state styling if needed
  },
  sportTabHighlight: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
  },
  sportTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sportTabTextActive: {
    color: '#fff',
  },
  sportTabTextInactive: {
    color: '#6B7280',
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
  achievementsContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  achievementsCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
  },
  achievementsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  achievementsTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  achievementTrophyIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  achievementsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  achievementsCount: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 1,
  },
  emptyAchievementsBox: {
    marginTop: 8,
    minHeight: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  emptyAchievementsText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
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
});
