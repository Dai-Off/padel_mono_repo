import { getSupabaseServiceRoleClient } from './supabase';

const KNOWN_TYPES = [
  'standard',
  'open_match',
  'pozo',
  'fixed_recurring',
  'school_group',
  'school_individual',
  'flat_rate',
  'tournament',
  'blocked',
] as const;

export type KnownReservationType = (typeof KNOWN_TYPES)[number];

function defaultAllowOnline(t: string): boolean {
  return t === 'standard' || t === 'open_match';
}

export type SupabaseAdmin = ReturnType<typeof getSupabaseServiceRoleClient>;

/** Lee allow_online por tipo para un club (fallback si falta fila o columna en BD antigua). */
export async function fetchAllowOnlineByType(
  supabase: SupabaseAdmin,
  clubId: string,
): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const t of KNOWN_TYPES) out[t] = defaultAllowOnline(t);

  let data: { reservation_type?: string; allow_online?: boolean }[] | null = null;
  const q1 = await supabase
    .from('reservation_type_prices')
    .select('reservation_type, allow_online')
    .eq('club_id', clubId);
  if (q1.error) {
    const msg = String(q1.error.message ?? '').toLowerCase();
    if (msg.includes('allow_online') || msg.includes('column')) {
      const q2 = await supabase.from('reservation_type_prices').select('reservation_type').eq('club_id', clubId);
      if (q2.error) throw q2.error;
      data = q2.data ?? [];
    } else throw q1.error;
  } else {
    data = q1.data ?? [];
  }
  for (const row of data) {
    const rt = String((row as { reservation_type?: string }).reservation_type ?? '');
    if (!rt) continue;
    const ao = (row as { allow_online?: boolean }).allow_online;
    out[rt] = typeof ao === 'boolean' ? ao : defaultAllowOnline(rt);
  }
  return out;
}

export function isOnlineSourceChannel(ch: string | undefined | null): boolean {
  return ch === 'mobile' || ch === 'web' || ch === 'app';
}

export function assertReservationTypeAllowedOnline(
  allowMap: Record<string, boolean>,
  reservationType: string,
  sourceChannel: string | undefined | null,
): { ok: true } | { ok: false; error: string } {
  if (!isOnlineSourceChannel(sourceChannel)) return { ok: true };
  const allowed = allowMap[reservationType] ?? defaultAllowOnline(reservationType);
  if (!allowed) {
    return {
      ok: false,
      error: `El tipo de reserva «${reservationType}» no está disponible para reserva online. Contacta al club o reserva en recepción.`,
    };
  }
  return { ok: true };
}
