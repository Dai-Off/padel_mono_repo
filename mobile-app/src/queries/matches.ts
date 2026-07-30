import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchMatches, fetchMyMatches, type MatchEnriched } from '../api/matches';
import { fetchMyPlayerProfile, type MyPlayerProfile } from '../api/players';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { normalizeMatchEnriched } from '../api/normalizeMatch';
import {
  getMatchBooking,
  getMatchListPhase,
  isPartidoCancelled,
} from '../domain/matchLifecycle';
import { defaultPartidosDiscoveryDateRange } from '../domain/partidosFilters';
import {
  enrichPartidoWithProfileAvatar,
  enrichPartidosWithProfileAvatar,
  isPartidoOpenForDiscovery,
  mergeMisPartidosFromServer,
  removeMisPartidoFromList,
  upsertMisPartidosList,
  type ProfileForPartidoEnrich,
} from '../lib/partidoPlayerUtils';
import { reloadMatchPartido } from '../lib/reloadMatchPartido';
import { findMisPartidoIdsToRemove } from '../lib/pruneMisPartidos';
import type { PartidoItem } from '../screens/PartidosScreen';
import { useMyProfile } from './profile';
import { matchesKeys, profileKeys } from './keys';

/**
 * Queries del dominio de partidos (antes en HomeDataContext.refreshMatches).
 *
 * - 'mine': /matches/mine + merge con upserts locales recientes (crear/unirse
 *   antes de que el servidor los confirme) y poda de los que desaparecieron.
 * - 'discovery': listado público, mapeado con el viewer actual (el playerId va
 *   en la key: al llegar el perfil se re-mapea; keepPreviousData evita el flash).
 * - Volátil y con mutaciones optimistas: la raíz 'matches' NO se persiste.
 */

/** Throttle (3s) de las revalidaciones 'mine' sin force tras mutaciones. */
const lastMineRefreshAtByUser = new Map<string, number>();
const MINE_REFRESH_THROTTLE_MS = 3000;

/** Registro por usuario de la mecánica anti-clobber del merge de "mis partidos". */
type MisPartidosRegistry = {
  /** IDs que /matches/mine devolvió alguna vez — si desaparecen, no reinsertar en merge. */
  everSynced: Set<string>;
  /** Upserts locales recientes (crear/unirse) antes de que /mine los confirme. */
  pendingLocal: Map<string, number>;
};

const registries = new Map<string, MisPartidosRegistry>();

function getRegistry(userId: string): MisPartidosRegistry {
  let r = registries.get(userId);
  if (!r) {
    r = { everSynced: new Set(), pendingLocal: new Map() };
    registries.set(userId, r);
  }
  return r;
}

/** Limpieza en logout / cambio de usuario (el caché de queries lo limpia queryClient.clear()). */
export function clearMisPartidosRegistry(userId: string | null): void {
  if (userId) registries.delete(userId);
}

function toEnrichProfile(p: MyPlayerProfile | null | undefined): ProfileForPartidoEnrich | null {
  if (!p?.id) return null;
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    username: p.username,
    avatarUrl: p.avatarUrl,
    eloRating: p.eloRating,
  };
}

/** Solo datos de GET /matches/mine — nunca el listado público de /matches. */
function buildMisPartidosFromMatches(
  mineSource: MatchEnriched[],
  playerProfile: ProfileForPartidoEnrich | null,
): PartidoItem[] {
  const mineRawBase = mineSource.filter((m) => {
    const b = getMatchBooking(m);
    return Boolean(b?.start_at && b?.end_at);
  });
  const mineVisible = mineRawBase.filter((m) => {
    const b = getMatchBooking(m);
    if (b?.deleted_at != null) return false;
    if (String(m.status).toLowerCase() === 'cancelled') return false;
    if (String(b?.status ?? '').toLowerCase() === 'cancelled') return false;
    return true;
  });
  const mineRaw = [
    ...mineVisible
      .filter((m) => {
        const b = getMatchBooking(m)!;
        return getMatchListPhase(Date.now(), m.status, b.start_at, b.end_at) !== 'past';
      })
      .sort(
        (a, b) =>
          new Date(getMatchBooking(a)!.start_at!).getTime() -
          new Date(getMatchBooking(b)!.start_at!).getTime(),
      ),
    ...mineVisible
      .filter((m) => {
        const b = getMatchBooking(m)!;
        return getMatchListPhase(Date.now(), m.status, b.start_at, b.end_at) === 'past';
      })
      .sort(
        (a, b) =>
          new Date(getMatchBooking(b)!.start_at!).getTime() -
          new Date(getMatchBooking(a)!.start_at!).getTime(),
      ),
  ];
  const viewerPlayerId = playerProfile?.id ?? null;
  const mapped = mineRaw
    .map((m) => mapMatchToPartido(m, { viewerPlayerId }))
    .filter((p): p is PartidoItem => p != null)
    .filter((p) => !isPartidoCancelled(p));
  return enrichPartidosWithProfileAvatar(mapped, playerProfile);
}

