import { getSupabaseServiceRoleClient } from './supabase';

async function autoConfirmExpiredVotes(): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: matchesToConfirm, error: selectErr } = await supabase
    .from('matches')
    .select('id, competitive, type')
    .eq('score_status', 'pending_votes')
    .lt('score_proposed_at', twentyFourHoursAgo);

  if (selectErr) {
    console.error('[autoConfirmExpiredVotes] select failed:', selectErr.message);
    return;
  }

  if (matchesToConfirm && matchesToConfirm.length > 0) {
    const { runLevelingPipeline, applyFriendlyPlayCounts } = require('../services/levelingService');
    const { matchAffectsElo } = require('./openMatchRules');
    const { runFraudCheck } = require('../services/fraudService');

    for (const match of matchesToConfirm) {
      const now = new Date().toISOString();
      const { data: upd, error: updErr } = await supabase
        .from('matches')
        .update({ score_status: 'confirmed', score_confirmed_at: now, updated_at: now })
        .eq('id', match.id)
        .eq('score_status', 'pending_votes')
        .select('id')
        .maybeSingle();

      if (updErr) {
        console.error('[autoConfirmExpiredVotes] update failed for match:', match.id, updErr.message);
        continue;
      }

      if (upd) {
        const affectsElo = matchAffectsElo(!!match.competitive, match.type);
        try {
          if (affectsElo) {
            await runLevelingPipeline(match.id);
            runFraudCheck(match.id).catch((e: any) => console.error('[autoConfirm fraud]', e));
          } else {
            await applyFriendlyPlayCounts(match.id);
          }
        } catch (pipelineErr) {
          console.error('[autoConfirmExpiredVotes] pipeline failed for match:', match.id, pipelineErr);
          await supabase
            .from('matches')
            .update({
              score_status: 'pending_votes',
              score_confirmed_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', match.id);
        }
      }
    }
  }
}

/**
 * Marca como finished los partidos cuya reserva ya terminó (bookings.end_at < now).
 * No requiere acción humana: alinea `matches.status` con la realidad horaria.
 * Idempotente: volver a llamar no cambia filas ya finished/cancelled.
 */
export async function finalizePastMatches(): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();

  // Ejecuta la auto-confirmación de partidos con votos pendientes expirados (> 24h)
  try {
    await autoConfirmExpiredVotes();
  } catch (err) {
    console.error('[finalizePastMatches] autoConfirmExpiredVotes failed:', err);
  }

  // Incluye todos los estados "activos" — no solo 'pending'/'in_progress'.
  // En este sistema los partidos se crean con status 'open' o 'full'.
  const ACTIVE_STATUSES = ['open', 'full', 'pending', 'in_progress'];
  const { data: rows, error } = await supabase
    .from('matches')
    .select('id, bookings!inner(end_at)')
    .in('status', ACTIVE_STATUSES)
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
