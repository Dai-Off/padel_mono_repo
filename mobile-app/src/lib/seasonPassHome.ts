import type { SeasonPassMeOk } from '../api/seasonPass';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/** Etiqueta corta desde `season.slug` (p. ej. `s1` → `Temporada 1`). */
export function seasonSlugToLabel(slug: string, t: TranslateFn): string {
  const m = /^s(\d+)$/i.exec(String(slug).trim());
  return m
    ? t('home.seasonPass.seasonSlug', { n: parseInt(m[1], 10) })
    : String(slug).trim() || '—';
}

export function levelMaxResolved(me: Pick<SeasonPassMeOk, 'level_max'>): number {
  const v = me.level_max;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 100;
}

export function seasonPassCapSp(me: Pick<SeasonPassMeOk, 'level_max' | 'sp_per_level'>): number {
  return levelMaxResolved(me as SeasonPassMeOk) * me.sp_per_level;
}

export function isSeasonPassSpCapped(
  me: Pick<SeasonPassMeOk, 'sp' | 'level_max' | 'sp_per_level'>
): boolean {
  return me.sp >= seasonPassCapSp(me);
}

export function seasonPassNextLevel(me: SeasonPassMeOk): number {
  return Math.min(levelMaxResolved(me), me.level + 1);
}

/** Texto fila “Siguiente:” (solo datos del pase). */
export function seasonPassHomeNextLine(me: SeasonPassMeOk, t: TranslateFn): string {
  if (isSeasonPassSpCapped(me)) return t('home.seasonPass.seasonMax');
  return t('home.seasonPass.levelN', { n: seasonPassNextLevel(me) });
}
