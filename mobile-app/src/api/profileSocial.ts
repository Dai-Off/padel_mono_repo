import { API_URL } from '../config';
import type { FrameAttrs } from '../components/profile/AvatarWithFrame';

/** Club donde el jugador suele jugar (por frecuencia de partidos). */
export interface FrequentClub {
  id: string;
  name: string;
  image: string | null;
  count: number;
}

/** Persona con la que el jugador suele jugar (co-jugador por frecuencia). */
export interface FrequentPartner {
  id: string;
  name: string;
  avatarUrl: string | null;
  count: number;
  /** Marco equipado del compañero (para pintar el pack). */
  frame?: FrameAttrs | null;
  /** Si completó la nivelación (para no ofrecer invitarle a competitiva). null = desconocido. */
  onboardingCompleted?: boolean | null;
}

/** Clubs donde suele jugar un jugador. Público (sin token). */
export async function fetchFrequentClubs(playerId: string, limit = 8): Promise<FrequentClub[]> {
  if (!playerId) return [];
  try {
    const res = await fetch(`${API_URL}/players/${playerId}/frequent-clubs?limit=${limit}`);
    const json = (await res.json()) as { ok?: boolean; clubs?: FrequentClub[] };
    if (!res.ok || !json.ok) return [];
    return (json.clubs ?? []).map((c) => ({
      id: c.id,
      name: c.name ?? 'Club',
      image: c.image ?? null,
      count: Number(c.count ?? 0),
    }));
  } catch {
    return [];
  }
}

/** Personas con las que suele jugar un jugador. Público (sin token). */
export async function fetchFrequentPartners(playerId: string, limit = 8): Promise<FrequentPartner[]> {
  if (!playerId) return [];
  try {
    const res = await fetch(`${API_URL}/players/${playerId}/frequent-partners?limit=${limit}`);
    const json = (await res.json()) as { ok?: boolean; partners?: FrequentPartner[] };
    if (!res.ok || !json.ok) return [];
    return (json.partners ?? []).map((p) => ({
      id: p.id,
      name: p.name ?? 'Jugador',
      avatarUrl: p.avatarUrl ?? null,
      count: Number(p.count ?? 0),
      frame: p.frame ?? null,
      onboardingCompleted: p.onboardingCompleted ?? null,
    }));
  } catch {
    return [];
  }
}
