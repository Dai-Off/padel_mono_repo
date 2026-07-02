import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from './AuthContext';
import { useHomeData } from './HomeDataContext';
import { useTranslation } from '../i18n';
import { fetchProfileBundle } from '../api/profileBundle';
import {
  fetchMyCoachAssessment,
  fetchMyCoachStats,
  type CoachAssessment,
  type CoachStats,
} from '../api/coachAssessment';
import type { ProfileCustomization, CatalogItem } from '../api/profileCustomization';
import type { Achievement } from '../design/achievements';
import { fetchMyPeerFeedbackInsight, type PeerFeedbackInsight } from '../api/peerFeedbackInsight';
import {
  fetchLevelHistory,
  fetchPlayerStats,
  type LevelHistory,
  type LevelHistoryLimit,
  type PlayerStats,
} from '../api/profileStats';
import {
  fetchFrequentClubs,
  fetchFrequentPartners,
  type FrequentClub,
  type FrequentPartner,
} from '../api/profileSocial';

/** Cooldown entre refrescos al volver del background. */
const BACKGROUND_REFRESH_COOLDOWN_MS = 30_000;

type ProfileDataValue = {
  // Bundle above-the-fold
  customization: ProfileCustomization | null;
  framesCatalog: CatalogItem[];
  allAchievements: Achievement[];
  assessment: CoachAssessment | null;
  peerInsight: PeerFeedbackInsight | null;
  coachStats: CoachStats | null;
  // Evolución + estadísticas + social
  levelHistory: LevelHistory | null;
  levelLimit: LevelHistoryLimit;
  setLevelLimit: (l: LevelHistoryLimit) => void;
  playerStats: PlayerStats | null;
  frequentClubs: FrequentClub[];
  frequentPartners: FrequentPartner[];
  // Flags de carga (solo la 1ª vez; las revalidaciones son silenciosas)
  bundleReady: boolean;
  assessmentLoaded: boolean;
  levelLoading: boolean;
  socialLoading: boolean;
  // Acciones
  /** Bootstrap perezoso: carga los datos la 1ª vez que se abre el perfil. */
  ensureLoaded: () => void;
  /** Re-fetch forzado de todo (tras onboarding/editar/personalizar). */
  refresh: (opts?: { force?: boolean }) => void;
  /** Recarga solo el bundle (radar) + stats del Coach (botón reintentar). */
  reloadCoach: () => void;
  /** Actualiza la personalización equipada en caliente (modal de personalizar). */
  setCustomization: (c: ProfileCustomization) => void;
};

const ProfileDataContext = createContext<ProfileDataValue | null>(null);

