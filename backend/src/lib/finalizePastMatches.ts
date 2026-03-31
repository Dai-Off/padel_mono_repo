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

  const ids = (rows ?? []).map((r: { id: string }) => r.id).filter(Boolean);
  if (ids.length === 0) return 0;

  const { error: upErr } = await supabase
    .from('matches')
    .update({ status: 'finished', updated_at: nowIso })
    .in('id', ids);

  if (upErr) {
    console.error('[finalizePastMatches] update failed:', upErr.message);
    return 0;
  }

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
