import { useCallback, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton } from '../components/ui/Skeleton';
import { theme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useHomeStats, useZoneTrends } from '../hooks/useHomeStats';
import { fetchMatches } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import type { PartidoItem } from './PartidosScreen';

type NearYouItem = {
  id: string;
  label: string;
  value: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
};

function buildNearYouItems(
  stats: { courtsFree: number; playersLooking: number; classesToday: number; tournaments: number },
  openMatchesCount?: number
): NearYouItem[] {
  return [
    { id: '1', label: 'Reservar pista', value: String(stats.courtsFree), subtitle: 'pistas libres', icon: 'calendar', iconBg: 'rgba(227, 30, 36, 0.25)' },
    { id: '2', label: 'Buscar partido', value: String(openMatchesCount ?? stats.playersLooking), subtitle: openMatchesCount != null ? (openMatchesCount === 1 ? 'partido abierto' : 'partidos abiertos') : 'jugadores', icon: 'people', iconBg: 'rgba(255, 255, 255, 0.12)' },
    { id: '3', label: 'Aprender', value: String(stats.classesToday), subtitle: 'clases hoy', icon: 'school', iconBg: 'rgba(91, 141, 238, 0.25)' },
    { id: '4', label: 'Competir', value: String(stats.tournaments), subtitle: 'torneos', icon: 'trophy', iconBg: 'rgba(16, 185, 129, 0.25)' },
  ];
}

function getFirstName(fullName?: string | null, email?: string): string {
  if (fullName?.trim()) {
    return fullName.trim().split(/\s+/)[0] ?? 'Usuario';
  }
  return email?.split('@')[0] ?? 'Usuario';
}

const WEEK_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

type WeekStats = {
  sessionsDone: number;
  sessionsTotal: number;
  streakDays: number;
  progressPercent: number;
  checkedDays: boolean[];
};

type UserStats = {
  matchesThisMonth: number;
  winPercent: number;
  completed: number;
};

const EMPTY_USER_STATS: UserStats = {
  matchesThisMonth: 0,
  winPercent: 0,
  completed: 0,
};

const EMPTY_WEEK: WeekStats = {
  sessionsDone: 0,
  sessionsTotal: 0,
  streakDays: 0,
  progressPercent: 0,
  checkedDays: [false, false, false, false, false, false, false],
};

function WeekProgressCircle({ percent }: { percent: number }) {
  const size = 60;
  const fontSize = 16;
  return (
    <View style={[styles.weekProgressOuter, { width: size, height: size }]} collapsable={false}>
      <View
        style={[
          styles.weekProgressCircle,
          { width: size, height: size, borderRadius: size / 2, borderWidth: 4 },
        ]}
      />
      <View style={[styles.weekProgressTextContainer, { maxWidth: size - 12 }]} pointerEvents="none">
        <Text
          style={[styles.weekProgressText, { fontSize }]}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {String(percent)}%
        </Text>
      </View>
    </View>
  );
}

type ZoneTrendRow = {
  id: string;
  emoji: string;
  subtitle: string;
  value: string;
};

function buildZoneTrendRows(trends: {
  popularTimeSlot: string | null;
  topClub: string | null;
  activePlayersToday: number | null;
  nextTournament: string | null;
} | null): ZoneTrendRow[] {
  if (!trends) {
    return [
      { id: '1', emoji: '🔥', subtitle: 'Horario más popular', value: '-' },
      { id: '2', emoji: '📍', subtitle: 'Club más reservado', value: '-' },
      { id: '3', emoji: '👥', subtitle: 'Jugadores activos hoy', value: '-' },
      { id: '4', emoji: '🏆', subtitle: 'Próximo torneo', value: '-' },
    ];
  }
  const activeText =
    trends.activePlayersToday != null
      ? `${trends.activePlayersToday} cerca de ti`
      : '-';
  return [
    { id: '1', emoji: '🔥', subtitle: 'Horario más popular', value: trends.popularTimeSlot ?? '-' },
    { id: '2', emoji: '📍', subtitle: 'Club más reservado', value: trends.topClub ?? '-' },
    { id: '3', emoji: '👥', subtitle: 'Jugadores activos hoy', value: activeText },
    { id: '4', emoji: '🏆', subtitle: 'Próximo torneo', value: trends.nextTournament ?? '-' },
  ];
}

function parseTimeFromDateTime(dateTime: string): string {
  const m = dateTime.match(/\d{1,2}:\d{2}/);
  return m ? m[0] : '';
}

type TabId = 'reservar' | 'partidos' | 'competir';

type HomeScreenProps = {
  onPartidoPress?: (partido: PartidoItem) => void;
  onNavigateToTab?: (tab: TabId) => void;
};