export function ProfileDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { locale } = useTranslation();
  const { profile } = useHomeData();
  const token = session?.access_token ?? null;
  const playerId = profile?.id ?? null;

  const [customization, setCustomization] = useState<ProfileCustomization | null>(null);
  const [framesCatalog, setFramesCatalog] = useState<CatalogItem[]>([]);
  const [allAchievements, setAllAchievements] = useState<Achievement[]>([]);
  const [assessment, setAssessment] = useState<CoachAssessment | null>(null);
  const [peerInsight, setPeerInsight] = useState<PeerFeedbackInsight | null>(null);
  const [coachStats, setCoachStats] = useState<CoachStats | null>(null);
  const [bundleReady, setBundleReady] = useState(false);
  const [assessmentLoaded, setAssessmentLoaded] = useState(false);

  const [levelHistory, setLevelHistory] = useState<LevelHistory | null>(null);
  const [levelLimit, setLevelLimitState] = useState<LevelHistoryLimit>('5');
  const [levelLoading, setLevelLoading] = useState(true);

  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);

  const [frequentClubs, setFrequentClubs] = useState<FrequentClub[]>([]);
  const [frequentPartners, setFrequentPartners] = useState<FrequentPartner[]>([]);
  const [socialLoading, setSocialLoading] = useState(true);

  // Guards de cache: >0 => ya cargado alguna vez (no re-fetch salvo force).
  const bundleLoadedAt = useRef(0);
  const radarLoadedAt = useRef(0);
  const peerLoadedAt = useRef(0);
  const levelLoadedAt = useRef(0);
  const statsLoadedAt = useRef(0);
  const socialLoadedAt = useRef(0);
  const [bootstrapped, setBootstrapped] = useState(false);
  const lastBackgroundRefreshAt = useRef(0);

  // ── Loaders (con guard + SWR: spinner solo en 1ª carga) ──

  // Bundle del HERO (personalización + marcos + logros): lo ÚNICO que bloquea el
  // hero. El radar y el peer van aparte (loaders de abajo) con su skeleton.
  const loadBundle = useCallback(
    (force: boolean) => {
      if (!token) return;
      if (!force && bundleLoadedAt.current > 0) return;
      fetchProfileBundle(token)
        .then((b) => {
          if (!b) return;
          setCustomization(b.customization);
          setFramesCatalog(b.frames);
          setAllAchievements(b.achievements);
          bundleLoadedAt.current = Date.now();
        })
        .catch(() => {})
        .finally(() => setBundleReady(true));
    },
    [token],
  );

  // Radar del Coach (+ sus stats): aparte del hero, con CoachSkeleton hasta que
  // llega. Puede crecer en complejidad sin afectar al hero.
  const loadRadar = useCallback(
    (force: boolean) => {
      if (!token) return;
      if (!force && radarLoadedAt.current > 0) return;
      const isFirst = radarLoadedAt.current === 0;
      if (isFirst) setAssessmentLoaded(false);
      fetchMyCoachAssessment(token, locale)
        .then((a) => {
          setAssessment(a);
          radarLoadedAt.current = Date.now();
        })
        .catch(() => {})
        .finally(() => setAssessmentLoaded(true));
      fetchMyCoachStats(token)
        .then(setCoachStats)
        .catch(() => {});
    },
    [token, locale],
  );

  // Peer-insight (OpenAI): depende de playerId; el backend no bloquea (devuelve
  // vacío y genera en background), así que aquí es un fetch normal, sin skeleton.
  const loadPeer = useCallback(
    (force: boolean) => {
      if (!token || !playerId) return;
      if (!force && peerLoadedAt.current > 0) return;
      fetchMyPeerFeedbackInsight(token, playerId, locale)
        .then((p) => {
          setPeerInsight(p);
          peerLoadedAt.current = Date.now();
        })
        .catch(() => {});
    },
    [token, playerId, locale],
  );

  const loadLevel = useCallback(
    (force: boolean, limitOverride?: LevelHistoryLimit) => {
      if (!token) return;
      const limit = limitOverride ?? levelLimit;
      if (!force && levelLoadedAt.current > 0 && limitOverride === undefined) return;
      const isFirst = levelLoadedAt.current === 0;
      if (isFirst) setLevelLoading(true);
      fetchLevelHistory(token, limit)
        .then((h) => {
          setLevelHistory(h);
          levelLoadedAt.current = Date.now();
        })
        .catch(() => {})
        .finally(() => {
          if (isFirst) setLevelLoading(false);
        });
    },
    [token, levelLimit],
  );

  const loadStats = useCallback(
    (force: boolean) => {
      if (!token || !playerId) return;
      if (!force && statsLoadedAt.current > 0) return;
      fetchPlayerStats(token, playerId)
        .then((s) => {
          setPlayerStats(s);
          statsLoadedAt.current = Date.now();
        })
        .catch(() => {});
    },
    [token, playerId],
  );

  const loadSocial = useCallback(
    (force: boolean) => {
      if (!playerId) return;
      if (!force && socialLoadedAt.current > 0) return;
      const isFirst = socialLoadedAt.current === 0;
      if (isFirst) setSocialLoading(true);
      Promise.all([fetchFrequentClubs(playerId), fetchFrequentPartners(playerId)])
        .then(([c, p]) => {
          setFrequentClubs(c);
          setFrequentPartners(p);
          socialLoadedAt.current = Date.now();
        })
        .catch(() => {})
        .finally(() => {
          if (isFirst) setSocialLoading(false);
        });
    },
    [playerId],
  );

  // ── Acciones expuestas ──

  const ensureLoaded = useCallback(() => {
    if (bootstrapped) return; // reentrada: sirve lo cacheado, sin fetch.
    setBootstrapped(true);
    // Token-only. Los que dependen de playerId (peer/stats/social) los dispara el
    // efecto [bootstrapped, playerId] de abajo (una sola vía, evita doble carga).
    loadBundle(false);
    loadRadar(false);
    loadLevel(false);
  }, [bootstrapped, loadBundle, loadRadar, loadLevel]);

  const refresh = useCallback(
    ({ force = false }: { force?: boolean } = {}) => {
      setBootstrapped(true);
      loadBundle(force);
      loadRadar(force);
      loadLevel(force);
      loadPeer(force);
      loadStats(force);
      loadSocial(force);
    },
    [loadBundle, loadRadar, loadLevel, loadPeer, loadStats, loadSocial],
  );

  const reloadCoach = useCallback(() => {
    loadRadar(true);
    loadPeer(true);
  }, [loadRadar, loadPeer]);

  const setLevelLimit = useCallback(
    (l: LevelHistoryLimit) => {
      setLevelLimitState(l);
      loadLevel(true, l);
    },
    [loadLevel],
  );

  // Cargas dependientes de playerId: se disparan cuando el perfil ya se abrió
  // (bootstrapped) y hay playerId — tanto si llegó antes como después.
  useEffect(() => {
    if (!bootstrapped || !playerId) return;
    loadPeer(false);
    loadStats(false);
    loadSocial(false);
  }, [bootstrapped, playerId, loadPeer, loadStats, loadSocial]);

  // Al volver del background: revalidación silenciosa con cooldown (solo si ya
  // se abrió el perfil alguna vez).
  useEffect(() => {
    let last: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      const prev = last;
      last = next;
      if (!bootstrapped) return;
      if (prev.match(/inactive|background/) && next === 'active') {
        if (Date.now() - lastBackgroundRefreshAt.current < BACKGROUND_REFRESH_COOLDOWN_MS) return;
        lastBackgroundRefreshAt.current = Date.now();
        refresh({ force: true });
      }
    });
    return () => sub.remove();
  }, [bootstrapped, refresh]);

  // Logout / cambio de usuario: limpiar cache para que el próximo login recargue.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    setBootstrapped(false);
    bundleLoadedAt.current = 0;
    radarLoadedAt.current = 0;
    peerLoadedAt.current = 0;
    levelLoadedAt.current = 0;
    statsLoadedAt.current = 0;
    socialLoadedAt.current = 0;
    setBundleReady(false);
    setAssessmentLoaded(false);
    setLevelLoading(true);
    setSocialLoading(true);
    setCustomization(null);
    setFramesCatalog([]);
    setAllAchievements([]);
    setAssessment(null);
    setPeerInsight(null);
    setCoachStats(null);
    setLevelHistory(null);
    setPlayerStats(null);
    setFrequentClubs([]);
    setFrequentPartners([]);
  }, [userId]);

  const value = useMemo<ProfileDataValue>(
    () => ({
      customization,
      framesCatalog,
      allAchievements,
      assessment,
      peerInsight,
      coachStats,
      levelHistory,
      levelLimit,
      setLevelLimit,
      playerStats,
      frequentClubs,
      frequentPartners,
      bundleReady,
      assessmentLoaded,
      levelLoading,
      socialLoading,
      ensureLoaded,
      refresh,
      reloadCoach,
      setCustomization,
    }),
    [
      customization,
      framesCatalog,
      allAchievements,
      assessment,
      peerInsight,
      coachStats,
      levelHistory,
      levelLimit,
      setLevelLimit,
      playerStats,
      frequentClubs,
      frequentPartners,
      bundleReady,
      assessmentLoaded,
      levelLoading,
      socialLoading,
      ensureLoaded,
      refresh,
      reloadCoach,
    ],
  );

  return <ProfileDataContext.Provider value={value}>{children}</ProfileDataContext.Provider>;
}

export function useProfileData(): ProfileDataValue {
  const ctx = useContext(ProfileDataContext);
  if (!ctx) throw new Error('useProfileData debe usarse dentro de ProfileDataProvider');
  return ctx;
}
