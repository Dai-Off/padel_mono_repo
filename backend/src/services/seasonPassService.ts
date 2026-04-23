import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getActiveSeasonRow } from './seasonPassSeasonConfig';

/** Metadata Stripe `purpose` para PaymentIntent del Pase Elite. */
export const STRIPE_META_SEASON_PASS_ELITE = 'season_pass_elite';

export type SeasonPassComputed = {
  level: number;
  into_level: number;
  pct: number;
  sp_to_next: number;
};

export function computeSeasonPass(sp: number, spPerLevel: number, maxLevel: number): SeasonPassComputed {
  const s = Math.max(0, sp);
  if (s <= 0) {
    return { level: 1, into_level: 0, pct: 0, sp_to_next: spPerLevel };
  }
  const completedLevels = Math.floor(s / spPerLevel);
  const into = s - completedLevels * spPerLevel;
  const level = Math.min(maxLevel, completedLevels + 1);
  const pct = spPerLevel > 0 ? Math.min(1, into / spPerLevel) : 0;
  return { level, into_level: into, pct, sp_to_next: spPerLevel - into };
}

export async function getOrCreateSeasonPassRow(playerId: string): Promise<{ sp: number; has_elite: boolean }> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('player_season_pass')
    .select('sp, has_elite')
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return { sp: Number(data.sp ?? 0), has_elite: Boolean(data.has_elite) };
  const { error: insErr } = await supabase.from('player_season_pass').insert({
    player_id: playerId,
    sp: 0,
    has_elite: false,
  });
  if (insErr) throw new Error(insErr.message);
  return { sp: 0, has_elite: false };
}

export async function addSeasonPassSp(playerId: string, delta: number): Promise<{ sp: number }> {
  if (!Number.isFinite(delta) || delta <= 0 || delta > 50_000) {
    throw new Error('delta SP inválido');
  }
  const season = await getActiveSeasonRow();
  if (!season) {
    throw new Error('No hay temporada activa en season_pass_seasons (migración 050)');
  }
  const capSp = season.max_level * season.sp_per_level;
  const supabase = getSupabaseServiceRoleClient();
  const cur = await getOrCreateSeasonPassRow(playerId);
  const next = Math.min(capSp, cur.sp + Math.round(delta));
  const { error } = await supabase
    .from('player_season_pass')
    .upsert(
      { player_id: playerId, sp: next, has_elite: cur.has_elite, updated_at: new Date().toISOString() },
      { onConflict: 'player_id' }
    );
  if (error) throw new Error(error.message);
  return { sp: next };
}

export async function setSeasonPassEliteFlag(playerId: string, value: boolean): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const cur = await getOrCreateSeasonPassRow(playerId);
  const { error } = await supabase
    .from('player_season_pass')
    .upsert(
      {
        player_id: playerId,
        sp: cur.sp,
        has_elite: value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id' }
    );
  if (error) throw new Error(error.message);
}

/** Tras pago Stripe confirmado (webhook o confirm-client): registro contable + activa Elite (idempotente por `paymentIntentId`). */
export async function finalizeSeasonPassElitePurchase(params: {
  playerId: string;
  stripePaymentIntentId: string;
  amountCents: number;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: dup } = await supabase
    .from('payment_transactions')
    .select('id')
    .eq('stripe_payment_intent_id', params.stripePaymentIntentId)
    .maybeSingle();
  if (dup) {
    await setSeasonPassEliteFlag(params.playerId, true);
    return { ok: true };
  }

  const { error: txErr } = await supabase.from('payment_transactions').insert({
    booking_id: null,
    tournament_id: null,
    payer_player_id: params.playerId,
    amount_cents: params.amountCents,
    currency: 'EUR',
    stripe_payment_intent_id: params.stripePaymentIntentId,
    status: 'succeeded',
  });

  if (txErr) {
    const msg = String(txErr.message ?? '');
    if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
      await setSeasonPassEliteFlag(params.playerId, true);
      return { ok: true };
    }
    return { ok: false, error: msg };
  }

  await setSeasonPassEliteFlag(params.playerId, true);
  return { ok: true };
}
