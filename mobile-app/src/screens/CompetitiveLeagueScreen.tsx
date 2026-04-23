import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { MATCHMAKING_DEFAULT_CLUB_ID } from '../config';
import { fetchMatches, fetchMatchById, type MatchEnriched } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import type { PartidoItem } from './PartidosScreen';
import {
  fetchMatchmakingLeagueConfig,
  fetchMatchmakingProposal,
  fetchMatchmakingStatus,
  joinMatchmaking,
  leaveMatchmaking,
  rejectMatchmakingProposal,
  type MatchmakingJoinPayload,
  type MatchmakingLeagueConfigRow,
  type MatchmakingProposalResponse,
  type MatchmakingStatusResponse,
} from '../api/matchmaking';
import { fetchMyPlayerProfile, type MyPlayerProfile } from '../api/players';

type Step = 'home' | 'prefs' | 'queue' | 'found';
type MainTab = 'liga' | 'ranking';
type SearchArea = 'club' | 'km5' | 'km10' | 'km25';
type SearchForm = {
  day: 'hoy' | 'manana' | 'esta-semana' | 'fin-semana';
  time: 'manana' | 'tarde' | 'noche';
  preferred_side: 'drive' | 'backhand' | 'any';
  gender: 'male' | 'female' | 'mixed' | 'any';
  search_area: SearchArea;
};

const DEFAULT_FORM: SearchForm = {
  day: 'hoy',
  time: 'tarde',
  preferred_side: 'any',
  gender: 'mixed',
  search_area: 'club',
};

