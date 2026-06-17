import { clubLocalMinutesFromIso, clubLocalDateTimeToUtcIso, dayKeyInClubTz } from '../lib/clubTimeZone';
import { formatLocale, type AppLocale } from '../i18n/constants';
import { dateKeyLocal, startOfLocalDay, TIME_RANGE_PRESETS } from '../utils/formatSearch';
import type { PartidoItem } from '../screens/PartidosScreen';

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export type PartidosSportFilter = 'padel' | 'tenis' | 'pickleball' | 'all';

export type PartidosSortBy = 'relevance' | 'recent' | 'players' | 'distance';

export type PartidosMatchTypeFilter = 'all' | 'competitive' | 'friendly';

export type PartidosGenderFilter = 'all' | 'male' | 'female' | 'mixed';

export type PartidosCerramientoFilter = 'all' | 'indoor' | 'outdoor' | 'cubierta';

export type PartidosParedesFilter = 'all' | 'muro' | 'cristal' | 'panoramico';

export type PartidosSizeFilter = 'all' | 'individual' | 'doubles';

export const PARTIDOS_MAX_SELECTED_DAYS = 7;

export const PARTIDOS_DISTANCE_STEPS_KM = [1, 2, 3, 5, 6, 8, 10] as const;

export type PartidosFiltersState = {
  sport: PartidosSportFilter;
  selectedClubIds: string[];
  useFavoriteClubsOnly: boolean;
  useDistanceFilter: boolean;
  maxDistanceKm: number;
  /** Vacío = todos los próximos (sin filtro de día). */
  selectedDateKeys: string[];
  timeRange: { start: string; end: string } | null;
  sortBy: PartidosSortBy;
  matchType: PartidosMatchTypeFilter;
  gender: PartidosGenderFilter;
  cerramiento: PartidosCerramientoFilter;
  paredes: PartidosParedesFilter;
  size: PartidosSizeFilter;
};

export function getInitialPartidosFilters(): PartidosFiltersState {
  return {
    sport: 'padel',
    selectedClubIds: [],
    useFavoriteClubsOnly: false,
    useDistanceFilter: false,
    maxDistanceKm: 10,
    selectedDateKeys: [],
    timeRange: null,
    sortBy: 'relevance',
    matchType: 'all',
    gender: 'all',
    cerramiento: 'all',
    paredes: 'all',
    size: 'all',
  };
}

function slotToMinutes(slot: string): number {
  const [h, m = '0'] = slot.split(':');
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
}

function partidoStartMinutes(p: PartidoItem): number | null {
  const iso = p.startAt ?? p.startAtIso;
  if (!iso) return null;
  return clubLocalMinutesFromIso(iso);
}

function passesTimeRange(p: PartidoItem, range: { start: string; end: string } | null): boolean {
  if (!range) return true;
  const m = partidoStartMinutes(p);
  if (m == null) return true;
  return m >= slotToMinutes(range.start) && m < slotToMinutes(range.end);
}

function passesSport(p: PartidoItem, sport: PartidosSportFilter): boolean {
  if (sport === 'all') return true;
  return (p.courtSport ?? 'padel').toLowerCase() === sport;
}

function passesGender(p: PartidoItem, gender: PartidosGenderFilter): boolean {
  if (gender === 'all') return true;
  const g = p.matchGender ?? 'all';
  if (g === 'all') return true;
  if (gender === 'mixed') return g === 'mixed';
  if (gender === 'male') return g === 'male';
  if (gender === 'female') return g === 'female';
  return true;
}

function passesCerramiento(p: PartidoItem, cerramiento: PartidosCerramientoFilter): boolean {
  if (cerramiento === 'all') return true;
  const ct = (p.courtType ?? '').toLowerCase();
  if (cerramiento === 'indoor') return ct.includes('indoor');
  if (cerramiento === 'outdoor') return ct.includes('exterior');
  if (cerramiento === 'cubierta') return ct.includes('cubierta');
  return true;
}

