import { Router, Request, Response } from 'express';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { computeSeasonPass, getOrCreateSeasonPassRow } from '../services/seasonPassService';
import { getActiveSeasonRow } from '../services/seasonPassSeasonConfig';
import { computeTrackLevels, listSpHowRows } from '../services/seasonPassMissions';
import { ackMissionCelebrations, buildSeasonPassState } from '../services/seasonPassEngine';

const router = Router();

/**
 * GET /season-pass/me?timezone=Europe/Madrid
 * Estado del pase: asigna (lazy) y evalúa las misiones del período, otorga SP
 * pendiente y devuelve misiones + celebraciones diferidas (notified_at null).
 */
router.get('/me', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const tz = String(req.query.timezone ?? 'UTC').trim() || 'UTC';
  try {
    const season = await getActiveSeasonRow();
    if (!season) {
      return res.status(503).json({
        ok: false,
        error:
          'Temporada del pase no configurada. Ejecutá la migración 050 (season_pass_seasons) y dejá una fila con active=true.',
      });
    }

    const state = await buildSeasonPassState(playerId!, season, tz);
    // After evaluation: fresh grants are already reflected in the SP row.
    const row = await getOrCreateSeasonPassRow(playerId!);
    const c = computeSeasonPass(row.sp, season.sp_per_level, season.max_level);
    const sp_how = await listSpHowRows(season.slug);
    const track_levels = computeTrackLevels(c.level, season.max_level, season.track_radius);

    return res.json({
      ok: true,
      season: {
        slug: season.slug,
        title: season.title,
        subtitle: season.subtitle,
        ends_at: season.ends_at,
        hero_chip_label: season.hero_chip_label,
        elite_card_subtitle: season.elite_card_subtitle,
        elite_modal_bullets: season.elite_modal_bullets,
      },
      sp: row.sp,
      has_elite: row.has_elite,
      sp_per_level: season.sp_per_level,
      level_max: season.max_level,
      mission_period_tabs: season.mission_period_tabs,
      missions: state.missions,
      pending_celebrations: state.pending_celebrations,
      sp_how,
      track_levels,
      next_milestone: null,
      ...c,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

/**
 * POST /season-pass/missions/ack
 * Marca celebraciones diferidas como vistas. Body: { ids: string[] } con ids
 * de asignación (assignment_id de pending_celebrations).
 */
router.post('/missions/ack', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const raw = (req.body?.ids ?? []) as unknown;
  const ids = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === 'string' && v.length > 0).slice(0, 100)
    : [];
  if (ids.length === 0) return res.status(400).json({ ok: false, error: 'ids requerido' });

  try {
    const acked = await ackMissionCelebrations(playerId!, ids);
    return res.json({ ok: true, acked });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
