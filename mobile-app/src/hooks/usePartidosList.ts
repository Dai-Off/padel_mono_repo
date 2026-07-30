import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useHomeData } from '../contexts/HomeDataContext';
import { usePartidosDiscoveryRange } from '../queries/matches';
import { matchesKeys } from '../queries/keys';
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

export function usePartidosList(token: string | null | undefined, refreshNonce: number) {
  const { t, locale } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const queryClient = useQueryClient();
  const {
    profile,
    partidos: contextPartidos,
    refreshMatches,
    matchesLoading,
  } = useHomeData();
  const [filters, setFilters] = useState<PartidosFiltersState>(getInitialPartidosFilters);
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

  // Discovery de rango custom en React Query: activo solo cuando el filtro
  // «cuándo» pide un rango distinto al del Home (si no, se usa el cache del Home).
  const customRange = usesDefaultDiscoveryRange
    ? null
    : { activeOnly: fetchRange.activeOnly, dateFrom: fetchRange.dateFrom, dateTo: fetchRange.dateTo };
  const customRangeQuery = usePartidosDiscoveryRange(customRange);
  const customRangeOpen = usesDefaultDiscoveryRange ? null : (customRangeQuery.data ?? null);
  const customRangeLoading = usesDefaultDiscoveryRange ? false : customRangeQuery.isLoading;

  /** Tras crear/unirse: revalida el Home (mine + discovery) y el rango custom. */
  useEffect(() => {
    if (refreshNonce > 0 && token) {
      void refreshMatches({ force: true });
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: matchesKeys.discoveryRangeAll(userId) });
      }
    }
  }, [refreshNonce, token, refreshMatches, userId, queryClient]);

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
