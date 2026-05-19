export type JoinedPlayer = {
  first_name?: string | null;
  last_name?: string | null;
  elo_rating?: number | null;
};

/** Supabase puede devolver joins 1:1 como objeto o como array de un elemento. */
export function resolveJoinedPlayer(raw: unknown): JoinedPlayer | null {
  if (raw == null) return null;
  const p = Array.isArray(raw) ? raw[0] : raw;
  if (!p || typeof p !== 'object') return null;
  return p as JoinedPlayer;
}

export function formatPlayerDisplayName(p: JoinedPlayer | null | undefined): string {
  if (!p) return '';
  const fn = String(p.first_name ?? '').trim();
  const ln = String(p.last_name ?? '').trim();
  return `${fn} ${ln}`.trim();
}

const INTERNAL_NOTE_PREFIXES = ['__COURT_MAINTENANCE__', '__PLAY_MODE__:', '__MATCH_DRAFT__'];

/** Título legible en grilla para bloqueos/eventos sin organizador (primera línea de notas). */
export function displayTitleFromNotes(notes: string | null | undefined): string {
  if (!notes || typeof notes !== 'string') return '';
  const lines = notes.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (INTERNAL_NOTE_PREFIXES.some((p) => line.startsWith(p))) continue;
    if (line.startsWith('__') && line.includes('__')) continue;
    return line;
  }
  return '';
}

export function resolveOrganizerFromBooking(b: {
  players?: unknown;
  organizer_player_id?: string | null;
  booking_participants?: Array<{ role?: string; player_id?: string; players?: unknown }>;
}): JoinedPlayer | null {
  const fromJoin = resolveJoinedPlayer(b.players);
  if (formatPlayerDisplayName(fromJoin)) return fromJoin;

  const participants = b.booking_participants ?? [];
  const organizerPart =
    participants.find((p) => p.role === 'organizer') ?? participants[0];
  const fromParticipant = resolveJoinedPlayer(organizerPart?.players);
  if (formatPlayerDisplayName(fromParticipant)) return fromParticipant;

  return null;
}

export function resolveBookingGridLabel(
  b: {
    reservation_type?: string | null;
    booking_type?: string | null;
    notes?: string | null;
    players?: unknown;
    organizer_player_id?: string | null;
    booking_participants?: Array<{ role?: string; player_id?: string; players?: unknown }>;
  },
  tournamentName?: string | null,
): string {
  const bookingType = b.reservation_type ?? b.booking_type ?? 'standard';

  if (bookingType === 'tournament') {
    return (tournamentName && tournamentName.trim()) || 'Torneo';
  }

  const organizerName = formatPlayerDisplayName(resolveOrganizerFromBooking(b));
  if (organizerName) return organizerName;

  const fromNotes = displayTitleFromNotes(b.notes);
  if (fromNotes) return fromNotes;

  if (bookingType === 'blocked') return 'Bloqueado';
  if (bookingType === 'pozo') return 'Americanas';
  if (bookingType === 'open_match') return 'Partido abierto';

  return '';
}
