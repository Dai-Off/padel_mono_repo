import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMatchById, fetchMatches } from '../api/matches';
import { fetchPublicTournaments } from '../api/tournaments';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { fetchMyPlayerId, fetchMyPlayerProfile, type MyPlayerProfile } from '../api/players';
import {
  CompetitiveLeagueHomeCard,
  DailyLessonCard,
  EnDirectoSection,
  IAAfinidadCard,
  InicioQuickActions,
  INICIO_PAD_BOTTOM,
  INICIO_PAD_H,
  INICIO_PAD_TOP,
  INICIO_STACK_GAP,
  MissionsHomeSection,
  ProximosPartidosSection,
  SeasonPassHomeCard,
} from '../components/home/inicio';
import { selectMyUpcomingMatches } from '../domain/selectMyUpcomingMatches';
import { useAuth } from '../contexts/AuthContext';
import { useHomeStats } from '../hooks/useHomeStats';
import type { PartidoItem } from './PartidosScreen';
import { AiMatchModal, type MatchmakingSearchInput } from '../components/home/AiMatchModal';
import { IAAfinidadModal } from '../components/home/IAAfinidadModal';
import { searchAiMatch } from '../api/aiMatch';
import {
  fetchMatchmakingLeagueConfig,
  fetchMatchmakingProposal,
  fetchMatchmakingStatus,
  joinMatchmaking,
  leaveMatchmaking,
  respondMatchmakingExpansion,
  type MatchmakingJoinPayload,
  type MatchmakingLeagueConfigRow,
  type MatchmakingProposalResponse,
  type MatchmakingStatusResponse,
} from '../api/matchmaking';
import { MATCHMAKING_DEFAULT_CLUB_ID } from '../config';

type TabId = 'pistas' | 'partidos' | 'torneos';

type HomeScreenProps = {
  onNavigateToTab?: (tab: TabId) => void;
  onPartidoPress?: (partido: PartidoItem) => void;
  onDailyLessonPress?: () => void;
  onCoursesPress?: () => void;
  onOpenMessageThread?: (peer: { id: string; displayName: string; avatarUrl: string | null }) => void;
};

function computeAvailabilityWindow(input: Pick<MatchmakingSearchInput, 'day' | 'time'>): {
  availableFrom: string;
  availableUntil: string;
} {
  const now = new Date();
  const targetDay = new Date(now);

  if (input.day === 'manana') targetDay.setDate(targetDay.getDate() + 1);
  else if (input.day === 'esta-semana') targetDay.setDate(targetDay.getDate() + 2);
  else if (input.day === 'fin-semana') {
    const day = targetDay.getDay();
    const daysUntilSaturday = (6 - day + 7) % 7 || 7;
    targetDay.setDate(targetDay.getDate() + daysUntilSaturday);
  }

  let startHour = now.getHours();
  let endHour = Math.min(startHour + 2, 23);
  if (input.time === 'manana') {
    startHour = 9;
    endHour = 12;
  } else if (input.time === 'tarde') {
    startHour = 15;
    endHour = 18;
  } else if (input.time === 'noche') {
    startHour = 19;
    endHour = 22;
  }

  const availableFromDate = new Date(targetDay);
  availableFromDate.setHours(startHour, 0, 0, 0);
  const availableUntilDate = new Date(targetDay);
  availableUntilDate.setHours(endHour, 0, 0, 0);
  if (availableUntilDate <= availableFromDate) {
    availableUntilDate.setTime(availableFromDate.getTime() + 90 * 60 * 1000);
  }
  return { availableFrom: availableFromDate.toISOString(), availableUntil: availableUntilDate.toISOString() };
}

