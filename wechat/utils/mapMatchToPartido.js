const { getMatchListPhase } = require('./matchLifecycle');

function formatDateTime(startAt, endAt) {
  const start = new Date(startAt);
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
    'octubre', 'noviembre', 'diciembre',
  ];
  const day = days[start.getDay()];
  const date = start.getDate();
  const month = months[start.getMonth()];
  const time = start.toTimeString().slice(0, 5);
  return `${day}, ${date} de ${month} · ${time}`;
}

function formatPrice(cents, currency) {
  const amount = (cents / 100).toFixed(2).replace('.', ',');
  return currency === 'EUR' ? `${amount}€` : `${amount} ${currency}`;
}

function durationMinutes(startAt, endAt) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  return Math.round((end - start) / 60000);
}

function mapMatchToPartido(m) {
  const raw = m.bookings;
  const b = Array.isArray(raw) ? raw[0] : raw;
  if (!b || !b.start_at || !b.end_at || b.total_price_cents == null) return null;

  const court = b.courts;
  const club = court && court.clubs;
  const venue = (club && club.name) || 'Club';
  const city = (club && club.city) || '';
  const address = (club && club.address) || '';
  const courtName = court && court.name;
  const indoor = court && court.indoor;
  const glassType = (court && court.glass_type) || 'normal';
  const courtType = [
    indoor ? 'Indoor' : 'Exterior',
    glassType === 'panoramic' ? 'Cristal' : 'Muro',
    'Dobles',
  ].join(', ');
  const mode = m.competitive ? 'competitivo' : 'amistoso';
  const typeLabel = m.gender === 'mixed' ? 'Mixto' : 'Todos los jugadores';
  const fmtElo = (v) => (v / 1000).toFixed(2).replace('.', ',');
  const levelRange =
    m.elo_min != null && m.elo_max != null
      ? `${fmtElo(m.elo_min)} - ${fmtElo(m.elo_max)}`
      : '0,25 - 1,25';

  const durationMin = durationMinutes(b.start_at, b.end_at);

  const mps = (m.match_players || []).slice();
  const hasSlotIndex = mps.some((mp) => mp.slot_index != null);
  if (hasSlotIndex) {
    mps.sort((a, b) => (a.slot_index ?? 99) - (b.slot_index ?? 99));
  } else {
    mps.sort((a, b) => {
      if (a.team !== b.team) return a.team === 'A' ? -1 : 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  const slots = [
    { name: '', level: '', isFree: true },
    { name: '', level: '', isFree: true },
    { name: '', level: '', isFree: true },
    { name: '', level: '', isFree: true },
  ];
  const playerIds = [];
  mps.forEach((mp, i) => {
    const idx =
      hasSlotIndex && mp.slot_index != null && mp.slot_index >= 0 && mp.slot_index <= 3
        ? mp.slot_index
        : i;
    if (idx >= 4) return;
    const p = mp.players;
    if (!p) return;
    if (p.id) playerIds.push(p.id);
    const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Jugador';
    const parts = fullName.split(/\s+/).filter(Boolean);
    const initial =
      parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : (fullName[0] && fullName[0].toUpperCase()) || '?';
    const level = (p.elo_rating / 1000).toFixed(2).replace('.', ',');
    slots[idx] = { name: fullName, initial, level, isFree: false };
  });

  const matchPhase = getMatchListPhase(Date.now(), m.status, b.start_at, b.end_at);

  const clubId = (club && club.id) || (court && court.club_id) || '';

  return {
    id: m.id,
    clubId,
    playerIds,
    visibility: m.visibility === 'private' ? 'private' : 'public',
    matchPhase,
    dateTime: formatDateTime(b.start_at, b.end_at),
    mode,
    typeLabel,
    levelRange,
    /** Misma regla que RN PartidoOpenCard: puntos → comas en el badge. */
    levelRangeDisplay: String(levelRange).replace(/\./g, ','),
    players: slots,
    venue,
    location: city || '—',
    price: formatPrice(b.total_price_cents, b.currency || 'EUR'),
    duration: `${durationMin}min`,
    venueAddress: address || undefined,
    courtName,
    courtType,
  };
}

module.exports = { mapMatchToPartido };
