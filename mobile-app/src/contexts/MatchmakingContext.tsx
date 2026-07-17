import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  fetchMatchmakingStatus,
  leaveMatchmaking,
  type PairInvite,
} from '../api/matchmaking';
import {
  fetchReceivedMatchInvites,
  type ReceivedMatchInvite,
} from '../api/matchInvites';
import { useAuth } from './AuthContext';

export type MatchmakingBannerState = 'hidden' | 'searching' | 'matched' | 'timed_out';

const MATCHMAKING_TIMEOUT_SECONDS = 3 * 60;

type MatchmakingValue = {
  /** Estado del banner de matchmaking (Home y Liga competitiva comparten fuente). */
  bannerState: MatchmakingBannerState;
  /** Cambia el banner respetando la persistencia del estado timed_out. */
  setBannerState: (state: MatchmakingBannerState, options?: { force?: boolean }) => void;
  queueElapsedSec: number;
  setQueueElapsedSec: Dispatch<SetStateAction<number>>;
  queueStartedAtMs: number | null;
  setQueueStartedAtMs: Dispatch<SetStateAction<number | null>>;
  pairInvites: PairInvite[];
  /** Fuerza otro poll inmediato del estado de matchmaking / invitaciones de pareja. */
  bumpPairInvites: () => void;
  matchReceivedInvites: ReceivedMatchInvite[];
  /** Fuerza otro poll inmediato de invitaciones a partidos recibidas. */
  bumpMatchInvites: () => void;
};

const MatchmakingContext = createContext<MatchmakingValue | null>(null);

/**
 * Estado global de matchmaking (antes en MainApp): poll de estado cada 5 s con
 * timer de cola y auto-salida a los 3 min, mas el poll de invitaciones a
 * partidos cada 8 s. Vive a nivel de app para que el banner de Inicio y la
 * pantalla de Liga competitiva compartan una unica fuente.
 */
export function MatchmakingProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  const [bannerState, setBannerStateRaw] = useState<MatchmakingBannerState>('hidden');
  const [queueElapsedSec, setQueueElapsedSec] = useState(0);
  const [queueStartedAtMs, setQueueStartedAtMs] = useState<number | null>(null);
  const [timeoutNoticePending, setTimeoutNoticePending] = useState(false);
  const timeoutInFlightRef = useRef(false);
  const [pairInvites, setPairInvites] = useState<PairInvite[]>([]);
  const [pairInviteNonce, setPairInviteNonce] = useState(0);
  const [matchReceivedInvites, setMatchReceivedInvites] = useState<ReceivedMatchInvite[]>([]);
  const [matchInviteNonce, setMatchInviteNonce] = useState(0);

  // Poll de estado de matchmaking (5 s) + timer de cola + timeout de 3 min.
  useEffect(() => {
    const token = session?.access_token ?? null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!token) {
      setBannerStateRaw('hidden');
      setTimeoutNoticePending(false);
      setQueueStartedAtMs(null);
      setQueueElapsedSec(0);
      timeoutInFlightRef.current = false;
      return;
    }

    const pollStatus = async () => {
      const status = await fetchMatchmakingStatus(token);
      if (cancelled) return;
      setPairInvites(status?.pair_invites ?? []);
      if (status?.status === 'matched') {
        setBannerStateRaw('matched');
        setTimeoutNoticePending(false);
        setQueueStartedAtMs(null);
        setQueueElapsedSec(0);
        timeoutInFlightRef.current = false;
      } else if (status?.status === 'searching') {
        setBannerStateRaw('searching');
        setTimeoutNoticePending(false);
        const startedAt = queueStartedAtMs ?? Date.now();
        if (queueStartedAtMs == null) setQueueStartedAtMs(startedAt);
        const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        setQueueElapsedSec(elapsedSec);
        if (elapsedSec >= MATCHMAKING_TIMEOUT_SECONDS && !timeoutInFlightRef.current) {
          timeoutInFlightRef.current = true;
          const leaveResult = await leaveMatchmaking(token);
          if (cancelled) return;
          if (leaveResult.ok) {
            setBannerStateRaw('timed_out');
            setTimeoutNoticePending(true);
            setQueueStartedAtMs(null);
            setQueueElapsedSec(0);
          } else {
            timeoutInFlightRef.current = false;
          }
        }
      } else {
        setQueueStartedAtMs(null);
        setQueueElapsedSec(0);
        timeoutInFlightRef.current = false;
        setBannerStateRaw(timeoutNoticePending ? 'timed_out' : 'hidden');
      }
      timer = setTimeout(() => {
        void pollStatus();
      }, 5000);
    };

    void pollStatus();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [queueStartedAtMs, timeoutNoticePending, pairInviteNonce, session?.access_token]);

  // Poll de invitaciones a partidos recibidas (8 s).
  useEffect(() => {
    const token = session?.access_token ?? null;
    if (!token) {
      setMatchReceivedInvites([]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const res = await fetchReceivedMatchInvites(token);
      if (!cancelled && res.ok) setMatchReceivedInvites(res.invites);
      if (!cancelled) {
        timer = setTimeout(() => void poll(), 8000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [session?.access_token, matchInviteNonce]);

  const setBannerState = useCallback(
    (state: MatchmakingBannerState, options?: { force?: boolean }) => {
      const force = options?.force === true;
      if (state === 'timed_out') {
        setTimeoutNoticePending(true);
        setBannerStateRaw('timed_out');
        return;
      }

      if (state === 'searching' || state === 'matched') {
        setTimeoutNoticePending(false);
        setBannerStateRaw(state);
        return;
      }

      if (state === 'hidden') {
        // El timeout debe quedar visible hasta que el usuario haga una nueva
        // búsqueda o aparezca un match; no se oculta automáticamente.
        setBannerStateRaw((prev) => {
          if (!force && (timeoutNoticePending || prev === 'timed_out')) {
            return prev;
          }
          return 'hidden';
        });
      }
    },
    [timeoutNoticePending],
  );

  const bumpPairInvites = useCallback(() => setPairInviteNonce((n) => n + 1), []);
  const bumpMatchInvites = useCallback(() => setMatchInviteNonce((n) => n + 1), []);

  const value = useMemo(
    () => ({
      bannerState,
      setBannerState,
      queueElapsedSec,
      setQueueElapsedSec,
      queueStartedAtMs,
      setQueueStartedAtMs,
      pairInvites,
      bumpPairInvites,
      matchReceivedInvites,
      bumpMatchInvites,
    }),
    [
      bannerState,
      setBannerState,
      queueElapsedSec,
      queueStartedAtMs,
      pairInvites,
      bumpPairInvites,
      matchReceivedInvites,
      bumpMatchInvites,
    ],
  );

  return <MatchmakingContext.Provider value={value}>{children}</MatchmakingContext.Provider>;
}

export function useMatchmaking(): MatchmakingValue {
  const ctx = useContext(MatchmakingContext);
  if (!ctx) {
    throw new Error('useMatchmaking must be used within MatchmakingProvider');
  }
  return ctx;
}
