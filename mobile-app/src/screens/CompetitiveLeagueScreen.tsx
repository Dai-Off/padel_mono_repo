import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import Slider from '@react-native-community/slider';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MATCHMAKING_DEMO } from '../config';
import { haversineKm } from '../lib/geoDistance';
import {
  probeDeviceLocationIssue,
  resolveDeviceSearchCoordinatesFast,
  type LocationIssue,
  type SearchCoordinates,
} from '../lib/matchSearchLocation';
import { useAuth } from '../contexts/AuthContext';
import { Skeleton } from '../components/ui/Skeleton';
import { ClubMultiSelectPicker } from '../components/clubs/ClubMultiSelectPicker';
import { PlayerSelectModal } from '../components/matchmaking/PlayerSelectModal';
import { FilterBottomSheet } from '../components/filters/FilterBottomSheet';
import { useClubCatalog } from '../hooks/useClubCatalog';
import { resolveSavedFavoriteClubIds } from '../lib/favoriteClubIds';
import { computeMatchAvailabilityWindow } from '../lib/matchAvailabilityWindow';
import { saveStoredPreferredClubIds } from '../lib/preferredClubsStorage';
import { fetchMatchById, type MatchEnriched } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import type { PartidoItem } from './PartidosScreen';
import {
  fetchMatchmakingProposal,
  fetchMatchmakingStatus,
  isMatchmakingFlowPending,
  joinMatchmaking,
  startSearchPairInvite,
  leaveMatchmaking,
  rejectMatchmakingProposal,
  type MatchmakingJoinPayload,
  type MatchmakingLeagueConfigRow,
  type MatchmakingLeaderboardRow,
  type MatchmakingProposalResponse,
  type MatchmakingStatusResponse,
  type PairInvite,
} from '../api/matchmaking';
import { useMyProfile } from '../queries/profile';
import { useQueryClient } from '@tanstack/react-query';
import { matchmakingKeys } from '../queries/keys';
import {
  useMatchmakingLeaderboardInfinite,
  useMatchmakingLeagueConfigQuery,
  useRecentMatchmakingMatchesQuery,
} from '../queries/matchmaking';
import { useTranslation } from '../i18n';
import { getMatchBooking } from '../domain/matchLifecycle';
import { AvatarWithFrame } from '../components/profile/AvatarWithFrame';

/** Iniciales (máx 2) a partir del nombre para el avatar del ranking. */
function rankInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase() || '?';
}

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
  gender: 'any',
  search_area: 'club',
};
const FLOW_TOP_PADDING = 12;
const RANKING_PAGE_SIZE = 15;

type Props = {
  onBack: () => void;
  onPartidoPress?: (partido: PartidoItem) => void;
  /** Abre el perfil público de un jugador del ranking. */
  onOpenPlayer?: (playerId: string) => void;
  entryIntent?: 'default' | 'queue' | 'prefs';
  queueElapsedSec: number;
  setQueueElapsedSec: Dispatch<SetStateAction<number>>;
  queueStartedAtMs: number | null;
  setQueueStartedAtMs: Dispatch<SetStateAction<number | null>>;
  matchmakingBannerState?: 'hidden' | 'searching' | 'matched' | 'timed_out';
  onMatchmakingBannerStateChange?: (
    state: 'hidden' | 'searching' | 'matched' | 'timed_out',
    options?: { force?: boolean },
  ) => void;
  /** Compañero (invitación aceptada) con quien ir directo a buscar al abrir la pantalla. */
  pendingPartnerInvite?: PairInvite | null;
  onPartnerApplied?: () => void;
};

