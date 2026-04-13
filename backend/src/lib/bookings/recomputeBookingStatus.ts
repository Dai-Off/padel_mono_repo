import { getSupabaseServiceRoleClient } from '../supabase';

/**
 * Si todos los booking_participants están en `paid`, promueve el booking a `completed`
 * y marca el match asociado como `payment_settled=true` (sale del índice de deuda).
 * Idempotente.
 */
export async function recomputeBookingStatus(bookingId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking) return;
  if (booking.status === 'cancelled') return;

  const { data: participants, error } = await supabase
    .from('booking_participants')
    .select('payment_status')
    .eq('booking_id', bookingId);
  if (error || !participants || participants.length === 0) return;

  const allPaid = participants.every(
    (p: { payment_status: string }) => p.payment_status === 'paid'
  );
  if (!allPaid) return;

  if (booking.status !== 'completed') {
    await supabase
      .from('bookings')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', bookingId);
  }

  await supabase
    .from('matches')
    .update({ payment_settled: true, updated_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .eq('payment_settled', false);
}