function useMatchesSession() {
  const { session } = useAuth();
  return { token: session?.access_token, userId: session?.user?.id };
}

/**
 * Carrusel "Mis partidos": server + merge con upserts locales. El queryFn lee
 * el dato previo del caché para podar/mergear igual que hacía el contexto.
 */
export function useMisPartidos() {
  const { token, userId } = useMatchesSession();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: matchesKeys.mine(userId ?? 'anon'),
    queryFn: async (): Promise<PartidoItem[]> => {
      const registry = getRegistry(userId!);
      const enrichProfile = toEnrichProfile(
        queryClient.getQueryData<MyPlayerProfile>(profileKeys.base(userId!)),
      );

      const myMatches = await fetchMyMatches(token!, { phase: 'all', limit: 100 });
      const mineNormalized = (myMatches as MatchEnriched[]).map(normalizeMatchEnriched);
      for (const m of mineNormalized) {
        if (m.id) registry.everSynced.add(m.id);
      }
      const misFromServer = buildMisPartidosFromMatches(mineNormalized, enrichProfile);
      const serverIds = new Set(misFromServer.map((p) => p.id));
      for (const id of serverIds) {
        registry.pendingLocal.delete(id);
      }

      const prevMis = queryClient.getQueryData<PartidoItem[]>(matchesKeys.mine(userId!)) ?? [];
      const staleIds = await findMisPartidoIdsToRemove(prevMis, serverIds, token!);
      for (const id of staleIds) {
        registry.pendingLocal.delete(id);
      }
      const prunedPrev = prevMis.filter((p) => !staleIds.has(p.id));

      return mergeMisPartidosFromServer(
        prunedPrev,
        misFromServer,
        enrichProfile,
        registry.everSynced,
        registry.pendingLocal,
      );
    },
    enabled: Boolean(token && userId),
  });
}

/** Listado público de discovery del Home, mapeado con el viewer actual. */
export function usePartidosDiscovery() {
  const { token, userId } = useMatchesSession();
  const { data: myProfile } = useMyProfile();
  const playerId = myProfile?.id ?? null;
  return useQuery({
    queryKey: matchesKeys.discovery(userId ?? 'anon', playerId ?? 'none'),
    queryFn: async (): Promise<PartidoItem[]> => {
      const { dateFrom, dateTo } = defaultPartidosDiscoveryDateRange();
      const discoveryRows = await fetchMatches({
        expand: true,
        token: token!,
        activeOnly: true,
        discovery: true,
        visibility: 'public',
        dateFrom,
        dateTo,
        joinableOnly: true,
        limit: 80,
      });
      return discoveryRows
        .map((m) => mapMatchToPartido(m, { viewerPlayerId: playerId }))
        .filter((p): p is PartidoItem => p != null)
        .filter((p) => p.matchPhase !== 'past')
        .filter((p) => isPartidoOpenForDiscovery(p, playerId));
    },
    enabled: Boolean(token && userId),
    // La key cambia cuando llega el playerId: mantener el dataset anterior
    // mientras se re-mapea (sin flash de lista vacía).
    placeholderData: keepPreviousData,
  });
}

/**
 * Revalidación de partidos (antes HomeDataContext.refreshMatches). Sin force la
 * query gestiona su frescura; con force invalida mine (y discovery si scope
 * 'full'). El scope 'mine' sin force conserva el throttle de 3s.
 */
export function useRefreshMatches() {
  const { userId } = useMatchesSession();
  const queryClient = useQueryClient();
  return useCallback(
    async ({ force = false, scope = 'full' }: { force?: boolean; scope?: 'full' | 'mine' } = {}) => {
      if (!userId) return;
      const mineOnly = scope === 'mine';
      if (!force) {
        if (!mineOnly) return;
        const lastAt = lastMineRefreshAtByUser.get(userId) ?? 0;
        if (Date.now() - lastAt < MINE_REFRESH_THROTTLE_MS) return;
      }
      if (mineOnly) lastMineRefreshAtByUser.set(userId, Date.now());
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: matchesKeys.mine(userId) }),
      ];
      if (!mineOnly) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: matchesKeys.discoveryAll(userId) }),
        );
      }
      await Promise.all(invalidations);
    },
    [queryClient, userId],
  );
}

/**
 * Discovery de un rango de fechas custom (cuando el filtro «cuándo» pide un
 * rango distinto al del Home). Mismo mapeo que usePartidosDiscovery. Se habilita
 * solo con un `range` no nulo; el playerId va en la key para re-mapear al llegar
 * el perfil. Sustituye al fetch manual con generaciones de usePartidosList.
 */
