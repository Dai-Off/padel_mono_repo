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
import { useTranslation } from '../i18n';
import { enrichPartidosWithClubImages, isPartidoOpenForDiscovery } from '../lib/partidoPlayerUtils';
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

function mapDiscoveryRows(
  rows: Awaited<ReturnType<typeof fetchMatches>>,
  myId: string | null,
): PartidoItem[] {
  return rows
    .map((m) => mapMatchToPartido(m, { viewerPlayerId: myId }))
    .filter((p): p is PartidoItem => p != null)
    .filter((p) => p.matchPhase !== 'past')
    .filter((p) => isPartidoOpenForDiscovery(p, myId));
}

export function usePartidosList(token: string | null | undefined, refreshNonce: number) {
  const { t, locale } = useTranslation();
  const {
    profile,
    partidos: contextPartidos,
    refreshMatches,
    matchesLoading,
  } = useHomeData();
  const customLoadGenRef = useRef(0);
  const [filters, setFilters] = useState<PartidosFiltersState>(getInitialPartidosFilters);
  /** Solo cuando el filtro «cuándo» pide un rango distinto al cache de Home. */
  const [customRangeOpen, setCustomRangeOpen] = useState<PartidoItem[] | null>(null);
  const [customRangeLoading, setCustomRangeLoading] = useState(false);
  const [organizerPlayerId, setOrganizerPlayerId] = useState<string | null>(profile?.id ?? null);
  const [favoriteClubIds, setFavoriteClubIds] = useState<string[]>([]);
  const { clubs, loading: clubsLoading, reload: reloadClubs } = useClubCatalog();

  const usesDefaultDiscoveryRange = filters.selectedDateKeys.length === 0;

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

  /** Tras crear/unirse: una sola revalidación en HomeDataContext (mine + discovery). */
  useEffect(() => {
    if (refreshNonce > 0 && token) {
      setCustomRangeOpen(null);
      void refreshMatches({ force: true });
    }
  }, [refreshNonce, token, refreshMatches]);

  const loadCustomRangeOpen = useCallback(async () => {
    if (!token || usesDefaultDiscoveryRange) {
      setCustomRangeOpen(null);
      setCustomRangeLoading(false);
      return;
    }

    const gen = ++customLoadGenRef.current;
    setCustomRangeLoading(true);
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
      if (gen !== customLoadGenRef.current) return;
      const myId = profile?.id ?? null;
      setCustomRangeOpen(mapDiscoveryRows(openMatches, myId));
    } catch {
      if (gen === customLoadGenRef.current) setCustomRangeOpen([]);
    } finally {
      if (gen === customLoadGenRef.current) setCustomRangeLoading(false);
    }
  }, [
    token,
    usesDefaultDiscoveryRange,
    fetchRange.activeOnly,
    fetchRange.dateFrom,
    fetchRange.dateTo,
    profile?.id,
  ]);

  useEffect(() => {
    void loadCustomRangeOpen();
  }, [loadCustomRangeOpen]);

  const openRawBase = usesDefaultDiscoveryRange ? contextPartidos : (customRangeOpen ?? []);

  const openRaw = useMemo(
    () =>
      enrichPartidosWithClubImages(
        openRawBase,
        clubs.map((c) => ({ id: c.id, imageUrl: c.imageUrl })),
      ),
    [openRawBase, clubs],
  );

  const loading = usesDefaultDiscoveryRange
    ? matchesLoading && contextPartidos.length === 0
    : customRangeLoading;

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

  const previewCount = useCallback(
    (draft: PartidosFiltersState) => {
      const base = openRaw.filter((p) => isOthersOpenMatch(p, organizerPlayerId));
      return filterPartidosList(base, draft, filterContext).length;
    },
    [openRaw, filterContext, organizerPlayerId],
  );

  const labels = useMemo(
    () => ({
      sport: sportChipLabel(filters.sport, t),
      clubs: clubsChipLabel(filters.selectedClubIds.length, clubs.length, t),
      when: whenChipLabel(filters.selectedDateKeys, filters.timeRange, t, locale),
      sportActive: filters.sport !== 'all',
      clubsActive:
        filters.selectedClubIds.length > 0 ||
        filters.useFavoriteClubsOnly ||
        filters.useDistanceFilter,
      whenActive: filters.selectedDateKeys.length > 0 || filters.timeRange != null,
      advancedCount: countPartidosAdvancedFilters(filters),
    }),
    [filters, clubs.length, t, locale],
  );

  return {
    filters,
    setFilters,
    applyFilters,
    patchFilters,
    openPartidos,
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
