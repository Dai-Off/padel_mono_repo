const { fetchSearchCourts } = require('./search');

const DAY_LABELS = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
};

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const t0 = today.toISOString().slice(0, 10);
  const t1 = tomorrow.toISOString().slice(0, 10);
  if (dateStr === t0) return 'Hoy';
  if (dateStr === t1) return 'Mañana';
  const day = DAY_LABELS[d.getDay()] ?? 'día';
  const num = d.getDate();
  const month = MONTHS[d.getMonth()];
  return `${day}, ${num} ${month}`;
}

function toSlots(r, dateStr, dateLabel) {
  const slots = r.timeSlots || [];
  return slots.map((time) => ({
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

function mergeByClub(todayResults, tomorrowResults) {
  const byClub = new Map();

  function processResult(r, dateStr, dateLabel) {
    const key = r.clubId;
    const slots = toSlots(r, dateStr, dateLabel);
    const location =
      r.distanceKm != null ? `${r.distanceKm}km · ${r.city}` : r.city;
    const existing = byClub.get(key);
    if (existing) {
      const dateIdx = existing.dates.findIndex((x) => x.dateStr === dateStr);
      if (dateIdx >= 0) {
        const merged = existing.dates[dateIdx].slots.concat(slots);
        const byTime = new Map();
        merged.forEach((s) => {
          const prev = byTime.get(s.time);
          if (!prev || s.minPriceCents < prev.minPriceCents) {
            byTime.set(s.time, s);
          }
        });
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
  }

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const tomorrowLabel = formatDateLabel(tomorrow);

  (todayResults || []).forEach((r) => processResult(r, today, 'Hoy'));
  (tomorrowResults || []).forEach((r) => processResult(r, tomorrow, tomorrowLabel));

  return Array.from(byClub.values()).sort((a, b) => a.clubName.localeCompare(b.clubName));
}

function fetchClubAvailabilityForCreate() {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return Promise.all([
    fetchSearchCourts({ dateFrom: today }),
    fetchSearchCourts({ dateFrom: tomorrow }),
  ]).then(([a, b]) => mergeByClub(a, b));
}

module.exports = { fetchClubAvailabilityForCreate, formatDateLabel };