export function usePartidosDiscoveryRange(
  range: { activeOnly: boolean; dateFrom?: string; dateTo?: string } | null,
) {
  const { token, userId } = useMatchesSession();
  const { data: myProfile } = useMyProfile();
  const playerId = myProfile?.id ?? null;
  const rangeKey = range
    ? `${range.activeOnly ? 1 : 0}:${range.dateFrom ?? ''}:${range.dateTo ?? ''}`
    : 'none';
  return useQuery({
    queryKey: matchesKeys.discoveryRange(userId ?? 'anon', playerId ?? 'none', rangeKey),
    queryFn: async (): Promise<PartidoItem[]> => {
      const discoveryRows = await fetchMatches({
        expand: true,
        token: token!,
        activeOnly: range!.activeOnly,
        discovery: true,
        visibility: 'public',
        dateFrom: range!.dateFrom,
        dateTo: range!.dateTo,
        joinableOnly: true,
        limit: 100,
      });
      return discoveryRows
        .map((m) => mapMatchToPartido(m, { viewerPlayerId: playerId }))
        .filter((p): p is PartidoItem => p != null)
        .filter((p) => p.matchPhase !== 'past')
        .filter((p) => isPartidoOpenForDiscovery(p, playerId));
    },
    enabled: Boolean(token && userId && range),
    placeholderData: keepPreviousData,
  });
}

/**
 * Mutaciones optimistas del carrusel. Cancelan el /mine en vuelo antes de
 * escribir (su merge, anterior al cambio local, pisaría el upsert) y registran
 * el id en pendingLocal para que el próximo merge lo respete.
 */
export function useMisPartidosActions() {
  const { userId } = useMatchesSession();
  const queryClient = useQueryClient();

  const upsertMisPartido = useCallback(
    async (item: PartidoItem) => {
      if (!userId) return;
      const key = matchesKeys.mine(userId);
      const registry = getRegistry(userId);
      await queryClient.cancelQueries({ queryKey: key });
      if (isPartidoCancelled(item)) {
        registry.pendingLocal.delete(item.id);
        queryClient.setQueryData<PartidoItem[]>(key, (prev) =>
          removeMisPartidoFromList(prev ?? [], item.id),
        );
        return;
      }
      registry.pendingLocal.set(item.id, Date.now());
      queryClient.setQueryData<PartidoItem[]>(key, (prev) => upsertMisPartidosList(prev ?? [], item));
    },
    [queryClient, userId],
  );

  const removeMisPartido = useCallback(
    async (matchId: string) => {
      if (!userId) return;
      const key = matchesKeys.mine(userId);
      getRegistry(userId).pendingLocal.delete(matchId);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<PartidoItem[]>(key, (prev) =>
        removeMisPartidoFromList(prev ?? [], matchId),
      );
    },
    [queryClient, userId],
  );

  return { upsertMisPartido, removeMisPartido };
}

/**
 * Tras crear/unirse a un partido: trae el perfil fresco, recarga el match, lo
 * inserta (o lo quita si está cancelado) en el carrusel y revalida /mine.
 * Extraído de HomeDataContext.syncMisPartidoFromMatchId sin cambios de lógica.
 */
export function useSyncMisPartidoFromMatchId() {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const userId = session?.user?.id ?? null;
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();
  const { upsertMisPartido, removeMisPartido } = useMisPartidosActions();
  const refreshMatches = useRefreshMatches();

  return useCallback(
    async (
      matchId: string,
      opts?: {
        organizerPlayerId?: string | null;
        forceSlotIndex?: number;
        matchVisibility?: 'public' | 'private';
      },
    ) => {
      if (!token || !matchId.trim()) return;

      const freshProfile = await fetchMyPlayerProfile(token);
      const playerId = freshProfile?.id ?? opts?.organizerPlayerId?.trim() ?? profile?.id ?? null;
      if (!playerId) {
        await refreshMatches({ force: true, scope: 'mine' });
        return;
      }

      const profileEnrich: ProfileForPartidoEnrich = {
        id: playerId,
        firstName: freshProfile?.firstName ?? profile?.firstName,
        lastName: freshProfile?.lastName ?? profile?.lastName,
        avatarUrl: freshProfile?.avatarUrl ?? profile?.avatarUrl ?? null,
      };

      const loaded = await reloadMatchPartido(matchId, token, {
        retryIfMissingPlayerId: playerId,
      });
      if (loaded) {
        if (isPartidoCancelled(loaded)) {
          await removeMisPartido(matchId);
        } else {
          let enriched = enrichPartidoWithProfileAvatar(loaded, profileEnrich, {
            forceSlotIndex: opts?.forceSlotIndex,
          });
          enriched = {
            ...enriched,
            organizerPlayerId: enriched.organizerPlayerId ?? opts?.organizerPlayerId ?? playerId,
            visibility:
              enriched.visibility ??
              (opts?.matchVisibility === 'private'
                ? 'private'
                : opts?.matchVisibility === 'public'
                  ? 'public'
                  : undefined),
          };
          await upsertMisPartido(enriched);
        }
      }

      await refreshMatches({ force: true, scope: 'mine' });

      if (freshProfile && userId) {
        // Siembra el caché del perfil base (lo marca fresco: evita otro fetch).
        queryClient.setQueryData(profileKeys.base(userId), freshProfile);
      }
    },
    [token, userId, queryClient, profile?.id, profile?.firstName, profile?.lastName, profile?.avatarUrl, upsertMisPartido, removeMisPartido, refreshMatches],
  );
}
