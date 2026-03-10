import { fetchSearchCourts } from './search';
import type { SearchCourtResult } from './search';

export type SlotForCreate = {
  time: string;
  duration: string;
  courtId: string;
  dateStr: string;
  dateLabel: string;
  minPriceCents: number;
  minPriceFormatted: string;
};

export type ClubDisplay = {
  clubId: string;
  clubName: string;
  location: string;
  imageUrl: string | null;
  dates: {
    dateStr: string;
    label: string;
    slots: SlotForCreate[];
  }[];
};

const DAY_LABELS: Record<number, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
};

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === today.toISOString().slice(0, 10)) return 'Hoy';
  if (dateStr === tomorrow.toISOString().slice(0, 10)) return 'Mañana';
  const day = DAY_LABELS[d.getDay()] ?? 'día';
  const num = d.getDate();
  const month = MONTHS[d.getMonth()];
  return `${day}, ${num} ${month}`;
}

function toSlots(r: SearchCourtResult, dateStr: string, dateLabel: string): SlotForCreate[] {
  return (r.timeSlots ?? []).map((time) => ({
    time,
    duration: '90min',
    courtId: r.id,
    dateStr,
    dateLabel,
    minPriceCents: r.minPriceCents || 0,
    minPriceFormatted: r.minPriceFormatted || '-',
  }));
}

function mergeByClub(todayResults: SearchCourtResult[], tomorrowResults: SearchCourtResult[]): ClubDisplay[] {
  const byClub = new Map<string, ClubDisplay>();
  const processResult = (r: SearchCourtResult, dateStr: string, dateLabel: string) => {
    const key = r.clubId;
    const slots = toSlots(r, dateStr, dateLabel);
    const location = r.distanceKm != null ? `${r.distanceKm}km · ${r.city}` : r.city;
    const existing = byClub.get(key);
    if (existing) {
      const dateIdx = existing.dates.findIndex((d) => d.dateStr === dateStr);
      if (dateIdx >= 0) {
        existing.dates[dateIdx].slots = [...existing.dates[dateIdx].slots, ...slots].sort(
          (a, b) => a.time.localeCompare(b.time)
        );
      } else {
        existing.dates.push({ dateStr, label: dateLabel, slots });
      }
    } else {
      byClub.set(key, {
        clubId: r.clubId,
        clubName: r.clubName,
        location,
        imageUrl: r.imageUrl || null,
        dates: [{ dateStr, label: dateLabel, slots }],
      });
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const tomorrowLabel = formatDateLabel(tomorrow);

  todayResults.forEach((r) => processResult(r, today, 'Hoy'));
  tomorrowResults.forEach((r) => processResult(r, tomorrow, tomorrowLabel));

  return Array.from(byClub.values()).sort((a, b) => a.clubName.localeCompare(b.clubName));
}

export async function fetchClubAvailabilityForCreate(): Promise<ClubDisplay[]> {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [todayResults, tomorrowResults] = await Promise.all([
    fetchSearchCourts({ dateFrom: today }),
    fetchSearchCourts({ dateFrom: tomorrow }),
  ]);

  return mergeByClub(todayResults, tomorrowResults);
}
