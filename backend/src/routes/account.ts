import { Router, Request, Response } from 'express';
import { getPlayerAuthFromBearer } from '../lib/authPlayer';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getAccountDeletionGraceDays } from '../lib/accountDeletionConfig';
import { runAccountDeletionJob } from '../lib/accountDeletionJob';
import { cancelPlayerDeletionIfPending } from '../lib/cancelPlayerDeletion';

const router = Router();

function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers['x-cron-secret'] === secret;
}

async function logDeletionEvent(params: {
  playerId: string;
  authUserId: string | null;
  eventType: 'request' | 'cancel' | 'completed' | 'failed';
  requestedAt?: string | null;
  reason?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  await supabase.from('deletion_log').insert({
    player_id: params.playerId,
    auth_user_id: params.authUserId,
    event_type: params.eventType,
    requested_at: params.requestedAt ?? null,
    processed_at: new Date().toISOString(),
    reason: params.reason ?? null,
    error_message: params.errorMessage ?? null,
  });
}

/**
 * POST /account/delete
 * Marks account for deletion after grace period. No PII is removed yet.
 */
router.post('/delete', async (req: Request, res: Response) => {
  const { playerId, authUserId, error: authErr } = await getPlayerAuthFromBearer(req);
  if (authErr || !playerId) {
    return res.status(401).json({ ok: false, error: authErr ?? 'No autorizado' });
  }

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : null;
  const supabase = getSupabaseServiceRoleClient();

  const { data: player, error: fetchErr } = await supabase
    .from('players')
    .select('id, status, deletion_requested_at')
    .eq('id', playerId)
    .maybeSingle();

  if (fetchErr || !player) {
    return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });
  }

  const status = (player as { status: string }).status;
  if (status === 'deleted') {
    return res.status(409).json({ ok: false, error: 'La cuenta ya fue eliminada' });
  }
  if (status === 'pending_deletion') {
    const graceDays = getAccountDeletionGraceDays();
    return res.json({
      ok: true,
      already_requested: true,
      grace_days: graceDays,
      message: `Tu cuenta ya está programada para eliminarse. Puedes cancelar iniciando sesión antes de que venza el plazo de ${graceDays} días.`,
    });
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('players')
    .update({
      status: 'pending_deletion',
      deletion_requested_at: now,
      updated_at: now,
    })
    .eq('id', playerId)
    .eq('status', 'active');

  if (updateErr) {
    return res.status(500).json({ ok: false, error: updateErr.message });
  }

  await supabase.from('matchmaking_pool').delete().eq('player_id', playerId);

  await logDeletionEvent({
    playerId,
    authUserId,
    eventType: 'request',
    requestedAt: now,
    reason,
  });

  const graceDays = getAccountDeletionGraceDays();
  return res.json({
    ok: true,
    grace_days: graceDays,
    deletion_requested_at: now,
    message: `Tu cuenta se eliminará en ${graceDays} días. Puedes cancelar iniciando sesión de nuevo antes de esa fecha.`,
  });
});

/**
 * POST /account/cancel-deletion
 * Reverts a pending deletion within the grace period.
 */
router.post('/cancel-deletion', async (req: Request, res: Response) => {
  const { playerId, authUserId, error: authErr } = await getPlayerAuthFromBearer(req);
  if (authErr || !playerId) {
    return res.status(401).json({ ok: false, error: authErr ?? 'No autorizado' });
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data: player, error: fetchErr } = await supabase
    .from('players')
    .select('id, status, deletion_requested_at')
    .eq('id', playerId)
    .maybeSingle();

  if (fetchErr || !player) {
    return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });
  }

  const row = player as { status: string; deletion_requested_at: string | null };
  if (row.status !== 'pending_deletion') {
    return res.status(409).json({
      ok: false,
      error: row.status === 'deleted' ? 'La cuenta ya fue eliminada' : 'No hay una solicitud de borrado activa',
    });
  }

  const cancelled = await cancelPlayerDeletionIfPending(playerId, authUserId);
  if (!cancelled) {
    return res.status(500).json({ ok: false, error: 'No se pudo cancelar la solicitud' });
  }

  return res.json({
    ok: true,
    message: 'Solicitud de eliminación cancelada. Tu cuenta sigue activa.',
  });
});

/**
 * POST /account/process-deletions
 * Daily job: anonymize accounts past grace period. Protected by x-cron-secret.
 */
router.post('/process-deletions', async (req: Request, res: Response) => {
  if (!cronAuthorized(req)) {
    return res.status(403).json({ ok: false, error: 'No autorizado' });
  }

  try {
    const result = await runAccountDeletionJob();
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

export default router;
