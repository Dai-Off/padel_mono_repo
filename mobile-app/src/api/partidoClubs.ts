import { filterSlotsStartingAfterNow } from '../domain/localSlotAvailability';
import { toDateStringLocal } from '../utils/dateLocal';
import { fetchSearchCourts } from './search';
import type { SearchCourtResult } from './search';

export type SlotForCreate = {
  time: string;
  duration: string;
  courtId: string;
  /** Nombre de pista (SearchCourtResult.courtName) para confirmación post-pago. */
  courtName: string;
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
  if (dateStr === toDateStringLocal(today)) return 'Hoy';
  if (dateStr === toDateStringLocal(tomorrow)) return 'Mañana';
  const day = DAY_LABELS[d.getDay()] ?? 'día';
  const num = d.getDate();
  const month = MONTHS[d.getMonth()];
  return `${day}, ${num} ${month}`;
}

function toSlots(r: SearchCourtResult, dateStr: string, dateLabel: string): SlotForCreate[] {
  const now = new Date();
  const times = filterSlotsStartingAfterNow(dateStr, r.timeSlots ?? [], now);
  return times.map((time) => ({
    time,
    duration: '90min',
    courtId: r.id,
    courtName: r.courtName,
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
        const merged = [...existing.dates[dateIdx].slots, ...slots];
        const byTime = new Map<string, SlotForCreate>();
        for (const s of merged) {
          const prev = byTime.get(s.time);
          if (!prev || s.minPriceCents < prev.minPriceCents) {
            byTime.set(s.time, s);
          }
        }
        existing.dates[dateIdx].slots = Array.from(byTime.values()).sort((a, b) =>
          a.time.localeCompare(b.time)
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

  const now = new Date();
  const today = toDateStringLocal(now);
  const tomorrowD = new Date(now);
  tomorrowD.setDate(tomorrowD.getDate() + 1);
  const tomorrow = toDateStringLocal(tomorrowD);
  const tomorrowLabel = formatDateLabel(tomorrow);

  todayResults.forEach((r) => processResult(r, today, 'Hoy'));
  tomorrowResults.forEach((r) => processResult(r, tomorrow, tomorrowLabel));

  return Array.from(byClub.values()).sort((a, b) => a.clubName.localeCompare(b.clubName));
}

export async function fetchClubAvailabilityForCreate(): Promise<ClubDisplay[]> {
  const now = new Date();
  const today = toDateStringLocal(now);
  const tomorrowD = new Date(now);
  tomorrowD.setDate(tomorrowD.getDate() + 1);
  const tomorrow = toDateStringLocal(tomorrowD);

  const [todayResults, tomorrowResults] = await Promise.all([
    fetchSearchCourts({ dateFrom: today }),
    fetchSearchCourts({ dateFrom: tomorrow }),
  ]);

  return mergeByClub(todayResults, tomorrowResults);
}
