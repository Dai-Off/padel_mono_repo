import { API_URL, STRIPE_PUBLISHABLE_KEY } from '../config';

export function getStripePublishableKey(): string {
  return STRIPE_PUBLISHABLE_KEY;
}

export type CreatePaymentIntentResponse = {
  ok?: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  amountCents?: number;
  error?: string;
};

export async function confirmPaymentFromClient(
  paymentIntentId: string,
  token: string | null | undefined
): Promise<ConfirmClientResponse> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/payments/confirm-client`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payment_intent_id: paymentIntentId }),
    });
    const json = (await res.json()) as ConfirmClientResponse;
    return json;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function createPaymentIntent(
  bookingId: string,
  token: string | null | undefined,
  slotIndex?: number,
  participantId?: string
): Promise<CreatePaymentIntentResponse> {
  if (!token) return { ok: false, error: 'Token requerido' };
  const body: { booking_id: string; participant_id?: string; slot_index?: number } = {
    booking_id: bookingId,
  };
  if (participantId) body.participant_id = participantId;
  if (slotIndex != null) body.slot_index = slotIndex;
  try {
    const res = await fetch(`${API_URL}/payments/create-intent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as CreatePaymentIntentResponse;
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al crear el pago' };
    return json;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export type CreateIntentForNewMatchParams = {
  court_id: string;
  organizer_player_id: string;
  start_at: string;
  end_at: string;
  total_price_cents: number;
  /** Si true, el usuario paga el total (reserva). Si false, paga 1/4 (crear partido entre 4). */
  pay_full?: boolean;
  timezone?: string;
  visibility?: 'public' | 'private';
  competitive?: boolean;
  gender?: string | null;
  elo_min?: number | null;
  elo_max?: number | null;
};

export type Transaction = {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
  /** Fecha de última actualización (útil para mostrar cuándo se reembolsó). */
  updated_at?: string;
  booking_id: string | null;
  tournament_id?: string | null;
  tournament_name?: string | null;
  start_at: string | null;
  end_at: string | null;
  court_name: string | null;
  club_name: string | null;
  city: string | null;
  /** Título ya resuelto en backend (reserva o torneo). */
  summary_label?: string | null;
};

export type FetchTransactionsResponse = {
  ok?: boolean;
  transactions?: Transaction[];
  error?: string;
};

export type CustomerPortalResponse = {
  ok?: boolean;
  url?: string;
  error?: string;
};

export async function fetchCustomerPortalUrl(
  token: string | null | undefined
): Promise<CustomerPortalResponse> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/payments/customer-portal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ return_url: 'padelapp://payments' }),
    });
    const json = (await res.json()) as CustomerPortalResponse;
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al abrir métodos de pago' };
    return json;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function fetchTransactions(
  token: string | null | undefined
): Promise<FetchTransactionsResponse> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/payments/transactions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as FetchTransactionsResponse;
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al cargar transacciones' };
    return json;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export type ConfirmClientResponse = {
  ok?: boolean;
  match?: unknown;
  booking?: { id: string };
  error?: string;
};

export async function createIntentForNewMatch(
  params: CreateIntentForNewMatchParams,
  token: string | null | undefined
): Promise<CreatePaymentIntentResponse> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/payments/create-intent-for-new-match`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    const json = (await res.json()) as CreatePaymentIntentResponse;
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al crear el pago' };
    return json;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

/** Mismo flujo que reserva en club: PaymentSheet + `confirmPaymentFromClient`. */
export async function createIntentForTournament(
  tournamentId: string,
  token: string | null | undefined
): Promise<CreatePaymentIntentResponse> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/payments/create-intent-for-tournament`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tournament_id: tournamentId }),
    });
    const json = (await res.json()) as CreatePaymentIntentResponse;
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al crear el pago' };
    return json;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}