export function HomeScreen({ onPartidoPress, onNavigateToTab }: HomeScreenProps) {
  const { session } = useAuth();
  const { stats, loading } = useHomeStats();
  const { trends, loading: trendsLoading } = useZoneTrends();
  const [openMatches, setOpenMatches] = useState<PartidoItem[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

  const loadMatches = useCallback(async () => {
    setMatchesLoading(true);
    const matches = await fetchMatches({ expand: true });
    const partidos = matches.map(mapMatchToPartido).filter((p): p is PartidoItem => p != null);
    setOpenMatches(partidos);
    setMatchesLoading(false);
  }, []);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const firstName = getFirstName(session?.user?.user_metadata?.full_name, session?.user?.email);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  const nearYouItems = stats ? buildNearYouItems(stats, openMatches.length) : [];
  const zoneTrendRows = buildZoneTrendRows(trends);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.greeting}>
        <Text style={styles.greetingLabel}>{greeting}</Text>
        <Text style={styles.greetingName}>{firstName} 👋</Text>
      </View>

      <View style={styles.nearYou}>
        <LinearGradient
          colors={['#1a1a1a', '#2a2a2a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.nearYouCard}
        >
          <View style={[styles.nearYouOrb, styles.nearYouOrbRed]} />
          <View style={[styles.nearYouOrb, styles.nearYouOrbBlue]} />
          <View style={styles.nearYouContent}>
            <View style={styles.nearYouHeader}>
              <View style={styles.nearYouDot} />
              <Text style={styles.nearYouTitle}>CERCA DE TI · AHORA</Text>
            </View>
            {loading ? (
              <View style={styles.nearYouList}>
                {[1, 2, 3, 4].map((i) => (
                  <View key={i} style={styles.nearYouRow}>
                    <Skeleton variant="dark" width={32} height={32} borderRadius={12} style={styles.skeletonIcon} />
                    <Skeleton variant="dark" width="70%" height={14} borderRadius={4} style={styles.skeletonLabel} />
                    <View style={styles.skeletonRight}>
                      <Skeleton variant="dark" width={24} height={14} borderRadius={4} />
                      <Skeleton variant="dark" width={60} height={12} borderRadius={4} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
            <View style={styles.nearYouList}>
              {nearYouItems.map((item) => {
                const tabMap: Record<string, TabId | undefined> = {
                  '1': 'reservar',
                  '2': 'partidos',
                  '4': 'competir',
                };
                const targetTab = tabMap[item.id];
                const canNavigate = targetTab && onNavigateToTab;
                return (
                <Pressable
                  key={item.id}
                  style={styles.nearYouRow}
                  onPress={canNavigate ? () => onNavigateToTab(targetTab) : undefined}
                  disabled={!canNavigate}
                >
                  <View style={[styles.nearYouIconWrap, { backgroundColor: item.iconBg }]}>
                    <Ionicons name={item.icon} size={16} color="#fff" />
                  </View>
                  <Text style={styles.nearYouLabel}>{item.label}</Text>
                  <View style={styles.nearYouRight}>
                    <Text style={styles.nearYouValue}>{item.value}</Text>
                    <Text style={styles.nearYouSubtitle}>{item.subtitle}</Text>
                    <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
                  </View>
                </Pressable>
              );
              })}
            </View>
            )}
          </View>
        </LinearGradient>
      </View>

      <Pressable style={styles.aiCard} accessibilityRole="button" accessibilityLabel="Buscar partido con IA">
        <LinearGradient
          colors={['#1a1a1a', '#2d2d2d', '#1a1a1a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          locations={[0, 0.5, 1]}
          style={styles.aiCardGradient}
        >
          <View style={styles.aiCardOverlay} />
          <View style={styles.aiCardContent}>
            <View style={styles.aiCardIconWrap}>
              <Ionicons name="sparkles" size={24} color="#fff" />
            </View>
            <View style={styles.aiCardText}>
              <Text style={styles.aiCardTitle}>Buscar partido con IA</Text>
              <Text style={styles.aiCardSubtitle}>Encuentra tu partido ideal ahora</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.6)" />
          </View>
        </LinearGradient>
      </Pressable>

      <View style={styles.weekSection}>
        <LinearGradient
          colors={['#1a1a1a', '#252525']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.34, y: 1 }}
          style={styles.weekCard}
        >
          <View style={[styles.weekOrb, { top: 0, right: 0, backgroundColor: 'rgba(227, 30, 36, 0.08)' }]} />
          <View style={styles.weekContent}>
            <View style={styles.weekHeader}>
              <View style={styles.weekHeaderLeft}>
                <Text style={styles.weekTitle}>Tu Semana</Text>
                <Text style={styles.weekSubtitle} allowFontScaling={false}>
                  {EMPTY_WEEK.sessionsDone} de {EMPTY_WEEK.sessionsTotal} sesiones
                </Text>
              </View>
              <View style={styles.weekBadge} collapsable={false}>
                <View style={styles.weekBadgeIcon}>
                  <Ionicons name="flame" size={14} color="#fb923c" />
                </View>
                <View style={styles.weekBadgeTextWrap}>
                  <Text style={styles.weekBadgeText}>{EMPTY_WEEK.streakDays}</Text>
                  <Text style={styles.weekBadgeText}> días</Text>
                </View>
              </View>
            </View>
            <View style={styles.weekRow}>
              <View style={styles.weekDays}>
                {WEEK_DAYS.map((letter, i) => (
                  <View key={letter} style={styles.weekDayCell}>
                    <Text style={styles.weekDayLabel}>{letter}</Text>
                    <View
                      style={[
                        styles.weekDayBox,
                        EMPTY_WEEK.checkedDays[i] ? styles.weekDayBoxChecked : styles.weekDayBoxEmpty,
                      ]}
                    >
                      {EMPTY_WEEK.checkedDays[i] && (
                        <Text style={styles.weekDayCheck}>✓</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.weekProgressWrap}>
                <WeekProgressCircle percent={EMPTY_WEEK.progressPercent} />
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.openMatchesSection}>
        <View style={styles.openMatchesHeader}>
          <View style={styles.openMatchesTitleRow}>
            <View style={styles.openMatchesDotWrap}>
              <View style={styles.openMatchesDotPulse} />
              <View style={styles.openMatchesDot} />
            </View>
            <Text style={styles.openMatchesTitle}>Partidos Abiertos</Text>
          </View>
        </View>
        {matchesLoading ? (
          <View style={styles.openMatchesSkeleton}>
            {[1, 2].map((i) => (
              <View key={i} style={[styles.openMatchCard, { opacity: 0.7 }]}>
                <Skeleton variant="default" width="100%" height={120} borderRadius={16} />
              </View>
            ))}
          </View>
        ) : openMatches.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.openMatchesScroll}
          >
            {openMatches.slice(0, 6).map((item) => {
              const time = parseTimeFromDateTime(item.dateTime);
              return (
                <Pressable
                  key={item.id}
                  style={styles.openMatchCard}
                  onPress={() => onPartidoPress?.(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${time} - ${item.venue}`}
                >
                  <View style={[styles.openMatchTopBar, { backgroundColor: item.mode === 'competitivo' ? '#E31E24' : '#6b7280' }]} />
                  <View style={styles.openMatchBody}>
                    <View style={styles.openMatchRow1}>
                      <View style={styles.openMatchTimeRow}>
                        <Ionicons name="time-outline" size={12} color="#9ca3af" />
                        <Text style={styles.openMatchTime}>{time || '—'}</Text>
                      </View>
                      <View style={[styles.openMatchSportBadge, { backgroundColor: 'rgba(227,30,36,0.082)' }]}>
                        <Text style={[styles.openMatchSportText, { color: '#E31E24' }]}>Pádel</Text>
                      </View>
                    </View>
                    <Text style={styles.openMatchVenue} numberOfLines={1}>{item.venue}</Text>
                    <View style={styles.openMatchSlots}>
                      {item.players.slice(0, 4).map((p, i) => (
                        <View key={i} style={[styles.openMatchSlot, p.isFree ? styles.openMatchSlotEmpty : styles.openMatchSlotFilled]}>
                          <Text style={p.isFree ? styles.openMatchSlotTextEmpty : styles.openMatchSlotTextFilled}>
                            {p.isFree ? '+' : (p.initial ?? p.name?.[0] ?? '?')}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.openMatchFooter}>
                      <Text style={styles.openMatchStartsLabel}>{item.players.filter((x) => !x.isFree).length}/4</Text>
                      <Text style={styles.openMatchStartsValue}>{item.price}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.openMatchesEmpty}>
            <Text style={styles.openMatchesEmptyText}>No hay partidos abiertos</Text>
          </View>
        )}
      </View>

      <View style={styles.nextStepSection}>
        <Pressable
          style={styles.nextStepCard}
          onPress={() => onNavigateToTab?.('reservar')}
          accessibilityRole="button"
          accessibilityLabel="Reserva tu siguiente pista"
        >
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800' }}
            style={styles.nextStepImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(26,26,26,0.9)', 'rgba(26,26,26,0.6)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.nextStepGradient}
          />
          <View style={styles.nextStepContent}>
            <View style={styles.nextStepLabelRow}>
              <Ionicons name="locate" size={14} color="#E31E24" style={{ marginRight: 6 }} />
              <Text style={styles.nextStepLabel}>TU PRÓXIMO PASO</Text>
            </View>
            <Text style={styles.nextStepTitle}>Reserva tu siguiente pista</Text>
            <Text style={styles.nextStepSubtitle}>
              {stats?.courtsFree != null ? `${stats.courtsFree} pistas disponibles` : 'Ver disponibilidad'}
            </Text>
            <View style={styles.nextStepCta} collapsable={false}>
              <Text style={styles.nextStepCtaText}>
                Ver disponibilidad
              </Text>
              <Ionicons name="arrow-forward" size={14} color="#E31E24" style={{ marginLeft: 6 }} />
            </View>
          </View>
        </Pressable>
      </View>

      <View style={styles.statsSection} collapsable={false}>
        <Text style={styles.statsTitle}>Tus Estadísticas</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statsCard} collapsable={false}>
            <View style={[styles.statsIconWrap, { backgroundColor: 'rgba(227,30,36,0.082)' }]}>
              <Ionicons name="pulse" size={16} color="#E31E24" />
            </View>
            <Text style={styles.statsValue} >{EMPTY_USER_STATS.matchesThisMonth}</Text>
            <Text style={styles.statsLabel}  >
              este mes
            </Text>
          </View>
          <View style={styles.statsCard} collapsable={false}>
            <View style={[styles.statsIconWrap, { backgroundColor: 'rgba(16,185,129,0.082)' }]}>
              <Ionicons name="trending-up" size={16} color="#10b981" />
            </View>
            <View style={styles.statsValueRow}>
              <Text style={styles.statsValue} >{EMPTY_USER_STATS.winPercent}</Text>
              <Text style={styles.statsValue} >%</Text>
            </View>
            <Text style={styles.statsLabel}  >
              % ganados
            </Text>
          </View>
          <View style={styles.statsCard} collapsable={false}>
            <View style={[styles.statsIconWrap, { backgroundColor: 'rgba(91,141,238,0.082)' }]}>
              <Ionicons name="trophy" size={16} color="#5b8dee" />
            </View>
            <Text style={styles.statsValue} >{EMPTY_USER_STATS.completed}</Text>
            <Text style={styles.statsLabel}  >
              completados
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.zoneTrendsSection}>
        <Text style={styles.zoneTrendsTitle}>Tendencia en tu zona</Text>
        <View style={styles.zoneTrendsCard}>
          {trendsLoading ? (
            [1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.zoneTrendRow, i === 4 && styles.zoneTrendRowLast]}>
                <Skeleton width={20} height={20} borderRadius={4} style={styles.zoneTrendSkeletonIcon} />
                <View style={styles.zoneTrendSkeletonText}>
                  <Skeleton width="60%" height={10} borderRadius={4} style={{ marginBottom: 6 }} />
                  <Skeleton width="40%" height={14} borderRadius={4} />
                </View>
              </View>
            ))
          ) : (
            zoneTrendRows.map((row, idx) => (
              <Pressable
                key={row.id}
                style={[styles.zoneTrendRow, idx === zoneTrendRows.length - 1 && styles.zoneTrendRowLast]}
                accessibilityRole="button"
              >
                <Text style={styles.zoneTrendEmoji}>{row.emoji}</Text>
                <View style={styles.zoneTrendContent}>
                  <Text style={styles.zoneTrendSubtitle}>{row.subtitle}</Text>
                  <Text style={styles.zoneTrendValue} numberOfLines={1}>{row.value}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
              </Pressable>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: theme.scrollBottomPadding },
  greeting: {
    paddingBottom: 16,
  },
  greetingLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  greetingName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 2,
  },
  nearYou: { marginBottom: 24 },
  nearYouCard: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  nearYouOrb: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  nearYouOrbRed: {
    top: 0,
    right: 0,
    backgroundColor: 'rgba(227, 30, 36, 0.12)',
  },
  nearYouOrbBlue: {
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(91, 141, 238, 0.08)',
  },
  nearYouContent: { position: 'relative', zIndex: 10, padding: 20 },
  nearYouHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  skeletonIcon: { flexShrink: 0 },
  skeletonLabel: { flex: 1, marginHorizontal: 12 },
  skeletonRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nearYouDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e31e24',
  },
  nearYouTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 2,
  },
  nearYouList: {},
  nearYouRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  nearYouIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearYouLabel: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  nearYouRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nearYouValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  nearYouSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  weekSection: { marginBottom: 24 },
  weekCard: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  weekOrb: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
  },
  weekContent: { position: 'relative', zIndex: 10, padding: 20 },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  weekHeaderLeft: {
    flex: 1,
    minWidth: 100,
  },
  weekTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  weekSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
    flexShrink: 0,
  },
  weekBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
    flexShrink: 0,
    minWidth: 90,
  },
  weekBadgeIcon: { marginRight: 6 },
  weekBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fb923c',
    flexShrink: 0,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekDays: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginRight: 16,
    minWidth: 0,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekDayLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 4,
  },
  weekDayBox: {
    width: 28,
    height: 28,
    minWidth: 28,
    minHeight: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  weekDayBoxChecked: {
    backgroundColor: '#E31E24',
  },
  weekDayBoxEmpty: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  weekDayCheck: {
    fontSize: 12,
    color: '#fff',
  },
  weekProgressWrap: { flexShrink: 0 },
  weekProgressOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  weekProgressCircle: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  weekProgressTextContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  weekProgressText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
    flexShrink: 0,
  },
  openMatchesSection: { marginBottom: 24 },
  openMatchesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  openMatchesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  openMatchesDotWrap: {
    width: 10,
    height: 10,
    marginRight: 8,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  openMatchesDotPulse: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    opacity: 0.75,
    transform: [{ scale: 1.1 }],
  },
  openMatchesDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    position: 'relative',
  },
  openMatchesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  openMatchesSeeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  openMatchesSeeAllText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#E31E24',
    marginRight: 2,
  },
  openMatchesScroll: {
    paddingRight: 20,
    paddingBottom: 4,
  },
  openMatchCard: {
    width: 200,
    flexShrink: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
    marginRight: 12,
  },
  openMatchTopBar: {
    height: 4,
  },
  openMatchBody: {
    padding: 14,
  },
  openMatchRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  openMatchTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  openMatchTime: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A1A1A',
    marginLeft: 6,
  },
  openMatchSportBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  openMatchSportText: {
    fontSize: 10,
    fontWeight: '600',
  },
  openMatchVenue: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
  },
  openMatchSlots: {
    flexDirection: 'row',
    marginBottom: 12,
    marginRight: -4,
  },
  openMatchSlot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  openMatchSlotFilled: {
    backgroundColor: '#1A1A1A',
  },
  openMatchSlotEmpty: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  openMatchSlotTextFilled: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  openMatchSlotTextEmpty: {
    fontSize: 10,
    fontWeight: '700',
    color: '#d1d5db',
  },
  openMatchFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  openMatchStartsLabel: {
    fontSize: 10,
    color: '#9ca3af',
  },
  openMatchStartsValue: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E31E24',
  },
  nextStepSection: { marginBottom: 24 },
  nextStepCard: {
    width: '100%',
    height: 144,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  nextStepImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
  },
  openMatchesSkeleton: {
    flexDirection: 'row',
    gap: 12,
  },
  openMatchesEmpty: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  openMatchesEmptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  nextStepGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
  },
  nextStepContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    justifyContent: 'center',
  },
  nextStepLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  nextStepLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 2,
  },
  nextStepTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  nextStepSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  nextStepCta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  nextStepCtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E31E24',
    flexShrink: 0,
  },
  statsSection: { marginBottom: 24 },
  statsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
  },
  statsCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    alignItems: 'center',
    marginRight: 6,
  },
  statsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statsValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    flexShrink: 0,
  },
  statsValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statsLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
    textAlign: 'center',
    alignSelf: 'stretch',
    lineHeight: 16,
  },
  weekBadgeTextWrap: {
    flexDirection: 'row',
    flexShrink: 0,
  },
  aiCard: {
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  aiCardGradient: {
    padding: 20,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  aiCardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(227, 30, 36, 0.2)',
    opacity: 0.3,
  },
  aiCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    position: 'relative',
    zIndex: 10,
  },
  aiCardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#E31E24',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transform: [{ rotate: '-0.7deg' }],
  },
  aiCardText: { flex: 1, minWidth: 0 },
  aiCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  aiCardSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  zoneTrendsSection: { marginBottom: 0 },
  zoneTrendsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  zoneTrendsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
  },
  zoneTrendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  zoneTrendRowLast: { borderBottomWidth: 0 },
  zoneTrendEmoji: { fontSize: 16, marginRight: 12 },
  zoneTrendContent: { flex: 1, minWidth: 0 },
  zoneTrendSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 2,
  },
  zoneTrendValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  zoneTrendSkeletonIcon: { flexShrink: 0, marginRight: 12 },
  zoneTrendSkeletonText: { flex: 1 },
});
