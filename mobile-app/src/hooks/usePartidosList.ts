import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchMatches } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { useHomeData } from '../contexts/HomeDataContext';
import {
  clubsChipLabel,
  countPartidosAdvancedFilters,
  filterPartidosList,
  getInitialPartidosFilters,
  partidosFetchDateRange,
  sportChipLabel,
  whenChipLabel,
  type PartidosFiltersState,
} from '../domain/partidosFilters';
import { isPartidoOpenForDiscovery } from '../lib/partidoPlayerUtils';
import { loadStoredPreferredClubIds } from '../lib/preferredClubsStorage';
import type { PartidoItem } from '../screens/PartidosScreen';
import { useClubCatalog } from './useClubCatalog';

function isPublicJoinableMatch(p: PartidoItem): boolean {
  if (p.matchPhase !== 'upcoming') return false;
  if (p.matchStatus === 'cancelled') return false;
  const filled = (p.players ?? []).filter((x) => !x.isFree).length;
  return filled < 4;
}

function isOthersOpenMatch(p: PartidoItem, myPlayerId: string | null): boolean {
  return isPublicJoinableMatch(p) && isPartidoOpenForDiscovery(p, myPlayerId);
}

function myUpcomingFromHome(misPartidos: PartidoItem[]): PartidoItem[] {
  return misPartidos.filter((p) => p.matchPhase === 'upcoming' || p.matchPhase === 'live');
}

export function usePartidosList(token: string | null | undefined, refreshNonce: number) {
  const { profile, misPartidos, refreshMatches, matchesLoading } = useHomeData();
  const openLoadGenRef = useRef(0);
  const [filters, setFilters] = useState<PartidosFiltersState>(getInitialPartidosFilters);
  const [openRaw, setOpenRaw] = useState<PartidoItem[]>([]);
  const [organizerPlayerId, setOrganizerPlayerId] = useState<string | null>(profile?.id ?? null);
  const [loading, setLoading] = useState(true);
  const [favoriteClubIds, setFavoriteClubIds] = useState<string[]>([]);
  const { clubs, loading: clubsLoading, reload: reloadClubs } = useClubCatalog();

  useEffect(() => {
    setOrganizerPlayerId(profile?.id ?? null);
  }, [profile?.id]);

  useEffect(() => {
    void loadStoredPreferredClubIds().then(setFavoriteClubIds);
  }, []);

  const clubDistanceById = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clubs) {
      if (c.distanceKm != null) m.set(c.id, c.distanceKm);
    }
    return m;
  }, [clubs]);

  const filterContext = useMemo(
    () => ({ clubDistanceById, favoriteClubIds }),
    [clubDistanceById, favoriteClubIds],
  );

  const fetchRange = useMemo(() => partidosFetchDateRange(filters), [filters]);

  const myRaw = useMemo(() => myUpcomingFromHome(misPartidos), [misPartidos]);

  /** Tras mutaciones (unirse, crear…): solo revalida "mis partidos" vía HomeDataContext. */
  useEffect(() => {
    if (refreshNonce > 0 && token) {
      void refreshMatches({ scope: 'mine' });
    }
  }, [refreshNonce, token, refreshMatches]);

  const loadOpenPartidos = useCallback(async () => {
    const gen = ++openLoadGenRef.current;
    setLoading(true);
    const { activeOnly, dateFrom, dateTo } = fetchRange;

    try {
      const openMatches = await fetchMatches({
        expand: true,
        token,
        activeOnly,
        discovery: true,
        visibility: 'public',
        dateFrom,
        dateTo,
        joinableOnly: true,
        limit: 100,
      });
      if (gen !== openLoadGenRef.current) return;
      const myId = profile?.id ?? null;
      const openPartidos = openMatches
        .map((m) => mapMatchToPartido(m))
        .filter((p): p is PartidoItem => p != null)
        .filter((p) => p.matchPhase !== 'past')
        .filter((p) => isPartidoOpenForDiscovery(p, myId));
      setOpenRaw(openPartidos);
    } catch {
      if (gen === openLoadGenRef.current) setOpenRaw([]);
    } finally {
      if (gen === openLoadGenRef.current) setLoading(false);
    }
  }, [
    token,
    fetchRange.activeOnly,
    fetchRange.dateFrom,
    fetchRange.dateTo,
    profile?.id,
  ]);

  useEffect(() => {
    void loadOpenPartidos();
  }, [loadOpenPartidos, refreshNonce]);

  const applyFilters = useCallback((next: PartidosFiltersState) => {
    setFilters(next);
  }, []);

  const patchFilters = useCallback((patch: Partial<PartidosFiltersState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const openPartidos = useMemo(() => {
    const base = openRaw.filter((p) => isOthersOpenMatch(p, organizerPlayerId));
    return filterPartidosList(base, filters, filterContext);
  }, [openRaw, filters, filterContext, organizerPlayerId]);

  const myPartidos = useMemo(
    () => filterPartidosList(myRaw, filters, filterContext),
    [myRaw, filters, filterContext],
  );

  const previewCount = useCallback(
    (draft: PartidosFiltersState) => {
      const base = openRaw.filter((p) => isOthersOpenMatch(p, organizerPlayerId));
      return filterPartidosList(base, draft, filterContext).length;
    },
    [openRaw, filterContext, organizerPlayerId],
  );

  const labels = useMemo(
    () => ({
      sport: sportChipLabel(filters.sport),
      clubs: clubsChipLabel(filters.selectedClubIds.length, clubs.length),
      when: whenChipLabel(filters.selectedDateKeys, filters.timeRange),
      sportActive: filters.sport !== 'all',
      clubsActive:
        filters.selectedClubIds.length > 0 ||
        filters.useFavoriteClubsOnly ||
        filters.useDistanceFilter,
      whenActive: filters.selectedDateKeys.length > 0 || filters.timeRange != null,
      advancedCount: countPartidosAdvancedFilters(filters),
    }),
    [filters, clubs.length],
  );

  return {
    filters,
    setFilters,
    applyFilters,
    patchFilters,
    openPartidos,
    myPartidos,
    loading,
    /** Skeleton de "Mis partidos" mientras HomeDataContext termina el bootstrap. */
    misPartidosLoading: matchesLoading,
    organizerPlayerId,
    clubs,
    clubsLoading,
    reloadClubs,
    favoriteClubIds,
    previewCount,
    labels,
  };
}