function passesParedes(p: PartidoItem, paredes: PartidosParedesFilter): boolean {
  if (paredes === 'all') return true;
  const ct = (p.courtType ?? '').toLowerCase();
  if (paredes === 'muro') return ct.includes('muro');
  if (paredes === 'cristal') return ct.includes('cristal');
  if (paredes === 'panoramico') return ct.includes('panorámico') || ct.includes('panoramico');
  return true;
}

function passesSize(p: PartidoItem, size: PartidosSizeFilter): boolean {
  if (size === 'all') return true;
  const ct = (p.courtType ?? '').toLowerCase();
  if (size === 'doubles') return ct.includes('dobles');
  if (size === 'individual') return ct.includes('individual');
  return true;
}

export type PartidosFilterContext = {
  clubDistanceById: Map<string, number>;
  favoriteClubIds: string[];
};

export function filterPartidosList(
  items: PartidoItem[],
  filters: PartidosFiltersState,
  ctx: PartidosFilterContext,
): PartidoItem[] {
  let out = items.filter((p) => {
    if (!passesSport(p, filters.sport)) return false;
    if (filters.matchType === 'competitive' && p.mode !== 'competitivo') return false;
    if (filters.matchType === 'friendly' && p.mode !== 'amistoso') return false;
    if (!passesGender(p, filters.gender)) return false;
    if (!passesCerramiento(p, filters.cerramiento)) return false;
    if (!passesParedes(p, filters.paredes)) return false;
    if (!passesSize(p, filters.size)) return false;
    if (!passesTimeRange(p, filters.timeRange)) return false;

    if (filters.selectedDateKeys.length > 0) {
      const iso = p.startAt ?? p.startAtIso;
      if (!iso) return false;
      const key = dayKeyInClubTz(new Date(iso));
      if (!filters.selectedDateKeys.includes(key)) return false;
    }

    const clubId = p.clubId;
    if (filters.selectedClubIds.length > 0) {
      if (!clubId || !filters.selectedClubIds.includes(clubId)) return false;
    } else if (filters.useFavoriteClubsOnly && ctx.favoriteClubIds.length > 0) {
      if (!clubId || !ctx.favoriteClubIds.includes(clubId)) return false;
    }

    if (
      filters.useDistanceFilter &&
      filters.selectedClubIds.length === 0 &&
      clubId
    ) {
      const d = ctx.clubDistanceById.get(clubId);
      if (d != null && d > filters.maxDistanceKm) return false;
    }

    return true;
  });

  out = [...out].sort((a, b) => comparePartidos(a, b, filters.sortBy, ctx));
  return out;
}