function computeAvailabilityWindow(input: Pick<SearchForm, 'day' | 'time'>): {
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

type Props = {
  onBack: () => void;
  onPartidoPress?: (partido: PartidoItem) => void;
};

export function CompetitiveLeagueScreen({ onBack, onPartidoPress }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [mainTab, setMainTab] = useState<MainTab>('liga');
  const [step, setStep] = useState<Step>('home');
  const [form, setForm] = useState<SearchForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [openingProposal, setOpeningProposal] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [profile, setProfile] = useState<MyPlayerProfile | null>(null);
  const [leagueRows, setLeagueRows] = useState<MatchmakingLeagueConfigRow[] | null>(null);
  const [status, setStatus] = useState<MatchmakingStatusResponse | null>(null);
  const [proposal, setProposal] = useState<MatchmakingProposalResponse | null>(null);
  const [proposalMatch, setProposalMatch] = useState<MatchEnriched | null>(null);
  const [recentMatchRows, setRecentMatchRows] = useState<
    Array<{ id: string; title: string; subtitle: string; when: string }>
  >([]);
  const [clubOptions, setClubOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [preferredClubIds, setPreferredClubIds] = useState<string[]>([]);
  const [distanceKm, setDistanceKm] = useState(10);
  const [distanceTrackWidth, setDistanceTrackWidth] = useState(1);
  const [countdownText, setCountdownText] = useState<string>('--:--:--');
  const [queueElapsedSec, setQueueElapsedSec] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    const token = session?.access_token ?? null;
    if (!token) return;
    const s = await fetchMatchmakingStatus(token);
    setStatus(s);
    if (s?.status === 'matched') {
      const p = await fetchMatchmakingProposal(token);
      setProposal(p);
      setStep('found');
    } else if (s?.status === 'searching') {
      setStep('queue');
      setProposal(null);
    } else {
      setProposal(null);
    }
  }, [session?.access_token]);

  const pollStatus = useCallback(async () => {
    const token = session?.access_token ?? null;
    if (!token) return;
    const s = await fetchMatchmakingStatus(token);
    setStatus(s);
    if (s?.status === 'matched') {
      const p = await fetchMatchmakingProposal(token);
      setProposal(p);
      setLoading(false);
      setStep('found');
      clearPollTimer();
      return;
    }
    if (s?.status !== 'searching') {
      setLoading(false);
      clearPollTimer();
      return;
    }
    pollTimerRef.current = setTimeout(() => {
      void pollStatus();
    }, 5000);
  }, [clearPollTimer, session?.access_token]);

  useEffect(() => {
    void fetchMatchmakingLeagueConfig().then(setLeagueRows);
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    void fetchMyPlayerProfile(session.access_token).then(setProfile);
    void refreshStatus();
    return () => clearPollTimer();
  }, [clearPollTimer, refreshStatus, session?.access_token]);

  useEffect(() => {
    const token = session?.access_token ?? null;
    const myId = profile?.id;
    if (!token || !myId) return;
    let cancelled = false;
    void fetchMatches({ expand: true, token, activeOnly: false }).then((rows) => {
      if (cancelled) return;
      const myMatches = rows.filter((m) => (m.match_players ?? []).some((mp) => mp.players?.id === myId));
      setRecentMatchRows(toRecentRows(myMatches, myId));
      const clubs = new Map<string, string>();
      for (const m of myMatches) {
        const c = m.bookings?.courts?.clubs;
        if (c?.id && c.name) clubs.set(c.id, c.name);
      }
      setClubOptions([...clubs.entries()].map(([id, name]) => ({ id, name })));
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.id, session?.access_token]);

  const division = useMemo(() => {
    if (!profile) return null;
    const row = leagueRows?.find((r) => r.code === profile.liga);
    return row?.label ?? profile.liga ?? 'Sin división';
  }, [profile, leagueRows]);

  const progressPct = useMemo(() => {
    if (!profile) return 0;
    const row = leagueRows?.find((r) => r.code === profile.liga);
    const target = row?.lps_to_promote && row.lps_to_promote > 0 ? row.lps_to_promote : 100;
    const lps = profile.lps ?? 0;
    return Math.max(0, Math.min(100, Math.round((lps / target) * 100)));
  }, [profile, leagueRows]);
  const winCount = profile?.mmWins ?? 0;
  const lossCount = profile?.mmLosses ?? 0;
  const wr = winCount + lossCount > 0 ? Math.round((winCount / (winCount + lossCount)) * 100) : 0;

  const formatRelativeDate = (iso: string): string => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const days = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Hace 1 día';
    if (days < 7) return `Hace ${days} días`;
    const weeks = Math.floor(days / 7);
    if (weeks <= 1) return 'Hace 1 semana';
    return `Hace ${weeks} semanas`;
  };

  function toRecentRows(matches: MatchEnriched[], myPlayerId: string) {
    return matches
      .filter((m) => m.type === 'matchmaking')
      .filter((m) => (m.match_players ?? []).some((mp) => mp.players?.id === myPlayerId))
      .filter((m) => {
        const start = m.bookings?.start_at ? new Date(m.bookings.start_at).getTime() : 0;
        return Number.isFinite(start) && start > 0 && start <= Date.now();
      })
      .sort((a, b) => {
        const sa = a.bookings?.start_at ? new Date(a.bookings.start_at).getTime() : 0;
        const sb = b.bookings?.start_at ? new Date(b.bookings.start_at).getTime() : 0;
        return sb - sa;
      })
      .slice(0, 3)
      .map((m) => {
        const players = m.match_players ?? [];
        const mySlot = players.find((mp) => mp.players?.id === myPlayerId);
        const rivals = players
          .filter((mp) => !!mySlot?.team && mp.team !== mySlot.team)
          .map((mp) => mp.players)
          .filter((p): p is NonNullable<typeof p> => !!p);
        const title = rivals
          .slice(0, 2)
          .map((p) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim())
          .filter(Boolean)
          .join(' & ');
        const subtitle = rivals[0]?.liga ? `Rivales · ${rivals[0].liga}` : 'Rivales';
        return {
          id: m.id,
          title: title || 'Rivales pendientes',
          subtitle,
          when: m.bookings?.start_at ? formatRelativeDate(m.bookings.start_at) : 'Reciente',
        };
      });
  }

  const handleJoinQueue = useCallback(async () => {
    const token = session?.access_token ?? null;
    if (!token) {
      setErrorText('Necesitas iniciar sesión para buscar partido.');
      return;
    }
    setLoading(true);
    setErrorText(null);
    clearPollTimer();
    const { availableFrom, availableUntil } = computeAvailabilityWindow(form);
    const payload: MatchmakingJoinPayload = {
      available_from: availableFrom,
      available_until: availableUntil,
      preferred_side: form.preferred_side,
      gender: form.gender,
    };
    const wantClub = preferredClubIds.length > 0 || form.search_area === 'club';
    if (wantClub) {
      payload.club_id = MATCHMAKING_DEFAULT_CLUB_ID;
    } else {
      const maxKm = Math.max(1, Math.min(50, Math.round(distanceKm)));
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setLoading(false);
        setErrorText('Activa ubicación para buscar por distancia.');
        return;
      }
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        payload.max_distance_km = maxKm;
        payload.search_lat = pos.coords.latitude;
        payload.search_lng = pos.coords.longitude;
      } catch {
        setLoading(false);
        setErrorText('No se pudo obtener tu ubicación.');
        return;
      }
    }
    const result = await joinMatchmaking(payload, token);
    if (!result.ok && !result.alreadyInQueue) {
      setLoading(false);
      setErrorText(result.error);
      return;
    }
    setQueueElapsedSec(0);
    setStep('queue');
    await pollStatus();
  }, [clearPollTimer, distanceKm, form, pollStatus, preferredClubIds.length, session?.access_token]);

  const handleLeaveQueue = useCallback(async () => {
    const token = session?.access_token ?? null;
    if (!token) return;
    clearPollTimer();
    setLoading(false);
    const result = await leaveMatchmaking(token);
    if (!result.ok) {
      setErrorText(result.error);
      return;
    }
    setStatus(null);
    setProposal(null);
    setStep('home');
  }, [clearPollTimer, session?.access_token]);

  const handleRejectProposal = useCallback(async () => {
    const token = session?.access_token ?? null;
    const matchId = proposal?.match_id;
    if (!token || !matchId) return;
    const result = await rejectMatchmakingProposal(matchId, token);
    if (!result.ok) {
      setErrorText(result.error);
      return;
    }
    setProposal(null);
    setStep('queue');
    void pollStatus();
  }, [pollStatus, proposal?.match_id, session?.access_token]);

  const handleOpenProposal = useCallback(async () => {
    const token = session?.access_token ?? null;
    const matchId = proposal?.match_id;
    if (!token || !matchId || !onPartidoPress) return;
    setOpeningProposal(true);
    try {
      const match = await fetchMatchById(matchId, token);
      if (!match) {
        Alert.alert('Error', 'No se pudo cargar el partido.');
        return;
      }
      const mapped = mapMatchToPartido(match);
      if (!mapped) {
        Alert.alert('Error', 'No se pudo mostrar el partido.');
        return;
      }
      if (proposal.booking_id && proposal.your_participant_id && proposal.your_payment_status !== 'paid') {
        mapped.matchmakingPayment = {
          bookingId: proposal.booking_id,
          participantId: proposal.your_participant_id,
          shareAmountCents: proposal.your_share_cents ?? undefined,
        };
      }
      onPartidoPress(mapped);
    } finally {
      setOpeningProposal(false);
    }
  }, [onPartidoPress, proposal, session?.access_token]);

  useEffect(() => {
    const token = session?.access_token ?? null;
    const matchId = proposal?.match_id ?? null;
    if (!token || !matchId) {
      setProposalMatch(null);
      return;
    }
    let cancelled = false;
    void fetchMatchById(matchId, token).then((m) => {
      if (!cancelled) setProposalMatch(m);
    });
    return () => {
      cancelled = true;
    };
  }, [proposal?.match_id, session?.access_token]);

  useEffect(() => {
    const deadline = proposal?.confirm_deadline_at;
    if (!deadline) {
      setCountdownText('--:--:--');
      return;
    }
    const tick = () => {
      const ms = Math.max(0, new Date(deadline).getTime() - Date.now());
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600)
        .toString()
        .padStart(1, '0');
      const m = Math.floor((totalSec % 3600) / 60)
        .toString()
        .padStart(2, '0');
      const s = (totalSec % 60).toString().padStart(2, '0');
      setCountdownText(`${h}:${m}:${s}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [proposal?.confirm_deadline_at]);

  const proposalUi = useMemo(() => {
    const myId = profile?.id ?? '';
    const players = proposalMatch?.match_players ?? [];
    const byTeam = new Map<string, Array<NonNullable<(typeof players)[number]['players']>>>();
    for (const p of players) {
      const player = p.players;
      if (!player || !p.team) continue;
      const list = byTeam.get(p.team) ?? [];
      list.push(player);
      byTeam.set(p.team, list);
    }
    let myTeam = '';
    for (const p of players) {
      if (p.players?.id === myId) {
        myTeam = p.team;
        break;
      }
    }
    const teammate =
      (byTeam.get(myTeam) ?? []).find((p) => p.id !== myId) ?? null;
    const rivalTeams = [...byTeam.entries()].filter(([t]) => t !== myTeam);
    const rivals = rivalTeams.flatMap(([, list]) => list).slice(0, 2);
    const rivalLabel = rivals
      .map((p) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim())
      .filter(Boolean)
      .join(' & ');

    const club = proposalMatch?.bookings?.courts?.clubs;
    const startAt = proposalMatch?.bookings?.start_at;
    const startDate = startAt ? new Date(startAt) : null;
    const weekday = startDate
      ? startDate.toLocaleDateString('es-ES', { weekday: 'long' })
      : 'Sin fecha';
    const hour = startDate
      ? startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : '--:--';
    const timeLabel = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${hour}`;
    return {
      teammateName: teammate
        ? `${teammate.first_name ?? ''} ${teammate.last_name ?? ''}`.trim()
        : 'Compañero pendiente',
      teammateLevel: teammate?.elo_rating != null ? `Nivel ${Number(teammate.elo_rating).toFixed(2)}` : 'Nivel —',
      rivals: rivalLabel || 'Pareja rival pendiente',
      rivalsMeta:
        proposal?.pre_match_win_prob != null
          ? `Win prob: ${Math.round(proposal.pre_match_win_prob * 100)}%`
          : 'Win prob: —',
      clubName: club?.name ?? 'Club pendiente',
      clubDistance: '2.3 km',
      dateTime: timeLabel,
      duration: 'Duración: 1.5 - 2 horas',
    };
  }, [profile?.id, proposal?.pre_match_win_prob, proposalMatch]);

  useEffect(() => {
    if (step !== 'queue') return;
    const timer = setInterval(() => {
      setQueueElapsedSec((v) => v + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  const queueElapsedLabel = useMemo(() => {
    const mm = Math.floor(queueElapsedSec / 60)
      .toString()
      .padStart(2, '0');
    const ss = (queueElapsedSec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }, [queueElapsedSec]);

  const myRankingRow = useMemo(() => {
    if (!profile) return null;
    const meName = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || 'Tú';
    return {
      name: meName,
      level: profile.eloRating ? `Nivel ${Number(profile.eloRating).toFixed(2)}` : 'Nivel —',
      wl: `${profile.mmWins ?? 0}V / ${profile.mmLosses ?? 0}D`,
      lp: profile.lps ?? 0,
    };
  }, [profile]);

  return (
    <View style={styles.container}>
      {step === 'home' ? (
        <Pressable style={[styles.backFab, { top: Math.max(insets.top + 4, 12) }]} onPress={onBack}>
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </Pressable>
      ) : null}

      {step === 'home' && (
        <ScrollView
          contentContainerStyle={[
            styles.homeContent,
            { paddingTop: Math.max(insets.top + 36, 44), paddingBottom: insets.bottom + 28 },
          ]}
        >
          {(status?.status === 'searching' || status?.status === 'matched') && (
            <Pressable
              style={styles.resumeBanner}
              onPress={() => setStep(status.status === 'matched' ? 'found' : 'queue')}
            >
              <Ionicons name="radio-outline" size={16} color="#F59E0B" />
              <Text style={styles.resumeBannerText}>
                {status.status === 'matched'
                  ? 'Tienes partido encontrado'
                  : 'Búsqueda en curso en segundo plano'}
              </Text>
            </Pressable>
          )}

          <LinearGradient colors={['#3C1E00', '#15100A', '#0F0F0F']} locations={[0, 0.55, 1]} style={styles.hero}>
            <View style={styles.badge}>
              <View style={styles.badgeDot} />
              <Text style={styles.badgeText}>LIGA COMPETITIVA</Text>
            </View>
            <Text style={styles.heroCap}>TU DIVISIÓN ACTUAL</Text>
            <View style={styles.heroMainRow}>
              <View style={styles.medalBox}>
                <Text style={styles.medalEmoji}>🏅</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.division}>{division ?? '—'}</Text>
                <Text style={styles.divisionRank}>
                  {profile?.mmPeakLiga ? `Pico: ${profile.mmPeakLiga}` : 'Sin histórico'}
                </Text>
                <View style={styles.statsLine}>
                  <Text style={styles.statUp}>↗ {winCount}V</Text>
                  <Text style={styles.statDown}>↘ {lossCount}D</Text>
                  <Text style={styles.statWr}>WR {wr}%</Text>
                </View>
              </View>
            </View>
            <View style={styles.lpRow}>
              <Text style={styles.lpCap}>LEAGUE POINTS (LP)</Text>
              <Text style={styles.lp}>{profile?.lps ?? 0} / 100 LP</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${progressPct}%` }]} />
            </View>
            <Text style={styles.heroFoot}>Ranking reiniciado al final del Pase Temporada 1</Text>
          </LinearGradient>

          <View style={styles.tabRow}>
            <Pressable style={[styles.tabBtn, mainTab === 'liga' && styles.tabBtnActive]} onPress={() => setMainTab('liga')}>
              <Text style={styles.tabText}>Mi liga</Text>
            </Pressable>
            <Pressable
              style={[styles.tabBtn, mainTab === 'ranking' && styles.tabBtnActive]}
              onPress={() => setMainTab('ranking')}
            >
              <Text style={styles.tabText}>Ranking</Text>
            </Pressable>
          </View>

          {mainTab === 'liga' ? (
            <>
              <LinearGradient colors={['#4B2403', '#A56611']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.searchCard}>
                <Pressable style={styles.searchCardPress} onPress={() => setStep('prefs')}>
                  <View style={styles.searchIconWrap}>
                    <Ionicons name="flash-outline" size={22} color="#fff" />
                  </View>
                  <View style={styles.searchTextWrap}>
                    <Text style={styles.searchTitle}>Buscar partido</Text>
                    <Text style={styles.searchSubtitle}>Matchmaking competitivo 2v2</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#f6ddbf" />
                </Pressable>
              </LinearGradient>

              <View style={styles.recentHeader}>
                <Text style={styles.recentHeaderLeft}>Partidos recientes</Text>
                <Text style={styles.recentHeaderRight}>Temporada actual</Text>
              </View>
              <View style={styles.recentWrap}>
                {recentMatchRows.map((row) => (
                  <Pressable key={row.id} style={styles.recentCard}>
                    <View style={styles.recentHead}>
                      <Text style={styles.recentTitle}>{row.title}</Text>
                      <Text style={[styles.recentLp, styles.lpZero]}>—</Text>
                    </View>
                    <View style={styles.recentSubRow}>
                      <Text style={styles.recentSub}>{row.subtitle}</Text>
                      <Text style={styles.recentWhen}>{row.when}</Text>
                    </View>
                  </Pressable>
                ))}
                {recentMatchRows.length === 0 && (
                  <View style={styles.recentCard}>
                    <Text style={styles.recentSub}>Aún no hay partidos competitivos recientes.</Text>
                  </View>
                )}
              </View>

              <View style={styles.howCard}>
                <Text style={styles.howTitle}>Cómo funciona la liga</Text>
                <Text style={styles.howLine}>⚔️ Todos los partidos son 2v2 por parejas</Text>
                <Text style={styles.howLine}>↗ Victoria: +20 a +25 LP según el nivel del rival</Text>
                <Text style={styles.howLine}>↘ Derrota: -15 a -20 LP según la diferencia de nivel</Text>
                <Text style={styles.howLine}>★ Al llegar a 100 LP subes de división automáticamente</Text>
                <Text style={styles.howLine}>🔁 Los rankings se reinician al final de cada Pase de Temporada</Text>
              </View>
            </>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={styles.rankingHeader}>
                <View>
                  <Text style={styles.rankingDivision}>{division ?? 'Oro II'}</Text>
                  <Text style={styles.rankingSub}>20 jugadores en tu división</Text>
                </View>
                <View style={styles.topPill}>
                  <Text style={styles.topPillText}>Top 20</Text>
                </View>
              </View>
              <View style={styles.rankingNoticeCard}>
                <Text style={styles.rankingNoticeTitle}>Ranking global no disponible</Text>
                <Text style={styles.rankingNoticeSub}>
                  Cuando esté disponible el endpoint del leaderboard, acá se mostrará el Top 20 real.
                </Text>
              </View>
              {myRankingRow ? (
                <View style={[styles.rankRow, styles.rankRowMe]}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankBadgeText}>—</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rankName}>{myRankingRow.name}</Text>
                    <Text style={styles.rankMeta}>
                      {myRankingRow.level} · {myRankingRow.wl}
                    </Text>
                  </View>
                  <Text style={styles.rankLp}>{myRankingRow.lp} LP</Text>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      )}

      {step === 'prefs' && (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.stepHeader}>
            <Pressable style={styles.stepBackBtn} onPress={() => setStep('home')}>
              <Ionicons name="arrow-back" size={16} color="#fff" />
            </Pressable>
            <View>
              <Text style={styles.sectionTitle}>Preferencias de partido</Text>
              <Text style={styles.stepSubtitle}>
                Ajusta los parámetros para encontrar tu partido ideal
              </Text>
            </View>
          </View>

          <View style={styles.prefsCard}>
            <Text style={styles.prefsSectionTitle}>Formato de partido</Text>
            <View style={styles.fixedModeRow}>
              <View style={styles.fixedModeIcon}>
                <Ionicons name="people" size={18} color="#F18F34" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fixedModeTitle}>2v2 - Por parejas</Text>
                <Text style={styles.fixedModeSub}>Todos los partidos competitivos son por parejas</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color="#F18F34" />
            </View>
          </View>

          <OptionRow
            title="Horario preferido"
            sectionIcon="time-outline"
            options={[
              { id: 'manana', label: 'Mañana', subtitle: '6:00 - 12:00', iconName: 'sunny-outline' },
              { id: 'tarde', label: 'Tarde', subtitle: '12:00 - 18:00', iconName: 'sunny' },
              { id: 'noche', label: 'Noche', subtitle: '18:00 - 23:00', iconName: 'moon-outline' },
            ]}
            value={form.time}
            onChange={(v) => setForm((p) => ({ ...p, time: v as SearchForm['time'] }))}
            large
          />

          <View style={styles.optionSection}>
            <View style={styles.distanceTitleRow}>
              <View style={styles.optionTitleRow}>
                <Ionicons name="location-outline" size={14} color="#F59E0B" />
                <Text style={styles.optionTitleStrong}>Distancia máxima</Text>
              </View>
              <Text style={styles.distanceValue}>{distanceKm} km</Text>
            </View>
            <View
              style={styles.sliderTrack}
              onLayout={(e: LayoutChangeEvent) =>
                setDistanceTrackWidth(Math.max(1, e.nativeEvent.layout.width))
              }
            >
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={(e) => {
                  const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / distanceTrackWidth));
                  setDistanceKm(Math.max(1, Math.round(1 + ratio * 49)));
                }}
              />
              <View style={[styles.sliderFill, { width: `${((distanceKm - 1) / 49) * 100}%` }]} />
              <View
                style={[
                  styles.sliderThumb,
                  { left: `${((distanceKm - 1) / 49) * 100}%`, transform: [{ translateX: -8 }] },
                ]}
              />
            </View>
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>1 km</Text>
              <Text style={styles.sliderLabel}>50 km</Text>
            </View>
          </View>

          <OptionRow
            title="Modalidad"
            sectionIcon="shield-outline"
            options={[
              { id: 'male', label: 'Masculino', iconName: 'person-outline' },
              { id: 'female', label: 'Femenino', iconName: 'woman-outline' },
              { id: 'mixed', label: 'Mixto', iconName: 'people-outline' },
            ]}
            value={form.gender}
            onChange={(v) => setForm((p) => ({ ...p, gender: v as SearchForm['gender'] }))}
          />
          <OptionRow
            title="Lado preferido"
            sectionIcon="compass-outline"
            options={[
              { id: 'backhand', label: 'Izquierda', iconName: 'arrow-back-circle-outline' },
              { id: 'drive', label: 'Derecha', iconName: 'arrow-forward-circle-outline' },
              { id: 'any', label: 'Ambos', iconName: 'swap-horizontal-outline' },
            ]}
            value={form.preferred_side}
            onChange={(v) => setForm((p) => ({ ...p, preferred_side: v as SearchForm['preferred_side'] }))}
          />

          <View style={styles.optionSection}>
            <View style={styles.optionTitleRow}>
              <Ionicons name="location-outline" size={14} color="#F59E0B" />
              <Text style={styles.optionTitle}>Clubes preferidos (opcional)</Text>
            </View>
            {clubOptions.length === 0 ? (
              <Text style={styles.clubEmpty}>No hay clubes disponibles en tus partidos recientes.</Text>
            ) : (
              clubOptions.map((club) => {
                const active = preferredClubIds.includes(club.id);
                return (
                  <Pressable
                    key={club.id}
                    style={[styles.clubRow, active && styles.clubRowActive]}
                    onPress={() =>
                      setPreferredClubIds((prev) =>
                        prev.includes(club.id) ? prev.filter((id) => id !== club.id) : [...prev, club.id],
                      )
                    }
                  >
                    <Text style={[styles.clubName, active && styles.clubNameActive]}>{club.name}</Text>
                    {active ? <Ionicons name="checkmark-circle" size={18} color="#F59E0B" /> : null}
                  </Pressable>
                );
              })
            )}
          </View>

          <Pressable style={styles.primaryBtn} onPress={() => void handleJoinQueue()} disabled={loading}>
            <Ionicons name="flash" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>
              {loading ? 'Buscando...' : 'Buscar partido competitivo'}
            </Text>
          </Pressable>
          {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
        </ScrollView>
      )}

      {step === 'queue' && (
        <View style={[styles.content, { paddingTop: Math.max(insets.top + 10, 18), paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.queueTopRow}>
            <Pressable style={styles.stepBackBtn} onPress={() => setStep('home')}>
              <Ionicons name="arrow-back" size={16} color="#fff" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Buscando partido...</Text>
              <Text style={styles.stepSubtitle}>Tiempo en cola: {queueElapsedLabel}</Text>
            </View>
            <View style={styles.queuePlayersBox}>
              <Text style={styles.queuePlayersCaption}>Jugadores en cola</Text>
              <Text style={styles.queuePlayersValue}>144</Text>
            </View>
          </View>

          <View style={styles.queuePulseOuter}>
            <View style={styles.queuePulseInner}>
              <LinearGradient colors={['#8A4A0B', '#D4861F']} style={styles.queuePulseCore}>
                <Ionicons name="flash-outline" size={28} color="#fff" />
              </LinearGradient>
            </View>
          </View>

          <View style={styles.queueCenter}>
            <Text style={styles.queueTitle}>Buscando partido...</Text>
            <Text style={styles.queueCaption}>Buscando compañero y pareja de rivales</Text>
          </View>

          <View style={styles.queueSummaryBox}>
            <View style={styles.queueSummaryRow}><Text style={styles.queueKey}>Formato</Text><Text style={styles.queueVal}>2v2 (Por parejas)</Text></View>
            <View style={styles.queueSummaryRow}><Text style={styles.queueKey}>Horario</Text><Text style={styles.queueVal}>{form.time === 'manana' ? 'Mañana' : form.time === 'tarde' ? 'Tarde' : 'Noche'}</Text></View>
            <View style={styles.queueSummaryRow}><Text style={styles.queueKey}>Distancia</Text><Text style={styles.queueVal}>Hasta {distanceKm} km</Text></View>
            <View style={styles.queueSummaryRow}><Text style={styles.queueKey}>Modalidad</Text><Text style={styles.queueVal}>{form.gender === 'male' ? 'Masculino' : form.gender === 'female' ? 'Femenino' : form.gender === 'mixed' ? 'Mixto' : 'Sin pref.'}</Text></View>
            <View style={styles.queueSummaryRow}><Text style={styles.queueKey}>Lado</Text><Text style={styles.queueVal}>{form.preferred_side === 'drive' ? 'Derecha' : form.preferred_side === 'backhand' ? 'Izquierda' : 'Ambos'}</Text></View>
          </View>

          <View style={styles.queueBgCard}>
            <View style={styles.queueBgHead}>
              <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
              <Text style={styles.queueBgTitle}>Búsqueda en segundo plano</Text>
            </View>
            <Text style={styles.queueBgText}>
              puedes volver atrás y seguir usando la app. Te avisaremos cuando encontremos tu partido.
            </Text>
          </View>

          <Pressable style={styles.primaryBtn} onPress={() => setStep('home')}>
            <Text style={styles.primaryBtnText}>Minimizar búsqueda</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => void handleLeaveQueue()}>
            <Text style={styles.secondaryBtnText}>Cancelar búsqueda</Text>
          </Pressable>
          {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
        </View>
      )}

      {step === 'found' && (
        <View style={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.foundTop}>
            <View style={styles.foundTopIcon}>
              <Ionicons name="checkmark" size={14} color="#34d399" />
            </View>
            <View>
              <Text style={styles.foundTopTitle}>¡Partido encontrado!</Text>
              <Text style={styles.foundTopSub}>Confirma para reservar tu lugar</Text>
            </View>
          </View>

          <View style={styles.foundCardTeammate}>
            <Text style={styles.foundLabel}>TU COMPAÑERO</Text>
            <Text style={styles.foundName}>{proposalUi.teammateName}</Text>
            <Text style={styles.foundMeta}>{proposalUi.teammateLevel}</Text>
          </View>

          <View style={styles.foundCardRivals}>
            <Text style={styles.foundLabel}>PAREJA RIVAL</Text>
            <Text style={styles.foundName}>{proposalUi.rivals}</Text>
            <Text style={styles.foundMeta}>{proposalUi.rivalsMeta}</Text>
          </View>

          <View style={styles.foundInfoCard}>
            <Text style={styles.foundInfoMain}>{proposalUi.clubName}</Text>
            <Text style={styles.foundInfoSub}>{proposalUi.clubDistance}</Text>
            <Text style={[styles.foundInfoMain, { marginTop: 10 }]}>{proposalUi.dateTime}</Text>
            <Text style={styles.foundInfoSub}>{proposalUi.duration}</Text>
          </View>

          <View style={styles.foundLpCard}>
            <Text style={styles.foundLpText}>Victoria = +20-25 LP · Derrota = -15-20 LP</Text>
          </View>

          <View style={styles.foundCountdownCard}>
            <Text style={styles.foundCountdownHint}>Tienes 3 horas para confirmar</Text>
            <Text style={styles.foundCountdown}>{countdownText}</Text>
          </View>

          <View style={styles.foundWarning}>
            <Text style={styles.foundWarningText}>
              Si rechazas, volverás a la cola y perderás este partido.
            </Text>
          </View>

          <Pressable style={styles.primaryBtn} onPress={() => void handleOpenProposal()} disabled={openingProposal}>
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>{openingProposal ? 'Abriendo...' : '¡Confirmar partido!'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => void handleRejectProposal()}>
            <Text style={styles.secondaryBtnText}>Rechazar</Text>
          </Pressable>
          {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
        </View>
      )}
    </View>
  );
}

type OptionItem = {
  id: string;
  label: string;
  subtitle?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
};

function OptionRow({
  title,
  sectionIcon,
  options,
  value,
  onChange,
  large = false,
}: {
  title: string;
  sectionIcon?: keyof typeof Ionicons.glyphMap;
  options: OptionItem[];
  value: string;
  onChange: (value: string) => void;
  large?: boolean;
}) {
  return (
    <View style={styles.optionSection}>
      <View style={styles.optionTitleRow}>
        {sectionIcon ? <Ionicons name={sectionIcon} size={14} color="#F59E0B" /> : null}
        <Text style={styles.optionTitle}>{title}</Text>
      </View>
      <View style={styles.optionWrap}>
        {options.map(({ id, label, subtitle, iconName }) => (
          <Pressable
            key={id}
            style={[styles.optionChip, large && styles.optionChipLarge, value === id && styles.optionChipActive]}
            onPress={() => onChange(id)}
          >
            {iconName ? (
              <Ionicons
                name={iconName}
                size={large ? 18 : 20}
                color={value === id ? '#F59E0B' : '#9ca3af'}
                style={styles.optionIcon}
              />
            ) : null}
            <Text style={[styles.optionChipText, value === id && styles.optionChipTextActive]}>{label}</Text>
            {subtitle ? <Text style={styles.optionChipSub}>{subtitle}</Text> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  backFab: {
    position: 'absolute',
    left: 14,
    zIndex: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  homeContent: { paddingHorizontal: 10, gap: 8 },
  content: { padding: 14, gap: 10 },
  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    backgroundColor: 'rgba(245,158,11,0.12)',
    padding: 10,
  },
  resumeBannerText: { color: '#fcd34d', fontSize: 12, fontWeight: '700' },
  hero: { borderRadius: 18, padding: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.28)' },
  badge: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.28)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    backgroundColor: 'rgba(20,20,20,0.38)',
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
  badgeText: { color: '#f4c26b', fontSize: 11, fontWeight: '800' },
  heroCap: { color: '#8f8f8f', fontSize: 10, marginBottom: 6 },
  heroMainRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  medalBox: {
    width: 62,
    height: 62,
    borderRadius: 14,
    backgroundColor: 'rgba(245,158,11,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalEmoji: { fontSize: 28 },
  division: { color: '#f59e0b', fontSize: 30, fontWeight: '900', lineHeight: 32 },
  divisionRank: { color: '#d1d5db', fontSize: 21, fontWeight: '900', marginTop: -2 },
  statsLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  statUp: { color: '#34d399', fontSize: 11, fontWeight: '700' },
  statDown: { color: '#f87171', fontSize: 11, fontWeight: '700' },
  statWr: { color: '#d1d5db', fontSize: 11, fontWeight: '800' },
  lpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  lpCap: { color: '#a3a3a3', fontSize: 10, fontWeight: '800' },
  lp: { color: '#fff', fontSize: 20, fontWeight: '900' },
  track: { height: 8, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#f59e0b' },
  heroFoot: { marginTop: 6, color: '#8f8f8f', fontSize: 10, textAlign: 'center' },
  tabRow: { flexDirection: 'row', gap: 8, marginTop: 0 },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  tabBtnActive: { backgroundColor: 'rgba(245,158,11,0.28)', borderColor: 'rgba(245,158,11,0.45)' },
  tabText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  recentWrap: { gap: 8 },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  recentHeaderLeft: { color: '#f3f4f6', fontSize: 13, fontWeight: '900' },
  recentHeaderRight: { color: '#9ca3af', fontSize: 11, fontWeight: '600' },
  recentCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 10,
  },
  recentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentTitle: { color: '#f3f4f6', fontSize: 14, fontWeight: '800', flex: 1, paddingRight: 8 },
  recentLp: { fontSize: 22, fontWeight: '900' },
  lpZero: { color: '#9ca3af' },
  recentSubRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  recentSub: { color: '#9ca3af', fontSize: 11 },
  recentWhen: { color: '#9ca3af', fontSize: 11 },
  howCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    gap: 6,
  },
  howTitle: { color: '#f3f4f6', fontSize: 14, fontWeight: '900', marginBottom: 2 },
  howLine: { color: '#d1d5db', fontSize: 12, lineHeight: 16 },
  searchCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    overflow: 'hidden',
  },
  searchCardPress: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(0,0,0,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchTextWrap: { flex: 1 },
  searchTitle: { color: '#fff', fontSize: 14, fontWeight: '900', lineHeight: 16 },
  searchSubtitle: { color: '#faecd6', fontSize: 10, marginTop: 1, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: '#F18F34',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  secondaryBtnText: { color: '#d1d5db', fontWeight: '700' },
  infoTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  infoLine: { color: '#d1d5db', fontSize: 13 },
  rankingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  rankingDivision: { color: '#fff', fontSize: 15, fontWeight: '900' },
  rankingSub: { color: '#9ca3af', fontSize: 12, marginTop: 1 },
  topPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.5)',
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  topPillText: { color: '#fbbf24', fontSize: 11, fontWeight: '800' },
  rankingNoticeCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  rankingNoticeTitle: { color: '#fff', fontSize: 12, fontWeight: '800' },
  rankingNoticeSub: { color: '#9ca3af', fontSize: 11, marginTop: 2, lineHeight: 15 },
  rankRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankRowMe: {
    borderColor: 'rgba(245,158,11,0.45)',
    backgroundColor: 'rgba(245,158,11,0.1)',
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  rankBadgeTop: { backgroundColor: 'rgba(245,158,11,0.22)' },
  rankBadgeText: { color: '#e5e7eb', fontSize: 11, fontWeight: '800' },
  rankBadgeTextTop: { color: '#fbbf24' },
  rankName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  rankMeta: { color: '#9ca3af', fontSize: 12, marginTop: 1 },
  rankLp: { color: '#fff', fontSize: 15, fontWeight: '900' },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  stepSubtitle: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  stepBackBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  prefsCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    gap: 8,
  },
  prefsSectionTitle: { color: '#d1d5db', fontSize: 11, fontWeight: '700' },
  fixedModeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fixedModeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  fixedModeTitle: { color: '#fff', fontSize: 13, fontWeight: '800' },
  fixedModeSub: { color: '#9ca3af', fontSize: 11 },
  optionSection: { gap: 8 },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optionTitle: { color: '#f3f4f6', fontSize: 14, fontWeight: '800' },
  optionTitleStrong: { color: '#f3f4f6', fontSize: 14, fontWeight: '800' },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 84,
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionChipLarge: {
    minHeight: 64,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  optionChipActive: {
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderColor: 'rgba(245,158,11,0.45)',
  },
  optionIcon: { marginBottom: 4 },
  optionChipText: { color: '#d1d5db', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  optionChipSub: { color: '#9ca3af', fontSize: 10, marginTop: 1, textAlign: 'center' },
  optionChipTextActive: { color: '#fff' },
  distanceTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  distanceValue: { color: '#F59E0B', fontWeight: '800', fontSize: 12 },
  sliderTrack: {
    height: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(12,31,66,0.7)',
    overflow: 'visible',
    marginTop: 6,
  },
  sliderFill: { height: '100%', borderRadius: 99, backgroundColor: 'rgba(245,158,11,0.55)' },
  sliderThumb: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1f8dff',
  },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  sliderLabel: { color: '#9ca3af', fontSize: 11 },
  clubRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clubRowActive: {
    borderColor: 'rgba(245,158,11,0.45)',
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  clubName: { color: '#d1d5db', fontSize: 13, fontWeight: '700', flex: 1, paddingRight: 8 },
  clubNameActive: { color: '#fff' },
  clubEmpty: { color: '#9ca3af', fontSize: 12 },
  queueCenter: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 24, paddingBottom: 6 },
  queueTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  queueCaption: { color: '#d1d5db', fontSize: 12 },
  queueTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  queuePlayersBox: { alignItems: 'flex-end' },
  queuePlayersCaption: { color: '#9ca3af', fontSize: 10 },
  queuePlayersValue: { color: '#F59E0B', fontSize: 28, fontWeight: '900', lineHeight: 30 },
  queuePulseOuter: {
    alignSelf: 'center',
    marginTop: 14,
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  queuePulseInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  queuePulseCore: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueSummaryBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
    gap: 7,
    marginTop: 6,
  },
  queueSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  queueKey: { color: '#b9b9b9', fontSize: 12 },
  queueVal: { color: '#fff', fontSize: 13, fontWeight: '700' },
  queueBgCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    marginTop: 2,
  },
  queueBgHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  queueBgTitle: { color: '#fff', fontSize: 13, fontWeight: '800' },
  queueBgText: { color: '#9ca3af', fontSize: 11, lineHeight: 15 },
  summaryBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    gap: 4,
  },
  summaryLine: { color: '#d1d5db', fontSize: 12 },
  foundCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    backgroundColor: 'rgba(34,197,94,0.1)',
    padding: 14,
    gap: 6,
  },
  foundTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  foundTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  foundTopIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
  },
  foundTopTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  foundTopSub: { color: '#9ca3af', fontSize: 12 },
  foundCardTeammate: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.55)',
    backgroundColor: 'rgba(16,185,129,0.12)',
    padding: 12,
  },
  foundCardRivals: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
  },
  foundLabel: { color: '#f59e0b', fontSize: 11, fontWeight: '800', marginBottom: 4 },
  foundName: { color: '#fff', fontSize: 18, fontWeight: '900' },
  foundMeta: { color: '#d1d5db', fontSize: 12, marginTop: 1 },
  foundInfoCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
  },
  foundInfoMain: { color: '#fff', fontSize: 16, fontWeight: '800' },
  foundInfoSub: { color: '#9ca3af', fontSize: 12 },
  foundLpCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    backgroundColor: 'rgba(245,158,11,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  foundLpText: { color: '#fbbf24', fontSize: 12, fontWeight: '700' },
  foundCountdownCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    alignItems: 'center',
  },
  foundCountdownHint: { color: '#9ca3af', fontSize: 11 },
  foundCountdown: { color: '#F59E0B', fontSize: 33, fontWeight: '900', marginTop: 2 },
  foundWarning: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.5)',
    backgroundColor: 'rgba(239,68,68,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  foundWarningText: { color: '#fca5a5', fontSize: 12, fontWeight: '600' },
  errorText: { color: '#fca5a5', fontSize: 12, marginTop: 4 },
});
