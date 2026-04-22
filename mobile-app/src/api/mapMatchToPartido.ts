import type { MatchEnriched } from './matches';
import { getMatchListPhase } from '../domain/matchLifecycle';
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

/** Nivel 0–7 (OpenSkill). Por encima de 25 se asume ELO legacy (p. ej. 1200 → 1,20). */
function formatSkillNumber(rating: number | null | undefined): string {
  if (rating == null || !Number.isFinite(Number(rating))) return '—';
  const v = Number(rating);
  if (v <= 25) return v.toFixed(1).replace('.', ',');
  return (v / 1000).toFixed(2).replace('.', ',');
}

function playerLevelLine(p: { elo_rating: number; liga?: string | null }): string {
  const core = formatSkillNumber(p.elo_rating);
  const raw = p.liga != null && String(p.liga).trim() !== '' ? String(p.liga).trim() : '';
  const ligaLabel = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : '';
  return ligaLabel ? `${core} · ${ligaLabel}` : core;
}

export function mapMatchToPartido(m: MatchEnriched): PartidoItem | null {
  const b = m.bookings;
  if (!b?.start_at || !b?.end_at || !b?.total_price_cents) return null;

  const court = b.courts;
  const club = court?.clubs;
  const venue = club?.name ?? 'Club';
  const city = club?.city ?? '';
  const address = club?.address ?? '';
  const courtName = court?.name ?? undefined;
  const indoor = court?.indoor ?? false;
  const glassType = court?.glass_type ?? 'normal';
  const courtType = [
    indoor ? 'Indoor' : 'Exterior',
    glassType === 'panoramic' ? 'Cristal' : 'Muro',
    'Dobles',
  ].join(', ');
  const mode: PartidoMode = m.competitive ? 'competitivo' : 'amistoso';
  const typeLabel = m.gender === 'mixed' ? 'Mixto' : 'Todos los jugadores';
  const levelRange =
    m.elo_min != null && m.elo_max != null
      ? `${formatSkillNumber(m.elo_min)} - ${formatSkillNumber(m.elo_max)}`
      : 'Libre';

  const durationMin = durationMinutes(b.start_at, b.end_at);

  const mps = (m.match_players ?? []).slice();
  const hasSlotIndex = mps.some((mp) => mp.slot_index != null);
  if (hasSlotIndex) {
    mps.sort((a, b) => {
      const sa = a.slot_index ?? 99;
      const sb = b.slot_index ?? 99;
      return sa - sb;
    });
  } else {
    mps.sort((a, b) => {
      if (a.team !== b.team) return a.team === 'A' ? -1 : 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  const slots: PartidoPlayer[] = [
    { name: '', level: '', isFree: true },
    { name: '', level: '', isFree: true },
    { name: '', level: '', isFree: true },
    { name: '', level: '', isFree: true },
  ];
  const playerIds: string[] = [];
  const playerIdsBySlot: Array<string | null> = [null, null, null, null];
  mps.forEach((mp, i) => {
    const idx = hasSlotIndex && mp.slot_index != null && mp.slot_index >= 0 && mp.slot_index <= 3
      ? mp.slot_index
      : i;
    if (idx >= 4) return;
    const p = mp.players;
    if (!p) return;
    if (p.id) playerIdsBySlot[idx] = p.id;
    if (p.id) playerIds.push(p.id);
    const fullName = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Jugador';
    const parts = fullName.split(/\s+/).filter(Boolean);
    const initial =
      parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : fullName[0]?.toUpperCase() ?? '?';
    const level = playerLevelLine(p);
    slots[idx] = { name: fullName, initial, level, isFree: false };
  });
  const players = slots;

  const matchPhase = getMatchListPhase(Date.now(), m.status, b.start_at, b.end_at);

  return {
    id: m.id,
    playerIds,
    playerIdsBySlot,
    organizerPlayerId: b.organizer_player_id ?? null,
    visibility: m.visibility === 'private' ? 'private' : 'public',
    matchPhase,
    dateTime: formatDateTime(b.start_at, b.end_at),
    mode,
    typeLabel,
    levelRange,
    players,
    venue,
    location: city ? `${city}` : '—',
    price: formatPrice(b.total_price_cents, b.currency ?? 'EUR'),
    duration: `${durationMin}min`,
    matchType: m.type ?? undefined,
    matchStatus: m.status,
    bookingStatus: b.status,
    venueAddress: address || undefined,
    courtName,
    courtType,
  };
}
