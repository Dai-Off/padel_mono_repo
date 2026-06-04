import type { MatchEnriched } from './matches';
import { normalizePlayerAvatarUrl } from '../api/playerAvatar';
import { getMatchBooking, getMatchListPhase } from '../domain/matchLifecycle';
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

/** Formato de ELO alineado con Perfil (misma escala numérica). */
function formatSkillNumber(rating: number | null | undefined): string {
  if (rating == null || !Number.isFinite(Number(rating))) return '—';
  const v = Number(rating);
  // Mantener misma escala que en Perfil para evitar desalineaciones visuales.
  return v.toFixed(2).replace('.', ',');
}

function playerLevelLine(p: { elo_rating: number }): string {
  return formatSkillNumber(p.elo_rating);
}

export function mapMatchToPartido(m: MatchEnriched): PartidoItem | null {
  const b = getMatchBooking(m);
  // Partidos sin booking siguen siendo válidos para el historial (datos mínimos).
  if (!b) {
    const matchPhase = getMatchListPhase(Date.now(), m.status);
    const slots: PartidoPlayer[] = Array.from({ length: 4 }, () => ({ name: '', level: '', isFree: true }));
    const playerIds: string[] = [];
    const playerIdsBySlot: Array<string | null> = [null, null, null, null];
    (m.match_players ?? []).forEach((mp, i) => {
      const p = mp.players;
      if (!p || i >= 4) return;
      if (p.id) { playerIds.push(p.id); playerIdsBySlot[i] = p.id; }
      const fullName = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Jugador';
      const parts = fullName.split(/\s+/).filter(Boolean);
      const initial = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : fullName[0]?.toUpperCase() ?? '?';
      slots[i] = { id: p.id, name: fullName, initial, level: playerLevelLine(p), isFree: false };
    });
    return {
      id: m.id,
      playerIds,
      playerIdsBySlot,
      organizerPlayerId: null,
      visibility: m.visibility === 'private' ? 'private' : 'public',
      matchPhase,
      dateTime: '—',
      mode: m.competitive ? 'competitivo' : 'amistoso',
      typeLabel: m.gender === 'mixed' ? 'Mixto' : 'Todos los jugadores',
      levelRange: m.elo_min != null && m.elo_max != null ? `${formatSkillNumber(m.elo_min)} - ${formatSkillNumber(m.elo_max)}` : 'Libre',
      players: slots,
      venue: 'Club',
      location: '—',
      price: '—',
      pricePerPlayer: '—',
      duration: '—',
      matchType: m.type ?? undefined,
      matchStatus: m.status,
      scoreStatus: null,
      bookingStatus: undefined,
      hasMyFeedback: (m as MatchEnriched & { has_my_feedback?: boolean }).has_my_feedback === true,
      eloMin: m.elo_min ?? null,
      eloMax: m.elo_max ?? null,
    };
  }
  if (!b.start_at || !b.end_at) return null;
  const totalPriceCents = b.total_price_cents ?? 0;

  const court = b.courts;
  const club = court?.clubs;
  const venue = club?.name ?? 'Club';
  const city = club?.city ?? '';
  const address = club?.address ?? '';
  const courtName = court?.name ?? undefined;
  const courtSport = (court?.sport && String(court.sport).trim() !== '' ? String(court.sport) : 'padel').toLowerCase();
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
  const usedSlots = new Set<number>();

  function resolveSlotIndex(preferredIdx: number): number {
    if (preferredIdx >= 0 && preferredIdx <= 3 && !usedSlots.has(preferredIdx)) {
      return preferredIdx;
    }
    for (let i = 0; i < 4; i++) {
      if (!usedSlots.has(i)) return i;
    }
    return -1;
  }

  mps.forEach((mp, i) => {
    const preferredIdx = hasSlotIndex && mp.slot_index != null && mp.slot_index >= 0 && mp.slot_index <= 3
      ? mp.slot_index
      : i;
    const idx = resolveSlotIndex(preferredIdx);
    if (idx >= 4) return;
    const p = mp.players;
    if (!p) return;
    usedSlots.add(idx);
    if (p.id) playerIdsBySlot[idx] = p.id;
    if (p.id) playerIds.push(p.id);
    const fullName = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Jugador';
    const parts = fullName.split(/\s+/).filter(Boolean);
    const initial =
      parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : fullName[0]?.toUpperCase() ?? '?';
    const level = playerLevelLine(p);
    const avatar = normalizePlayerAvatarUrl(p.avatar_url) ?? undefined;
    slots[idx] = { id: p.id, name: fullName, initial, level, avatar, isFree: false };
  });
  const players = slots;

  const matchPhase = getMatchListPhase(Date.now(), m.status, b.start_at, b.end_at);

  const rawGender = (m.gender ?? 'any').toLowerCase();
  const matchGender: PartidoItem['matchGender'] =
    rawGender === 'male' || rawGender === 'men'
      ? 'male'
      : rawGender === 'female' || rawGender === 'women'
        ? 'female'
        : rawGender === 'mixed'
          ? 'mixed'
          : 'all';

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
    price: formatPrice(totalPriceCents, b.currency ?? 'EUR'),
    pricePerPlayer: formatPrice(Math.ceil(totalPriceCents / 4), b.currency ?? 'EUR'),
    duration: `${durationMin}min`,
    matchType: m.type ?? undefined,
    matchStatus: m.status,
    scoreStatus: (m.score_status === 'pending' ? null : m.score_status) as PartidoItem['scoreStatus'],
    bookingStatus: b.status,
    hasMyFeedback: (m as MatchEnriched & { has_my_feedback?: boolean }).has_my_feedback === true,
    startAtIso: b.start_at,
    eloMin: m.elo_min ?? null,
    eloMax: m.elo_max ?? null,
    venueAddress: address || undefined,
    courtName,
    courtType,
    courtSport,
    clubId: court?.club_id ?? club?.id,
    startAt: b.start_at,
    endAt: b.end_at,
    matchGender,
  };
}
