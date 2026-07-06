import { enumerateDatesInRange } from './recurrenceDates';
import { shareCentsPerPlayer } from './moneyInput';

/** Quita cobros del payload al crear reservas en lote (evita debitar wallet N veces). */
export function stripParticipantPayments(participants: unknown): unknown[] {
    if (!Array.isArray(participants)) return [];
    return participants.map((p) => {
        if (!p || typeof p !== 'object') return p;
        return {
            ...(p as Record<string, unknown>),
            paid_amount_cents: 0,
            wallet_amount_cents: 0,
            payment_method: null,
        };
    });
}

export function participantPaymentsTotalCents(participants: unknown): number {
    if (!Array.isArray(participants)) return 0;
    return participants.reduce((sum, p) => {
        const row = p as { paid_amount_cents?: number; wallet_amount_cents?: number };
        return sum + (Number(row?.paid_amount_cents) || 0) + (Number(row?.wallet_amount_cents) || 0);
    }, 0);
}

export function splitParticipantPaymentsForBooking(
    participants: unknown,
    bookingTotalCents: number,
    batchTotalCents: number,
): unknown[] {
    if (!Array.isArray(participants)) return [];
    if (bookingTotalCents <= 0 || batchTotalCents <= 0) return stripParticipantPayments(participants);

    const inputTotal = participantPaymentsTotalCents(participants);
    const effectiveInputTotal = Math.min(inputTotal, batchTotalCents);
    const ratio = bookingTotalCents / batchTotalCents;
    const playerCount = participants.filter((p) => p && typeof p === 'object' && (p as { player_id?: unknown }).player_id).length;
    const shareAmountCents = shareCentsPerPlayer(bookingTotalCents, playerCount);

    return participants.map((p) => {
        if (!p || typeof p !== 'object') return p;
        const row = p as Record<string, unknown>;
        const paidAmountCents = Math.round((Number(row.paid_amount_cents) || 0) * ratio * (effectiveInputTotal / Math.max(1, inputTotal)));
        const walletAmountCents = Math.round((Number(row.wallet_amount_cents) || 0) * ratio * (effectiveInputTotal / Math.max(1, inputTotal)));

        return {
            ...row,
            share_amount_cents: shareAmountCents,
            paid_amount_cents: paidAmountCents,
            wallet_amount_cents: walletAmountCents,
            payment_method: paidAmountCents + walletAmountCents > 0 ? row.payment_method : null,
        };
    });
}

export function resolveMultiBookingDates(
    isMultiple: boolean,
    recurrenceStart: string | undefined,
    recurrenceEnd: string | undefined,
    recurrenceWeekdays: unknown,
    gridDateYmd: string,
): string[] {
    if (!isMultiple) return [gridDateYmd];

    const start = String(recurrenceStart ?? '').trim();
    const end = String(recurrenceEnd ?? '').trim();
    if (!start || !end) return [gridDateYmd];

    if (start === end) return [start];

    const weekdays = Array.isArray(recurrenceWeekdays)
        ? recurrenceWeekdays.map((x) => Number(x)).filter((n) => !Number.isNaN(n))
        : [];
    if (weekdays.length === 0) return [];

    return enumerateDatesInRange(start, end, weekdays);
}
