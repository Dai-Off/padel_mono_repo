import { fetchFrequentPartners } from '../api/profileSocial';
import { fetchFollowing } from '../api/playerFollows';
import type { PlayerSearchHit } from '../api/players';

/**
 * Fuente de sugerencias de jugadores para invitar.
 * Combina compañeros frecuentes y personas a las que sigue el usuario.
 * Devuelve `PlayerSearchHit[]`.
 */
export async function fetchInviteSuggestions(
  playerId: string | null | undefined,
  limit = 5,
  token?: string | null
): Promise<PlayerSearchHit[]> {
  if (!playerId) return [];

  try {
    const [partners, followingRes] = await Promise.all([
      fetchFrequentPartners(playerId, limit),
      token ? fetchFollowing(token, playerId) : Promise.resolve({ ok: false, following: [] }),
    ]);

    const itemsMap = new Map<string, PlayerSearchHit>();

    // 1. Añadir personas a las que sigue (following)
    if (followingRes.ok && followingRes.following) {
      for (const p of followingRes.following) {
        itemsMap.set(p.id, {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          username: p.username,
          avatar_url: p.avatar_url,
          onboarding_completed: true, // Asumido para seguidos
        });
      }
    }

    // 2. Añadir compañeros frecuentes (pueden sobrescribir o añadir nuevos)
    for (const p of partners) {
      itemsMap.set(p.id, {
        id: p.id,
        first_name: p.name,
        last_name: null,
        username: null,
        avatar_url: p.avatarUrl,
        onboarding_completed: p.onboardingCompleted ?? undefined,
      });
    }

    return Array.from(itemsMap.values()).slice(0, limit);
  } catch (err) {
    console.error('fetchInviteSuggestions error:', err);
    return [];
  }
}
