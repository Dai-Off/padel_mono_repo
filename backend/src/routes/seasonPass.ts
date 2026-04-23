import { Router, Request, Response } from 'express';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { computeSeasonPass, getOrCreateSeasonPassRow } from '../services/seasonPassService';
import { getActiveSeasonRow } from '../services/seasonPassSeasonConfig';
import {
  buildMissionsForPlayer,
  computeTrackLevels,
  listSpHowRows,
} from '../services/seasonPassMissions';
import { ensureLessonSpGrantedForToday } from '../services/seasonPassLessonSpRepair';

const router = Router();

/**
 * GET /season-pass/me?timezone=Europe/Madrid
 * Estado del pase + misiones evaluadas + textos desde BD (migración 050).
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

    await ensureLessonSpGrantedForToday(playerId!, tz);

    const row = await getOrCreateSeasonPassRow(playerId!);
    const c = computeSeasonPass(row.sp, season.sp_per_level, season.max_level);
    const { missions, daily_lesson_sp_preview } = await buildMissionsForPlayer(playerId!, season, tz);
    let sp_how = await listSpHowRows(season.slug);
    if (sp_how.length === 0) {
      sp_how = [
        {
          icon: '📚',
          label: 'Lección diaria',
          sp_hint: `Con tu racha actual: ~${daily_lesson_sp_preview} SP (base ${season.lesson_sp_base} + bonus racha en Aprendizaje).`,
        },
      ];
    } else {
      sp_how = sp_how.map((r) =>
        r.label.trim() === 'Lección diaria'
          ? {
              ...r,
              sp_hint: `Con tu racha actual: ~${daily_lesson_sp_preview} SP (base ${season.lesson_sp_base} + bonus racha en Aprendizaje).`,
            }
          : r
      );
    }
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
      lesson_sp_base: season.lesson_sp_base,
      level_max: season.max_level,
      mission_period_tabs: season.mission_period_tabs,
      missions,
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

export default router;
