import { apiFetchWithAuth } from './api';

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

export type CashClosingExpected = {
  ok: true;
  date: string;
  systemCashTotal_cents: number;
  systemCardTotal_cents: number;
  systemCashTotal_eur: number;
  systemCardTotal_eur: number;
  bookings: CashClosingBookingExpected[];
};

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

  getCashClosingExpected: async (clubId: string, date?: string): Promise<CashClosingExpected> => {
    const q = new URLSearchParams({ club_id: clubId });
    if (date) q.set('date', date);
    const res = await apiFetchWithAuth<CashClosingExpected>(`/payments/cash-closing/expected?${q}`);
    return res;
  },

  listCashClosingRecords: async (clubId: string, limit = 50): Promise<CashClosingSavedRecord[]> => {
    const q = new URLSearchParams({ club_id: clubId, limit: String(limit) });
    const res = await apiFetchWithAuth<{ ok: true; records: CashClosingSavedRecord[] }>(
      `/payments/cash-closing/records?${q}`
    );
    return res.records ?? [];
  },

  createCashClosingRecord: async (body: {
    club_id: string;
    staff_id: string;
    for_date?: string;
    real_cash_cents: number;
    real_card_cents: number;
    system_cash_cents: number;
    system_card_cents: number;
    observations?: string;
  }): Promise<CashClosingSavedRecord> => {
    const res = await apiFetchWithAuth<{ ok: true; record: CashClosingSavedRecord }>(
      '/payments/cash-closing/records',
      { method: 'POST', body: JSON.stringify(body) }
    );
    return res.record;
  },
};
