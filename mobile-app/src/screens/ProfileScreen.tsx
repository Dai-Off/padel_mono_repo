import React, { useState, useEffect } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Platform,
  Dimensions,
  Alert,
  Modal,
  Easing,
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
import { fetchMyCoachAssessment, submitCoachAssessment, type CoachAssessment } from '../api/coachAssessment';
import { fetchMyPeerFeedbackInsight, type PeerFeedbackInsight } from '../api/peerFeedbackInsight';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type CoachQuestion = {
  title: string;
  options: string[];
};

const COACH_QUESTIONS: CoachQuestion[] = [
  {
    title: '¿Cuánto tiempo llevas jugando?',
    options: ['Menos de 6 meses', '6 meses - 2 años', '2 - 5 años', 'Más de 5 años'],
  },
  {
    title: '¿Con qué frecuencia juegas?',
    options: ['1 vez al mes', '1-2 veces por semana', '3-4 veces por semana', '5+ veces por semana'],
  },
  {
    title: '¿Cómo calificarías tu nivel técnico?',
    options: [
      'Principiante - Aprendiendo lo básico',
      'Intermedio - Domino lo básico',
      'Avanzado - Juego competitivo',
      'Profesional - Nivel de competición',
    ],
  },
  {
    title: '¿Cómo es tu servicio?',
    options: ['Aún aprendiendo', 'Consistente pero básico', 'Fuerte y variado', 'Mi mejor arma'],
  },
  {
    title: '¿Qué tan bien entiendes la estrategia del juego?',
    options: [
      'Conocimientos básicos',
      'Buena comprensión',
      'Estrategia avanzada',
      'Lectura táctica experta',
    ],
  },
  {
    title: '¿Has participado en competiciones?',
    options: ['Nunca', 'Torneos locales', 'Competiciones regionales', 'Nivel nacional/internacional'],
  },
];

type ProfileScreenProps = {
  onBack: () => void;
  onMenuPress: () => void;
  onPreferencesPress?: () => void;
};

type Achievement = {
  id: string;
  title: string;
  description: string;
  tier: 'LEGENDARIO' | 'ÉPICO' | 'NORMAL';
  icon: keyof typeof Ionicons.glyphMap;
  date: string;
  sport?: string;
  color: string;
  isPublic: boolean;
  isLocked?: boolean;
};

