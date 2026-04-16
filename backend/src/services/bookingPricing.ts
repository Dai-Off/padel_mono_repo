import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_HOUR_CENTS = 4000;
const MIN_BOOKING_TOTAL_CENTS = 200;

function utcDayIndices(d: Date): { jsDow: number; isoDow: number } {
  const jsDow = d.getUTCDay();
  const isoDow = jsDow === 0 ? 7 : jsDow;
  return { jsDow, isoDow };
}

function utcMinutesSinceMidnight(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

type RuleRow = {
  days_of_week: number[];
  start_minutes: number;
  end_minutes: number;
  amount_cents: number;
};

function pickRuleForInstant(rules: RuleRow[], d: Date): RuleRow | null {
  const { jsDow, isoDow } = utcDayIndices(d);
  const mins = utcMinutesSinceMidnight(d);
  for (const r of rules) {
    const dows = Array.isArray(r.days_of_week) ? r.days_of_week : [];
    const dayOk = dows.some((x) => Number(x) === jsDow || Number(x) === isoDow);
    if (!dayOk) continue;
    if (mins >= r.start_minutes && mins < r.end_minutes) return r;
  }
  return null;
}

/**
 * Estima el precio de una reserva sumando tramos horarios según pricing_rules (activas).
 * Si no hay tarifa para un tramo, usa un precio por hora por defecto.
 */
export async function estimateBookingPriceCents(
  supabase: SupabaseClient,
  courtId: string,
  startAt: string,
  endAt: string,
): Promise<number> {
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return MIN_BOOKING_TOTAL_CENTS;
  }

  const { data: rawRules, error } = await supabase
    .from('pricing_rules')
    .select('days_of_week, start_minutes, end_minutes, amount_cents')
    .eq('court_id', courtId)
    .eq('active', true);
  if (error) throw new Error(error.message);

  const rules = (rawRules ?? []) as RuleRow[];

  let total = 0;
  let cursor = startMs;
  while (cursor < endMs) {
    const d = new Date(cursor);
    const nextHour = cursor + 60 * 60 * 1000;
    const segmentEnd = Math.min(nextHour, endMs);
    const frac = (segmentEnd - cursor) / (60 * 60 * 1000);
    const rule = pickRuleForInstant(rules, d);
    const hourCents = rule?.amount_cents ?? DEFAULT_HOUR_CENTS;
    total += Math.round(hourCents * frac);
    cursor = nextHour;
  }

  return Math.max(total, MIN_BOOKING_TOTAL_CENTS);
}
