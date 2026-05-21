import { API_URL } from '../config';

export type WalletTransaction = {
  id: string;
  amount_cents: number;
  concept: string;
  type: string;
  booking_id: string | null;
  created_at: string;
  notes: string | null;
};

export type ClubWalletBalance = {
  club_id: string;
  club_name: string | null;
  balance_cents: number;
};

export type FetchPlayerBalancesResponse = {
  ok?: boolean;
  balances?: ClubWalletBalance[];
  total_balance_cents?: number;
  error?: string;
};

export type FetchWalletBalanceResponse = {
  ok?: boolean;
  balance_cents?: number;
  transactions?: WalletTransaction[];
  error?: string;
};

export async function fetchPlayerWalletBalances(
  playerId: string,
  token: string | null | undefined,
): Promise<FetchPlayerBalancesResponse> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const q = new URLSearchParams({ player_id: playerId });
    const res = await fetch(`${API_URL}/wallet/player-balances?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as FetchPlayerBalancesResponse;
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al cargar el monedero' };
    return json;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function fetchWalletBalance(
  playerId: string,
  clubId: string,
  token: string | null | undefined,
): Promise<FetchWalletBalanceResponse> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const q = new URLSearchParams({ player_id: playerId, club_id: clubId });
    const res = await fetch(`${API_URL}/wallet/balance?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as FetchWalletBalanceResponse;
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al cargar el saldo' };
    return json;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}