export function CompetitiveLeagueScreen({
  onBack,
  onPartidoPress,
  onOpenPlayer,
  entryIntent = 'default',
  queueElapsedSec,
  setQueueElapsedSec,
  queueStartedAtMs,
  setQueueStartedAtMs,
  matchmakingBannerState = 'hidden',
  onMatchmakingBannerStateChange,
  pendingPartnerInvite,
  onPartnerApplied,
}: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const queryClient = useQueryClient();
  // Status sembrado desde la query global (MatchmakingContext ya la poll-ea a
  // nivel app): al abrir/reabrir la pantalla no re-parpadea el skeleton si el
  // estado ya se conoce. El bootstrap de abajo revalida en silencio.
  const cachedStatus = userId
    ? queryClient.getQueryData<MatchmakingStatusResponse>(matchmakingKeys.status(userId)) ?? null
    : null;
  const [mainTab, setMainTab] = useState<MainTab>('liga');
  const [step, setStep] = useState<Step>('home');
  const [form, setForm] = useState<SearchForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [openingProposal, setOpeningProposal] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isHomeBootstrapping, setIsHomeBootstrapping] = useState(cachedStatus == null);
  // Profile compartido del HomeDataContext (evita un GET /players/me al montar).
  const profile = useMyProfile().data ?? null;
  const { t } = useTranslation();
  // Config de divisiones desde React Query (cachea entre aperturas).
  const leagueRows = useMatchmakingLeagueConfigQuery().data ?? null;
  // Ranking desde React Query (infinite): cachea por liga entre aperturas, así
  // no re-parpadea el skeleton al reentrar en la pestaña con la misma liga.
  const playerLiga = profile?.liga?.trim() || null;
  const leaderboardQuery = useMatchmakingLeaderboardInfinite(
    mainTab === 'ranking' ? playerLiga : null,
  );
  const rankingRows = useMemo(
    () => leaderboardQuery.data?.pages.flatMap((p) => p.rows) ?? [],
    [leaderboardQuery.data],
  );
  const rankingTotal = leaderboardQuery.data?.pages[0]?.total ?? 0;
  const rankingHasMore = Boolean(leaderboardQuery.hasNextPage);
  const rankingLoading = leaderboardQuery.isLoading;
  const rankingLoadingMore = leaderboardQuery.isFetchingNextPage;
  const rankingError = leaderboardQuery.isError
    ? t('competitive.screen.errors.rankingLoadFailed')
    : null;
  const [status, setStatus] = useState<MatchmakingStatusResponse | null>(cachedStatus);
  const [proposal, setProposal] = useState<MatchmakingProposalResponse | null>(null);
  const [proposalMatch, setProposalMatch] = useState<MatchEnriched | null>(null);
  const [recentMatchRows, setRecentMatchRows] = useState<
    Array<{ id: string; title: string; subtitle: string; when: string }>
  >([]);
  const [preferredClubIds, setPreferredClubIds] = useState<string[]>([]);
  const [clubPickerVisible, setClubPickerVisible] = useState(false);
  const [partnerPickerVisible, setPartnerPickerVisible] = useState(false);
  const [modeSheetVisible, setModeSheetVisible] = useState(false);
  const [searchPartner, setSearchPartner] = useState<PairInvite | null>(null);
  const [preferredClubsHydrated, setPreferredClubsHydrated] = useState(false);
  const preferredClubsSeedDoneRef = useRef(false);
  const { clubs: clubCatalog } = useClubCatalog();
  const [distanceKm, setDistanceKm] = useState(10);
  const [searchCoords, setSearchCoords] = useState<SearchCoordinates | null>(null);
  const [searchCoordsLoading, setSearchCoordsLoading] = useState(false);
  const [locationIssue, setLocationIssue] = useState<LocationIssue | null>(null);
  const [countdownText, setCountdownText] = useState<string>('--:--:--');
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAppliedEntryIntentRef = useRef<'default' | 'queue' | 'prefs' | null>(null);
  const refreshStatusRef = useRef<() => Promise<void>>(async () => {});

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async () => {
    const token = session?.access_token ?? null;
    if (!token) return;
    const s = await fetchMatchmakingStatus(token);
    setStatus(s);
    if (s?.status === 'matched') {
      const p = await fetchMatchmakingProposal(token);
      setProposal(p);
      if (isMatchmakingFlowPending(s, p)) {
        onMatchmakingBannerStateChange?.('matched');
        setQueueStartedAtMs(null);
        setQueueElapsedSec(0);
        setLoading(false);
        setStep('found');
        clearPollTimer();
        return;
      }
      onMatchmakingBannerStateChange?.('hidden', { force: true });
      setQueueStartedAtMs(null);
      setQueueElapsedSec(0);
      setProposal(null);
      setLoading(false);
      setStep('home');
      clearPollTimer();
      return;
    }
    if (s?.status !== 'searching') {
      if (matchmakingBannerState !== 'timed_out') onMatchmakingBannerStateChange?.('hidden');
      setQueueStartedAtMs(null);
      setQueueElapsedSec(0);
      setLoading(false);
      clearPollTimer();
      return;
    }
    onMatchmakingBannerStateChange?.('searching');
    pollTimerRef.current = setTimeout(() => {
      void pollStatus();
    }, 5000);
  }, [clearPollTimer, onMatchmakingBannerStateChange, session?.access_token, setQueueElapsedSec, setQueueStartedAtMs]);

  const refreshStatus = useCallback(async () => {
    const token = session?.access_token ?? null;
    if (!token) return;
    const s = await fetchMatchmakingStatus(token);
    setStatus(s);
    if (s?.status === 'matched') {
      clearPollTimer();
      const p = await fetchMatchmakingProposal(token);
      setProposal(p);
      if (isMatchmakingFlowPending(s, p)) {
        onMatchmakingBannerStateChange?.('matched');
        setQueueStartedAtMs(null);
        setQueueElapsedSec(0);
        setStep('found');
        return;
      }
      onMatchmakingBannerStateChange?.('hidden', { force: true });
      setQueueStartedAtMs(null);
      setQueueElapsedSec(0);
      setProposal(null);
      setStep('home');
      return;
    } else if (s?.status === 'searching') {
      onMatchmakingBannerStateChange?.('searching');
      if (queueStartedAtMs == null) setQueueStartedAtMs(Date.now());
      setProposal(null);
      void pollStatus();
    } else {
      if (matchmakingBannerState !== 'timed_out') onMatchmakingBannerStateChange?.('hidden');
      setQueueStartedAtMs(null);
      setQueueElapsedSec(0);
      setProposal(null);
    }
  }, [
    clearPollTimer,
    matchmakingBannerState,
    onMatchmakingBannerStateChange,
    pollStatus,
    queueStartedAtMs,
    session?.access_token,
    setQueueElapsedSec,
    setQueueStartedAtMs,
  ]);
  refreshStatusRef.current = refreshStatus;

  const loadMoreRanking = useCallback(() => {
    if (leaderboardQuery.hasNextPage && !leaderboardQuery.isFetchingNextPage) {
      void leaderboardQuery.fetchNextPage();
    }
  }, [leaderboardQuery]);

  const handleHomeScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (mainTab !== 'ranking' || rankingLoading || rankingLoadingMore || !rankingHasMore) return;
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 140) {
        loadMoreRanking();
      }
    },
    [loadMoreRanking, mainTab, rankingHasMore, rankingLoading, rankingLoadingMore],
  );

  useEffect(() => {
    const token = session?.access_token ?? null;
    let cancelled = false;
    if (!token) {
      setIsHomeBootstrapping(false);
      return () => clearPollTimer();
    }
    // No re-mostramos el skeleton si ya teníamos status cacheado (arranca en
    // false por el seed): revalidamos en silencio. Sin caché, isHomeBootstrapping
    // ya arranca en true, así que tampoco hace falta forzarlo aquí. Evita el
    // parpadeo contenido→skeleton→contenido al abrir.
    void refreshStatusRef.current().finally(() => {
      if (!cancelled) setIsHomeBootstrapping(false);
    });
    return () => {
      cancelled = true;
      clearPollTimer();
    };
  }, [clearPollTimer, session?.access_token]);

  useEffect(() => {
    if (lastAppliedEntryIntentRef.current === entryIntent) return;
    if (entryIntent === 'prefs') {
      setSearchPartner(null);
      setStep('prefs');
      if (matchmakingBannerState === 'timed_out') {
        setErrorText(t('competitive.screen.errors.timedOut'));
        // Limpiamos la búsqueda anterior: revierte la invitación de pareja a 'accepted' y nos
        // saca del pool, para que el reintento parta de cero (y la pareja siga en "Listos para jugar").
        const token = session?.access_token ?? null;
        if (token) void leaveMatchmaking(token);
      }
      lastAppliedEntryIntentRef.current = entryIntent;
      return;
    }
    if (entryIntent === 'queue' && status?.status === 'searching') {
      setStep('queue');
      lastAppliedEntryIntentRef.current = entryIntent;
      return;
    }
    if (entryIntent === 'default') {
      lastAppliedEntryIntentRef.current = entryIntent;
    }
  }, [entryIntent, matchmakingBannerState, status?.status]);

  // Llegada desde "Aceptar y buscar" del banner: ir a preferencias con ese compañero fijado.
  useEffect(() => {
    if (!pendingPartnerInvite) return;
    setSearchPartner(pendingPartnerInvite);
    setStep('prefs');
    onPartnerApplied?.();
  }, [pendingPartnerInvite, onPartnerApplied]);

  // Partidos recientes desde React Query (cachea entre aperturas); el mapeo a
  // filas sigue en la pantalla. Se sincroniza al state al llegar/cambiar el dato.
  const recentMatchesQuery = useRecentMatchmakingMatchesQuery(profile?.id);
  useEffect(() => {
    const myId = profile?.id;
    if (!myId || !recentMatchesQuery.data) return;
    const myMatches = recentMatchesQuery.data.filter((m) =>
      (m.match_players ?? []).some((mp) => mp.players?.id === myId),
    );
    setRecentMatchRows(toRecentRows(myMatches, myId));
  }, [recentMatchesQuery.data, profile?.id]);

  useEffect(() => {
    if (preferredClubsSeedDoneRef.current || clubCatalog.length === 0) return;

    let cancelled = false;
    void (async () => {
      const ids = await resolveSavedFavoriteClubIds(profile, clubCatalog);
      if (cancelled || preferredClubsSeedDoneRef.current) return;
      preferredClubsSeedDoneRef.current = true;
      if (ids.length > 0) setPreferredClubIds(ids);
      setPreferredClubsHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [clubCatalog, profile]);

  useEffect(() => {
    if (!preferredClubsHydrated) return;
    void saveStoredPreferredClubIds(preferredClubIds);
  }, [preferredClubIds, preferredClubsHydrated]);

  const preferredClubLabels = useMemo(() => {
    const byId = new Map(clubCatalog.map((c) => [c.id, c.name]));
    return preferredClubIds.map((id) => byId.get(id) ?? t('competitive.screen.fallback.club'));
  }, [clubCatalog, preferredClubIds]);

  const refreshSearchCoords = useCallback(async () => {
    if (MATCHMAKING_DEMO || preferredClubIds.length > 0) {
      setSearchCoords(null);
      setLocationIssue(null);
      setSearchCoordsLoading(false);
      return;
    }
    const issue = await probeDeviceLocationIssue(t);
    if (issue) {
      setLocationIssue(issue);
      setSearchCoords(null);
      setSearchCoordsLoading(false);
      return;
    }
    setLocationIssue(null);
    setSearchCoordsLoading(true);
    const res = await resolveDeviceSearchCoordinatesFast(5000, t);
    setSearchCoordsLoading(false);
    if (res.ok) {
      setSearchCoords(res.coords);
      setLocationIssue(null);
    } else {
      setSearchCoords(null);
      setLocationIssue({ message: res.error, action: 'retry' });
    }
  }, [preferredClubIds.length]);

  useEffect(() => {
    if (MATCHMAKING_DEMO || step !== 'prefs' || preferredClubIds.length > 0) {
      if (MATCHMAKING_DEMO) setSearchCoords(null);
      if (preferredClubIds.length > 0) {
        setLocationIssue(null);
        setSearchCoordsLoading(false);
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      const issue = await probeDeviceLocationIssue(t);
      if (cancelled) return;
      if (issue) {
        setLocationIssue(issue);
        setSearchCoords(null);
        setSearchCoordsLoading(false);
        return;
      }
      setLocationIssue(null);
      setSearchCoordsLoading(true);
      const res = await resolveDeviceSearchCoordinatesFast(5000, t);
      if (cancelled) return;
      setSearchCoordsLoading(false);
      if (res.ok) {
        setSearchCoords(res.coords);
        setLocationIssue(null);
      } else {
        setSearchCoords(null);
        setLocationIssue({ message: res.error, action: 'retry' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, preferredClubIds.length]);

  const handleActivateLocation = useCallback(async () => {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status === 'undetermined') {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== 'granted') {
        setLocationIssue({
          message: t('competitive.screen.prefs.locationPermission'),
          action: 'open_settings',
        });
        return;
      }
    } else if (perm.status !== 'granted') {
      await Linking.openSettings();
      return;
    } else {
      const servicesOn = await Location.hasServicesEnabledAsync();
      if (!servicesOn) {
        await Linking.openSettings();
        return;
      }
    }
    await refreshSearchCoords();
  }, [refreshSearchCoords]);

  const clubsInRange = useMemo(() => {
    if (preferredClubIds.length > 0) return [];
    if (MATCHMAKING_DEMO) {
      return clubCatalog.map((c) => ({ ...c, distance: null as number | null }));
    }
    if (!searchCoords) return [];
    return clubCatalog
      .filter((c) => c.lat != null && c.lng != null)
      .map((c) => ({
        ...c,
        distance: haversineKm(searchCoords, { lat: c.lat!, lng: c.lng! }),
      }))
      .filter((c) => c.distance <= distanceKm)
      .sort((a, b) => a.distance - b.distance);
  }, [clubCatalog, distanceKm, preferredClubIds.length, searchCoords]);

  const division = useMemo(() => {
    if (!profile) return null;
    const row = leagueRows?.find((r) => r.code === profile.liga);
    return row?.label ?? profile.liga ?? t('competitive.screen.fallback.noDivision');
  }, [profile, leagueRows, t]);

  // LP necesarios para ascender desde la liga actual (null en elite, que no asciende).
  const lpTarget = useMemo(() => {
    if (!profile) return null;
    const row = leagueRows?.find((r) => r.code === profile.liga);
    if (!row) return null;
    return row.lps_to_promote && row.lps_to_promote > 0 ? row.lps_to_promote : null;
  }, [profile, leagueRows]);

  const progressPct = useMemo(() => {
    if (!profile) return 0;
    const target = lpTarget ?? 100;
    const lps = profile.lps ?? 0;
    return Math.max(0, Math.min(100, Math.round((lps / target) * 100)));
  }, [profile, lpTarget]);
  const winCount = profile?.mmWins ?? 0;
  const lossCount = profile?.mmLosses ?? 0;
  const wr = winCount + lossCount > 0 ? Math.round((winCount / (winCount + lossCount)) * 100) : 0;

  const formatRelativeDate = (iso: string): string => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const days = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
    if (days === 0) return t('competitive.screen.relative.today');
    if (days === 1) return t('competitive.screen.relative.oneDayAgo');
    if (days < 7) return t('competitive.screen.relative.daysAgo', { n: days });
    const weeks = Math.floor(days / 7);
    if (weeks <= 1) return t('competitive.screen.relative.oneWeekAgo');
    return t('competitive.screen.relative.weeksAgo', { n: weeks });
  };

  function toRecentRows(matches: MatchEnriched[], myPlayerId: string) {
    return matches
      .filter((m) => m.type === 'matchmaking')
      .filter((m) => (m.match_players ?? []).some((mp) => mp.players?.id === myPlayerId))
      .filter((m) => {
        const startAt = getMatchBooking(m)?.start_at;
        const start = startAt ? new Date(startAt).getTime() : 0;
        return Number.isFinite(start) && start > 0 && start <= Date.now();
      })
      .sort((a, b) => {
        const sa = getMatchBooking(a)?.start_at ? new Date(getMatchBooking(a)!.start_at).getTime() : 0;
        const sb = getMatchBooking(b)?.start_at ? new Date(getMatchBooking(b)!.start_at).getTime() : 0;
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
        const subtitle = rivals[0]?.liga
          ? t('competitive.screen.recent.rivalsWithLiga', { liga: rivals[0].liga })
          : t('competitive.screen.recent.rivals');
        return {
          id: m.id,
          title: title || t('competitive.screen.recent.rivalsPending'),
          subtitle,
          when: (() => {
            const startAt = getMatchBooking(m)?.start_at;
            return startAt ? formatRelativeDate(startAt) : t('competitive.screen.recent.recent');
          })(),
        };
      });
  }

  const handleJoinQueue = useCallback(async () => {
    const token = session?.access_token ?? null;
    if (!token) {
      setErrorText(t('competitive.screen.errors.needLogin'));
      return;
    }
    setErrorText(null);
    clearPollTimer();
    const { availableFrom, availableUntil } = computeMatchAvailabilityWindow(form);
    const payload: MatchmakingJoinPayload = {
      available_from: availableFrom,
      available_until: availableUntil,
      preferred_side: form.preferred_side,
      gender: form.gender,
    };
    if (MATCHMAKING_DEMO) {
      const allClubIds = clubCatalog.map((c) => c.id).slice(0, 20);
      if (allClubIds.length === 0) {
        setErrorText(t('competitive.screen.errors.noClubsLoaded'));
        return;
      }
      payload.preferred_club_ids = allClubIds;
    } else if (preferredClubIds.length === 0 && clubsInRange.length === 0) {
      setErrorText(t('competitive.screen.errors.noClubsInDistance', { km: distanceKm }));
      return;
    } else if (preferredClubIds.length > 0) {
      payload.preferred_club_ids = preferredClubIds.slice(0, 20);
    } else {
      const issue = await probeDeviceLocationIssue(t);
      if (issue) {
        setLocationIssue(issue);
        return;
      }
      const maxKm = Math.max(1, Math.min(50, Math.round(distanceKm)));
      const loc = searchCoords
        ? { ok: true as const, coords: searchCoords }
        : await resolveDeviceSearchCoordinatesFast(4000, t);
      if (!loc.ok) {
        setLocationIssue({ message: loc.error, action: 'retry' });
        return;
      }
      setSearchCoords(loc.coords);
      setLocationIssue(null);
      payload.max_distance_km = maxKm;
      payload.search_lat = loc.coords.lat;
      payload.search_lng = loc.coords.lng;
    }
    // Con una pareja ya aceptada: buscar juntos usando ESTAS preferencias (start-search).
    if (searchPartner) {
      const proceed = async () => {
        setLoading(true);
        const res = await startSearchPairInvite(searchPartner.id, payload, token);
        setLoading(false);
        if (!res.ok) {
          setErrorText(res.error);
          return;
        }
        setQueueStartedAtMs(Date.now());
        setQueueElapsedSec(0);
        onMatchmakingBannerStateChange?.('searching', { force: true });
        setStep('queue');
        await pollStatus();
      };
      // Aviso antes de buscar si hay >1 de diferencia de nivel.
      if ((searchPartner.level_gap ?? 0) > 1) {
        const liga = searchPartner.target_liga
          ? searchPartner.target_liga.charAt(0).toUpperCase() + searchPartner.target_liga.slice(1)
          : t('competitive.screen.fallback.superiorPlayer');
        Alert.alert(
          t('competitive.demanding.title'),
          t('competitive.demanding.message', { name: searchPartner.other_player_name, liga }),
          [
            { text: t('competitive.common.cancel'), style: 'cancel' },
            { text: t('competitive.demanding.searchAnyway'), onPress: () => void proceed() },
          ],
        );
        return;
      }
      await proceed();
      return;
    }
    setLoading(true);
    const result = await joinMatchmaking(payload, token);
    if (!result.ok && !result.alreadyInQueue) {
      setLoading(false);
      setErrorText(result.error);
      return;
    }
    setQueueStartedAtMs(Date.now());
    setQueueElapsedSec(0);
    onMatchmakingBannerStateChange?.('searching', { force: true });
    setStep('queue');
    await pollStatus();
  }, [
    clearPollTimer,
    clubsInRange.length,
    distanceKm,
    form,
    onMatchmakingBannerStateChange,
    pollStatus,
    preferredClubIds,
    searchCoords,
    clubCatalog,
    searchPartner,
    session?.access_token,
    setQueueElapsedSec,
    setQueueStartedAtMs,
    t,
  ]);

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
    onMatchmakingBannerStateChange?.('hidden', { force: true });
    setQueueStartedAtMs(null);
    setQueueElapsedSec(0);
    setStep('home');
  }, [
    clearPollTimer,
    onMatchmakingBannerStateChange,
    session?.access_token,
    setQueueElapsedSec,
    setQueueStartedAtMs,
  ]);

  const handleRejectProposal = useCallback(async () => {
    const token = session?.access_token ?? null;
    const matchId = proposal?.match_id;
    if (!token || !matchId) return;
    clearPollTimer();
    const result = await rejectMatchmakingProposal(matchId, token);
    if (!result.ok) {
      setErrorText(result.error);
      return;
    }
    await leaveMatchmaking(token);
    setStatus(null);
    setProposal(null);
    setProposalMatch(null);
    onMatchmakingBannerStateChange?.('hidden', { force: true });
    setQueueStartedAtMs(null);
    setQueueElapsedSec(0);
    setLoading(false);
    setStep('home');
  }, [
    clearPollTimer,
    onMatchmakingBannerStateChange,
    proposal?.match_id,
    session?.access_token,
    setQueueElapsedSec,
    setQueueStartedAtMs,
  ]);

  const openMatchDetail = useCallback(
    async (matchId: string, matchmakingPayment?: PartidoItem['matchmakingPayment']) => {
      const token = session?.access_token ?? null;
      if (!token || !matchId || !onPartidoPress) return;
      const match = await fetchMatchById(matchId, token);
      if (!match) {
        Alert.alert(t('competitive.screen.errors.genericError'), t('competitive.screen.errors.matchLoadFailed'));
        return;
      }
      const mapped = mapMatchToPartido(match, { viewerPlayerId: profile?.id ?? null });
      if (!mapped) {
        Alert.alert(t('competitive.screen.errors.genericError'), t('competitive.screen.errors.matchShowFailed'));
        return;
      }
      if (matchmakingPayment) mapped.matchmakingPayment = matchmakingPayment;
      onPartidoPress(mapped);
    },
    [onPartidoPress, session?.access_token],
  );

  const handleOpenProposal = useCallback(async () => {
    const matchId = proposal?.match_id;
    if (!matchId) return;
    setOpeningProposal(true);
    try {
      const payment =
        proposal?.booking_id && proposal.your_participant_id && proposal.your_payment_status !== 'paid'
          ? {
              bookingId: proposal.booking_id,
              participantId: proposal.your_participant_id,
              shareAmountCents: proposal.your_share_cents ?? undefined,
            }
          : undefined;
      await openMatchDetail(matchId, payment);
    } finally {
      setOpeningProposal(false);
    }
  }, [openMatchDetail, proposal]);

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

    const proposalBooking = proposalMatch ? getMatchBooking(proposalMatch) : null;
    const club = proposalBooking?.courts?.clubs;
    const startAt = proposalBooking?.start_at;
    const startDate = startAt ? new Date(startAt) : null;
    const weekday = startDate
      ? startDate.toLocaleDateString('es-ES', { weekday: 'long' })
      : t('competitive.screen.proposal.noDate');
    const hour = startDate
      ? startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : '--:--';
    const timeLabel = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${hour}`;
    // Duración real a partir de start_at/end_at de la reserva (no un valor fijo).
    const endAt = proposalBooking?.end_at;
    const endDate = endAt ? new Date(endAt) : null;
    let durationLabel = '';
    if (startDate && endDate) {
      const mins = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const value = h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
      durationLabel = t('competitive.screen.proposal.duration', { value });
    }
    // Distancia real al club (si tenemos la ubicación de búsqueda y el club tiene coordenadas);
    // si no, caemos a la ciudad. Los clubes sí tienen lat/lng en BBDD.
    const clubKm =
      searchCoords && club?.lat != null && club?.lng != null
        ? haversineKm(searchCoords, { lat: club.lat, lng: club.lng })
        : null;
    const clubLocation =
      clubKm != null
        ? t('competitive.screen.proposal.distanceKm', { value: clubKm.toFixed(1) })
        : (club?.city ?? '');
    return {
      teammateName: teammate
        ? `${teammate.first_name ?? ''} ${teammate.last_name ?? ''}`.trim()
        : t('competitive.screen.proposal.teammatePending'),
      teammateLevel:
        teammate?.elo_rating != null
          ? t('competitive.screen.proposal.levelValue', { value: Number(teammate.elo_rating).toFixed(2) })
          : t('competitive.screen.proposal.levelUnknown'),
      rivals: rivalLabel || t('competitive.screen.proposal.rivalPairPending'),
      rivalsMeta:
        proposal?.pre_match_win_prob != null
          ? t('competitive.screen.proposal.winProb', { value: Math.round(proposal.pre_match_win_prob * 100) })
          : t('competitive.screen.proposal.winProbUnknown'),
      clubName: club?.name ?? t('competitive.screen.proposal.clubPending'),
      clubLocation,
      dateTime: timeLabel,
      duration: durationLabel,
    };
  }, [profile?.id, proposal?.pre_match_win_prob, proposalMatch, searchCoords, t]);

  useEffect(() => {
    if (status?.status !== 'searching' || queueStartedAtMs == null) return;
    const updateElapsed = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - queueStartedAtMs) / 1000));
      setQueueElapsedSec(elapsed);
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [queueStartedAtMs, setQueueElapsedSec, status?.status]);

  useEffect(() => {
    if (matchmakingBannerState !== 'timed_out') return;
    setErrorText(t('competitive.screen.errors.timedOut'));
    if (searchPartner) {
      // Era búsqueda en pareja: salimos de la cola (revierte la invitación a 'accepted' y nos
      // saca a ambos del pool) pero CONSERVAMOS al compañero para poder re-buscar juntos.
      const token = session?.access_token ?? null;
      if (token) void leaveMatchmaking(token);
      setStatus(null);
      setQueueStartedAtMs(null);
      setQueueElapsedSec(0);
    } else {
      setSearchPartner(null);
    }
    setStep('prefs');
  }, [matchmakingBannerState]);

  const queueElapsedLabel = useMemo(() => {
    const mm = Math.floor(queueElapsedSec / 60)
      .toString()
      .padStart(2, '0');
    const ss = (queueElapsedSec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }, [queueElapsedSec]);

  const myRankingRow = useMemo(() => {
    if (!profile) return null;
    const fromList = rankingRows?.find((r) => r.player_id === profile.id);
    const meName = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || t('competitive.screen.ranking.me');
    return {
      rank: fromList?.rank ?? null,
      name: meName,
      elo: profile.eloRating != null && Number.isFinite(profile.eloRating) ? profile.eloRating : undefined,
      lp: profile.lps ?? 0,
      avatarUrl: profile.avatarUrl,
      frame: profile.frame ?? null,
    };
  }, [profile, rankingRows, t]);

  const rankingLoadedCount = rankingRows.length;
  const rankingPlayerCount = rankingTotal > 0 ? rankingTotal : rankingLoadedCount;

  // Pompa de "Con un amigo": invitaciones que requieren tu atención = recibidas pendientes
  // (responder) + aceptadas pendientes de buscar. Las enviadas pendientes no cuentan.
  const pairInviteBadgeCount = (status?.pair_invites ?? []).filter(
    (i) => i.status === 'accepted' || (i.role === 'invitee' && i.status === 'pending'),
  ).length;

  return (
    <View style={styles.container}>
      {step === 'home' ? (
        <Pressable style={[styles.backFab, { top: FLOW_TOP_PADDING }]} onPress={onBack}>
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </Pressable>
      ) : null}

      {step === 'home' && (
        isHomeBootstrapping ? (
          <CompetitiveLeagueHomeSkeleton insetsBottom={insets.bottom} />
        ) : (
        <ScrollView
          contentContainerStyle={[
            styles.homeContent,
            { paddingTop: FLOW_TOP_PADDING + 32, paddingBottom: insets.bottom + 28 },
          ]}
          scrollEventThrottle={16}
          onScroll={handleHomeScroll}
        >
          {(status?.status === 'searching' || isMatchmakingFlowPending(status, proposal)) && (
            <Pressable
              style={styles.resumeBanner}
              onPress={() => setStep(status?.status === 'matched' ? 'found' : 'queue')}
            >
              <Ionicons name="radio-outline" size={16} color="#F59E0B" />
              <Text style={styles.resumeBannerText}>
                {status?.status === 'matched'
                  ? t('competitive.screen.resume.matched')
                  : t('competitive.screen.resume.searching')}
              </Text>
            </Pressable>
          )}

          <LinearGradient colors={['#3C1E00', '#15100A', '#0F0F0F']} locations={[0, 0.55, 1]} style={styles.hero}>
            <View style={styles.badge}>
              <View style={styles.badgeDot} />
              <Text style={styles.badgeText}>{t('competitive.screen.hero.badge')}</Text>
            </View>
            <Text style={styles.heroCap}>{t('competitive.screen.hero.currentDivision')}</Text>
            <View style={styles.heroMainRow}>
              <View style={styles.medalBox}>
                <Text style={styles.medalEmoji}>🏅</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.division}>{division ?? '—'}</Text>
                <Text style={styles.divisionRank}>
                  {profile?.mmPeakLiga
                    ? t('competitive.screen.hero.peak', { liga: profile.mmPeakLiga })
                    : t('competitive.screen.hero.noHistory')}
                </Text>
                <View style={styles.statsLine}>
                  <Text style={styles.statUp}>↗ {t('competitive.screen.hero.winsShort', { n: winCount })}</Text>
                  <Text style={styles.statDown}>↘ {t('competitive.screen.hero.lossesShort', { n: lossCount })}</Text>
                  <Text style={styles.statWr}>{t('competitive.screen.hero.wr', { wr })}</Text>
                </View>
              </View>
            </View>
            <View style={styles.lpRow}>
              <Text style={styles.lpCap}>{t('competitive.screen.hero.leaguePointsCap')}</Text>
              <Text style={styles.lp}>
                {lpTarget != null
                  ? t('competitive.lp.progress', { lps: profile?.lps ?? 0, target: lpTarget })
                  : t('competitive.lp.only', { lps: profile?.lps ?? 0 })}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${progressPct}%` }]} />
            </View>
            {(profile?.mmShieldMatches ?? 0) > 0 ? (
              <View style={styles.shieldBadge}>
                <Ionicons name="shield-checkmark" size={13} color="#60A5FA" />
                <Text style={styles.shieldBadgeText}>
                  {t(
                    profile?.mmShieldMatches === 1
                      ? 'competitive.shield.activeOne'
                      : 'competitive.shield.activeMany',
                    { n: profile?.mmShieldMatches ?? 0 },
                  )}
                </Text>
              </View>
            ) : null}
            <Text style={styles.heroFoot}>{t('competitive.screen.hero.seasonResetFoot')}</Text>
          </LinearGradient>

          <View style={styles.tabRow}>
            <Pressable style={[styles.tabBtn, mainTab === 'liga' && styles.tabBtnActive]} onPress={() => setMainTab('liga')}>
              <Text style={styles.tabText}>{t('competitive.screen.tabs.myLeague')}</Text>
            </Pressable>
            <Pressable
              style={[styles.tabBtn, mainTab === 'ranking' && styles.tabBtnActive]}
              onPress={() => setMainTab('ranking')}
            >
              <Text style={styles.tabText}>{t('competitive.screen.tabs.ranking')}</Text>
            </Pressable>
          </View>

          {mainTab === 'liga' ? (
            <>
              <LinearGradient colors={['#4B2403', '#A56611']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.searchCard}>
                <Pressable
                  style={styles.searchCardPress}
                  onPress={() => {
                    setSearchPartner(null);
                    setModeSheetVisible(true);
                  }}
                >
                  <View style={styles.searchIconWrap}>
                    <Ionicons name="flash-outline" size={22} color="#fff" />
                  </View>
                  <View style={styles.searchTextWrap}>
                    <Text style={styles.searchTitle}>{t('competitive.screen.search.title')}</Text>
                    <Text style={styles.searchSubtitle}>{t('competitive.screen.search.subtitle')}</Text>
                  </View>
                  {pairInviteBadgeCount > 0 ? (
                    <View style={styles.notifBadge}>
                      <Text style={styles.notifBadgeText}>{pairInviteBadgeCount}</Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={20} color="#f6ddbf" />
                </Pressable>
              </LinearGradient>

              <View style={styles.recentHeader}>
                <Text style={styles.recentHeaderLeft}>{t('competitive.screen.recent.header')}</Text>
                <Text style={styles.recentHeaderRight}>{t('competitive.screen.recent.currentSeason')}</Text>
              </View>
              <View style={styles.recentWrap}>
                {recentMatchRows.map((row) => (
                  <Pressable
                    key={row.id}
                    style={styles.recentCard}
                    onPress={() => void openMatchDetail(row.id)}
                  >
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
                    <Text style={styles.recentSub}>{t('competitive.screen.recent.empty')}</Text>
                  </View>
                )}
              </View>

              <View style={styles.howCard}>
                <Text style={styles.howTitle}>{t('competitive.screen.how.title')}</Text>
                <Text style={styles.howLine}>{t('competitive.screen.how.line1')}</Text>
                <Text style={styles.howLine}>{t('competitive.screen.how.line2')}</Text>
                <Text style={styles.howLine}>{t('competitive.screen.how.line3')}</Text>
                <Text style={styles.howLine}>
                  ★{' '}
                  {lpTarget != null
                    ? t('competitive.lp.promoteLine', { n: lpTarget })
                    : t('competitive.lp.maxDivision')}
                </Text>
                <Text style={styles.howLine}>{t('competitive.screen.how.line5')}</Text>
                <Text style={styles.howLine}>{t('competitive.screen.how.season')}</Text>
              </View>
            </>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={styles.rankingHeader}>
                <View>
                  <Text style={styles.rankingDivision}>{division ?? '—'}</Text>
                  <Text style={styles.rankingSub}>
                    {rankingLoading
                      ? t('competitive.screen.ranking.loading')
                      : rankingPlayerCount > 0
                        ? rankingHasMore
                          ? t('competitive.screen.ranking.showing', {
                              loaded: rankingLoadedCount,
                              total: rankingPlayerCount,
                            })
                          : t(
                              rankingPlayerCount === 1
                                ? 'competitive.screen.ranking.playersInDivisionOne'
                                : 'competitive.screen.ranking.playersInDivisionMany',
                              { total: rankingPlayerCount },
                            )
                        : t('competitive.screen.ranking.noPlayers')}
                  </Text>
                </View>
                {rankingPlayerCount > 0 ? (
                  <View style={styles.topPill}>
                    <Text style={styles.topPillText}>{t('competitive.screen.ranking.top', { total: rankingPlayerCount })}</Text>
                  </View>
                ) : null}
              </View>
              {rankingLoading ? (
                <>
                  <Skeleton height={52} borderRadius={12} variant="dark" />
                  <Skeleton height={52} borderRadius={12} variant="dark" />
                  <Skeleton height={52} borderRadius={12} variant="dark" />
                </>
              ) : rankingError ? (
                <View style={styles.rankingNoticeCard}>
                  <Text style={styles.rankingNoticeTitle}>{t('competitive.screen.ranking.notAvailable')}</Text>
                  <Text style={styles.rankingNoticeSub}>{rankingError}</Text>
                </View>
              ) : rankingPlayerCount === 0 ? (
                <View style={styles.rankingNoticeCard}>
                  <Text style={styles.rankingNoticeSub}>{t('competitive.screen.ranking.noneClassified')}</Text>
                </View>
              ) : (
                rankingRows.map((row) => {
                  const isMe = row.player_id === profile?.id;
                  const name =
                    `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() ||
                    row.username?.trim() ||
                    t('competitive.screen.fallback.player');
                  return (
                    <Pressable
                      key={row.player_id}
                      style={({ pressed }) => [styles.rankRow, isMe && styles.rankRowMe, pressed && styles.rankRowPressed]}
                      onPress={() => onOpenPlayer?.(row.player_id)}
                    >
                      <View style={[styles.rankBadge, row.rank <= 3 && styles.rankBadgeTop]}>
                        <Text style={[styles.rankBadgeText, row.rank <= 3 && styles.rankBadgeTextTop]}>
                          {row.rank}
                        </Text>
                      </View>
                      <AvatarWithFrame
                        avatarUrl={row.avatar_url}
                        initials={rankInitials(name)}
                        size={40}
                        frame={row.frame ?? null}
                        level={row.elo_rating ?? undefined}
                        animate={false}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rankName}>{isMe ? t('competitive.screen.ranking.meSelf', { name }) : name}</Text>
                      </View>
                      <Text style={styles.rankLp}>{row.lps} LP</Text>
                    </Pressable>
                  );
                })
              )}
              {rankingLoadingMore ? (
                <View style={styles.rankingLoadMore}>
                  <ActivityIndicator size="small" color="#F59E0B" />
                  <Text style={styles.rankingLoadMoreText}>{t('competitive.screen.ranking.loadingMore')}</Text>
                </View>
              ) : null}
              {!rankingLoading && rankingPlayerCount > 0 && myRankingRow && myRankingRow.rank == null ? (
                <Pressable
                  style={({ pressed }) => [styles.rankRow, styles.rankRowMe, pressed && styles.rankRowPressed]}
                  onPress={() => profile?.id && onOpenPlayer?.(profile.id)}
                >
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankBadgeText}>—</Text>
                  </View>
                  <AvatarWithFrame
                    avatarUrl={myRankingRow.avatarUrl}
                    initials={rankInitials(myRankingRow.name)}
                    size={40}
                    frame={myRankingRow.frame}
                    level={myRankingRow.elo}
                    animate={false}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rankName}>{myRankingRow.name}</Text>
                  </View>
                  <Text style={styles.rankLp}>{myRankingRow.lp} LP</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </ScrollView>
        )
      )}

      {step === 'prefs' && (
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: FLOW_TOP_PADDING, paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.stepHeader}>
            <Pressable style={styles.stepBackBtn} onPress={() => setStep('home')}>
              <Ionicons name="arrow-back" size={16} color="#fff" />
            </Pressable>
            <View>
              <Text style={styles.sectionTitle}>{t('competitive.screen.prefs.title')}</Text>
              <Text style={styles.stepSubtitle}>
                {t('competitive.screen.prefs.subtitle')}
              </Text>
            </View>
          </View>

          {searchPartner ? (
            <View style={styles.partnerLockRow}>
              <Ionicons name="people" size={16} color="#F59E0B" />
              <Text style={styles.partnerLockText}>
                {t('competitive.search.searchingWith', { name: searchPartner.other_player_name })}
              </Text>
            </View>
          ) : null}

          {!MATCHMAKING_DEMO && preferredClubIds.length === 0 && locationIssue ? (
            <View style={styles.locationBanner}>
              <View style={styles.locationBannerHead}>
                <Ionicons name="location-outline" size={18} color="#fca5a5" />
                <Text style={styles.locationBannerText}>{locationIssue.message}</Text>
              </View>
              <View style={styles.locationBannerActions}>
                <Pressable
                  style={styles.locationBannerBtn}
                  onPress={() => void handleActivateLocation()}
                >
                  <Ionicons name="navigate-outline" size={14} color="#fff" />
                  <Text style={styles.locationBannerBtnText}>{t('competitive.screen.prefs.locationBannerActivate')}</Text>
                </Pressable>
                <Pressable
                  style={styles.locationBannerBtnSecondary}
                  onPress={() => setClubPickerVisible(true)}
                >
                  <Text style={styles.locationBannerBtnSecondaryText}>{t('competitive.screen.prefs.locationBannerChooseClubs')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.prefsCard}>
            <Text style={styles.prefsSectionTitle}>{t('competitive.screen.prefs.formatTitle')}</Text>
            <View style={styles.fixedModeRow}>
              <View style={styles.fixedModeIcon}>
                <Ionicons name="people" size={18} color="#F18F34" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fixedModeTitle}>{t('competitive.screen.prefs.pairFormatTitle')}</Text>
                <Text style={styles.fixedModeSub}>{t('competitive.screen.prefs.pairFormatSub')}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color="#F18F34" />
            </View>
          </View>

          <OptionRow
            title={t('competitive.screen.prefs.scheduleTitle')}
            sectionIcon="time-outline"
            options={[
              { id: 'manana', label: t('competitive.screen.prefs.morning'), subtitle: t('competitive.screen.prefs.morningHours'), iconName: 'sunny-outline' },
              { id: 'tarde', label: t('competitive.screen.prefs.afternoon'), subtitle: t('competitive.screen.prefs.afternoonHours'), iconName: 'sunny' },
              { id: 'noche', label: t('competitive.screen.prefs.night'), subtitle: t('competitive.screen.prefs.nightHours'), iconName: 'moon-outline' },
            ]}
            value={form.time}
            onChange={(v) => setForm((p) => ({ ...p, time: v as SearchForm['time'] }))}
            large
          />

          <View style={styles.optionSection}>
            {MATCHMAKING_DEMO ? (
              <View style={styles.demoModeBanner}>
                <Ionicons name="flash" size={16} color="#F59E0B" />
                <Text style={styles.demoModeText}>
                  {t('competitive.screen.prefs.demoMode')}
                </Text>
              </View>
            ) : preferredClubIds.length > 0 ? (
              <Text style={styles.distanceByClubsHint}>
                {t(
                  preferredClubIds.length === 1
                    ? 'competitive.screen.prefs.searchingInClubsOne'
                    : 'competitive.screen.prefs.searchingInClubsMany',
                  { n: preferredClubIds.length },
                )}
              </Text>
            ) : (
              <>
                <View style={styles.distanceTitleRow}>
                  <View style={styles.optionTitleRow}>
                    <Ionicons name="location-outline" size={14} color="#F59E0B" />
                    <Text style={styles.optionTitleStrong}>{t('competitive.screen.prefs.maxDistance')}</Text>
                  </View>
                  <Text style={styles.distanceValue}>{t('competitive.screen.prefs.distanceKm', { km: distanceKm })}</Text>
                </View>
                <Slider
                  style={styles.distanceSlider}
                  minimumValue={1}
                  maximumValue={50}
                  step={1}
                  value={distanceKm}
                  onValueChange={(v) => setDistanceKm(Math.round(v))}
                  minimumTrackTintColor="#F59E0B"
                  maximumTrackTintColor="rgba(12,31,66,0.7)"
                  thumbTintColor="#1f8dff"
                />
                <View style={styles.sliderLabels}>
                  <Text style={styles.sliderLabel}>{t('competitive.screen.prefs.kmShort', { km: 1 })}</Text>
                  <Text style={styles.sliderLabel}>{t('competitive.screen.prefs.kmShort', { km: 50 })}</Text>
                </View>
              </>
            )}
            {preferredClubIds.length === 0 ? (
              <View style={styles.clubsInRangeBox}>
                <Text style={styles.clubsInRangeTitle}>
                  {MATCHMAKING_DEMO
                    ? t('competitive.screen.prefs.clubsInRangeDemo')
                    : t('competitive.screen.prefs.clubsInRange')}
                </Text>
                {!MATCHMAKING_DEMO && searchCoordsLoading ? (
                  <Text style={styles.clubsInRangeSub}>{t('competitive.screen.prefs.calculatingDistances')}</Text>
                ) : clubsInRange.length === 0 ? (
                  <Text style={styles.clubsInRangeEmpty}>
                    {MATCHMAKING_DEMO
                      ? t('competitive.screen.prefs.loadingClubs')
                      : searchCoords
                        ? t('competitive.screen.prefs.noneInDistance', { km: distanceKm })
                        : locationIssue
                          ? t('competitive.screen.prefs.noLocationPickClubs')
                          : t('competitive.screen.prefs.activateLocationToSee')}
                  </Text>
                ) : (
                  clubsInRange.slice(0, 8).map((club) => (
                    <View key={club.id} style={styles.clubsInRangeRow}>
                      <Ionicons name="business-outline" size={14} color="#F59E0B" />
                      <Text style={styles.clubsInRangeName} numberOfLines={1}>
                        {club.name}
                      </Text>
                      {club.distance != null ? (
                        <Text style={styles.clubsInRangeKm}>{t('competitive.screen.prefs.kmShort', { km: Math.round(club.distance) })}</Text>
                      ) : null}
                    </View>
                  ))
                )}
                {clubsInRange.length > 8 ? (
                  <Text style={styles.clubsInRangeMore}>{t('competitive.screen.prefs.moreClubs', { n: clubsInRange.length - 8 })}</Text>
                ) : null}
              </View>
            ) : null}
          </View>

          <OptionRow
            title={t('competitive.screen.prefs.modality')}
            sectionIcon="shield-outline"
            options={[
              { id: 'any', label: t('competitive.screen.prefs.any'), iconName: 'ellipse-outline' },
              { id: 'male', label: t('competitive.screen.prefs.male'), iconName: 'person-outline' },
              { id: 'female', label: t('competitive.screen.prefs.female'), iconName: 'woman-outline' },
              { id: 'mixed', label: t('competitive.screen.prefs.mixed'), iconName: 'people-outline' },
            ]}
            value={form.gender}
            onChange={(v) => setForm((p) => ({ ...p, gender: v as SearchForm['gender'] }))}
          />
          <OptionRow
            title={t('competitive.screen.prefs.preferredSide')}
            sectionIcon="compass-outline"
            options={[
              { id: 'backhand', label: t('competitive.screen.prefs.left'), iconName: 'arrow-back-circle-outline' },
              { id: 'drive', label: t('competitive.screen.prefs.right'), iconName: 'arrow-forward-circle-outline' },
              { id: 'any', label: t('competitive.screen.prefs.both'), iconName: 'swap-horizontal-outline' },
            ]}
            value={form.preferred_side}
            onChange={(v) => setForm((p) => ({ ...p, preferred_side: v as SearchForm['preferred_side'] }))}
          />

          <View style={styles.optionSection}>
            <View style={styles.optionTitleRow}>
              <Ionicons name="location-outline" size={14} color="#F59E0B" />
              <Text style={styles.optionTitle}>{t('competitive.screen.prefs.preferredClubsTitle')}</Text>
            </View>
            <Pressable
              style={styles.clubPickerBtn}
              onPress={() => setClubPickerVisible(true)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.clubPickerBtnTitle}>
                  {preferredClubIds.length === 0
                    ? t('competitive.screen.prefs.choosePreferredClubs')
                    : t(
                        preferredClubIds.length === 1
                          ? 'competitive.screen.prefs.clubsSelectedOne'
                          : 'competitive.screen.prefs.clubsSelectedMany',
                        { n: preferredClubIds.length },
                      )}
                </Text>
                <Text style={styles.clubPickerBtnSub} numberOfLines={2}>
                  {preferredClubIds.length === 0
                    ? t('competitive.screen.prefs.noClubsHint')
                    : preferredClubLabels.join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>
          </View>

          <Pressable style={styles.primaryBtn} onPress={() => void handleJoinQueue()} disabled={loading}>
            <Ionicons name={searchPartner ? 'people' : 'flash'} size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>
              {loading
                ? t('competitive.search.searching')
                : searchPartner
                  ? t('competitive.search.ctaWith', { name: searchPartner.other_player_name })
                  : t('competitive.search.cta')}
            </Text>
          </Pressable>
          {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
        </ScrollView>
      )}

      {step === 'queue' && (
        <View style={[styles.content, { paddingTop: FLOW_TOP_PADDING, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.queueTopRow}>
            <Pressable style={styles.stepBackBtn} onPress={() => setStep('home')}>
              <Ionicons name="arrow-back" size={16} color="#fff" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{t('competitive.screen.queue.searchingTitle')}</Text>
              <Text style={styles.stepSubtitle}>{t('competitive.screen.queue.timeInQueue', { time: queueElapsedLabel })}</Text>
            </View>
            <View style={styles.queuePlayersBox}>
              <Text style={styles.queuePlayersCaption}>{t('competitive.screen.queue.playersInQueue')}</Text>
              <Text style={styles.queuePlayersValue}>
                {status?.searching_in_club_count != null
                  ? String(status.searching_in_club_count)
                  : status?.searching_count != null
                    ? String(status.searching_count)
                    : '—'}
              </Text>
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
            <Text style={styles.queueTitle}>{t('competitive.screen.queue.searchingTitle')}</Text>
            <Text style={styles.queueCaption}>{t('competitive.screen.queue.searchingPartner')}</Text>
          </View>

          <View style={styles.queueSummaryBox}>
            <View style={styles.queueSummaryRow}><Text style={styles.queueKey}>{t('competitive.screen.queue.format')}</Text><Text style={styles.queueVal}>{t('competitive.screen.queue.formatValue')}</Text></View>
            <View style={styles.queueSummaryRow}><Text style={styles.queueKey}>{t('competitive.screen.queue.schedule')}</Text><Text style={styles.queueVal}>{form.time === 'manana' ? t('competitive.screen.prefs.morning') : form.time === 'tarde' ? t('competitive.screen.prefs.afternoon') : t('competitive.screen.prefs.night')}</Text></View>
            <View style={styles.queueSummaryRow}>
              <Text style={styles.queueKey}>{t('competitive.screen.queue.location')}</Text>
              <Text style={styles.queueVal} numberOfLines={2}>
                {preferredClubIds.length > 0
                  ? preferredClubLabels.join(', ')
                  : t('competitive.screen.queue.upToKm', { km: distanceKm })}
              </Text>
            </View>
            <View style={styles.queueSummaryRow}><Text style={styles.queueKey}>{t('competitive.screen.queue.modality')}</Text><Text style={styles.queueVal}>{form.gender === 'male' ? t('competitive.screen.prefs.male') : form.gender === 'female' ? t('competitive.screen.prefs.female') : form.gender === 'mixed' ? t('competitive.screen.prefs.mixed') : t('competitive.screen.queue.noPref')}</Text></View>
            <View style={styles.queueSummaryRow}><Text style={styles.queueKey}>{t('competitive.screen.queue.side')}</Text><Text style={styles.queueVal}>{form.preferred_side === 'drive' ? t('competitive.screen.prefs.right') : form.preferred_side === 'backhand' ? t('competitive.screen.prefs.left') : t('competitive.screen.prefs.both')}</Text></View>
          </View>

          <View style={styles.queueBgCard}>
            <View style={styles.queueBgHead}>
              <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
              <Text style={styles.queueBgTitle}>{t('competitive.screen.queue.backgroundTitle')}</Text>
            </View>
            <Text style={styles.queueBgText}>
              {t('competitive.screen.queue.backgroundText')}
            </Text>
          </View>

          <Pressable style={styles.primaryBtn} onPress={() => setStep('home')}>
            <Text style={styles.primaryBtnText}>{t('competitive.screen.queue.minimize')}</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => void handleLeaveQueue()}>
            <Text style={styles.secondaryBtnText}>{t('competitive.screen.queue.cancel')}</Text>
          </Pressable>
          {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
        </View>
      )}

      {step === 'found' && (
        <View style={[styles.content, { paddingTop: FLOW_TOP_PADDING, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.foundTop}>
            <View style={styles.foundTopIcon}>
              <Ionicons name="checkmark" size={14} color="#34d399" />
            </View>
            <View>
              <Text style={styles.foundTopTitle}>{t('competitive.screen.found.title')}</Text>
              <Text style={styles.foundTopSub}>{t('competitive.screen.found.subtitle')}</Text>
            </View>
          </View>

          <View style={styles.foundCardTeammate}>
            <Text style={styles.foundLabel}>{t('competitive.screen.found.yourTeammate')}</Text>
            <Text style={styles.foundName}>{proposalUi.teammateName}</Text>
            <Text style={styles.foundMeta}>{proposalUi.teammateLevel}</Text>
          </View>

          <View style={styles.foundCardRivals}>
            <Text style={styles.foundLabel}>{t('competitive.screen.found.rivalPair')}</Text>
            <Text style={styles.foundName}>{proposalUi.rivals}</Text>
            <Text style={styles.foundMeta}>{proposalUi.rivalsMeta}</Text>
          </View>

          <View style={styles.foundInfoCard}>
            <Text style={styles.foundInfoMain} numberOfLines={1}>{proposalUi.clubName}</Text>
            {proposalUi.clubLocation ? (
              <Text style={styles.foundInfoSub} numberOfLines={1}>{proposalUi.clubLocation}</Text>
            ) : null}
            <Text style={[styles.foundInfoMain, { marginTop: 10 }]}>{proposalUi.dateTime}</Text>
            {proposalUi.duration ? <Text style={styles.foundInfoSub}>{proposalUi.duration}</Text> : null}
          </View>

          <View style={styles.foundLpCard}>
            <Text style={styles.foundLpText}>{t('competitive.screen.found.lpInfo')}</Text>
          </View>

          <View style={styles.foundCountdownCard}>
            <Text style={styles.foundCountdownHint}>{t('competitive.screen.found.confirmHint')}</Text>
            <Text style={styles.foundCountdown}>{countdownText}</Text>
          </View>

          <View style={styles.foundWarning}>
            <Text style={styles.foundWarningText}>
              {t('competitive.screen.found.rejectWarning')}
            </Text>
          </View>

          <Pressable style={styles.primaryBtn} onPress={() => void handleOpenProposal()} disabled={openingProposal}>
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>{openingProposal ? t('competitive.screen.found.opening') : t('competitive.screen.found.confirm')}</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => void handleRejectProposal()}>
            <Text style={styles.secondaryBtnText}>{t('competitive.screen.found.reject')}</Text>
          </Pressable>
          {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
        </View>
      )}

      <ClubMultiSelectPicker
        visible={clubPickerVisible}
        selectedIds={preferredClubIds}
        onChange={setPreferredClubIds}
        onClose={() => setClubPickerVisible(false)}
        title={t('competitive.screen.picker.title')}
        subtitle={t('competitive.screen.picker.subtitle')}
      />

      <FilterBottomSheet
        visible={modeSheetVisible}
        title={t('competitive.mode.title')}
        onClose={() => setModeSheetVisible(false)}
      >
        <View style={styles.modeSheetCol}>
          <Pressable
            style={({ pressed }) => [styles.modeOption, pressed && { opacity: 0.85 }]}
            onPress={() => {
              setModeSheetVisible(false);
              setSearchPartner(null);
              setStep('prefs');
            }}
          >
            <LinearGradient colors={['#8A4A0B', '#D4861F']} style={styles.modeOptionIcon}>
              <Ionicons name="person" size={24} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.modeOptionTitle}>{t('competitive.mode.solo')}</Text>
              <Text style={styles.modeOptionSub}>{t('competitive.mode.soloSub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.modeOption, pressed && { opacity: 0.85 }]}
            onPress={() => {
              setModeSheetVisible(false);
              setPartnerPickerVisible(true);
            }}
          >
            <LinearGradient colors={['#1E40AF', '#3B82F6']} style={styles.modeOptionIcon}>
              <Ionicons name="people" size={24} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.modeOptionTitle}>{t('competitive.mode.friend')}</Text>
              <Text style={styles.modeOptionSub}>{t('competitive.mode.friendSub')}</Text>
            </View>
            {pairInviteBadgeCount > 0 ? (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{pairInviteBadgeCount}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </Pressable>
        </View>
      </FilterBottomSheet>

      <PlayerSelectModal
        visible={partnerPickerVisible}
        onClose={() => setPartnerPickerVisible(false)}
        onSelectAccepted={(inv) => {
          setPartnerPickerVisible(false);
          setSearchPartner(inv);
          setStep('prefs');
        }}
        excludeIds={profile?.id ? [profile.id] : undefined}
        currentPlayerId={profile?.id}
      />
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

function CompetitiveLeagueHomeSkeleton({
  insetsBottom,
}: {
  insetsBottom: number;
}) {
  return (
    <ScrollView
      contentContainerStyle={[
        styles.homeContent,
        { paddingTop: FLOW_TOP_PADDING + 32, paddingBottom: insetsBottom + 28 },
      ]}
    >
      <Skeleton height={38} borderRadius={12} variant="dark" />
      <Skeleton height={188} borderRadius={18} variant="dark" />
      <Skeleton height={38} borderRadius={14} variant="dark" />
      <Skeleton height={50} borderRadius={20} variant="dark" />
      <Skeleton width="55%" height={16} borderRadius={8} variant="dark" style={{ marginTop: 2 }} />
      <Skeleton height={56} borderRadius={14} variant="dark" />
      <Skeleton height={56} borderRadius={14} variant="dark" />
      <Skeleton height={56} borderRadius={14} variant="dark" />
      <Skeleton height={140} borderRadius={14} variant="dark" />
    </ScrollView>
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
  notifBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  notifBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
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
  rankingLoadMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  rankingLoadMoreText: { color: '#9ca3af', fontSize: 12 },
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
  rankRowPressed: { opacity: 0.7 },
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
  distanceSlider: { width: '100%', height: 40, marginTop: 4 },
  distanceByClubsHint: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  sliderLabel: { color: '#9ca3af', fontSize: 11 },
  clubsInRangeBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  clubsInRangeTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  clubsInRangeSub: { color: '#9ca3af', fontSize: 12 },
  clubsInRangeEmpty: { color: '#9ca3af', fontSize: 12, lineHeight: 18 },
  clubsInRangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clubsInRangeName: { flex: 1, color: '#d1d5db', fontSize: 13, fontWeight: '600' },
  clubsInRangeKm: { color: '#F59E0B', fontSize: 12, fontWeight: '700' },
  clubsInRangeMore: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  demoModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245,158,11,0.35)',
    marginBottom: 4,
  },
  demoModeText: { flex: 1, color: '#FCD34D', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  clubPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#141414',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  clubPickerBtnTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  clubPickerBtnSub: { color: '#9ca3af', fontSize: 12, marginTop: 4 },
  partnerLockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(241,143,52,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(241,143,52,0.45)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  partnerLockText: { color: '#fff', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  shieldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(59,130,246,0.45)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  shieldBadgeText: { color: '#60A5FA', fontSize: 12, fontWeight: '700' },
  modeSheetCol: { gap: 12, paddingBottom: 8 },
  modeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#141414',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  modeOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeOptionTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modeOptionSub: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
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
  locationBanner: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.1)',
    gap: 10,
  },
  locationBannerHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  locationBannerText: { flex: 1, color: '#fca5a5', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  locationBannerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  locationBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F18F34',
  },
  locationBannerBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  locationBannerBtnSecondary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  locationBannerBtnSecondaryText: { color: '#e5e7eb', fontSize: 12, fontWeight: '600' },
});
