import type { SupabaseClient } from '@supabase/supabase-js';

type PricingRuleDefaults = {
  days_of_week?: number[]; // supports 1..7 or 0..6, we store as provided (prefer 1..7)
  start_minutes?: number;
  end_minutes?: number;
  amount_cents?: number;
  currency?: string;
};

const DEFAULTS_REQUIRED: Required<PricingRuleDefaults> = {
  days_of_week: [1, 2, 3, 4, 5, 6, 7],
  start_minutes: 8 * 60,
  end_minutes: 22 * 60,
  amount_cents: 2000,
  currency: 'EUR',
};

function normalizeDefaults(d?: PricingRuleDefaults): Required<PricingRuleDefaults> {
  const days = Array.isArray(d?.days_of_week) && d!.days_of_week!.length
    ? d!.days_of_week!.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 7)
    : DEFAULTS_REQUIRED.days_of_week;

  const start = d?.start_minutes != null ? Number(d.start_minutes) : DEFAULTS_REQUIRED.start_minutes;
  const end = d?.end_minutes != null ? Number(d.end_minutes) : DEFAULTS_REQUIRED.end_minutes;
  const amount = d?.amount_cents != null ? Number(d.amount_cents) : DEFAULTS_REQUIRED.amount_cents;
  const curr = (d?.currency ?? DEFAULTS_REQUIRED.currency) as string;

  return {
    days_of_week: days.length ? days : DEFAULTS_REQUIRED.days_of_week,
    start_minutes: start,
    end_minutes: end,
    amount_cents: amount,
    currency: curr,
  };
}

export async function ensureDefaultPricingRuleForCourt(
  supabase: SupabaseClient,
  courtId: string,
  defaults?: PricingRuleDefaults
): Promise<{ created: boolean; error?: string }> {
  const { data: existing, error: exErr } = await supabase
    .from('pricing_rules')
    .select('id')
    .eq('court_id', courtId)
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (exErr) return { created: false, error: exErr.message };
  if (existing) return { created: false };

  const d = normalizeDefaults(defaults);
  if (!Number.isFinite(d.start_minutes) || !Number.isFinite(d.end_minutes) || d.start_minutes < 0 || d.end_minutes > 24 * 60 || d.start_minutes >= d.end_minutes) {
    return { created: false, error: 'start_minutes/end_minutes inválidos' };
  }
  if (!Number.isFinite(d.amount_cents) || d.amount_cents <= 0) {
    return { created: false, error: 'amount_cents inválido' };
  }

  const { error: insErr } = await supabase.from('pricing_rules').insert({
    court_id: courtId,
    days_of_week: d.days_of_week,
    start_minutes: d.start_minutes,
    end_minutes: d.end_minutes,
    amount_cents: d.amount_cents,
    currency: d.currency,
    active: true,
  });

  if (insErr) return { created: false, error: insErr.message };
  return { created: true };
}

