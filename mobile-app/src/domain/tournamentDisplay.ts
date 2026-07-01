import type { PublicTournamentRow, TournamentPrize } from '../api/tournaments';
import { formatLocale, type AppLocale } from '../i18n/constants';
import type { TranslateFn } from './partidosFilters';

export type TournamentFormatFilter = 'all' | 'liga' | 'americano' | 'eliminatoria' | 'torneo';
export type TournamentLevelFilter = 'all' | 'principiante' | 'medio' | 'avanzado';

const PADEL_PLACEHOLDER_IMAGES = [
  'https://images.unsplash.com/photo-1658491830143-72808ca237e3?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1768637757353-57c498a225b7?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1764408721535-2dcb912db83e?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1641237003312-07cf9f83c9a5?w=400&h=300&fit=crop',
];

export function placeholderImageForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h + id.charCodeAt(i) * (i + 1)) % 997;
  return PADEL_PLACEHOLDER_IMAGES[h % PADEL_PLACEHOLDER_IMAGES.length];
}

/** Etiqueta de formato para chips (descripción libre en BD). */
export function inferTournamentFormatKey(description: string | null | undefined): TournamentFormatFilter {
  const d = (description ?? '').toLowerCase();
  if (/\bliga\b/.test(d)) return 'liga';
  if (/americano/.test(d)) return 'americano';
  if (/eliminator|knockout|cuadro|eliminat/.test(d)) return 'eliminatoria';
  return 'torneo';
}

export function formatFormatLabel(key: TournamentFormatFilter, t: TranslateFn): string {
  switch (key) {
    case 'liga':
      return t('torneos.formatLiga');
    case 'americano':
      return t('torneos.formatAmericano');
    case 'eliminatoria':
      return t('torneos.formatEliminatoria');
    case 'torneo':
      return t('torneos.formatTournament');
    default:
      return t('torneos.formatTournament');
  }
}

export function formatShortDate(locale: AppLocale, iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(formatLocale(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return '';
  }
}

export function formatEloRange(
  eloMin: number | null | undefined,
  eloMax: number | null | undefined,
  t: TranslateFn,
): string {
  if (eloMin == null && eloMax == null) return t('common.eloFree');
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `${eloMin != null ? fmt(Number(eloMin)) : '—'} - ${eloMax != null ? fmt(Number(eloMax)) : '—'}`;
}

export function clubLocationLabel(row: PublicTournamentRow, t: TranslateFn): string {
  const c = row.clubs;
  if (!c) return t('common.clubFallback');
  const one = Array.isArray(c) ? c[0] : c;
  if (!one) return t('common.clubFallback');
  const name = String((one as { name?: string }).name ?? '');
  const city = String((one as { city?: string }).city ?? '');
  if (name && city) return `${name}`;
  return name || city || t('common.clubFallback');
}

/** Dirección legible para detalle (datos del club embebidos). */
export function formatClubFullAddress(row: PublicTournamentRow): string {
  const c = row.clubs;
  if (!c) return '';
  const one = Array.isArray(c) ? c[0] : c;
  if (!one) return '';
  const parts = [
    String((one as { address?: string }).address ?? '').trim(),
    String((one as { postal_code?: string }).postal_code ?? '').trim(),
    String((one as { city?: string }).city ?? '').trim(),
  ].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return String((one as { name?: string }).name ?? '').trim();
}

export function formatGenderLabel(
  gender: PublicTournamentRow['gender'],
  t: TranslateFn,
): string | null {
  if (gender == null || gender === '') return null;
  const g = String(gender).toLowerCase();
  if (g === 'male') return t('torneos.genderMale');
  if (g === 'female') return t('torneos.genderFemale');
  if (g === 'mixed') return t('torneos.genderMixed');
  return gender;
}

/**
 * Inscripción: el API envía importes en céntimos (`price_cents`).
 * No usar `toFixed(0)` sobre euros: importes bajos en céntimos se redondeaban a «0€».
 */
export function formatTournamentInscriptionPrice(
  cents: number | null | undefined,
  currency = 'EUR',
): string {
  const c = Number(cents ?? 0);
  const amount = c / 100;
  if (currency === 'EUR') {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  }
  return `${amount.toFixed(2)} ${currency}`;
}

export function formatTournamentStatus(status: string | undefined, t: TranslateFn): string {
  const s = String(status ?? '');
  const map: Record<string, string> = {
    open: t('torneos.statusOpen'),
    closed: t('torneos.statusClosed'),
    cancelled: t('torneos.statusCancelled'),
  };
  return map[s] ?? s;
}

export function formatIsoDateTime(locale: AppLocale, iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(formatLocale(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return null;
  }
}

/** `duration_min` del torneo (API). */
export function formatDurationMinutes(minutes: number, t: TranslateFn): string {
  if (minutes >= 120) return t('common.durationHours', { hours: Math.round(minutes / 60) });
  return t('common.durationMin', { minutes });
}

export function parsePrizesFromRow(row: PublicTournamentRow): TournamentPrize[] {
  let raw: unknown = row.prizes;
  if (raw == null) return [];
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const out: TournamentPrize[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const label = typeof o.label === 'string' ? o.label : '';
    const cents = typeof o.amount_cents === 'number' ? o.amount_cents : Number(o.amount_cents);
    if (!label || Number.isNaN(cents)) continue;
    out.push({ label, amount_cents: cents });
  }
  return out;
}

function levelBucket(row: PublicTournamentRow): 'principiante' | 'medio' | 'avanzado' | 'none' {
  const max = row.elo_max != null ? Number(row.elo_max) : null;
  const min = row.elo_min != null ? Number(row.elo_min) : null;
  if (max == null && min == null) return 'none';
  const hi = max ?? min ?? 0;
  const lo = min ?? max ?? 0;
  const mid = (hi + lo) / 2;
  if (mid <= 2.5) return 'principiante';
  if (mid >= 4) return 'avanzado';
  return 'medio';
}

export function matchesLevelFilter(row: PublicTournamentRow, filter: TournamentLevelFilter): boolean {
  if (filter === 'all') return true;
  const b = levelBucket(row);
  if (b === 'none') return filter === 'principiante';
  return b === filter;
}

export function matchesFormatFilter(row: PublicTournamentRow, filter: TournamentFormatFilter): boolean {
  if (filter === 'all') return true;
  return inferTournamentFormatKey(row.description) === filter;
}

export function tournamentTitle(row: PublicTournamentRow, t: TranslateFn): string {
  const n = String(row.name ?? '').trim();
  if (n.length > 0) return n;
  const d = (row.description ?? '').trim();
  if (d.length > 0) {
    const first = d.split('\n')[0]?.trim();
    if (first && first.length <= 120) return first;
  }
  return t('torneos.tournamentFallback');
}

export function matchesSearch(row: PublicTournamentRow, q: string, t: TranslateFn): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const title = tournamentTitle(row, t).toLowerCase();
  const loc = clubLocationLabel(row, t).toLowerCase();
  const c = row.clubs;
  const one = c && !Array.isArray(c) ? c : Array.isArray(c) ? c[0] : null;
  const city = one ? String((one as { city?: string }).city ?? '').toLowerCase() : '';
  return title.includes(s) || loc.includes(s) || city.includes(s);
}
