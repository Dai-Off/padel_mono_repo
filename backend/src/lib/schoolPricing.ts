export type SchoolTimeBand = 'morning' | 'afternoon' | 'weekend';
export type SchoolWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export function resolveTimeBand(weekday: SchoolWeekday, startTime: string): SchoolTimeBand {
  if (weekday === 'sat' || weekday === 'sun') return 'weekend';
  const hour = Number(startTime.slice(0, 2));
  if (!Number.isFinite(hour)) return 'afternoon';
  return hour < 14 ? 'morning' : 'afternoon';
}

export async function lookupFeeRulePriceCents(
  supabase: { from: (table: string) => any },
  clubId: string,
  groupSize: 1 | 2 | 3 | 4,
  weekday: SchoolWeekday,
  startTime: string,
  staffId?: string | null,
): Promise<number | null> {
  const timeBand = resolveTimeBand(weekday, startTime);
  const staffKey = typeof staffId === 'string' ? staffId.trim() : '';

  if (staffKey) {
    const { data: staffRule, error: staffErr } = await supabase
      .from('club_school_fee_rules')
      .select('price_cents')
      .eq('club_id', clubId)
      .eq('staff_id', staffKey)
      .eq('group_size', groupSize)
      .eq('time_band', timeBand)
      .eq('is_active', true)
      .maybeSingle();
    if (!staffErr && staffRule) {
      const cents = Number((staffRule as { price_cents?: number }).price_cents ?? 0);
      if (Number.isFinite(cents) && cents >= 0) return Math.round(cents);
    }
  }

  const { data, error } = await supabase
    .from('club_school_fee_rules')
    .select('price_cents')
    .eq('club_id', clubId)
    .is('staff_id', null)
    .eq('group_size', groupSize)
    .eq('time_band', timeBand)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) return null;
  const cents = Number((data as { price_cents?: number }).price_cents ?? 0);
  return Number.isFinite(cents) && cents >= 0 ? Math.round(cents) : null;
}

export async function resolvePriceTypeCents(
  supabase: { from: (table: string) => any },
  priceTypeId: string | null | undefined,
): Promise<number | null> {
  if (!priceTypeId) return null;
  const { data, error } = await supabase
    .from('club_school_price_types')
    .select('price_cents, is_active')
    .eq('id', priceTypeId)
    .maybeSingle();
  if (error || !data || (data as { is_active?: boolean }).is_active === false) return null;
  const cents = Number((data as { price_cents?: number }).price_cents ?? 0);
  return Number.isFinite(cents) && cents >= 0 ? Math.round(cents) : null;
}
