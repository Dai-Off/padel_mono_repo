import type { MatchEnriched } from './matches';
import type { PartidoItem, PartidoMode, PartidoPlayer } from '../screens/PartidosScreen';

function formatDateTime(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const day = days[start.getDay()];
  const date = start.getDate();
  const month = months[start.getMonth()];
  const time = start.toTimeString().slice(0, 5);
  return `${day}, ${date} de ${month} · ${time}`;
}

function formatPrice(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2).replace('.', ',');
  return currency === 'EUR' ? `${amount}€` : `${amount} ${currency}`;
}

function durationMinutes(startAt: string, endAt: string): number {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  return Math.round((end - start) / 60000);
}

export function mapMatchToPartido(m: MatchEnriched): PartidoItem | null {
  const b = m.bookings;
  if (!b?.start_at || !b?.end_at || !b?.total_price_cents) return null;

  const club = b.courts?.clubs;
  const venue = club?.name ?? 'Club';
  const city = club?.city ?? '';
  const address = club?.address ?? '';
  const mode: PartidoMode = m.competitive ? 'competitivo' : 'automático';
  const typeLabel = m.gender === 'mixed' ? 'Mixto' : 'Todos los jugadores';
  const levelRange = m.elo_min != null && m.elo_max != null
    ? `${(m.elo_min / 1000).toFixed(2)} - ${(m.elo_max / 1000).toFixed(2)}`
    : '0,25 - 1,25';

  const durationMin = durationMinutes(b.start_at, b.end_at);

  const mps = (m.match_players ?? []).slice();
  mps.sort((a, b) => {
    if (a.team !== b.team) return a.team === 'A' ? -1 : 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const slots: PartidoPlayer[] = [
    { name: '', level: '', isFree: true },
    { name: '', level: '', isFree: true },
    { name: '', level: '', isFree: true },
    { name: '', level: '', isFree: true },
  ];
  const playerIds: string[] = [];
  mps.forEach((mp, i) => {
    if (i >= 4) return;
    const p = mp.players;
    if (!p) return;
    if (p.id) playerIds.push(p.id);
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Jugador';
    const level = (p.elo_rating / 1000).toFixed(2).replace('.', ',');
    slots[i] = { name, level, isFree: false };
  });
  const players = slots;

  return {
    id: m.id,
    playerIds,
    dateTime: formatDateTime(b.start_at, b.end_at),
    mode,
    typeLabel,
    levelRange,
    players,
    venue,
    location: city ? `${city}` : '—',
    price: formatPrice(b.total_price_cents, b.currency ?? 'EUR'),
    duration: `${durationMin}min`,
    venueAddress: address || undefined,
  };
}