export function HomeScreen({
  onNavigateToTab,
  onPartidoPress,
  onDailyLessonPress,
  onCoursesPress,
  onOpenMessageThread,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { stats, loading: statsLoading } = useHomeStats();
  const [publicTournamentsCount, setPublicTournamentsCount] = useState<number | null>(null);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [partidos, setPartidos] = useState<PartidoItem[]>([]);
  const [misProximosPartidos, setMisProximosPartidos] = useState<PartidoItem[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [myPlayerProfile, setMyPlayerProfile] = useState<MyPlayerProfile | null>(null);
  const [matchmakingModalVisible, setMatchmakingModalVisible] = useState(false);
  const [matchmakingLoading, setMatchmakingLoading] = useState(false);
  const [matchmakingError, setMatchmakingError] = useState<string | null>(null);
  const [affinityModalVisible, setAffinityModalVisible] = useState(false);
  const [affinityLoading, setAffinityLoading] = useState(false);
  const [affinityResponse, setAffinityResponse] = useState<string | null>(null);
  const [affinityError, setAffinityError] = useState<string | null>(null);
  const [matchmakingStatus, setMatchmakingStatus] = useState<MatchmakingStatusResponse | null>(null);
  const [matchmakingProposal, setMatchmakingProposal] = useState<MatchmakingProposalResponse | null>(null);
  const [openingProposal, setOpeningProposal] = useState(false);
  const [leagueRows, setLeagueRows] = useState<MatchmakingLeagueConfigRow[] | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proposalAlertMatchRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void fetchMatchmakingLeagueConfig().then((rows) => {
      if (mounted) setLeagueRows(rows);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const loadMatches = useCallback(async () => {
    setMatchesLoading(true);
    const token = session?.access_token ?? null;
    const [playerId, matches] = await Promise.all([
      token ? fetchMyPlayerId(token) : Promise.resolve(null),
      fetchMatches({ expand: true, token }),
    ]);
    const mineRaw = selectMyUpcomingMatches(matches, playerId);
    const misProximos = mineRaw
      .map(mapMatchToPartido)
      .filter((p): p is PartidoItem => p != null)
      .filter((p) => p.visibility !== 'private');
    setMisProximosPartidos(misProximos);

    const all = matches
      .map(mapMatchToPartido)
      .filter((p): p is PartidoItem => p != null)
      .filter((p) => p.matchPhase !== 'past');
    setPartidos(all.filter((p) => p.visibility !== 'private'));
    setMatchesLoading(false);
  }, [session?.access_token]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  useEffect(() => {
    let mounted = true;
    setTournamentsLoading(true);
    fetchPublicTournaments(session?.access_token ?? null).then((r) => {
      if (!mounted) return;
      if (r.ok) {
        /** Misma lista que Competiciones → públicos y no cancelados (open + closed). */
        setPublicTournamentsCount(r.tournaments.length);
      } else {
        setPublicTournamentsCount(null);
      }
      setTournamentsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) {
      setMyPlayerProfile(null);
      return;
    }
    void fetchMyPlayerProfile(session.access_token).then(setMyPlayerProfile);
  }, [session?.access_token]);

  const listLoading = statsLoading || matchesLoading || tournamentsLoading;

  const competitiveLeagueHomeProps = useMemo(() => {
    const p = myPlayerProfile;
    if (!p) {
      return {
        divisionName: null as string | null,
        leaguePoints: null as string | null,
        ladderProgressPercent: null as number | null,
        winsLabel: null as string | null,
        lossesLabel: null as string | null,
        eloFiabCaption: null as string | null,
      };
    }
    const row = leagueRows?.find((r) => r.code === p.liga);
    const divisionName =
      row?.label ??
      (p.liga && p.liga.length > 0 ? p.liga.charAt(0).toUpperCase() + p.liga.slice(1) : null);
    const leaguePoints = p.lps != null ? String(p.lps) : null;
    let ladderProgressPercent: number | null = null;
    if (p.lps != null) {
      const t = row?.lps_to_promote != null && row.lps_to_promote > 0 ? row.lps_to_promote : 100;
      ladderProgressPercent = Math.min(100, Math.round((p.lps / t) * 100));
    }
    const winsLabel = `${p.mmWins} victorias`;
    const lossesLabel = `${p.mmLosses} derrotas`;
    const capParts: string[] = [];
    if (p.eloRating != null) capParts.push(`Elo ${p.eloRating.toFixed(1)}`);
    if (p.fiabilidad != null) capParts.push(`Fiab. ${p.fiabilidad}%`);
    if (p.matchesPlayedMatchmaking != null) capParts.push(`${p.matchesPlayedMatchmaking} PJ MM`);
    if (p.mmDraws > 0) capParts.push(`${p.mmDraws} empates`);
    const eloFiabCaption = capParts.length > 0 ? capParts.join(' · ') : null;
    return {
      divisionName,
      leaguePoints,
      ladderProgressPercent,
      winsLabel,
      lossesLabel,
      eloFiabCaption,
    };
  }, [myPlayerProfile, leagueRows]);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollMatchmaking = useCallback(async () => {
    const token = session?.access_token ?? null;
    if (!token) return;

    const status = await fetchMatchmakingStatus(token);
    setMatchmakingStatus(status);

    if (status?.status === 'matched') {
      const proposal = await fetchMatchmakingProposal(token);
      setMatchmakingProposal(proposal);
      setMatchmakingLoading(false);
      clearPollTimer();
      return;
    }

    if (status?.status === 'blocked' || status?.status === 'not_in_pool') {
      setMatchmakingLoading(false);
      clearPollTimer();
      return;
    }

    pollTimerRef.current = setTimeout(() => {
      void pollMatchmaking();
    }, 5000);
  }, [clearPollTimer, session?.access_token]);

  useEffect(() => () => clearPollTimer(), [clearPollTimer]);

  useEffect(() => {
    const mid = matchmakingProposal?.match_id;
    const has = matchmakingProposal?.has_proposal === true;
    if (!matchmakingModalVisible || !has || !mid) {
      if (!has) proposalAlertMatchRef.current = null;
      return;
    }
    if (proposalAlertMatchRef.current === mid) return;
    proposalAlertMatchRef.current = mid;
    Alert.alert(
      '¡Partido encontrado!',
      'Tenés una propuesta activa. Abrí el detalle para pagar tu plaza y confirmar.',
      [{ text: 'Entendido' }],
    );
  }, [matchmakingModalVisible, matchmakingProposal?.has_proposal, matchmakingProposal?.match_id]);

  const handleOpenMatchmakingProposal = useCallback(async () => {
    const token = session?.access_token;
    const mid = matchmakingProposal?.match_id;
    if (!token || !mid || !onPartidoPress) {
      return;
    }
    setOpeningProposal(true);
    try {
      const match = await fetchMatchById(mid, token);
      if (!match) {
        Alert.alert('Error', 'No se pudo cargar el partido.');
        return;
      }
      const mapped = mapMatchToPartido(match);
      if (!mapped) {
        Alert.alert('Error', 'No se pudo mostrar el partido.');
        return;
      }
      const bookingId = matchmakingProposal.booking_id;
      const participantId = matchmakingProposal.your_participant_id;
      if (matchmakingProposal.your_payment_status !== 'paid' && (!bookingId || !participantId)) {
        Alert.alert(
          'Pago',
          'No encontramos los datos de tu plaza en la reserva. Probá de nuevo en unos segundos o contactá soporte.',
        );
      }
      if (
        bookingId &&
        participantId &&
        matchmakingProposal.your_payment_status !== 'paid'
      ) {
        mapped.matchmakingPayment = {
          bookingId,
          participantId,
          shareAmountCents: matchmakingProposal.your_share_cents ?? undefined,
        };
      }
      clearPollTimer();
      setMatchmakingModalVisible(false);
      onPartidoPress(mapped);
    } finally {
      setOpeningProposal(false);
    }
  }, [clearPollTimer, matchmakingProposal, onPartidoPress, session?.access_token]);

  /** Al abrir el modal: estado real del backend + polling si ya estás buscando. */
  useEffect(() => {
    if (!matchmakingModalVisible) {
      clearPollTimer();
      return;
    }
    const token = session?.access_token;
    if (!token) return;

    let cancelled = false;
    clearPollTimer();
    void (async () => {
      setMatchmakingError(null);
      const status = await fetchMatchmakingStatus(token);
      if (cancelled) return;
      setMatchmakingStatus(status);
      if (status?.status === 'searching') {
        void pollMatchmaking();
      } else if (status?.status === 'matched') {
        const proposal = await fetchMatchmakingProposal(token);
        if (!cancelled) setMatchmakingProposal(proposal);
      } else {
        setMatchmakingProposal(null);
      }
    })();

    return () => {
      cancelled = true;
      clearPollTimer();
    };
  }, [matchmakingModalVisible, session?.access_token, clearPollTimer, pollMatchmaking]);

  const handleMatchmakingSearch = useCallback(async (input: MatchmakingSearchInput) => {
    const token = session?.access_token ?? null;
    if (!token) {
      setMatchmakingError('Necesitas iniciar sesión para buscar partido.');
      return;
    }

    setMatchmakingLoading(true);
    setMatchmakingError(null);
    setMatchmakingProposal(null);
    clearPollTimer();

    const { availableFrom, availableUntil } = computeAvailabilityWindow(input);

    const payload: MatchmakingJoinPayload = {
      available_from: availableFrom,
      available_until: availableUntil,
      preferred_side: input.preferred_side,
      gender: input.gender,
    };

    if (input.search_area === 'club') {
      payload.club_id = MATCHMAKING_DEFAULT_CLUB_ID;
    } else {
      const maxKm = input.search_area === 'km5' ? 5 : input.search_area === 'km10' ? 10 : 25;
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setMatchmakingError('Para buscar por distancia necesitamos permiso de ubicación.');
        setMatchmakingLoading(false);
        return;
      }
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        payload.max_distance_km = maxKm;
        payload.search_lat = pos.coords.latitude;
        payload.search_lng = pos.coords.longitude;
      } catch {
        setMatchmakingError('No se pudo obtener tu ubicación. Probá de nuevo o elegí búsqueda por club.');
        setMatchmakingLoading(false);
        return;
      }
    }

    const result = await joinMatchmaking(payload, token);
    if (!result.ok) {
      if (result.alreadyInQueue) {
        const status = await fetchMatchmakingStatus(token);
        setMatchmakingStatus(status);
        setMatchmakingLoading(false);
        setMatchmakingError(null);
        if (status?.status === 'searching') {
          void pollMatchmaking();
        } else if (status?.status === 'matched') {
          const proposal = await fetchMatchmakingProposal(token);
          setMatchmakingProposal(proposal);
        }
        return;
      }
      setMatchmakingError(result.error);
      setMatchmakingLoading(false);
      return;
    }

    await pollMatchmaking();
  }, [clearPollTimer, pollMatchmaking, session?.access_token]);

  const handleLeaveQueue = useCallback(async () => {
    const token = session?.access_token ?? null;
    if (!token) return;
    clearPollTimer();
    setMatchmakingLoading(false);
    const result = await leaveMatchmaking(token);
    if (!result.ok) {
      setMatchmakingError(result.error);
      return;
    }
    setMatchmakingStatus(null);
    setMatchmakingProposal(null);
  }, [clearPollTimer, session?.access_token]);

  const handleExpansionResponse = useCallback(async (accept: boolean) => {
    const token = session?.access_token ?? null;
    if (!token) return;
    const result = await respondMatchmakingExpansion(accept, token);
    if (!result.ok) {
      setMatchmakingError(result.error);
      return;
    }
    const status = await fetchMatchmakingStatus(token);
    setMatchmakingStatus(status);
  }, [session?.access_token]);

  const handleAffinitySearch = useCallback(
    async (prompt: string) => {
      setAffinityLoading(true);
      setAffinityError(null);
      setAffinityResponse(null);

      const userName =
        [myPlayerProfile?.firstName, myPlayerProfile?.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        session?.user?.user_metadata?.full_name ||
        session?.user?.email?.split('@')[0] ||
        'Sin dato';

      const enrichedPrompt = [
        'CONTEXTO JUGADOR LOGUEADO (ANCLA)',
        `- player_id: ${myPlayerProfile?.id ?? 'Sin dato'}`,
        `- nombre: ${userName}`,
        `- email: ${myPlayerProfile?.email ?? session?.user?.email ?? 'Sin dato'}`,
        `- elo_rating: ${myPlayerProfile?.eloRating ?? 'Sin dato'}`,
        `- telefono: ${myPlayerProfile?.phone ?? 'Sin dato'}`,
        '',
        'SOLICITUD DEL USUARIO',
        prompt,
        '',
        'INSTRUCCION IMPORTANTE',
        'Usa el jugador logueado como jugador ancla para el matching.',
      ].join('\n');

      const result = await searchAiMatch(enrichedPrompt);
      if (result.ok && result.text) {
        setAffinityResponse(result.text);
      } else {
        setAffinityError(result.error ?? 'No se pudo completar la búsqueda.');
      }
      setAffinityLoading(false);
    },
    [myPlayerProfile, session?.user?.email, session?.user?.user_metadata?.full_name]
  );

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: INICIO_PAD_TOP,
            paddingBottom: INICIO_PAD_BOTTOM + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ProximosPartidosSection
          items={misProximosPartidos}
          /** No acoplar a session aquí: en iOS la sesión hidrata tarde y `loading` quedaba false con items vacíos → la sección se ocultaba por completo (early return). */
          loading={matchesLoading}
          onPartidoPress={onPartidoPress}
        />
        <DailyLessonCard onPress={() => onDailyLessonPress?.()} />
        <SeasonPassHomeCard />
        <CompetitiveLeagueHomeCard
          divisionName={competitiveLeagueHomeProps.divisionName}
          leaguePoints={competitiveLeagueHomeProps.leaguePoints}
          ladderProgressPercent={competitiveLeagueHomeProps.ladderProgressPercent}
          winsLabel={competitiveLeagueHomeProps.winsLabel}
          lossesLabel={competitiveLeagueHomeProps.lossesLabel}
          eloFiabCaption={competitiveLeagueHomeProps.eloFiabCaption}
          onPress={() => {
            setMatchmakingError(null);
            setMatchmakingModalVisible(true);
          }}
        />
        <InicioQuickActions
          onNavigateToTab={onNavigateToTab}
          onCoursesPress={onCoursesPress}
          openMatchesCount={partidos.length}
          courtsFree={stats?.courtsFree}
          tournamentsCount={publicTournamentsCount}
          loading={listLoading}
        />
        <IAAfinidadCard
          onPress={() => {
            setAffinityError(null);
            setAffinityResponse(null);
            setAffinityModalVisible(true);
          }}
        />
        <MissionsHomeSection />
        <EnDirectoSection
          partidos={partidos.filter((p) => p.matchPhase === 'live')}
          loading={matchesLoading}
          onPartidoPress={onPartidoPress}
          onOpenPartidos={() => onNavigateToTab?.('partidos')}
        />
      </ScrollView>

      <IAAfinidadModal
        visible={affinityModalVisible}
        loading={affinityLoading}
        responseText={affinityResponse}
        errorText={affinityError}
        onClose={() => setAffinityModalVisible(false)}
        onSubmit={handleAffinitySearch}
      />

      <AiMatchModal
        visible={matchmakingModalVisible}
        loading={matchmakingLoading}
        status={matchmakingStatus}
        proposal={matchmakingProposal}
        errorText={matchmakingError}
        openingProposal={openingProposal}
        onClose={() => {
          clearPollTimer();
          setMatchmakingLoading(false);
          setMatchmakingModalVisible(false);
        }}
        onSubmit={handleMatchmakingSearch}
        onLeaveQueue={handleLeaveQueue}
        onRespondExpansion={handleExpansionResponse}
        onDirectMessageSent={(target) => onOpenMessageThread?.(target)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    paddingHorizontal: INICIO_PAD_H,
    gap: INICIO_STACK_GAP,
  },
});
