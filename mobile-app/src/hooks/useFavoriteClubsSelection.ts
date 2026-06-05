import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useHomeData } from '../contexts/HomeDataContext';
import { updateMyPlayerPreferences, type PlayerPreferences } from '../api/players';
import { resolveSavedFavoriteClubIds } from '../lib/favoriteClubIds';
import { saveStoredPreferredClubIds } from '../lib/preferredClubsStorage';
import { useClubCatalog } from './useClubCatalog';

export function useFavoriteClubsSelection() {
  const { session } = useAuth();
  const token = session?.access_token;
  const { profile, refreshProfile } = useHomeData();
  const { clubs: clubCatalog, loading: catalogLoading, error: catalogError, reload } = useClubCatalog();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialSeedDoneRef = useRef(false);

  useEffect(() => {
    if (initialSeedDoneRef.current || clubCatalog.length === 0) return;

    let cancelled = false;
    void (async () => {
      const ids = await resolveSavedFavoriteClubIds(profile, clubCatalog);
      if (cancelled || initialSeedDoneRef.current) return;
      initialSeedDoneRef.current = true;
      setSelectedIds(ids);
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [clubCatalog, profile]);

  const selectedLabels = useMemo(() => {
    const byId = new Map(clubCatalog.map((c) => [c.id, c.name]));
    return selectedIds.map((id) => byId.get(id) ?? 'Club');
  }, [clubCatalog, selectedIds]);

  const persistSelection = useCallback(
    async (ids: string[]) => {
      if (!token) return { ok: false as const, error: 'Inicia sesión para guardar.' };
      const byId = new Map(clubCatalog.map((c) => [c.id, c.name]));
      const names = ids.map((id) => byId.get(id)).filter((n): n is string => !!n && n.trim().length > 0);
      setSaving(true);
      const basePrefs: PlayerPreferences = profile?.preferences ?? {
        preferredSide: 'both',
        preferredScheduleSlots: [],
        preferredDays: [],
        preferredPlayStyle: 'balanced',
        preferredMatchDurationMin: 90,
        preferredPartnerLevel: 'any',
        favoriteClubs: [],
        notifNewMatches: true,
        notifTournamentReminders: true,
        notifClassUpdates: true,
        notifChatMessages: true,
      };
      const res = await updateMyPlayerPreferences(token, {
        ...basePrefs,
        favoriteClubs: names,
      });
      setSaving(false);
      if (!res.ok) return { ok: false as const, error: res.error };
      await saveStoredPreferredClubIds(ids);
      void refreshProfile({ force: true });
      return { ok: true as const };
    },
    [clubCatalog, profile?.preferences, refreshProfile, token],
  );

  return {
    selectedIds,
    setSelectedIds,
    selectedLabels,
    clubCatalog,
    catalogLoading,
    catalogError,
    reload,
    saving,
    persistSelection,
    hydrated,
  };
}
