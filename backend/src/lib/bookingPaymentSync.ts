import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tras marcar un participante como pagado: actualiza `bookings.status`.
 * - Matchmaking: `confirmed` solo cuando los 4 participantes han pagado.
 * - Otros: `confirmed` cuando el organizador ha pagado (flujo clásico).
 */
export async function refreshBookingStatusAfterParticipantPayment(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, reservation_type')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking || booking.status === 'cancelled') return;

  const { data: match } = await supabase.from('matches').select('type').eq('booking_id', bookingId).maybeSingle();
  const matchType = String((match as { type?: string } | null)?.type ?? 'open');

  const { data: parts } = await supabase
    .from('booking_participants')
    .select('role, payment_status')
    .eq('booking_id', bookingId);

  if (!parts?.length) return;

  // open_match (app split-payment) and matchmaking both require all 4 players paid
  const needsAllFour = booking.reservation_type === 'open_match' || matchType === 'matchmaking';
  if (needsAllFour) {
    const allPaid = parts.length >= 4 && parts.every((p) => p.payment_status === 'paid');
    if (allPaid) {
      await supabase
        .from('bookings')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', bookingId);
    }
    return;
  }

  const org = parts.find((p) => p.role === 'organizer');
  if (org?.payment_status === 'paid') {
    await supabase
      .from('bookings')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', bookingId);
  }
}
