import { API_URL } from '../config';

export type CourtReservation = {
  id: string;
  court_id: string;
  court_name: string | null;
  club_id: string | null;
  club_name: string | null;
  start_at: string;
  end_at: string;
  total_price_cents: number;
  currency: string;
  status: string;
};

export type CreateCourtReservationPayLaterParams = {
  courtId: string;
  organizerPlayerId: string;
  startAtIso: string;
  endAtIso: string;
  totalPriceCents: number;
  token: string;
};

export async function createCourtReservationPayLater(
  params: CreateCourtReservationPayLaterParams,
): Promise<{ ok: boolean; bookingId?: string; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/bookings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        court_id: params.courtId,
        organizer_player_id: params.organizerPlayerId,
        start_at: params.startAtIso,
        end_at: params.endAtIso,
        total_price_cents: params.totalPriceCents,
        booking_type: 'standard',
        source_channel: 'mobile',
        status: 'pending_payment',
        participants: [
          {
            player_id: params.organizerPlayerId,
            role: 'organizer',
            share_amount_cents: params.totalPriceCents,
            paid_amount_cents: 0,
            wallet_amount_cents: 0,
            payment_method: null,
          },
        ],
      }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      booking?: { id?: string };
    };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'No se pudo crear la reserva' };
    }
    return { ok: true, bookingId: json.booking?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function fetchMyCourtReservations(
  token: string | null | undefined,
  opts?: { phase?: 'upcoming' | 'past' | 'all'; limit?: number },
): Promise<{ ok: boolean; reservations: CourtReservation[]; error?: string }> {
  if (!token) return { ok: false, reservations: [], error: 'Token requerido' };
  const phase = opts?.phase ?? 'upcoming';
  const limit = opts?.limit ?? 50;
  try {
    const res = await fetch(
      `${API_URL}/bookings/mine/court-reservations?phase=${encodeURIComponent(phase)}&limit=${limit}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = (await res.json()) as {
      ok?: boolean;
      reservations?: CourtReservation[];
      error?: string;
    };
    if (!res.ok || !json.ok) {
      return { ok: false, reservations: [], error: json.error ?? 'Error al cargar reservas' };
    }
    return { ok: true, reservations: json.reservations ?? [] };
  } catch {
    return { ok: false, reservations: [], error: 'Error de conexión' };
  }
}

export type CourtReservationCancelPreview = {
  ok?: boolean;
  refund_eligible?: boolean;
  policy_message?: string;
  error?: string;
};

export async function fetchCourtReservationCancelPreview(
  bookingId: string,
  token: string | null | undefined,
): Promise<CourtReservationCancelPreview> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/bookings/${bookingId}/cancel-preview`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const json = (await res.json()) as CourtReservationCancelPreview;
    if (!res.ok) {
      return { ok: false, error: json.error ?? 'No se pudo consultar la política' };
    }
    return json;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function cancelCourtReservation(
  bookingId: string,
  token: string | null | undefined,
): Promise<
  | { ok: true; refundEligible: boolean }
  | { ok: false; error: string; refund_errors?: string[] }
> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      refund_eligible?: boolean;
      refund_errors?: string[];
    };
    if (!res.ok || !json.ok) {
      return {
        ok: false,
        error: json.error ?? 'No se pudo cancelar la reserva',
        refund_errors: json.refund_errors,
      };
    }
    return { ok: true, refundEligible: json.refund_eligible !== false };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}
