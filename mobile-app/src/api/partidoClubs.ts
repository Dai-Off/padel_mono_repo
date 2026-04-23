import { filterSlotsStartingAfterNow } from '../domain/localSlotAvailability';
import { toDateStringLocal } from '../utils/dateLocal';
import { fetchSearchCourts } from './search';
import { fetchAvailableSlots } from './availability';
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

export async function fetchClubAvailabilityForCreate(
  token: string | null | undefined
): Promise<ClubDisplay[]> {
  const now = new Date();
  const today = toDateStringLocal(now);
  const tomorrowD = new Date(now);
  tomorrowD.setDate(tomorrowD.getDate() + 1);
  const tomorrow = toDateStringLocal(tomorrowD);

  // Obtenemos precios (sin token necesario)
  const [todayPrices, tomorrowPrices] = await Promise.all([
    fetchSearchCourts({ dateFrom: today, dateTo: today }),
    fetchSearchCourts({ dateFrom: tomorrow, dateTo: tomorrow }),
  ]);

  // Obtenemos disponibilidad real (requiere token)
  // Nota: Para simplificar, traemos disponibilidad de TODOS los clubes para esos dos días.
  // El endpoint /availability/slots actual requiere club_id. 
  // Podríamos iterar sobre los clubes encontrados en search o modificar el endpoint.
  // Dado que search nos da los clubes operativos, iteramos.
  
  const clubIds = [...new Set([
    ...todayPrices.map(r => r.clubId),
    ...tomorrowPrices.map(r => r.clubId)
  ])];

  // Agrupamos resultados de búsqueda por club/fecha para los metadatos (nombre, imagen, etc)
  const clubMetadata = new Map<string, { name: string; city: string; imageUrl: string | null; distanceKm: number | null }>();
  [...todayPrices, ...tomorrowPrices].forEach(r => {
    if (!clubMetadata.has(r.clubId)) {
      clubMetadata.set(r.clubId, {
        name: r.clubName,
        city: r.city,
        imageUrl: r.imageUrl,
        distanceKm: r.distanceKm
      });
    }
  });

  // Obtenemos disponibilidad real (requiere token) en BATCH para mejorar performance
  const [day1Res, day2Res] = await Promise.all([
    fetchAvailableSlots({ clubIds, date: today, token, durationMinutes: 90 }),
    fetchAvailableSlots({ clubIds, date: tomorrow, token, durationMinutes: 90 })
  ]);

  const finalResults: ClubDisplay[] = [];

  for (const clubId of clubIds) {
    const meta = clubMetadata.get(clubId)!;
    const location = meta.distanceKm != null ? `${meta.distanceKm}km · ${meta.city}` : meta.city;
    
    const dates = [];

    // Hoy
    if (day1Res.ok) {
      const slots: SlotForCreate[] = [];
      const clubCourts = day1Res.results.filter(r => (r as any).club_id === clubId);
      for (const courtRes of clubCourts) {
        const filteredTimes = filterSlotsStartingAfterNow(today, courtRes.free_slots.map(s => s.start), now);
        for (const time of filteredTimes) {
          const p = todayPrices.find(r => r.id === courtRes.court_id);
          slots.push({
            time,
            duration: '90min',
            courtId: courtRes.court_id,
            courtName: courtRes.court_name,
            dateStr: today,
            dateLabel: 'Hoy',
            minPriceCents: p?.minPriceCents ?? 0,
            minPriceFormatted: p?.minPriceFormatted ?? '-'
          });
        }
      }
      if (slots.length > 0) {
        const byTime = new Map<string, SlotForCreate>();
        slots.forEach(s => {
          const prev = byTime.get(s.time);
          if (!prev || s.minPriceCents < prev.minPriceCents) byTime.set(s.time, s);
        });
        dates.push({
          dateStr: today,
          label: 'Hoy',
          slots: Array.from(byTime.values()).sort((a, b) => a.time.localeCompare(b.time))
        });
      }
    }

    // Mañana
    if (day2Res.ok) {
      const slots: SlotForCreate[] = [];
      const tomorrowLabel = formatDateLabel(tomorrow);
      const clubCourts = day2Res.results.filter(r => (r as any).club_id === clubId);
      for (const courtRes of clubCourts) {
        const filteredTimes = filterSlotsStartingAfterNow(tomorrow, courtRes.free_slots.map(s => s.start), now);
        for (const time of filteredTimes) {
          const p = tomorrowPrices.find(r => r.id === courtRes.court_id);
          slots.push({
            time,
            duration: '90min',
            courtId: courtRes.court_id,
            courtName: courtRes.court_name,
            dateStr: tomorrow,
            dateLabel: tomorrowLabel,
            minPriceCents: p?.minPriceCents ?? 0,
            minPriceFormatted: p?.minPriceFormatted ?? '-'
          });
        }
      }
      if (slots.length > 0) {
        const byTime = new Map<string, SlotForCreate>();
        slots.forEach(s => {
          const prev = byTime.get(s.time);
          if (!prev || s.minPriceCents < prev.minPriceCents) byTime.set(s.time, s);
        });
        dates.push({
          dateStr: tomorrow,
          label: tomorrowLabel,
          slots: Array.from(byTime.values()).sort((a, b) => a.time.localeCompare(b.time))
        });
      }
    }

    if (dates.length > 0) {
      finalResults.push({
        clubId,
        clubName: meta.name,
        location,
        imageUrl: meta.imageUrl,
        dates
      });
    }
  }

  return finalResults.sort((a, b) => a.clubName.localeCompare(b.clubName));
}
