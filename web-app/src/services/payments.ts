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
};

export const paymentsService = {
  listTransactions: async (limit = 100): Promise<PaymentTransaction[]> => {
    const q = new URLSearchParams({ limit: String(limit) });
    const res = await apiFetchWithAuth<{ ok: true; transactions: PaymentTransaction[] }>(`/payments/transactions?${q}`);
    return res.transactions ?? [];
  },
};
