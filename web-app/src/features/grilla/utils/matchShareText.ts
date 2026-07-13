import { buildMatchShareUrl } from './matchShareUrl';
import { resolveMatchPlayerSlots, type MatchPlayerRow } from './matchPlayerSlots';

export type MatchShareSource = {
    matchId: string;
    startAt: string;
    endAt: string;
    clubName?: string | null;
    courtName?: string | null;
    sport?: string | null;
    eloMin?: number | null;
    eloMax?: number | null;
    matchPlayers?: MatchPlayerRow[];
};

function formatElo(value: unknown): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0.00';
    return n.toFixed(2);
}

function formatSportLabel(sport?: string | null): string {
    const s = String(sport ?? 'padel').trim().toLowerCase();
    if (s === 'padel' || s === 'pádel') return 'PÁDEL';
    return s.toUpperCase();
}

function formatDateTimeLine(startAt: string, endAt: string): string {
    const start = new Date(startAt);
    const weekday = start.toLocaleDateString('es-ES', { weekday: 'long' });
    const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const dateStr = start.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
    });
    const timeStr = start.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const durationMin = Math.max(
        0,
        Math.round((new Date(endAt).getTime() - start.getTime()) / 60000),
    );
    return `📅 ${capitalized}, ${dateStr}, ${timeStr} ${durationMin} min`;
}

function formatLocationLine(clubName?: string | null, courtName?: string | null): string {
    const club = String(clubName ?? '').trim() || 'WeMatch';
    const court = String(courtName ?? '').trim();
    if (court) return `📍 ${club} · ${court}`;
    return `📍 ${club}`;
}

function formatPlayerLines(matchPlayers: MatchPlayerRow[]): string[] {
    const slots = resolveMatchPlayerSlots(matchPlayers);
    return slots.map((slot) => {
        const p = slot?.players;
        const first = String(p?.first_name ?? '').trim();
        const last = String(p?.last_name ?? '').trim();
        const name = [first, last].filter(Boolean).join(' ').trim();
        if (!name) return '⚪ ??';
        const elo = formatElo(p?.elo_rating);
        return `✅ ${name} (${elo})`;
    });
}

export function buildMatchShareText(source: MatchShareSource): string {
    const lines: string[] = [
        formatSportLabel(source.sport),
        formatDateTimeLine(source.startAt, source.endAt),
        formatLocationLine(source.clubName, source.courtName),
        `📊 ${formatElo(source.eloMin)} - ${formatElo(source.eloMax)}`,
        ...formatPlayerLines(source.matchPlayers ?? []),
        buildMatchShareUrl(source.matchId),
    ];
    return lines.join('\n');
}

export function buildMatchShareTextFromMatch(match: {
    id: string;
    elo_min?: number | null;
    elo_max?: number | null;
    match_players?: MatchPlayerRow[];
    bookings?: unknown;
}): string {
    const booking = Array.isArray(match.bookings) ? match.bookings[0] : match.bookings;
    const court = (booking as { courts?: { name?: string; sport?: string; clubs?: unknown } | null })?.courts;
    const clubRaw = court?.clubs;
    const club = Array.isArray(clubRaw) ? clubRaw[0] : clubRaw;

    return buildMatchShareText({
        matchId: match.id,
        startAt: String((booking as { start_at?: string })?.start_at ?? ''),
        endAt: String((booking as { end_at?: string })?.end_at ?? ''),
        clubName: (club as { name?: string } | null)?.name,
        courtName: court?.name,
        sport: court?.sport,
        eloMin: match.elo_min,
        eloMax: match.elo_max,
        matchPlayers: match.match_players ?? [],
    });
}

export function buildMatchShareTextFromBooking(booking: {
    start_at?: string;
    end_at?: string;
    organizer_player_id?: string | null;
    players?: unknown;
    booking_participants?: Array<{ role?: string; players?: unknown }>;
    courts?: unknown;
    matches?: unknown;
}): string | null {
    const matchRow = Array.isArray(booking.matches) ? booking.matches[0] : booking.matches;
    if (!matchRow || !(matchRow as { id?: string }).id) return null;

    const players: MatchPlayerRow[] = [];
    const orgPlayer = Array.isArray(booking.players) ? booking.players[0] : booking.players;
    if (booking.organizer_player_id && orgPlayer) {
        players.push({ slot_index: 0, team: 'A', players: orgPlayer as MatchPlayerRow['players'] });
    }
    let guestSlot = 1;
    for (const bp of booking.booking_participants ?? []) {
        if (bp.role !== 'guest') continue;
        const p = Array.isArray(bp.players) ? bp.players[0] : bp.players;
        if (!p) continue;
        if (guestSlot > 3) break;
        players.push({ slot_index: guestSlot, players: p as MatchPlayerRow['players'] });
        guestSlot += 1;
    }

    const court = Array.isArray(booking.courts) ? booking.courts[0] : booking.courts;
    const clubRaw = (court as { clubs?: unknown } | null)?.clubs;
    const club = Array.isArray(clubRaw) ? clubRaw[0] : clubRaw;

    return buildMatchShareText({
        matchId: String((matchRow as { id: string }).id),
        startAt: String(booking.start_at ?? ''),
        endAt: String(booking.end_at ?? ''),
        clubName: (club as { name?: string } | null)?.name,
        courtName: (court as { name?: string } | null)?.name,
        sport: (court as { sport?: string } | null)?.sport,
        eloMin: (matchRow as { elo_min?: number | null }).elo_min,
        eloMax: (matchRow as { elo_max?: number | null }).elo_max,
        matchPlayers: players,
    });
}
