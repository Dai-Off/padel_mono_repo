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
import { useQueryClient } from '@tanstack/react-query';
import { leaveMatchmaking, type PairInvite } from '../api/matchmaking';
import { type ReceivedMatchInvite } from '../api/matchInvites';
import {
  useMatchmakingStatusQuery,
  useReceivedMatchInvitesQuery,
} from '../queries/matchmaking';
import { matchmakingKeys } from '../queries/keys';
import { useAuth } from './AuthContext';

/** Identidades estables para los estados vacíos. */
const EMPTY_PAIR_INVITES: PairInvite[] = [];
const EMPTY_RECEIVED_INVITES: ReceivedMatchInvite[] = [];

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
  const userId = session?.user?.id ?? null;
  const token = session?.access_token ?? null;
  const queryClient = useQueryClient();

  const [bannerState, setBannerStateRaw] = useState<MatchmakingBannerState>('hidden');
  const [queueElapsedSec, setQueueElapsedSec] = useState(0);
  const [queueStartedAtMs, setQueueStartedAtMs] = useState<number | null>(null);
  const [timeoutNoticePending, setTimeoutNoticePending] = useState(false);
  const timeoutInFlightRef = useRef(false);

  // El FETCH lo hacen las queries (poll 5s / 8s); aquí solo vive la máquina de
  // banner/timeout, que reacciona al último status recibido.
  const statusQuery = useMatchmakingStatusQuery();
  const invitesQuery = useReceivedMatchInvitesQuery();

  const pairInvites = statusQuery.data?.pair_invites ?? EMPTY_PAIR_INVITES;
  const matchReceivedInvites = invitesQuery.data ?? EMPTY_RECEIVED_INVITES;

  // Deriva el banner, el timer de cola y la auto-salida a los 3 min a partir
  // del status. Antes vivía dentro del pollStatus; ahora reacciona al dato de
  // la query (cada refetch produce un data nuevo → el efecto recomputa).
  useEffect(() => {
    if (!token) {
      setBannerStateRaw('hidden');
      setTimeoutNoticePending(false);
      setQueueStartedAtMs(null);
      setQueueElapsedSec(0);
      timeoutInFlightRef.current = false;
      return;
    }
    const status = statusQuery.data;
    if (status === undefined) return; // aún sin primer dato
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
        void (async () => {
          const leaveResult = await leaveMatchmaking(token);
          if (leaveResult.ok) {
            setBannerStateRaw('timed_out');
            setTimeoutNoticePending(true);
            setQueueStartedAtMs(null);
            setQueueElapsedSec(0);
          } else {
            timeoutInFlightRef.current = false;
          }
        })();
      }
    } else {
      setQueueStartedAtMs(null);
      setQueueElapsedSec(0);
      timeoutInFlightRef.current = false;
      setBannerStateRaw(timeoutNoticePending ? 'timed_out' : 'hidden');
    }
  }, [
    statusQuery.data,
    statusQuery.dataUpdatedAt,
    queueStartedAtMs,
    timeoutNoticePending,
    token,
  ]);

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

  // Fuerza un poll inmediato reejecutando la query correspondiente.
  const bumpPairInvites = useCallback(() => {
    if (userId) void queryClient.refetchQueries({ queryKey: matchmakingKeys.status(userId) });
  }, [queryClient, userId]);
  const bumpMatchInvites = useCallback(() => {
    if (userId) {
      void queryClient.refetchQueries({ queryKey: matchmakingKeys.receivedInvites(userId) });
    }
  }, [queryClient, userId]);

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
