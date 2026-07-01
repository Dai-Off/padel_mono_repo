import type { Reservation } from '../types';
import { isOpenMatchType, normalizeReservationTypeSlug } from './reservationTypeSlug';

export type ReservationListFilters = {
    reservationType: string;
    court: string;
    payment: '' | 'paid' | 'unpaid' | 'partial';
    status: string;
    client: string;
    sourceChannel: string;
    playersFill: '' | 'complete' | 'incomplete';
    eloMin: string;
    eloMax: string;
    priceMin: string;
    priceMax: string;
    timeFrom: string;
    timeTo: string;
};

export const EMPTY_RESERVATION_LIST_FILTERS: ReservationListFilters = {
    reservationType: '',
    court: '',
    payment: '',
    status: '',
    client: '',
    sourceChannel: '',
    playersFill: '',
    eloMin: '',
    eloMax: '',
    priceMin: '',
    priceMax: '',
    timeFrom: '',
    timeTo: '',
};

function endTimeFromStart(startTime: string, durationMinutes: number): string {
    const [h, m] = startTime.split(':').map(Number);
    const total = (h ?? 0) * 60 + (m ?? 0) + durationMinutes;
    const eh = Math.floor(total / 60) % 24;
    const em = total % 60;
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

export function getReservationEndTime(res: Reservation): string {
    return endTimeFromStart(res.startTime, res.durationMinutes);
}

function totalPriceCents(res: Reservation): number {
    if (res.totalPrice != null) return Math.round(res.totalPrice * 100);
    return 0;
}

export function isReservationPaid(res: Reservation): boolean {
    const total = totalPriceCents(res);
    const paid = res.totalPaidCents ?? 0;
    if (total <= 0) return paid > 0 || res.status === 'confirmed' || res.status === 'flat_rate';
    if (paid >= total) return true;
    return res.status === 'confirmed' || res.status === 'flat_rate';
}

export function isReservationPartiallyPaid(res: Reservation): boolean {
    const total = totalPriceCents(res);
    const paid = res.totalPaidCents ?? 0;
    return total > 0 && paid > 0 && paid < total;
}

function playerCount(res: Reservation): number {
    if (res.detailedPlayers && res.detailedPlayers.length > 0) return res.detailedPlayers.length;
    return res.playerName?.trim() ? 1 : 0;
}

const MATCH_GRID_FILL_TYPES = new Set(['open_match', 'pozo', 'standard']);
const PUBLIC_OPEN_MATCH_MIN_PLAYERS = 3;

function resolveLinkedMatch(b: { matches?: unknown }): { visibility?: string | null } | null {
    const raw = b.matches;
    if (!raw) return null;
    return (Array.isArray(raw) ? raw[0] : raw) as { visibility?: string | null };
}

/** Partido abierto visible en app (no privado). Sin fila matches se trata como público. */
export function isPublicOpenMatchBooking(b: {
    reservation_type?: string;
    booking_type?: string;
    matches?: unknown;
}): boolean {
    if (!isOpenMatchType(rawBookingType(b))) return false;
    const match = resolveLinkedMatch(b);
    return match?.visibility !== 'private';
}

function expectedPlayerSlots(res: Reservation): number {
    const t = res.booking_type;
    if (t === 'blocked' || t === 'tournament' || t === 'flat_rate') return 0;
    if (t === 'school_group' || t === 'school_individual' || t === 'school_course') return 1;
    if (t === 'open_match' || t === 'pozo' || t === 'standard') return 4;
    return 4;
}

function rawBookingType(b: { reservation_type?: string; booking_type?: string }): string {
    return normalizeReservationTypeSlug(b.reservation_type ?? b.booking_type ?? 'standard');
}

function rawPlayerCount(b: {
    booking_participants?: unknown[];
    organizer_player_id?: string | null;
    players?: unknown;
}): number {
    const participants = Array.isArray(b.booking_participants) ? b.booking_participants : [];
    if (participants.length > 0) return participants.length;
    return b.organizer_player_id || b.players ? 1 : 0;
}

type RawBookingPaymentInput = {
    payment_transactions?: Array<{
        status?: string;
        payer_player_id?: string | null;
        amount_cents?: number | null;
    }>;
    booking_participants?: Array<{
        paid_amount_cents?: number | null;
        wallet_amount_cents?: number | null;
        payment_status?: string | null;
        share_amount_cents?: number | null;
    }>;
};

function rawTotalPaidCents(b: RawBookingPaymentInput): number {
    const txByPlayer = new Map<string, number>();
    for (const t of b.payment_transactions ?? []) {
        if (t.status !== 'succeeded' || !t.payer_player_id) continue;
        txByPlayer.set(
            t.payer_player_id,
            (txByPlayer.get(t.payer_player_id) ?? 0) + (t.amount_cents ?? 0),
        );
    }
    const txTotal = Array.from(txByPlayer.values()).reduce((sum, n) => sum + n, 0);
    if (txTotal > 0) return txTotal;

    const participants = b.booking_participants ?? [];
    const bpTotal = participants.reduce(
        (sum, p) => sum + (p.paid_amount_cents ?? 0) + (p.wallet_amount_cents ?? 0),
        0,
    );
    if (bpTotal > 0) return bpTotal;

    return participants
        .filter((p) => p.payment_status === 'paid')
        .reduce((sum, p) => sum + (p.share_amount_cents ?? 0), 0);
}

function rawBookingFullyPaid(
    b: RawBookingPaymentInput & {
        total_price_cents?: number | null;
        status?: string | null;
    },
): boolean {
    const total = b.total_price_cents ?? 0;
    const paid = rawTotalPaidCents(b);
    if (total <= 0) return paid > 0 || b.status === 'confirmed' || b.status === 'flat_rate';
    return paid >= total;
}

/** Partido con fila en `matches` y visibilidad privada. */
export function isPrivateMatchBooking(b: { matches?: unknown }): boolean {
    const match = resolveLinkedMatch(b);
    return String(match?.visibility ?? '').toLowerCase() === 'private';
}

/** Grid: públicos abiertos desde 3 jugadores; partidos privados pagados al 100%; otros 4 jugadores o pago completo. Lista muestra todos. */
export function shouldShowRawBookingInGrid(
    b: RawBookingPaymentInput & {
        court_contention_status?: string | null;
        reservation_type?: string;
        booking_type?: string;
        organizer_player_id?: string | null;
        players?: unknown;
        total_price_cents?: number | null;
        status?: string | null;
        source_channel?: string | null;
        matches?: unknown;
    },
): boolean {
    if (b.court_contention_status === 'lost') return false;

    const type = rawBookingType(b);
    const isMatchType = MATCH_GRID_FILL_TYPES.has(type);

    // Mostrador: bloqueos, torneos, escuela, etc. Siempre visibles. Los partidos siguen las reglas de abajo.
    if (b.source_channel === 'manual' && !isMatchType) return true;

    if (b.court_contention_status === 'competing' && !isPrivateMatchBooking(b)) {
        if (rawBookingFullyPaid(b) && (b.status === 'confirmed' || b.status === 'flat_rate')) return true;
        return false;
    }

    if (isPublicOpenMatchBooking(b)) {
        if (b.court_contention_status === 'won') return true;
        if (rawPlayerCount(b) >= PUBLIC_OPEN_MATCH_MIN_PLAYERS) return true;
        if (rawBookingFullyPaid(b)) return true;
        return false;
    }

    if (isPrivateMatchBooking(b)) {
        return rawBookingFullyPaid(b);
    }

    if (!isMatchType) return true;

    if (rawPlayerCount(b) >= 4) return true;
    return rawBookingFullyPaid(b);
}

/** Same rule on mapped reservations (e.g. optimistic grid updates). */
export function shouldShowReservationInGrid(res: Reservation): boolean {
    const type = normalizeReservationTypeSlug(res.booking_type ?? res.reservation_type ?? 'standard');
    const isMatchType = MATCH_GRID_FILL_TYPES.has(type);

    if (res.source_channel === 'manual' && !isMatchType) return true;

    if (type === 'open_match') {
        if (playerCount(res) >= PUBLIC_OPEN_MATCH_MIN_PLAYERS) return true;
        if (isReservationPaid(res)) return true;
        return false;
    }
    if (!isMatchType) return true;
    if (isReservationPaid(res)) return true;
    return false;
}

export function willPublicOpenMatchStayOffGrid(playerCount: number, fullyPaid: boolean): boolean {
    return playerCount < PUBLIC_OPEN_MATCH_MIN_PLAYERS && !fullyPaid;
}

export function isReservationPlayersComplete(res: Reservation): boolean {
    const expected = expectedPlayerSlots(res);
    if (expected === 0) return true;
    return playerCount(res) >= expected;
}

export function averageElo(res: Reservation): number | null {
    const players = res.detailedPlayers?.filter((p) => p.name?.trim()) ?? [];
    if (players.length === 0) return null;
    const sum = players.reduce((acc, p) => acc + (p.level ?? 0), 0);
    return sum / players.length;
}

export function filterReservations(
    reservations: Reservation[],
    filters: ReservationListFilters,
): Reservation[] {
    return reservations.filter((res) => {
        if (filters.reservationType && res.booking_type !== filters.reservationType) return false;

        if (filters.court) {
            const name = res.courtName ?? '';
            if (name !== filters.court) return false;
        }

        if (filters.status && res.status !== filters.status) return false;

        if (filters.sourceChannel && res.source_channel !== filters.sourceChannel) return false;

        if (filters.client) {
            const q = filters.client.trim().toLowerCase();
            const hay = `${res.playerName} ${res.matchType ?? ''}`.toLowerCase();
            const players = (res.detailedPlayers ?? []).map((p) => p.name).join(' ').toLowerCase();
            if (!hay.includes(q) && !players.includes(q)) return false;
        }

        if (filters.payment) {
            const paid = isReservationPaid(res);
            const partial = isReservationPartiallyPaid(res);
            if (filters.payment === 'paid' && !paid) return false;
            if (filters.payment === 'unpaid' && (paid || partial)) return false;
            if (filters.payment === 'partial' && !partial) return false;
        }

        if (filters.playersFill) {
            const complete = isReservationPlayersComplete(res);
            if (filters.playersFill === 'complete' && !complete) return false;
            if (filters.playersFill === 'incomplete' && complete) return false;
        }

        const avg = averageElo(res);
        if (filters.eloMin) {
            const min = Number(filters.eloMin);
            if (Number.isFinite(min) && (avg == null || avg < min)) return false;
        }
        if (filters.eloMax) {
            const max = Number(filters.eloMax);
            if (Number.isFinite(max) && (avg == null || avg > max)) return false;
        }

        const priceEur = res.totalPrice ?? 0;
        if (filters.priceMin) {
            const min = Number(filters.priceMin);
            if (Number.isFinite(min) && priceEur < min) return false;
        }
        if (filters.priceMax) {
            const max = Number(filters.priceMax);
            if (Number.isFinite(max) && priceEur > max) return false;
        }

        if (filters.timeFrom && res.startTime < filters.timeFrom) return false;
        if (filters.timeTo && res.startTime > filters.timeTo) return false;

        return true;
    });
}

export function countActiveFilters(filters: ReservationListFilters): number {
    return Object.values(filters).filter((v) => v !== '').length;
}
