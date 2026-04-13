import { getSupabaseServiceRoleClient } from '../supabase';

/**
 * Un jugador está bloqueado por deuda si la suma de wallet_transactions de tipo
 * `organizer_debt` (cargos negativos) supera la suma de wallet_transactions
 * positivos posteriores que las compensan. Simplificación: chequea saldo neto
 * de transacciones del jugador < 0 con al menos un cargo de tipo organizer_debt.
 */
export async function playerHasDebt(playerId: string): Promise<boolean> {
  const supabase = getSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('amount_cents, type')
    .eq('player_id', playerId);
  if (error || !data) return false;

  const hasDebtCharge = data.some((t: { type: string }) => t.type === 'organizer_debt');
  if (!hasDebtCharge) return false;

  const net = data.reduce(
    (acc: number, t: { amount_cents: number }) => acc + Number(t.amount_cents || 0),
    0
  );
  return net < 0;
}

export type PlayerClubDebtCharge = {
  id: string;
  amount_cents: number;
  concept: string | null;
  booking_id: string | null;
  notes: string | null;
  created_at: string;
};

export type PlayerClubDebtSummary = {
  net_balance_cents: number;
  debt_cents: number;
  has_debt: boolean;
  charges: PlayerClubDebtCharge[];
};

/**
 * Deuda real de un jugador en un club. Regla de negocio (CU-4.3):
 * si el jugador tiene saldo positivo que cubre los cargos `organizer_debt`,
 * NO está en deuda — el saldo los compensa automáticamente. La "deuda"
 * expuesta al admin es `max(0, -net_balance)`.
 *
 * `charges` devuelve los cargos `organizer_debt` brutos (para mostrar origen
 * en el panel), pero el total a cobrar se calcula desde el balance neto.
 */
export async function getPlayerClubDebt(
  playerId: string,
  clubId: string
): Promise<PlayerClubDebtSummary> {
  const supabase = getSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, amount_cents, type, concept, booking_id, notes, created_at')
    .eq('player_id', playerId)
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`getPlayerClubDebt failed: ${error.message}`);
  }

  const rows = data ?? [];
  const net = rows.reduce(
    (acc: number, t: { amount_cents: number }) => acc + Number(t.amount_cents || 0),
    0
  );
  const debt_cents = net < 0 ? -net : 0;

  const charges: PlayerClubDebtCharge[] = rows
    .filter((r: { type: string }) => r.type === 'organizer_debt')
    .map((r) => ({
      id: r.id,
      amount_cents: Number(r.amount_cents || 0),
      concept: r.concept ?? null,
      booking_id: r.booking_id ?? null,
      notes: r.notes ?? null,
      created_at: r.created_at,
    }));

  return {
    net_balance_cents: net,
    debt_cents,
    has_debt: debt_cents > 0,
    charges,
  };
}