function partidoStartMs(p: PartidoItem): number {
  const iso = p.startAt ?? p.startAtIso;
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function comparePartidos(
  a: PartidoItem,
  b: PartidoItem,
  sortBy: PartidosSortBy,
  ctx: PartidosFilterContext,
): number {
  if (sortBy === 'recent') {
    return partidoStartMs(a) - partidoStartMs(b);
  }
  if (sortBy === 'players') {
    const fa = (a.players ?? []).filter((x) => !x.isFree).length;
    const fb = (b.players ?? []).filter((x) => !x.isFree).length;
    return fb - fa;
  }
  if (sortBy === 'distance') {
    const da = a.clubId ? ctx.clubDistanceById.get(a.clubId) ?? Infinity : Infinity;
    const db = b.clubId ? ctx.clubDistanceById.get(b.clubId) ?? Infinity : Infinity;
    if (da !== db) return da - db;
  }
  const ta = partidoStartMs(a);
  const tb = partidoStartMs(b);
  return ta - tb;
}

export function countPartidosAdvancedFilters(filters: PartidosFiltersState): number {
  let n = 0;
  if (filters.sortBy !== 'relevance') n += 1;
  if (filters.matchType !== 'all') n += 1;
  if (filters.gender !== 'all') n += 1;
  if (filters.cerramiento !== 'all') n += 1;
  if (filters.paredes !== 'all') n += 1;
  if (filters.size !== 'all') n += 1;
  return n;
}

const TIME_PRESET_LABEL_KEYS: Record<string, string> = {
  allday: 'search.timePresetAllDay',
  morning: 'search.timePresetMorning',
  afternoon: 'search.timePresetAfternoon',
  evening: 'search.timePresetEvening',
};

export function sportChipLabel(sport: PartidosSportFilter, t: TranslateFn): string {
  if (sport === 'padel') return t('common.sportPadel');
  if (sport === 'tenis') return t('common.sportTenis');
  if (sport === 'pickleball') return t('common.sportPickleball');
  return t('partidos.filterSportDefault');
}

export function clubsChipLabel(selectedCount: number, totalCatalog: number, t: TranslateFn): string {
  if (selectedCount > 0) {
    return selectedCount === 1 ? t('common.oneClub') : t('common.clubsCountLabel', { count: selectedCount });
  }
  if (totalCatalog > 0) return t('common.clubsCountLabel', { count: totalCatalog });
  return t('partidos.filterClubsDefault');
}

export function whenChipLabel(
  selectedDateKeys: string[],
  timeRange: { start: string; end: string } | null,
  t: TranslateFn,
  locale: AppLocale,
): string {
  if (timeRange) {
    const preset = TIME_RANGE_PRESETS.find(
      (p) =>
        p.range != null &&
        p.range.start === timeRange.start &&
        p.range.end === timeRange.end,
    );
    if (preset) {
      const key = TIME_PRESET_LABEL_KEYS[preset.id];
      if (key) return t(key);
    }
  }
  if (selectedDateKeys.length === 0) return t('partidos.filterWhenDefault');
  if (selectedDateKeys.length > 1) return t('partidos.filterWhenDays', { count: selectedDateKeys.length });
  const d = new Date(selectedDateKeys[0] + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return t('partidos.filterWhenDefault');
  const weekday = d.toLocaleDateString(formatLocale(locale), { weekday: 'short' });
  const month = d.toLocaleDateString(formatLocale(locale), { month: 'short' });
  return t('partidos.filterWhenDate', { weekday, day: d.getDate(), month });
}

/** Ventana por defecto al buscar partidos abiertos (evita descargar todo el histórico). */
export const PARTIDOS_DISCOVERY_DEFAULT_DAYS = 14;

export function defaultPartidosDiscoveryDateRange(): { dateFrom: string; dateTo: string } {
  const today = dayKeyInClubTz(new Date());
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + PARTIDOS_DISCOVERY_DEFAULT_DAYS);
  const endKey = dayKeyInClubTz(end);
  return {
    dateFrom: clubLocalDateTimeToUtcIso(today, '00:00'),
    dateTo: clubLocalDateTimeToUtcIso(endKey, '23:59'),
  };
}

/** Rango API según días seleccionados; sin días = próximos 14 días. */
export function partidosFetchDateRange(filters: PartidosFiltersState): {
  activeOnly: boolean;
  dateFrom?: string;
  dateTo?: string;
} {
  if (filters.selectedDateKeys.length === 0) {
    const { dateFrom, dateTo } = defaultPartidosDiscoveryDateRange();
    return { activeOnly: true, dateFrom, dateTo };
  }
  const sorted = [...filters.selectedDateKeys].sort();
  const minKey = sorted[0]!;
  const maxKey = sorted[sorted.length - 1]!;
  return {
    activeOnly: true,
    dateFrom: clubLocalDateTimeToUtcIso(minKey, '00:00'),
    dateTo: clubLocalDateTimeToUtcIso(maxKey, '23:59'),
  };
}

export function toggleDateKey(
  current: string[],
  key: string,
  max = PARTIDOS_MAX_SELECTED_DAYS,
): string[] {
  if (current.includes(key)) return current.filter((k) => k !== key);
  if (current.length >= max) return current;
  return [...current, key].sort();
}

export function nearestDistanceStep(km: number): number {
  let best: number = PARTIDOS_DISTANCE_STEPS_KM[0];
  for (const step of PARTIDOS_DISTANCE_STEPS_KM) {
    if (Math.abs(step - km) < Math.abs(best - km)) best = step;
  }
  return best;
}

export function todayKey(): string {
  return dayKeyInClubTz(new Date());
}
