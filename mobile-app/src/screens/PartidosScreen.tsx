import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useHomeData } from '../contexts/HomeDataContext';
import { fetchMatches, fetchMyMatches } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { fetchMyPlayerId } from '../api/players';
import { PartidoCard } from '../components/partido/PartidoCard';
import { PartidoOpenCard } from '../components/partido/PartidoOpenCard';
import { PartidoOpenCardSkeleton } from '../components/partido/PartidoOpenCardSkeleton';
import { CrearPartidoLocationSheet } from '../components/partido/CrearPartidoLocationSheet';
import { getMatchBooking, getMatchListPhase } from '../domain/matchLifecycle';
import type { MatchListPhase } from '../domain/matchLifecycle';
import { clubCalendarDayBounds, dayKeyInClubTz } from '../lib/clubTimeZone';
import { lineHeightFor, theme } from '../theme';
import { Ionicons } from '@expo/vector-icons';

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function dayLabel(d: Date): string {
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

type SportFilter = 'all' | 'padel' | 'tenis' | 'pickleball' | 'otro';

function passesSportFilter(p: PartidoItem, sportFilter: SportFilter): boolean {
  const sport = (p.courtSport ?? 'padel').toLowerCase();
  if (sportFilter === 'otro') {
    if (sport === 'padel' || sport === 'tenis' || sport === 'pickleball') return false;
  } else if (sportFilter !== 'all' && sport !== sportFilter) return false;
  return true;
}

function isPublicJoinableMatch(p: PartidoItem): boolean {
  if (p.matchPhase !== 'upcoming') return false;
  if (p.matchStatus === 'cancelled') return false;
  const filled = (p.players ?? []).filter((x) => !x.isFree).length;
  return filled < 4;
}

function passesLevelForViewer(p: PartidoItem, viewerElo: number | null | undefined): boolean {
  if (viewerElo == null || !Number.isFinite(viewerElo)) return true;
  if (p.eloMin != null && p.eloMax != null) {
    return viewerElo >= p.eloMin && viewerElo <= p.eloMax;
  }
  return true;
}

function sortByStartAsc(a: PartidoItem, b: PartidoItem): number {
  const ta = a.startAtIso ? new Date(a.startAtIso).getTime() : Number.POSITIVE_INFINITY;
  const tb = b.startAtIso ? new Date(b.startAtIso).getTime() : Number.POSITIVE_INFINITY;
  return ta - tb;
}

export type PartidoMode = 'competitivo' | 'amistoso';
export type PartidoPlayer = {
  id?: string;
  name: string;
  avatar?: string;
  initial?: string;
  level: string;
  isFree: boolean;
};
export type PartidoItem = {
  id: string;
  dateTime: string;
  mode: PartidoMode;
  typeLabel: string;
  levelRange: string;
  players: PartidoPlayer[];
  /** IDs de jugadores ya en el partido (para ocultar Unirse al organizador/jugadores) */
  playerIds?: string[];
  /** IDs por slot (0..3) para mapear feedback por jugador visualizado. */
  playerIdsBySlot?: Array<string | null>;
  /** Si es 'private', otros jugadores no pueden unirse */
  visibility?: 'public' | 'private';
  venue: string;
  location: string;
  price: string;
  pricePerPlayer: string;
  duration: string;
  venueImage?: string;
  venueAddress?: string;
  courtName?: string;
  courtType?: string;
  /** upcoming = por jugar, live = en horario, past = ya jugado (no debería aparecer en listados activos). */
  matchPhase?: MatchListPhase;
  /** Organizador de la reserva (cancelación / gestión). */
  organizerPlayerId?: string | null;
  /** Matchmaking: plaza ya creada en booking_participants; pagar con create-intent (sin prepare-join). */
  matchmakingPayment?: {
    bookingId: string;
    participantId: string;
    shareAmountCents?: number;
  };
  matchType?: string | null;
  matchStatus?: string;
  bookingStatus?: string;
  scoreStatus?: 'pending' | 'confirmed' | 'disputed' | null;
  /** true si el jugador autenticado ya envió feedback de este partido. */
  hasMyFeedback?: boolean;
  /** Deporte de la pista (padel, tenis, pickleball…) */
  courtSport?: string;
  startAtIso?: string;
  eloMin?: number | null;
  eloMax?: number | null;
};

type PartidosScreenProps = {
  onPartidoPress?: (partido: PartidoItem) => void;
  /** Tras elegir WeMatch en el modal y Siguiente: abre pantalla completa de clubes/horarios. */
  onOpenWeMatchClubsFlow?: (organizerPlayerId: string | null) => void;
  /** Abre perfil para completar nivelación inicial (desde alerta en crear partido). */
  onNavigateToCompleteOnboarding?: () => void;
  /** Incrementado desde MainApp al cerrar el flujo para refrescar listas */
  partidosRefreshNonce?: number;
};

export function PartidosScreen({
  onPartidoPress,
  onOpenWeMatchClubsFlow,
  onNavigateToCompleteOnboarding,
  partidosRefreshNonce = 0,
}: PartidosScreenProps) {
  const { session } = useAuth();
  const { profile } = useHomeData();
  const [organizerPlayerId, setOrganizerPlayerId] = useState<string | null>(profile?.id ?? null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [openRaw, setOpenRaw] = useState<PartidoItem[]>([]);
  const [myRaw, setMyRaw] = useState<PartidoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayOffset, setDayOffset] = useState(0);
  const [sportFilter, setSportFilter] = useState<SportFilter>('all');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      setOrganizerPlayerId(profile.id);
      return;
    }
    const token = session?.access_token;
    if (!token) {
      setOrganizerPlayerId(null);
      return;
    }
    void fetchMyPlayerId(token).then(setOrganizerPlayerId);
  }, [profile?.id, session?.access_token]);

  const loadPartidos = useCallback(async () => {
    setLoading(true);
    const token = session?.access_token ?? null;
    const useDay = dayOffset !== 0;
    const dayBounds = useDay ? clubCalendarDayBounds(dayOffset) : null;
    const viewerElo = profile?.eloRating ?? null;

    const openMatches = await fetchMatches({
      expand: true,
      token,
      activeOnly: true,
      discovery: true,
      dateFrom: dayBounds?.dateFrom,
      dateTo: dayBounds?.dateTo,
      visibility: 'public',
    });
    const openPartidos = openMatches
      .map(mapMatchToPartido)
      .filter((p): p is PartidoItem => p != null)
      .filter((p) => p.matchPhase !== 'past')
      .filter((p) => {
        if (!useDay || !dayBounds || !p.startAtIso) return true;
        return dayKeyInClubTz(new Date(p.startAtIso)) === dayBounds.dayKey;
      })
      .filter((p) => passesLevelForViewer(p, viewerElo))
      .sort(sortByStartAsc);
    setOpenRaw(openPartidos);
    setLoading(false);

    if (!token) {
      setMyRaw([]);
      return;
    }

    const myMatches = await fetchMyMatches(token, { phase: 'all', limit: 50 });
    const myPartidos = myMatches
      .filter((m) => {
        const booking = getMatchBooking(m);
        if (!booking?.start_at || !booking?.end_at) return false;
        if ((m.visibility ?? 'public') !== 'private') return false;
        if (useDay && dayBounds) {
          return dayKeyInClubTz(new Date(booking.start_at)) === dayBounds.dayKey;
        }
        return getMatchListPhase(Date.now(), m.status, booking.start_at, booking.end_at) !== 'past';
      })
      .map(mapMatchToPartido)
      .filter((p): p is PartidoItem => p != null)
      .sort(sortByStartAsc);
    setMyRaw(myPartidos);
  }, [session?.access_token, dayOffset, profile?.eloRating]);

  const openPartidos = useMemo(
    () =>
      openRaw
        .filter(isPublicJoinableMatch)
        .filter((p) => passesSportFilter(p, sportFilter)),
    [openRaw, sportFilter]
  );

  const myPartidos = useMemo(
    () => myRaw.filter((p) => passesSportFilter(p, sportFilter)),
    [myRaw, sportFilter]
  );

  const dayDateDisplay = useMemo(() => {
    const bounds = clubCalendarDayBounds(dayOffset);
    return new Date(`${bounds.dayKey}T12:00:00`);
  }, [dayOffset]);
  const maxDayAhead = 21;
  const maxDayBack = -7;

  useEffect(() => {
    loadPartidos();
  }, [loadPartidos, partidosRefreshNonce]);

  return (
    <View style={styles.wrapper}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Para tu nivel</Text>
        <Text style={styles.sectionSubtitle}>
          Estos partidos reflejan tu búsqueda y nivel
        </Text>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.dayRow}>
          <View style={styles.daySide}>
            {dayOffset !== 0 ? (
              <Pressable onPress={() => setDayOffset(0)} style={styles.hoyPill}>
                <Text style={styles.hoyPillText}>Hoy</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.dayCenter}>
            <Pressable
              hitSlop={8}
              onPress={() => setDayOffset((d) => Math.max(maxDayBack, d - 1))}
              style={styles.dayArrow}
            >
              <Ionicons name="chevron-back" size={22} color="#e5e7eb" />
            </Pressable>
            <Text style={styles.dayTitle} numberOfLines={1}>
              {dayOffset === 0 ? 'Próximos' : dayLabel(dayDateDisplay)}
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => setDayOffset((d) => Math.min(maxDayAhead, d + 1))}
              style={styles.dayArrow}
            >
              <Ionicons name="chevron-forward" size={22} color="#e5e7eb" />
            </Pressable>
          </View>
          <View style={styles.daySide} />
        </View>
        <Pressable
          onPress={() => setFiltersExpanded((v) => !v)}
          style={styles.filtersToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersExpanded }}
        >
          <Text style={styles.filtersToggleText}>Filtros</Text>
          <Ionicons
            name={filtersExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#d1d5db"
          />
        </Pressable>
        {filtersExpanded ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {(
              [
                ['all', 'Todos deportes'],
                ['padel', 'Pádel'],
                ['tenis', 'Tenis'],
                ['pickleball', 'Pickleball'],
                ['otro', 'Otro'],
              ] as const
            ).map(([v, label]) => (
              <Pressable
                key={v}
                onPress={() => setSportFilter(v)}
                style={[styles.chip, sportFilter === v && styles.chipOn]}
              >
                <Text style={[styles.chipText, sportFilter === v && styles.chipTextOn]}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
      <View style={styles.list}>
        {loading ? (
          <>
            <PartidoOpenCardSkeleton />
            <PartidoOpenCardSkeleton />
            <PartidoOpenCardSkeleton />
          </>
        ) : openPartidos.length > 0 ? (
          openPartidos.map((item) => (
            <PartidoOpenCard
              key={item.id}
              item={item}
              onPress={() => onPartidoPress?.(item)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No hay partidos abiertos</Text>
          </View>
        )}
      </View>

      <View style={[styles.section, { marginTop: theme.spacing.xl }]}>
        <Text style={styles.sectionTitle}>Mis partidos</Text>
        <Text style={styles.sectionSubtitle}>Tus reservas privadas</Text>
      </View>
      <View style={styles.list}>
        {loading ? (
          <>
            <PartidoOpenCardSkeleton />
            <PartidoOpenCardSkeleton />
          </>
        ) : myPartidos.length > 0 ? (
          myPartidos.map((item) => (
            <PartidoCard
              key={item.id}
              item={item}
              surface="dark"
              onPress={() => onPartidoPress?.(item)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No tienes partidos privados</Text>
          </View>
        )}
      </View>
    </ScrollView>
      <View style={styles.fabAnchor} pointerEvents="box-none">
        <View style={styles.fabShadow}>
          <Pressable
            style={({ pressed }) => [styles.fabPressable, pressed && styles.fabPressed]}
            onPress={() => setLocationModalVisible(true)}
          >
            {/*
              El gradiente envuelve el texto con padding (sin capa absoluteFill + overflow).
              En Android, gradiente hermano del Text + elevation en la capa recortada suele
              dejar la etiqueta cortada; aquí el LinearGradient define el tamaño del botón.
            */}
            <LinearGradient
              colors={['#F18F34', '#E95F32']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fabGradient}
            >
              <Text
                style={styles.fabLabel}
                {...Platform.select({
                  android: { textBreakStrategy: 'simple' as const },
                  default: {},
                })}
              >
                + Comenzar un partido
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      <CrearPartidoLocationSheet
        presentation="modal"
        visible={locationModalVisible}
        modalOnlyWeMatch
        initialStep="location"
        organizerPlayerId={organizerPlayerId}
        onContinueWeMatch={() => {
          setLocationModalVisible(false);
          onOpenWeMatchClubsFlow?.(organizerPlayerId ?? profile?.id ?? null);
        }}
        onClose={() => setLocationModalVisible(false)}
        onSiguiente={() => {}}
        onPartidoCreado={undefined}
        onNavigateToCompleteOnboarding={
          onNavigateToCompleteOnboarding
            ? () => {
                setLocationModalVisible(false);
                onNavigateToCompleteOnboarding();
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { flex: 1, backgroundColor: '#000000' },
  content: {
    paddingBottom: theme.scrollBottomPadding,
  },
  fabPressed: { opacity: 0.92 },
  fabPressable: {
    alignSelf: 'center',
    ...Platform.select({
      android: { overflow: 'visible' as const },
      default: {},
    }),
  },
  section: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    lineHeight: lineHeightFor(theme.fontSize.base),
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
    ...Platform.select({
      android: { paddingVertical: 1 },
      default: {},
    }),
  },
  toolbar: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    gap: 10,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  daySide: { width: 72, justifyContent: 'center' },
  dayCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dayTitle: {
    minWidth: 100,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: '#f9fafb',
  },
  dayArrow: { padding: 4 },
  hoyPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  hoyPillText: { fontSize: 12, fontWeight: '600', color: '#f9fafb' },
  filtersToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  filtersToggleText: { fontSize: 13, fontWeight: '600', color: '#e5e7eb' },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  chipOn: {
    backgroundColor: 'rgba(241, 143, 52, 0.25)',
    borderColor: 'rgba(241, 143, 52, 0.55)',
  },
  chipText: { fontSize: 12, color: '#d1d5db', fontWeight: '500' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: lineHeightFor(12),
    color: '#9ca3af',
    ...Platform.select({
      android: { paddingVertical: 1 },
      default: {},
    }),
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    gap: 12,
  },
  emptyState: { paddingVertical: theme.spacing.xxl, alignItems: 'center' },
  emptyText: {
    fontSize: theme.fontSize.sm,
    lineHeight: lineHeightFor(theme.fontSize.sm),
    color: '#9ca3af',
    ...Platform.select({
      android: { paddingVertical: 1 },
      default: {},
    }),
  },
  fabAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
    zIndex: 50,
  },
  /** iOS: sombra en el wrapper. Android: elevation en fabGradient (mismo bloque que el texto). */
  fabShadow: {
    borderRadius: 9999,
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(241, 143, 52, 0.4)',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 32,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  fabGradient: {
    borderRadius: 9999,
    paddingHorizontal: 28,
    paddingVertical: 16,
    justifyContent: 'center',
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        alignItems: 'center',
      },
      android: {
        /** stretch: el Text usa el ancho del gradiente (minWidth), no una medición intrínseca rota. */
        alignItems: 'stretch',
        minWidth: Math.min(320, theme.screenWidth - 32),
        elevation: 10,
      },
      default: {
        alignItems: 'center',
      },
    }),
  },
  fabLabel: {
    flexShrink: 0,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: lineHeightFor(theme.fontSize.lg),
    textAlign: 'center',
    ...Platform.select({
      android: {
        includeFontPadding: false,
        paddingVertical: 1,
      },
      default: {},
    }),
  },
});
