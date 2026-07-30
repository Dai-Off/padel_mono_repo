import { cancelIncompletePastMatches } from './incompleteMatchCancel';
import { SCORE_DISPUTE_GRACE_HOURS, SCORE_REPORT_WINDOW_HOURS } from './levelingConstants';
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
 * Estados de marcador que pueden caducar a no_result. pending_confirmation y
 * disputed_pending son del flujo legacy (la app ya no llama a /score/confirm ni
 * /score/dispute): sin expiración quedarían atascados para siempre.
 */
const EXPIRABLE_SCORE_STATUSES = ['pending', 'pending_confirmation', 'disputed_pending'];
/** Lote por ejecución: acota la URL de los .in() y la latencia del hot path. */
const EXPIRE_BATCH_SIZE = 500;
const EXPIRE_CHUNK_SIZE = 100;

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Partidos finished cuya reserva terminó hace más de SCORE_REPORT_WINDOW_HOURS
 * sin resultado: pasan a no_result. Sin ELO, sin play counts — el partido queda
 * como "sin resultado" y deja de ser accionable.
 *
 * Excepciones que alargan la ventana (acotadas):
 * - pending_votes no entra aquí: lo resuelve autoConfirmExpiredVotes (24h).
 * - Con propuesta previa (score_submissions) o estado legacy con propuesta:
 *   gracia de SCORE_DISPUTE_GRACE_HOURS desde el último movimiento (updated_at)
 *   antes de cerrar a no_result.
 */
async function expireUnreportedScores(): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const nowMs = Date.now();
  const cutoffIso = new Date(nowMs - SCORE_REPORT_WINDOW_HOURS * 3600 * 1000).toISOString();

  const { data: rows, error: selectErr } = await supabase
    .from('matches')
    .select('id, score_status, updated_at, bookings!inner(end_at)')
    .eq('status', 'finished')
    .in('score_status', EXPIRABLE_SCORE_STATUSES)
    .lt('bookings.end_at', cutoffIso)
    .limit(EXPIRE_BATCH_SIZE);

  if (selectErr) {
    console.error('[expireUnreportedScores] select failed:', selectErr.message);
    return;
  }

  const candidates = (rows ?? []).filter((r: { id: string }) => Boolean(r.id));
  if (candidates.length === 0) return;

  const withProposalIds = new Set<string>();
  for (const chunk of chunked(candidates.map((r: { id: string }) => r.id), EXPIRE_CHUNK_SIZE)) {
    const { data: subs, error: subsErr } = await supabase
      .from('score_submissions')
      .select('match_id')
      .in('match_id', chunk);
    if (subsErr) {
      console.error('[expireUnreportedScores] submissions select failed:', subsErr.message);
      return;
    }
    for (const s of subs ?? []) withProposalIds.add((s as { match_id: string }).match_id);
  }

  const graceMs = SCORE_DISPUTE_GRACE_HOURS * 3600 * 1000;
  const ids = candidates
    .filter((r: { id: string; score_status?: string; updated_at?: string | null }) => {
      const hadProposal = withProposalIds.has(r.id) || r.score_status !== 'pending';
      if (!hadProposal) return true;
      const lastMoveMs = r.updated_at ? new Date(r.updated_at).getTime() : NaN;
      return !Number.isFinite(lastMoveMs) || nowMs >= lastMoveMs + graceMs;
    })
    .map((r: { id: string }) => r.id);
  if (ids.length === 0) return;

  let expired = 0;
  for (const chunk of chunked(ids, EXPIRE_CHUNK_SIZE)) {
    const { error: updErr } = await supabase
      .from('matches')
      .update({ score_status: 'no_result', updated_at: new Date().toISOString() })
      .in('id', chunk)
      .in('score_status', EXPIRABLE_SCORE_STATUSES);
    if (updErr) {
      console.error('[expireUnreportedScores] update failed:', updErr.message);
      return;
    }
    expired += chunk.length;
  }
  if (expired > 0) console.log(`[expireUnreportedScores] expired ${expired} matches to no_result`);
}

type FinalizePastMatchesOpts = {
  /** Reembolsos Stripe + cancelación masiva: solo cron (`run-debt-settlement`), no listados. */
  cancelIncomplete?: boolean;
};

/**
 * Marca como finished los partidos completos (4 jugadores) cuya reserva ya terminó.
 * Opcionalmente cancela incompletos vencidos (solo vía cron; ver `cancelIncomplete`).
 * Idempotente: volver a llamar no cambia filas ya finished/cancelled.
 */
export async function finalizePastMatches(
  opts?: FinalizePastMatchesOpts,
): Promise<{ finished: number; cancelled: number }> {
  const supabase = getSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();

  // Ejecuta la auto-confirmación de partidos con votos pendientes expirados (> 24h)
  try {
    await autoConfirmExpiredVotes();
  } catch (err) {
    console.error('[finalizePastMatches] autoConfirmExpiredVotes failed:', err);
  }

  // Cierra sin resultado los partidos que nadie reportó dentro de la ventana.
  try {
    await expireUnreportedScores();
  } catch (err) {
    console.error('[finalizePastMatches] expireUnreportedScores failed:', err);
  }

  let cancelled = 0;
  if (opts?.cancelIncomplete) {
    try {
      cancelled = await cancelIncompletePastMatches();
    } catch (err) {
      console.error('[finalizePastMatches] cancelIncompletePastMatches failed:', err);
    }
  }

  // Solo partidos con 4 jugadores pasan a finished al cerrar el turno.
  const ACTIVE_STATUSES = ['open', 'full', 'pending', 'in_progress'];
  const { data: rows, error } = await supabase
    .from('matches')
    .select('id, match_players(id), bookings!inner(end_at)')
    .in('status', ACTIVE_STATUSES)
    .lt('bookings.end_at', nowIso);

  if (error) {
    console.error('[finalizePastMatches] select failed:', error.message);
    return { finished: 0, cancelled };
  }

  const toUpdate = (rows ?? [])
    .map((r: { id: string; match_players?: unknown[]; bookings: { end_at: string } | { end_at: string }[] }) => {
      const b = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
      const playerCount = (r.match_players ?? []).length;
      if (playerCount < 4) return null;
      return { id: r.id, end_at: b?.end_at };
    })
    .filter((r): r is { id: string; end_at: string } => r != null && Boolean(r.id && r.end_at));
  if (toUpdate.length === 0) return { finished: 0, cancelled };

  for (const row of toUpdate) {
    const deadlineIso = new Date(new Date(row.end_at).getTime() + 2 * 60 * 60 * 1000).toISOString();
    const { error: upErr } = await supabase
      .from('matches')
      .update({ status: 'finished', updated_at: nowIso, payment_deadline_at: deadlineIso })
      .eq('id', row.id);
    if (upErr) console.error('[finalizePastMatches] update failed:', upErr.message);
  }
  return { finished: toUpdate.length, cancelled };
}

let lastThrottledRun = 0;
const THROTTLE_MS = 60_000;

/** Listados: cierre rápido al minuto; sin cancelaciones masivas ni Stripe en el hot path. */
export async function finalizePastMatchesThrottled(): Promise<void> {
  const now = Date.now();
  if (now - lastThrottledRun < THROTTLE_MS) return;
  lastThrottledRun = now;
  await finalizePastMatches({ cancelIncomplete: false });
}
