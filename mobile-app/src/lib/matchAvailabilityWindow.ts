const MADRID_TZ = 'Europe/Madrid';

function madridYmd(base: Date, dayOffset: number): { y: number; m: number; d: number } {
  const shifted = new Date(base.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted);
  return {
    y: Number(parts.find((p) => p.type === 'year')!.value),
    m: Number(parts.find((p) => p.type === 'month')!.value),
    d: Number(parts.find((p) => p.type === 'day')!.value),
  };
}

/** Convierte Y-M-D + hora en Europe/Madrid a ISO UTC (misma zona que el seed demo del backend). */
function madridHourToIso(y: number, m: number, d: number, hour: number): string {
  const probe = new Date(Date.UTC(y, m - 1, d, hour, 0, 0));
  const madridHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: MADRID_TZ,
      hour: 'numeric',
      hour12: false,
    }).format(probe),
  );
  const deltaH = hour - madridHour;
  return new Date(probe.getTime() + deltaH * 60 * 60 * 1000).toISOString();
}

export type MatchSearchTimeSlot = 'manana' | 'tarde' | 'noche';
export type MatchSearchDay = 'hoy' | 'manana' | 'esta-semana' | 'fin-semana';

export function computeMatchAvailabilityWindow(input: {
  day: MatchSearchDay;
  time: MatchSearchTimeSlot;
}): { availableFrom: string; availableUntil: string } {
  const now = new Date();
  let dayOffset = 0;
  if (input.day === 'manana') dayOffset = 1;
  else if (input.day === 'esta-semana') dayOffset = 2;
  else if (input.day === 'fin-semana') {
    const wdStr = new Intl.DateTimeFormat('en-US', { timeZone: MADRID_TZ, weekday: 'short' }).format(now);
    const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const day = wdMap[wdStr] ?? 0;
    const daysUntilSaturday = (6 - day + 7) % 7 || 7;
    dayOffset = daysUntilSaturday;
  }

  let startHour = 15;
  let endHour = 18;
  if (input.time === 'manana') {
    startHour = 9;
    endHour = 12;
  } else if (input.time === 'tarde') {
    startHour = 15;
    endHour = 18;
  } else if (input.time === 'noche') {
    startHour = 19;
    endHour = 22;
  }

  const { y, m, d } = madridYmd(now, dayOffset);
  const availableFrom = madridHourToIso(y, m, d, startHour);
  let availableUntil = madridHourToIso(y, m, d, endHour);
  if (new Date(availableUntil).getTime() <= new Date(availableFrom).getTime()) {
    availableUntil = new Date(new Date(availableFrom).getTime() + 90 * 60 * 1000).toISOString();
  }
  return { availableFrom, availableUntil };
}
