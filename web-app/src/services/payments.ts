import { apiFetchWithAuth } from './api';

export type PaymentParticipant = {
  player_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: 'organizer' | 'guest' | null;
  share_amount_cents: number;
  payment_status: 'pending' | 'paid' | null;
  payment_method: 'cash' | 'card' | 'wallet' | null;
  paid_amount_cents: number;
  wallet_amount_cents: number;
};

export type PaymentTransaction = {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
  booking_id: string;
  start_at: string | null;
  end_at: string | null;
  court_name: string | null;
  club_name: string | null;
  city: string | null;
  payer_first_name?: string | null;
  payer_last_name?: string | null;
  payer_email?: string | null;
  participants?: PaymentParticipant[];
};

export type CashClosingBookingExpected = {
  booking_id: string;
  start_at: string | null;
  end_at: string | null;
  court_name: string | null;
  total_price_cents: number | null;
  cash_paid_cents: number;
  card_paid_cents: number;
};

export type CashMovementType = 'withdrawal' | 'deposit';

export type CashMovementRecord = {
  id: string;
  club_id: string;
  staff_id: string | null;
  employee_name: string;
  movement_type: CashMovementType;
  amount_cents: number;
  for_date: string;
  opening_id: string | null;
  notes: string | null;
  created_at: string;
};

export type CashClosingExpected = {
  ok: true;
  date: string;
  systemCashTotal_cents: number;
  systemCardTotal_cents: number;
  systemCashTotal_eur: number;
  systemCardTotal_eur: number;
  openingCashTotal_cents?: number;
  openingCashTotal_eur?: number;
  storeSalesCash_cents?: number;
  storeSalesCard_cents?: number;
  storeSalesCash_eur?: number;
  storeSalesCard_eur?: number;
  cash_deposits_cents?: number;
  cash_withdrawals_cents?: number;
  cash_deposits_eur?: number;
  cash_withdrawals_eur?: number;
  cash_movement_net_cents?: number;
  cash_movement_net_eur?: number;
  /** Último cierre del día (ISO). */
  last_closing_at?: string | null;
  /** Tras un cierre, hace falta una apertura posterior para contar efectivo inicial en el esperado. */
  needs_new_opening_after_closing?: boolean;
  opening?: CashOpeningSavedRecord | null;
  openings?: CashOpeningSavedRecord[];
  cash_movements?: CashMovementRecord[];
  bookings: CashClosingBookingExpected[];
};

export type CashCurrentOperator = {
  ok: true;
  staff_id: string | null;
  employee_name: string;
  is_club_owner?: boolean;
  can_delegate?: boolean;
  owner_display_name?: string;
};

export type CashOpeningSavedRecord = {
  id: string;
  club_id: string;
  staff_id: string | null;
  employee_name: string;
  opened_at: string;
  for_date: string;
  opening_cash_cents: number;
  notes: string | null;
};

export type CashRecordKind = 'arqueo' | 'cierre';

export type CashClosingSavedRecord = {
  id: string;
  club_id: string;
  staff_id: string | null;
  employee_name: string;
  closed_at: string;
  for_date: string;
  real_cash_cents: number;
  real_card_cents: number;
  system_cash_cents: number;
  system_card_cents: number;
  difference_cents: number;
  observations: string | null;
  status: 'perfect' | 'surplus' | 'deficit';
  record_kind?: CashRecordKind;
};

export const paymentsService = {
  listTransactions: async (limit = 100): Promise<PaymentTransaction[]> => {
    const q = new URLSearchParams({ limit: String(limit) });
    const res = await apiFetchWithAuth<{ ok: true; transactions: PaymentTransaction[] }>(`/payments/transactions?${q}`);
    return res.transactions ?? [];
  },

  listClubTransactions: async (clubId: string, limit = 100): Promise<PaymentTransaction[]> => {
    const q = new URLSearchParams({ club_id: clubId, limit: String(limit) });
    const res = await apiFetchWithAuth<{ ok: true; transactions: PaymentTransaction[] }>(
      `/payments/club-transactions?${q}`
    );
    return res.transactions ?? [];
  },

  getCashClosingExpected: async (clubId: string, date?: string, timezone?: string): Promise<CashClosingExpected> => {
    const q = new URLSearchParams({ club_id: clubId });
    if (date) q.set('date', date);
    if (timezone) q.set('timezone', timezone);
    const res = await apiFetchWithAuth<CashClosingExpected>(`/payments/cash-closing/expected?${q}`);
    return res;
  },

  getCashOpeningForDay: async (clubId: string, date?: string): Promise<{ ok: true; date: string; opening: CashOpeningSavedRecord | null }> => {
    const q = new URLSearchParams({ club_id: clubId });
    if (date) q.set('date', date);
    return apiFetchWithAuth<{ ok: true; date: string; opening: CashOpeningSavedRecord | null }>(`/payments/cash-opening/today?${q}`);
  },

  createCashOpeningRecord: async (body: {
    club_id: string;
    staff_id?: string | null;
    for_date?: string;
    opening_cash_cents: number;
    notes?: string;
  }): Promise<CashOpeningSavedRecord> => {
    const res = await apiFetchWithAuth<{ ok: true; record: CashOpeningSavedRecord }>(
      '/payments/cash-opening/records',
      { method: 'POST', body: JSON.stringify(body) }
    );
    return res.record;
  },

  listCashClosingRecords: async (
    clubId: string,
    limit = 50,
    date?: string,
    recordKind?: CashRecordKind,
  ): Promise<CashClosingSavedRecord[]> => {
    const q = new URLSearchParams({ club_id: clubId, limit: String(limit) });
    if (date) q.set('date', date);
    if (recordKind) q.set('record_kind', recordKind);
    const res = await apiFetchWithAuth<{ ok: true; records: CashClosingSavedRecord[] }>(
      `/payments/cash-closing/records?${q}`
    );
    return res.records ?? [];
  },

  getCashCurrentOperator: async (clubId: string): Promise<CashCurrentOperator> => {
    const q = new URLSearchParams({ club_id: clubId });
    return apiFetchWithAuth<CashCurrentOperator>(`/payments/cash-ledger/current-operator?${q}`);
  },

  listCashMovementRecords: async (
    clubId: string,
    date?: string,
  ): Promise<{ ok: true; date: string; session_active: boolean; records: CashMovementRecord[] }> => {
    const q = new URLSearchParams({ club_id: clubId });
    if (date) q.set('date', date);
    return apiFetchWithAuth<{ ok: true; date: string; session_active: boolean; records: CashMovementRecord[] }>(
      `/payments/cash-movements/records?${q}`,
    );
  },

  createCashMovementRecord: async (body: {
    club_id: string;
    staff_id?: string | null;
    movement_type: CashMovementType;
    amount_cents: number;
    for_date?: string;
    notes?: string;
  }): Promise<CashMovementRecord> => {
    const res = await apiFetchWithAuth<{ ok: true; record: CashMovementRecord }>(
      '/payments/cash-movements/records',
      { method: 'POST', body: JSON.stringify(body) },
    );
    return res.record;
  },

  createCashClosingRecord: async (body: {
    club_id: string;
    staff_id?: string | null;
    for_date?: string;
    real_cash_cents: number;
    real_card_cents: number;
    system_cash_cents: number;
    system_card_cents: number;
    observations?: string;
    record_kind?: CashRecordKind;
  }): Promise<CashClosingSavedRecord> => {
    const res = await apiFetchWithAuth<{ ok: true; record: CashClosingSavedRecord }>(
      '/payments/cash-closing/records',
      { method: 'POST', body: JSON.stringify(body) }
    );
    return res.record;
  },
};
