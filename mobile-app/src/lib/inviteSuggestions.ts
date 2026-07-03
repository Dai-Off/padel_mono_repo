import { fetchFrequentPartners } from '../api/profileSocial';
import type { PlayerSearchHit } from '../api/players';

/**
 * Fuente de sugerencias de jugadores para invitar. Enchufable: HOY = compañeros frecuentes;
 * en el futuro se unirán aquí los "seguidores" (misma UI, sin tocar los pickers).
 * Devuelve `PlayerSearchHit` para reutilizar el render de los resultados de búsqueda.
 */
export async function fetchInviteSuggestions(
  playerId: string | null | undefined,
  limit = 5,
): Promise<PlayerSearchHit[]> {
  if (!playerId) return [];
  const partners = await fetchFrequentPartners(playerId, limit);
  return partners.map((p) => ({
    id: p.id,
    first_name: p.name,
    last_name: null,
    username: null,
    avatar_url: p.avatarUrl,
    // Valor real: en matchmaking se filtran los que no completaron la nivelación; en privado da igual.
    onboarding_completed: p.onboardingCompleted ?? undefined,
  }));
}
