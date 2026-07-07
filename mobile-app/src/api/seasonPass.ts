import { API_URL } from '../config';

export type SeasonPassMissionDto = {
  id: string;
  /** player_season_pass_missions row id — target for ack/reroll. */
  assignment_id?: string;
  slug: string;
  period: 'daily' | 'weekly' | 'monthly';
  icon: string;
  title: string;
  description: string;
  sp_reward: number;
  reward_hint: string | null;
  target: number;
  current: number;
  done: boolean;
  sp_granted?: number | null;
  period_end_iso: string | null;
  expires_label: string | null;
};

export type SeasonPassSpHowRowDto = {
  icon: string;
  label: string;
  sp_hint: string;
};

export type MissionPeriodTabDto = { period: string; label: string };

export type EliteModalBulletDto = { icon: string; text: string };

/** Misión completada dentro de un delta instantáneo (respuesta de una acción). */
export type SeasonPassCompletedMissionDto = {
  slug: string;
  icon: string;
  title: string;
  period: 'daily' | 'weekly' | 'monthly';
  sp_granted: number;
};

/** Bloque `season_pass` devuelto por endpoints de acción (canal instantáneo §6.7). */
export type SeasonPassDeltaDto = {
  completed_missions: SeasonPassCompletedMissionDto[];
  sp_total: number;
  level: number;
  boost_applied: number;
  level_up: { from: number; to: number; rewards: unknown[] } | null;
};

/** Celebración pendiente de mostrar (misión completada "fuera" de la app). */
export type SeasonPassPendingCelebrationDto = {
  assignment_id: string;
  slug: string;
  icon: string;
  title: string;
  period: 'daily' | 'weekly' | 'monthly';
  sp_granted: number;
  completed_at: string;
};

export type SeasonPassMeOk = {
  ok: true;
  season: {
    slug: string;
    title: string;
    subtitle: string;
    ends_at: string;
    hero_chip_label?: string | null;
    elite_card_subtitle?: string | null;
    elite_modal_bullets?: unknown;
  };
  sp: number;
  has_elite: boolean;
  sp_per_level: number;
  level_max?: number;
  level: number;
  into_level: number;
  pct: number;
  sp_to_next: number;
  mission_period_tabs?: unknown;
  missions?: SeasonPassMissionDto[];
  pending_celebrations?: SeasonPassPendingCelebrationDto[];
  sp_how?: SeasonPassSpHowRowDto[];
  track_levels?: number[];
  next_milestone: unknown | null;
};

export async function fetchSeasonPassMe(
  token: string,
  timezone?: string | null
): Promise<SeasonPassMeOk | null> {
  const tz = encodeURIComponent((timezone ?? 'UTC').trim() || 'UTC');
  const res = await fetch(`${API_URL}/season-pass/me?timezone=${tz}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || data.ok !== true) return null;
  return data as unknown as SeasonPassMeOk;
}

/** Marca celebraciones diferidas como vistas (ids = assignment_id). */
export async function ackSeasonPassMissions(token: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  try {
    const res = await fetch(`${API_URL}/season-pass/missions/ack`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids }),
    });
    return res.ok;
  } catch {
    return false; // silencioso: volverán en el siguiente /me y se re-mostrarán
  }
}
