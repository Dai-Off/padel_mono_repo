import type { Reservation } from '../types';

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
    return paid >= total;
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

function expectedPlayerSlots(res: Reservation): number {
    const t = res.booking_type;
    if (t === 'blocked' || t === 'tournament' || t === 'flat_rate') return 0;
    if (t === 'school_group' || t === 'school_individual' || t === 'school_course') return 1;
    if (t === 'open_match' || t === 'pozo' || t === 'standard') return 4;
    return 4;
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
