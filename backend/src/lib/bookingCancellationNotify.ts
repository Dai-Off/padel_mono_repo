import type { SupabaseClient } from '@supabase/supabase-js';
import {
  collectStripePlayerIds,
  fetchBookingParticipantsForRefund,
  summarizeParticipantRefund,
  type CashRefundDisposition,
  type CashRefundMap,
} from './bookingParticipantRefund';
import { sendBookingCancellationNoticeEmail } from './mailer';

export type CancellationEmailScenario = 'cancelled' | 'left' | 'removed';

type NotifyParams = {
  bookingId: string;
  scenario: CancellationEmailScenario;
  cancelledBy: 'admin' | 'player';
  refundPercent: number;
  refundEligible: boolean;
  policyMessage?: string;
  cashRefunds?: CashRefundMap;
  cashRefundAction?: CashRefundDisposition;
  notifyPlayerIds?: string[];
};

function playerEmail(row: { players?: unknown }): string | null {
  const raw = row.players;
  const p = Array.isArray(raw) ? raw[0] : raw;
  const email = String((p as { email?: string } | undefined)?.email ?? '').trim().toLowerCase();
  return email || null;
}

function playerName(row: { players?: unknown }): string {
  const raw = row.players;
  const p = Array.isArray(raw) ? raw[0] : raw;
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();
  return name || 'Jugador';
}

function formatBookingDateTime(startAt: string, timezone?: string | null): { dateStr: string; timeStr: string } {
  const tz = timezone || 'Europe/Madrid';
  const dateStr = new Date(startAt).toLocaleDateString('es-ES', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = new Date(startAt).toLocaleTimeString('es-ES', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  });
  return { dateStr, timeStr };
}

export async function notifyBookingCancellationEmails(
  supabase: SupabaseClient,
  params: NotifyParams,
): Promise<void> {
  try {
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('start_at, timezone, courts(name, clubs(name))')
      .eq('id', params.bookingId)
      .maybeSingle();
    if (bookingErr || !booking?.start_at) {
      console.error('[notifyBookingCancellationEmails] booking fetch:', bookingErr?.message ?? 'not found');
      return;
    }

    const court = (booking as { courts?: { name?: string; clubs?: { name?: string } } | null }).courts;
    const clubName = court?.clubs?.name ?? 'WeMatch Club';
    const courtName = court?.name ?? 'Pista';
    const { dateStr, timeStr } = formatBookingDateTime(
      booking.start_at,
      (booking as { timezone?: string | null }).timezone,
    );

    const participants = await fetchBookingParticipantsForRefund(supabase, params.bookingId);
    const stripeIds = await collectStripePlayerIds(supabase, params.bookingId);
    const targetIds = params.notifyPlayerIds?.length ? new Set(params.notifyPlayerIds) : null;
    const seenPlayerIds = new Set<string>();
    const sentEmails = new Set<string>();

    for (const row of participants) {
      if (!row.player_id || seenPlayerIds.has(row.player_id)) continue;
      seenPlayerIds.add(row.player_id);
      if (targetIds && !targetIds.has(row.player_id)) continue;

      const email = playerEmail(row);
      if (!email || sentEmails.has(email)) continue;
      sentEmails.add(email);

      const cashAction =
        params.cashRefundAction ??
        (params.cashRefunds?.[row.player_id] as CashRefundDisposition | undefined);

      const refund = summarizeParticipantRefund(row, stripeIds, {
        refundEligible: params.refundEligible && params.refundPercent > 0,
        refundPercent: params.refundPercent,
        cashRefundAction: cashAction,
      });

      const result = await sendBookingCancellationNoticeEmail({
        to: email,
        playerName: playerName(row),
        clubName,
        matchDateStr: dateStr,
        matchTimeStr: timeStr,
        courtName,
        scenario: params.scenario,
        cancelledBy: params.cancelledBy,
        refundSummary: refund,
        policyMessage: params.policyMessage,
      });

      if (!result.sent) {
        console.error(`[notifyBookingCancellationEmails] failed for ${email}:`, result.error);
      }
    }
  } catch (err) {
    console.error('[notifyBookingCancellationEmails]', err);
  }
}
