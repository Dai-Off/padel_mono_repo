import { getSupabaseServiceRoleClient } from '../supabase';
import type { IPaymentProvider } from './types';
import { randomUUID } from 'node:crypto';

/**
 * Simula pago en mostrador (admin cobra al cliente).
 * Sin pasarela real. Futuro: sustituir por Alipay/WeChat Pay.
 */
export class MockPaymentProvider implements IPaymentProvider {
  async recordPayment(bookingId: string): Promise<{ ok: boolean; error?: string }> {
    const supabase = getSupabaseServiceRoleClient();

    const { data: booking, error: errBooking } = await supabase
      .from('bookings')
      .select('id, status, organizer_player_id, total_price_cents, currency')
      .eq('id', bookingId)
      .maybeSingle();

    if (errBooking) return { ok: false, error: errBooking.message };
    if (!booking) return { ok: false, error: 'Reserva no encontrada' };
    if (booking.status === 'confirmed') return { ok: true };

    if (booking.status !== 'pending_payment') {
      return { ok: false, error: `La reserva no está pendiente de pago (status: ${booking.status})` };
    }

    const { error: errUpdateBooking } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (errUpdateBooking) return { ok: false, error: errUpdateBooking.message };

    const { error: errUpdateOrg } = await supabase
      .from('booking_participants')
      .update({ payment_status: 'paid' })
      .eq('booking_id', bookingId)
      .eq('role', 'organizer');

    if (errUpdateOrg) {
      console.error('[MockPaymentProvider] Error actualizando organizer:', errUpdateOrg.message);
      return { ok: false, error: errUpdateOrg.message };
    }

    const mockIntentId = `mock_${bookingId}_${randomUUID()}`;
    await supabase.from('payment_transactions').insert({
      booking_id: bookingId,
      payer_player_id: booking.organizer_player_id,
      amount_cents: booking.total_price_cents,
      currency: booking.currency ?? 'EUR',
      stripe_payment_intent_id: mockIntentId,
      status: 'succeeded',
    });

    return { ok: true };
  }
}
