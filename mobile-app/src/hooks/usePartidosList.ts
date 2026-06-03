import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMatches, fetchMyMatches } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { fetchMyPlayerId } from '../api/players';
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
import { loadStoredPreferredClubIds } from '../lib/preferredClubsStorage';
import type { PartidoItem } from '../screens/PartidosScreen';
import { useClubCatalog } from './useClubCatalog';

function isPublicJoinableMatch(p: PartidoItem): boolean {
  if (p.matchPhase !== 'upcoming') return false;
  if (p.matchStatus === 'cancelled') return false;
  const filled = (p.players ?? []).filter((x) => !x.isFree).length;
  return filled < 4;
}

export function usePartidosList(token: string | null | undefined, refreshNonce: number) {
  const { profile } = useHomeData();
  const [filters, setFilters] = useState<PartidosFiltersState>(getInitialPartidosFilters);
  const [openRaw, setOpenRaw] = useState<PartidoItem[]>([]);
  const [myRaw, setMyRaw] = useState<PartidoItem[]>([]);
  const [organizerPlayerId, setOrganizerPlayerId] = useState<string | null>(profile?.id ?? null);
  const [loading, setLoading] = useState(true);
  const [favoriteClubIds, setFavoriteClubIds] = useState<string[]>([]);
  const { clubs, loading: clubsLoading, reload: reloadClubs } = useClubCatalog();

  useEffect(() => {
    if (profile?.id) {
      setOrganizerPlayerId(profile.id);
    } else if (token) {
      void fetchMyPlayerId(token).then(setOrganizerPlayerId);
    } else {
      setOrganizerPlayerId(null);
    }
  }, [profile?.id, token]);

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

  const fetchRange = partidosFetchDateRange(filters);

  const loadPartidos = useCallback(async () => {
    setLoading(true);
    const { activeOnly, dateFrom, dateTo } = fetchRange;

    const openMatches = await fetchMatches({
      expand: true,
      token,
      activeOnly,
      discovery: true,
      visibility: 'public',
      dateFrom,
      dateTo,
    });
    const openPartidos = openMatches
      .map(mapMatchToPartido)
      .filter((p): p is PartidoItem => p != null)
      .filter((p) => p.matchPhase !== 'past');
    setOpenRaw(openPartidos);

    if (!token) {
      setMyRaw([]);
      setLoading(false);
      return;
    }

    const myMatches = await fetchMyMatches(token, { phase: 'upcoming', limit: 100 });
    const myPartidos = myMatches
      .map(mapMatchToPartido)
      .filter((p): p is PartidoItem => p != null)
      .filter((p) => p.matchPhase !== 'past');
    setMyRaw(myPartidos);
    setLoading(false);
  }, [token, fetchRange.activeOnly, fetchRange.dateFrom, fetchRange.dateTo]);

  useEffect(() => {
    loadPartidos();
  }, [loadPartidos, refreshNonce]);

  const applyFilters = useCallback((next: PartidosFiltersState) => {
    setFilters(next);
  }, []);

  const patchFilters = useCallback((patch: Partial<PartidosFiltersState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const openPartidos = useMemo(() => {
    const base = openRaw.filter(isPublicJoinableMatch);
    return filterPartidosList(base, filters, filterContext);
  }, [openRaw, filters, filterContext]);

  const myPartidos = useMemo(
    () => filterPartidosList(myRaw, filters, filterContext),
    [myRaw, filters, filterContext],
  );

  const previewCount = useCallback(
    (draft: PartidosFiltersState) => {
      const base = openRaw.filter(isPublicJoinableMatch);
      return filterPartidosList(base, draft, filterContext).length;
    },
    [openRaw, filterContext],
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
    organizerPlayerId,
    clubs,
    clubsLoading,
    reloadClubs,
    favoriteClubIds,
    previewCount,
    labels,
  };
}