const ACHIEVEMENTS: Achievement[] = [
  {
    id: '1',
    title: 'Campeón Torneo Verano',
    description: '1er puesto en el Torneo de Verano 2025',
    tier: 'LEGENDARIO',
    icon: 'trophy',
    date: 'Ago 2025',
    sport: 'Pádel',
    color: '#F18F34',
    isPublic: true,
  },
  {
    id: '2',
    title: 'Imparable',
    description: 'Completaste la lección diaria 7 días seguidos',
    tier: 'ÉPICO',
    icon: 'flame',
    date: 'Jul 2025',
    sport: 'Pádel',
    color: '#A855F7',
    isPublic: true,
  },
  {
    id: '3',
    title: 'Muro de la Red',
    description: 'Completaste tu primer curso de volea',
    tier: 'NORMAL',
    icon: 'ribbon',
    date: 'Jun 2025',
    color: '#6B7280',
    isPublic: true,
  },
  {
    id: '4',
    title: 'Francotirador',
    description: 'Dominaste los fundamentos del saque y resto',
    tier: 'NORMAL',
    icon: 'locate',
    date: 'May 2025',
    color: '#3B82F6',
    isPublic: false,
  },
];

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
  const [showCoachModal, setShowCoachModal] = useState(false);
  const [coachPhase, setCoachPhase] = useState<'questions' | 'results'>('questions');
  const [coachStepIdx, setCoachStepIdx] = useState(0);
  const [coachAnswers, setCoachAnswers] = useState<(string | null)[]>(
    () => Array.from({ length: COACH_QUESTIONS.length }, () => null),
  );
  const [assessment, setAssessment] = useState<CoachAssessment | null>(null);
  const [peerInsight, setPeerInsight] = useState<PeerFeedbackInsight | null>(null);
  const [isSubmittingCoach, setIsSubmittingCoach] = useState(false);
  const coachTranslateY = React.useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const coachProgressAnim = React.useRef(new Animated.Value(0)).current;
  const shineTranslateX = React.useRef(new Animated.Value(-1)).current;
  const particleLoopsRef = React.useRef<Animated.CompositeAnimation[]>([]);
  const particles = React.useRef(
    [
      { id: 'p1', size: 2, radius: 999, color: 'rgba(241,143,52,1)', leftPct: 0.06, topPct: 0.1 },
      { id: 'p2', size: 4, radius: 2, color: 'rgba(241,143,52,0.6)', leftPct: 0.34, topPct: 0.26 },
      { id: 'p3', size: 6, radius: 2, color: 'rgba(255,255,255,0.18)', leftPct: 0.7, topPct: 0.52 },
      { id: 'p4', size: 8, radius: 999, color: 'rgba(241,143,52,0.35)', leftPct: 0.18, topPct: 0.78 },
      { id: 'p5', size: 10, radius: 2, color: 'rgba(241,143,52,0.9)', leftPct: 0.52, topPct: 0.22 },
      { id: 'p6', size: 4, radius: 999, color: 'rgba(255,255,255,0.18)', leftPct: 0.26, topPct: 0.68 },
      { id: 'p7', size: 6, radius: 999, color: 'rgba(241,143,52,0.8)', leftPct: 0.48, topPct: 0.6 },
      { id: 'p8', size: 8, radius: 2, color: 'rgba(241,143,52,0.55)', leftPct: 0.82, topPct: 0.12 },
      { id: 'p9', size: 10, radius: 999, color: 'rgba(241,143,52,0.6)', leftPct: 0.36, topPct: 0.72 },
      { id: 'p10', size: 6, radius: 2, color: 'rgba(255,255,255,0.16)', leftPct: 0.74, topPct: 0.34 },
    ].map((p, idx) => ({
      ...p,
      opacity: new Animated.Value(0),
      drift: new Animated.Value(0),
      delayMs: 120 * idx,
      driftTo: idx % 2 === 0 ? 10 : -12,
    })),
  ).current;

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

  useEffect(() => {
    if (!showCoachModal) return;
    // Start off-screen (bottom)
    coachTranslateY.setValue(SCREEN_HEIGHT);
    Animated.timing(coachTranslateY, {
      toValue: 0,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showCoachModal, coachTranslateY]);

  const initials = getInitials(profile?.firstName, profile?.lastName);
  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : 'Cargando...';

  const openCoachModal = () => {
    setCoachStepIdx(0);
    setCoachAnswers(Array.from({ length: COACH_QUESTIONS.length }, () => null));
    setCoachPhase('questions');
    setShowCoachModal(true);
  };

  const closeCoachModal = () => {
    Animated.timing(coachTranslateY, {
      toValue: SCREEN_HEIGHT,
      duration: 260,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShowCoachModal(false);
      }
    });
  };

  const coachCurrentQuestion = COACH_QUESTIONS[coachStepIdx]!;
  const coachCurrentAnswer = coachAnswers[coachStepIdx];
  const coachProgressRatio = (coachStepIdx + 1) / COACH_QUESTIONS.length;
  const resultsCardWidth = Math.min(SCREEN_WIDTH - 40, 380);

  const setCoachAnswerAtStep = (answer: string) => {
    setCoachAnswers((prev) => {
      const next = [...prev];
      next[coachStepIdx] = answer;
      return next;
    });
  };

  const goNextCoachStep = async () => {
    if (coachCurrentAnswer == null) return;
    const last = coachStepIdx === COACH_QUESTIONS.length - 1;
    if (last) {
      try {
        setIsSubmittingCoach(true);
        const answersForApi = coachAnswers.map((ans, idx) => ({
          question_index: idx,
          selected_option: COACH_QUESTIONS[idx].options.indexOf(ans!)
        }));
        
        const result = await submitCoachAssessment(session?.access_token, answersForApi);
        if (result) {
          setAssessment(result);
          setCoachPhase('results');
        }
      } catch (err) {
        Alert.alert('Error', 'No se pudo guardar la evaluación. Por favor intenta de nuevo.');
      } finally {
        setIsSubmittingCoach(false);
      }
      return;
    }
    setCoachStepIdx((i) => Math.min(i + 1, COACH_QUESTIONS.length - 1));
  };
  
  useEffect(() => {
    if (showCoachModal && coachPhase === 'questions') {
      const target = (coachStepIdx + 1) / COACH_QUESTIONS.length;
      Animated.timing(coachProgressAnim, {
        toValue: target,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [coachStepIdx, showCoachModal, coachPhase]);

  useEffect(() => {
    if (!showCoachModal || coachPhase !== 'results') return;
    shineTranslateX.setValue(-1);
    // Slower shimmer with pauses (less frequent), more "glint" than "block".
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shineTranslateX, {
          toValue: 1,
          duration: 2100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(1600),
      ]),
    );
    loop.start();
    const particleAnims = particles.map((p) => {
      p.opacity.setValue(0);
      p.drift.setValue(0);
      const base = Animated.sequence([
        Animated.delay(p.delayMs),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(p.opacity, {
              toValue: 1,
              duration: 700,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(p.opacity, {
              toValue: 0,
              duration: 900,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(p.drift, {
              toValue: p.driftTo,
              duration: 1600,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(p.drift, {
              toValue: 0,
              duration: 1600,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]);
      return Animated.loop(base);
    });
    particleLoopsRef.current = particleAnims;
    particleAnims.forEach((a) => a.start());
    return () => {
      loop.stop();
      particleLoopsRef.current.forEach((a) => a.stop());
      particleLoopsRef.current = [];
    };
  }, [coachPhase, showCoachModal, shineTranslateX, particles]);

  const renderAchievementItem = (item: Achievement) => {
    const isLegendary = item.tier === 'LEGENDARIO';
    const isEpic = item.tier === 'ÉPICO';
    const isPrivate = !item.isPublic;

    return (
      <View
        key={item.id}
        style={[
          styles.achievementItem,
          isLegendary && styles.achievementLegendary,
          isEpic && styles.achievementEpic,
          isPrivate && styles.achievementPrivate,
          item.tier === 'NORMAL' && !isPrivate && styles.achievementNormal,
        ]}
      >
        <View style={[styles.achievementIconBox, { backgroundColor: `${item.color}20`, borderColor: `${item.color}40` }]}>
          <Ionicons name={item.icon} size={20} color={isPrivate ? '#9CA3AF' : item.color} />
        </View>
        <View style={styles.achievementContent}>
          <View style={styles.achievementTitleRow}>
            <Text style={styles.achievementTitle} numberOfLines={1}>{item.title}</Text>
            {isLegendary && (
              <View style={styles.tierBadgeLegendary}>
                <Text style={styles.tierBadgeTextLegendary}>✦ LEGENDARIO</Text>
              </View>
            )}
            {isEpic && (
              <View style={styles.tierBadgeEpic}>
                <Text style={styles.tierBadgeTextEpic}>ÉPICO</Text>
              </View>
            )}
          </View>
          <Text style={styles.achievementDesc} numberOfLines={1}>{item.description}</Text>
          <View style={styles.achievementFooter}>
            <Text style={styles.achievementDate}>{item.date}</Text>
            {item.sport && (
              <View style={styles.sportBadge}>
                <Text style={styles.sportBadgeText}>{item.sport}</Text>
              </View>
            )}
          </View>
        </View>
        <Pressable 
          style={[styles.eyeButton, !item.isPublic && styles.eyeButtonDisabled]}
          onPress={() => Alert.alert('Visibilidad', `Cambiar visibilidad de ${item.title}`)}
        >
          <Ionicons name={item.isPublic ? "eye-outline" : "eye-off-outline"} size={14} color={item.isPublic ? "#F18F34" : "#4B5563"} />
        </Pressable>
      </View>
    );
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
                <Text style={styles.statValue}>0</Text>
                <Text style={styles.statLabel}>PARTIDOS</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>0</Text>
                <Text style={styles.statLabel}>SEGUIDORES</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>1</Text>
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
        {!assessment ? (
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
                <Text style={styles.coachTitle}>Coach Virtual IA</Text>
                <Text style={styles.coachDesc}>
                  Mide tu nivel de Pádel para desbloquear análisis personalizados y recomendaciones del Coach IA
                </Text>
                <Pressable style={styles.coachCtaBtn} onPress={openCoachModal}>
                  <Ionicons name="locate-outline" size={16} color="#fff" />
                  <Text style={styles.coachCtaText}>Medir mi nivel de Pádel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <AICoachSection assessment={assessment} peerInsight={peerInsight} />
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
                    <Text style={styles.achievementsCount}>10 logros conseguidos</Text>
                  </View>
                </View>
                <View style={styles.publicBadge}>
                  <Ionicons name="eye-outline" size={12} color="#F18F34" />
                  <Text style={styles.publicBadgeText}>8 públicos</Text>
                </View>
              </View>

              {/* Achievement Mini Stats */}
              <View style={styles.achStatsRow}>
                <View style={styles.achStatItem}>
                  <Text style={styles.achStatEmoji}>🏆</Text>
                  <Text style={styles.achStatVal}>5</Text>
                  <Text style={styles.achStatLab}>Trofeos</Text>
                </View>
                <View style={styles.achStatItem}>
                  <Text style={styles.achStatEmoji}>🎖️</Text>
                  <Text style={styles.achStatVal}>2</Text>
                  <Text style={styles.achStatLab}>Insignias</Text>
                </View>
                <View style={styles.achStatItem}>
                  <Text style={styles.achStatEmoji}>📚</Text>
                  <Text style={styles.achStatVal}>3</Text>
                  <Text style={styles.achStatLab}>Cursos</Text>
                </View>
              </View>

              {/* Achievement Categories */}
              <View style={styles.achTabsRow}>
                <View style={styles.achTabsInner}>
                  {['Todos', 'Trofeos', 'Insignias', 'Cursos'].map(tab => (
                    <Pressable 
                      key={tab} 
                      onPress={() => setActiveLogroTab(tab)}
                      style={[styles.achTab, activeLogroTab === tab && styles.achTabActive]}
                    >
                      <Ionicons 
                        name={
                          tab === 'Todos' ? 'star' : 
                          tab === 'Trofeos' ? 'trophy' : 
                          tab === 'Insignias' ? 'medal' : 'school'
                        } 
                        size={14} 
                        color={activeLogroTab === tab ? '#F18F34' : '#6B7280'} 
                      />
                      <Text style={[styles.achTabText, activeLogroTab === tab ? styles.achTabTextActive : styles.achTabTextInactive]}>
                        {tab}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Achievement List */}
              <View style={styles.achList}>
                {ACHIEVEMENTS.map(renderAchievementItem)}
              </View>

              {/* View All Button */}
              <Pressable style={styles.viewAllBtn}>
                <Text style={styles.viewAllText}>Ver todos (10)</Text>
                <Ionicons name="chevron-down" size={14} color="#9CA3AF" />
              </Pressable>

              {/* Visibility Disclaimer */}
              <View style={styles.publicDisclaimer}>
                <Ionicons name="lock-closed" size={12} color="#4B5563" />
                <Text style={styles.disclaimerText}>
                  Los logros marcados como <Text style={styles.disclaimerHighlight}>públicos</Text> serán visibles para otros jugadores en tu perfil.
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

      <Modal visible={showCoachModal} transparent animationType="none" onRequestClose={closeCoachModal}>
        <View style={styles.coachModalRoot}>
          <Pressable style={styles.coachModalBackdrop} onPress={closeCoachModal} />
          <Animated.View
            style={[
              styles.coachSheet,
              {
                transform: [{ translateY: coachTranslateY }],
                paddingBottom: (insets.bottom ?? 0) + 16,
              },
            ]}
          >
            {coachPhase === 'questions' ? (
              <>
                <View style={styles.coachSheetHeader}>
                  <View style={styles.coachSheetHandle} />
                  <View style={styles.coachSheetHeaderRow}>
                    <Text style={styles.coachSheetKicker}>
                      Responde estas preguntas para determinar tu nivel
                    </Text>
                    <Pressable style={styles.coachSheetCloseBtn} onPress={closeCoachModal}>
                      <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
                    </Pressable>
                  </View>
                  <View style={styles.coachProgressTrack}>
                    <Animated.View
                      style={[
                        styles.coachProgressFill,
                        {
                          width: coachProgressAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                          backgroundColor: '#F18F34',
                        },
                      ]}
                    />
                  </View>
                </View>

                <ScrollView
                  style={styles.coachSheetBody}
                  contentContainerStyle={styles.coachSheetBodyContent}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.coachQuestionBlock}>
                    <Text style={styles.coachStepLabel}>
                      {coachStepIdx + 1}/{COACH_QUESTIONS.length}
                    </Text>
                    <Text style={styles.coachQuestionTitle}>{coachCurrentQuestion.title}</Text>
                  </View>

                  <View style={styles.coachOptions}>
                    {coachCurrentQuestion.options.map((label) => {
                      const selected = coachCurrentAnswer === label;
                      return (
                        <Pressable
                          key={label}
                          onPress={() => setCoachAnswerAtStep(label)}
                          style={({ pressed }) => [
                            styles.coachOptionBtn,
                            selected && styles.coachOptionBtnSelected,
                            pressed && styles.coachOptionBtnPressed,
                          ]}
                        >
                          <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                            {selected ? <View style={styles.radioInner} /> : null}
                          </View>
                          <Text style={styles.coachOptionText}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                <View style={styles.coachSheetFooter}>
                  <Pressable
                    disabled={coachCurrentAnswer == null}
                    style={({ pressed }) => [
                      styles.coachNextBtnOuter,
                      coachCurrentAnswer == null && styles.coachNextBtnDisabled,
                      pressed && coachCurrentAnswer != null && styles.coachNextBtnPressed,
                    ]}
                    onPress={goNextCoachStep}
                  >
                    <View style={styles.coachNextBtnInner}>
                      <LinearGradient
                        colors={['#F18F34', '#E95F32']}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={styles.coachNextBtnGradient}
                      >
                        <Text style={styles.coachNextBtnText}>
                          {isSubmittingCoach ? 'Guardando...' : (coachStepIdx === COACH_QUESTIONS.length - 1 ? 'Finalizar' : 'Siguiente')}
                        </Text>
                        <Ionicons name="arrow-forward" size={16} color="#fff" />
                      </LinearGradient>
                    </View>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.coachResultsRoot}>
                <Pressable style={styles.coachResultsCloseBtn} onPress={closeCoachModal}>
                  <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
                </Pressable>

                <View pointerEvents="none" style={styles.coachResultsParticlesLayer}>
                  {particles.map((p) => {
                    const left = `${Math.round(p.leftPct * 1000) / 10}%` as `${number}%`;
                    const top = `${Math.round(p.topPct * 1000) / 10}%` as `${number}%`;
                    return (
                      <Animated.View
                        key={p.id}
                        style={[
                          styles.coachParticle,
                          {
                            width: p.size,
                            height: p.size,
                            borderRadius: p.radius,
                            backgroundColor: p.color,
                            left,
                            top,
                            opacity: p.opacity.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 0.45],
                            }),
                            transform: [
                              { translateY: p.drift },
                              {
                                scale: p.opacity.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0.92, 1.2],
                                }),
                              },
                            ],
                          },
                        ]}
                      />
                    );
                  })}
                </View>

                <View style={styles.coachResultsInner}>
                  <Text style={styles.coachResultsTitle}>Tu nivel es</Text>
                  <Text style={styles.coachResultsSubtitle}>Basado en tus respuestas</Text>

                    <View style={[styles.coachResultsCard, { width: resultsCardWidth }]}>
                      <View pointerEvents="none" style={styles.coachResultsCardBackdrop} />
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.coachResultsShine,
                        {
                          transform: [
                            {
                              translateX: shineTranslateX.interpolate({
                                inputRange: [-1, 1],
                                outputRange: [-SCREEN_WIDTH * 1.2, SCREEN_WIDTH * 1.2],
                              }),
                            },
                            { rotate: '12deg' },
                          ],
                        },
                      ]}
                    >
                      <LinearGradient
                        colors={[
                          'rgba(255,255,255,0)',
                          'rgba(255,255,255,0.03)',
                          'rgba(255,255,255,0.12)',
                          'rgba(255,255,255,0.03)',
                          'rgba(255,255,255,0)',
                        ]}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={StyleSheet.absoluteFill}
                      />
                    </Animated.View>

                    <View style={styles.coachResultsCardContent}>
                      <Text style={styles.coachResultsLevelNumber}>{assessment?.level_number || '?'}</Text>
                      <Text style={styles.coachResultsLevelName}>
                        {assessment?.level_name || 'Nivel'}
                      </Text>
                      <Text style={styles.coachResultsLevelDesc}>
                        {assessment?.level_name || 'Nivel'} - {assessment?.recommendation?.split('.')[0] || 'Análisis completado'}
                      </Text>
                    </View>
                  </View>

                  <Pressable style={[styles.coachSaveBtnOuter, { width: resultsCardWidth }]} onPress={closeCoachModal}>
                    <View style={styles.coachNextBtnInner}>
                      <LinearGradient
                        colors={['#F18F34', '#E95F32']}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={styles.coachNextBtnGradient}
                      >
                        <Text style={styles.coachNextBtnText}>Guardar</Text>
                      </LinearGradient>
                    </View>
                  </Pressable>
                </View>
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>

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
  publicBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(241,143,52,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.2)',
  },
  publicBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#F18F34',
  },
  achStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  achStatItem: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  achStatEmoji: {
    fontSize: 18,
  },
  achStatVal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginTop: 2,
  },
  achStatLab: {
    fontSize: 9,
    color: '#6B7280',
    fontWeight: '600',
  },
  achTabsRow: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  achTabsInner: {
    flexDirection: 'row',
    gap: 4,
  },
  achTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
  },
  achTabActive: {
    backgroundColor: 'rgba(241,143,52,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.2)',
  },
  achTabText: {
    fontSize: 10,
    fontWeight: '700',
  },
  achTabTextActive: {
    color: '#F18F34',
  },
  achTabTextInactive: {
    color: '#6B7280',
  },
  achList: {
    gap: 8,
  },
  achievementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  achievementLegendary: {
    borderColor: 'rgba(241,143,52,0.3)',
    backgroundColor: 'rgba(241,143,52,0.1)',
  },
  achievementEpic: {
    borderColor: 'rgba(168,85,247,0.3)',
    backgroundColor: 'rgba(168,85,247,0.1)',
  },
  achievementNormal: {
    borderColor: 'rgba(107,114,128,0.3)',
    backgroundColor: 'rgba(107,114,128,0.1)',
  },
  achievementPrivate: {
    borderColor: 'rgba(107,114,128,0.3)',
    backgroundColor: 'rgba(107,114,128,0.1)',
    opacity: 0.6,
  },
  achievementIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  achievementContent: {
    flex: 1,
  },
  achievementTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  achievementTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    maxWidth: '65%',
  },
  tierBadgeLegendary: {
    backgroundColor: 'rgba(241,143,52,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.3)',
  },
  tierBadgeTextLegendary: {
    fontSize: 8,
    fontWeight: '900',
    color: '#F18F34',
  },
  tierBadgeEpic: {
    backgroundColor: 'rgba(168,85,247,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
  },
  tierBadgeTextEpic: {
    fontSize: 8,
    fontWeight: '900',
    color: '#A855F7',
  },
  achievementDesc: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  achievementFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  achievementDate: {
    fontSize: 9,
    color: '#4B5563',
  },
  sportBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sportBadgeText: {
    fontSize: 8,
    color: '#6B7280',
    fontWeight: '500',
  },
  eyeButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(241,143,52,0.15)',
  },
  eyeButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  viewAllBtn: {
    width: '100%',
    height: 40,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  publicDisclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  disclaimerText: {
    fontSize: 10,
    color: '#4B5563',
    flex: 1,
    lineHeight: 14,
  },
  disclaimerHighlight: {
    color: '#F18F34',
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

  coachModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  coachModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  coachSheet: {
    height: '92%',
    width: '100%',
    backgroundColor: '#0F0F0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  coachSheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  coachSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  coachSheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  coachSheetKicker: {
    flex: 1,
    fontSize: 10,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  coachSheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachProgressTrack: {
    marginTop: 12,
    width: '100%',
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  coachProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  coachSheetBody: {
    flex: 1,
  },
  coachSheetBodyContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  coachQuestionBlock: {
    marginBottom: 16,
  },
  coachStepLabel: {
    fontSize: 10,
    color: '#F18F34',
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  coachQuestionTitle: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 28,
  },
  coachOptions: {
    gap: 10,
  },
  coachOptionBtn: {
    width: '100%',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coachOptionBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  coachOptionBtnSelected: {
    borderColor: 'rgba(241,143,52,0.35)',
    backgroundColor: 'rgba(241,143,52,0.08)',
  },
  coachOptionText: {
    flex: 1,
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 20,
    fontWeight: '500',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: '#F18F34',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F18F34',
  },
  coachSheetFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  coachNextBtnOuter: {
    width: '100%',
    borderRadius: 14,
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  coachNextBtnInner: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  coachNextBtnGradient: {
    width: '100%',
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  coachNextBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  coachNextBtnDisabled: {
    opacity: 0.3,
  },
  coachNextBtnPressed: {
    opacity: 0.92,
  },

  coachResultsRoot: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    justifyContent: 'center',
  },
  coachResultsParticlesLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    elevation: 0,
  },
  coachResultsCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  coachResultsInner: {
    alignItems: 'center',
    zIndex: 2,
    elevation: 2,
    width: '100%',
  },
  coachResultsTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  coachResultsSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  coachResultsCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    paddingVertical: 26,
    paddingHorizontal: 22,
    overflow: 'hidden',
    marginBottom: 20,
    zIndex: 3,
    elevation: 3,
  },
  coachResultsCardBackdrop: {
    ...StyleSheet.absoluteFillObject,
    // Solid fill matching the visual tone of rgba(255,255,255,0.06) over #0F0F0F
    backgroundColor: '#1C1C1C',
  },
  coachResultsShine: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    width: 80,
    opacity: 0.32,
    borderRadius: 999,
  },
  coachParticle: {
    position: 'absolute',
    zIndex: 0,
  },
  coachResultsCardContent: {
    alignItems: 'center',
    zIndex: 2,
    elevation: 2,
    width: '100%',
  },
  coachResultsLevelNumber: {
    fontSize: 56,
    fontWeight: '900',
    color: '#F18F34',
    marginBottom: 6,
  },
  coachResultsLevelName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  coachResultsLevelDesc: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  coachSaveBtnOuter: {
    borderRadius: 14,
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
});
