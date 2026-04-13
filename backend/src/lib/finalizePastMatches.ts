import { getSupabaseServiceRoleClient } from './supabase';

/**
 * Marca como finished los partidos cuya reserva ya terminó (bookings.end_at < now).
 * No requiere acción humana: alinea `matches.status` con la realidad horaria.
 * Idempotente: volver a llamar no cambia filas ya finished/cancelled.
 */
export async function finalizePastMatches(): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from('matches')
    .select('id, bookings!inner(end_at)')
    .in('status', ['pending', 'in_progress'])
    .lt('bookings.end_at', nowIso);

  if (error) {
    console.error('[finalizePastMatches] select failed:', error.message);
    return 0;
  }

  const toUpdate = (rows ?? [])
    .map((r: { id: string; bookings: { end_at: string } | { end_at: string }[] }) => {
      const b = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
      return { id: r.id, end_at: b?.end_at };
    })
    .filter((r) => r.id && r.end_at);
  if (toUpdate.length === 0) return 0;

  for (const row of toUpdate) {
    const deadlineIso = new Date(new Date(row.end_at).getTime() + 2 * 60 * 60 * 1000).toISOString();
    const { error: upErr } = await supabase
      .from('matches')
      .update({ status: 'finished', updated_at: nowIso, payment_deadline_at: deadlineIso })
      .eq('id', row.id);
    if (upErr) console.error('[finalizePastMatches] update failed:', upErr.message);
  }
  const ids = toUpdate.map((r) => r.id);
  return ids.length;
}

let lastThrottledRun = 0;
const THROTTLE_MS = 60_000;

/** Listados: como mucho una pasada de cierre al minuto para no multiplicar lecturas/escrituras. */
export async function finalizePastMatchesThrottled(): Promise<void> {
  const now = Date.now();
  if (now - lastThrottledRun < THROTTLE_MS) return;
  lastThrottledRun = now;
  await finalizePastMatches();
}
