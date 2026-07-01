import { API_URL } from '../config';
import type { Achievement, AchievementType } from '../design/achievements';
import type { AchievementRarity } from '../design/rarity';

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** ISO → "ago 2025" (es). Devuelve null si no hay fecha válida. */
function formatMonthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function asType(raw: string): AchievementType {
  return raw === 'trophy' || raw === 'course' ? raw : 'badge';
}
function asRarity(raw: string): AchievementRarity {
  return raw === 'rare' || raw === 'epic' || raw === 'legendary' ? raw : 'common';
}

type AchievementsResponse = {
  ok?: boolean;
  achievements?: {
    id: string;
    type: string;
    title: string;
    description: string;
    icon: string;
    rarity: string;
    sport?: string | null;
    date?: string | null;
    isPublic?: boolean;
    progress?: number;
  }[];
  error?: string;
};

function mapAchievements(json: AchievementsResponse): Achievement[] {
  return (json.achievements ?? []).map((a) => ({
    id: a.id,
    type: asType(a.type),
    title: a.title,
    description: a.description ?? '',
    icon: a.icon ?? 'trophy-outline',
    rarity: asRarity(a.rarity),
    sport: a.sport ?? null,
    date: formatMonthYear(a.date),
    isPublic: a.isPublic ?? true,
    progress: a.progress,
  }));
}

/** Vitrina de logros del jugador (trofeos/insignias conseguidos + cursos completados). */
export async function fetchAchievements(token: string | null | undefined): Promise<Achievement[]> {
  if (!token) return [];
  try {
    const res = await fetch(`${API_URL}/players/me/achievements`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as AchievementsResponse;
    if (!res.ok || !json.ok) return [];
    return mapAchievements(json);
  } catch {
    return [];
  }
}

/** Logros VISIBLES (públicos) de otro jugador, para el perfil ajeno. Público (sin token). */
export async function fetchPlayerPublicAchievements(playerId: string): Promise<Achievement[]> {
  if (!playerId) return [];
  try {
    const res = await fetch(`${API_URL}/players/${playerId}/public-achievements`);
    const json = (await res.json()) as AchievementsResponse;
    if (!res.ok || !json.ok) return [];
    return mapAchievements(json);
  } catch {
    return [];
  }
}

/** Alterna visibilidad pública de un logro. Devuelve el nuevo valor o null si falla. */
export async function toggleAchievementVisibility(
  token: string | null | undefined,
  id: string,
): Promise<boolean | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/players/me/achievements/${id}/visibility`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { ok?: boolean; is_public?: boolean };
    if (!res.ok || !json.ok) return null;
    return json.is_public ?? null;
  } catch {
    return null;
  }
}

// ─── Modal global de desbloqueo ───
export interface PendingUnlock {
  id: string;
  kind: 'trophy' | 'badge' | 'course' | 'title' | 'frame';
  title: string;
  description: string;
  icon: string | null;
  rarity: AchievementRarity;
  animationType: string | null;
  style: string | null;
}

/** Desbloqueables recién conseguidos y no mostrados aún (para el modal global). */
export async function fetchPendingUnlocks(token: string | null | undefined): Promise<PendingUnlock[]> {
  if (!token) return [];
  try {
    const res = await fetch(`${API_URL}/players/me/unlocks/pending`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { ok?: boolean; pending?: PendingUnlock[] };
    if (!res.ok || !json.ok) return [];
    return (json.pending ?? []).map((p) => ({ ...p, rarity: asRarity(p.rarity as string) }));
  } catch {
    return [];
  }
}

/** Marca como mostrados los desbloqueables indicados. */
export async function markUnlocksSeen(token: string | null | undefined, ids: string[]): Promise<void> {
  if (!token || !ids.length) return;
  try {
    await fetch(`${API_URL}/players/me/unlocks/seen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  } catch {
    /* noop */
  }
}
