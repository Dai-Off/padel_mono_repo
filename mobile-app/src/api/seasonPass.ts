import { API_URL } from '../config';

export type SeasonPassMissionDto = {
  id: string;
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
  lesson_sp_base: number;
  level_max?: number;
  level: number;
  into_level: number;
  pct: number;
  sp_to_next: number;
  mission_period_tabs?: unknown;
  missions?: SeasonPassMissionDto[];
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
