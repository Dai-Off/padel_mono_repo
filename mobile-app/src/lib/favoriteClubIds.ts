import { loadStoredPreferredClubIds } from './preferredClubsStorage';

type ClubRef = { id: string; name: string };
type ProfileWithFavorites = {
  preferences?: { favoriteClubs?: string[] };
} | null;

/** Misma fuente que el picker de clubes: storage local y, si no hay, nombres del perfil. */
export async function resolveSavedFavoriteClubIds(
  profile: ProfileWithFavorites,
  clubCatalog: ClubRef[],
): Promise<string[]> {
  const stored = await loadStoredPreferredClubIds();
  if (stored.length > 0) return stored;

  const favNames = new Set(
    (profile?.preferences?.favoriteClubs ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean),
  );
  if (favNames.size === 0) return [];

  return clubCatalog
    .filter((c) => favNames.has(c.name.trim().toLowerCase()))
    .map((c) => c.id);
}

export function countFavoriteClubsFromIds(ids: string[]): number {
  return new Set(ids.filter((id) => id.trim().length > 0)).size;
}
