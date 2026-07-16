import { Router, Request, Response } from 'express';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { computeSeasonPass, getOrCreateSeasonPassRow } from '../services/seasonPassService';
import { getActiveSeasonRow } from '../services/seasonPassSeasonConfig';
import { computeTrackLevels, listSpHowRows } from '../services/seasonPassMissions';
import {
  ackMissionCelebrations,
  buildSeasonPassState,
  rerollMission,
} from '../services/seasonPassEngine';
import {
  ackRewardGrants,
  buildRewardDisplay,
  claimAllRewards,
  claimSingleReward,
  listGrantedRewardIds,
  loadSeasonRewards,
} from '../services/seasonPassRewards';
import { getActiveSpBonus } from '../services/seasonPassBoosts';

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

    // Perf tanda 1: lecturas independientes de la evaluación y de la SP row.
    // (Claim manual: NO se auto-otorga; cada nivel alcanzado y no reclamado
    //  queda `claimable`.)
    const [state, sp_how, seasonRewards, grantedIds] = await Promise.all([
      buildSeasonPassState(playerId!, season, tz),
      listSpHowRows(season.slug),
      loadSeasonRewards(season.slug),
      listGrantedRewardIds(playerId!),
    ]);
    // Tanda 2 (tras la evaluación, para que el SP y el conteo de misiones estén
    // ya persistidos): la SP row y el boost. El boost incluye el catch-up, que
    // cuenta misiones completadas, así que debe leerse DESPUÉS de la evaluación.
    const [row, activeBoost] = await Promise.all([
      getOrCreateSeasonPassRow(playerId!),
      getActiveSpBonus(playerId!, { tz, season }),
    ]);
    const c = computeSeasonPass(row.sp, season.sp_per_level, season.max_level);
    const track_levels = computeTrackLevels(c.level, season.max_level, season.track_radius);
    const tiers: ('free' | 'elite')[] = row.has_elite ? ['free', 'elite'] : ['free'];
    const boosts = {
      total_bonus: Math.min(activeBoost.total, Math.max(0, Number(season.boost_cap ?? 2) - 1)),
      breakdown: activeBoost.breakdown,
    };

    // Track completo 1..max_level (bloque C): el cliente pinta todos los
    // niveles y hace scroll; los que no tienen recompensa salen como nodo
    // simple. track_levels (radio) se mantiene por compatibilidad.
    let claimable_count = 0;
    const allTrackLevels = Array.from({ length: season.max_level }, (_, i) => i + 1);
    const track_rewards = allTrackLevels.map((level) => ({
      level,
      current: level === c.level,
      unlocked: level <= c.level,
      rewards: seasonRewards
        .filter((r) => r.level === level)
        .map((r) => {
          const reached = level <= c.level && (r.tier === 'free' || row.has_elite);
          const status = grantedIds.has(r.id) ? 'claimed' : reached ? 'claimable' : 'locked';
          if (status === 'claimable') claimable_count += 1;
          return {
            id: r.id,
            tier: r.tier,
            reward_type: r.reward_type,
            display: buildRewardDisplay(r),
            status,
          };
        }),
    }));

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
      reroll: state.reroll,
      sp_how,
      track_levels,
      track_rewards,
      claimable_count,
      boosts,
      next_milestone: null,
      ...c,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

/**
 * GET /season-pass/estado?timezone=Europe/Madrid
 * La mitad RÁPIDA del /me: hero + track sin evaluación de misiones. Todas las
 * lecturas son baratas/cacheadas, así que van en una única tanda (sin la
 * restricción "boost después de la evaluación" del /me: aquí no hay
 * evaluación). El cliente lo pinta primero y pide /misiones en paralelo.
 */
router.get('/estado', async (req: Request, res: Response) => {
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

    const [sp_how, seasonRewards, grantedIds, row, activeBoost] = await Promise.all([
      listSpHowRows(season.slug),
      loadSeasonRewards(season.slug),
      listGrantedRewardIds(playerId!),
      getOrCreateSeasonPassRow(playerId!),
      getActiveSpBonus(playerId!, { tz, season }),
    ]);
    const c = computeSeasonPass(row.sp, season.sp_per_level, season.max_level);
    const track_levels = computeTrackLevels(c.level, season.max_level, season.track_radius);
    const boosts = {
      total_bonus: Math.min(activeBoost.total, Math.max(0, Number(season.boost_cap ?? 2) - 1)),
      breakdown: activeBoost.breakdown,
    };

    let claimable_count = 0;
    const allTrackLevels = Array.from({ length: season.max_level }, (_, i) => i + 1);
    const track_rewards = allTrackLevels.map((level) => ({
      level,
      current: level === c.level,
      unlocked: level <= c.level,
      rewards: seasonRewards
        .filter((r) => r.level === level)
        .map((r) => {
          const reached = level <= c.level && (r.tier === 'free' || row.has_elite);
          const status = grantedIds.has(r.id) ? 'claimed' : reached ? 'claimable' : 'locked';
          if (status === 'claimable') claimable_count += 1;
          return {
            id: r.id,
            tier: r.tier,
            reward_type: r.reward_type,
            display: buildRewardDisplay(r),
            status,
          };
        }),
    }));

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
      sp_how,
      track_levels,
      track_rewards,
      claimable_count,
      boosts,
      next_milestone: null,
      ...c,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

/**
 * GET /season-pass/misiones?timezone=Europe/Madrid
 * La mitad LENTA del /me: asigna (lazy) y evalúa las misiones del período,
 * otorga SP pendiente y devuelve misiones, reroll y celebraciones diferidas.
 * Incluye sp/level post-evaluación: si la evaluación otorgó SP, el cliente
 * lo compara con su /estado cacheado y lo refresca.
 */
router.get('/misiones', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const tz = String(req.query.timezone ?? 'UTC').trim() || 'UTC';
  try {
    const season = await getActiveSeasonRow();
    if (!season) return res.status(503).json({ ok: false, error: 'Sin temporada activa' });

    const state = await buildSeasonPassState(playerId!, season, tz);
    // La SP row se lee tras la evaluación (igual que en /me) para reflejar
    // el SP recién otorgado por misiones completadas.
    const row = await getOrCreateSeasonPassRow(playerId!);
    const c = computeSeasonPass(row.sp, season.sp_per_level, season.max_level);

    return res.json({
      ok: true,
      mission_period_tabs: season.mission_period_tabs,
      missions: state.missions,
      pending_celebrations: state.pending_celebrations,
      reroll: state.reroll,
      sp: row.sp,
      level: c.level,
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

/**
 * POST /season-pass/missions/:id/reroll?timezone=Europe/Madrid
 * Reroll v1 (gratis): descarta una misión del pool (diaria o semanal) del
 * período actual y la sustituye por otra elegida determinísticamente.
 * Cuota: 1/día para diarias y 1/semana para semanales.
 */
router.post('/missions/:id/reroll', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const tz = String(req.query.timezone ?? 'UTC').trim() || 'UTC';

  try {
    const season = await getActiveSeasonRow();
    if (!season) return res.status(503).json({ ok: false, error: 'Sin temporada activa' });

    const result = await rerollMission(playerId!, season, tz, String(req.params.id));
    if (!result.ok) {
      const status =
        result.code === 'not_found' ? 404 : result.code === 'limit_reached' ? 409 : 400;
      return res.status(status).json({ ok: false, error: result.code });
    }
    return res.json({ ok: true, new_mission: result.new_mission });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /season-pass/rewards/ack
 * Marca recompensas celebradas como vistas. Body: { ids: string[] } con ids
 * de recompensa (`track_rewards[].rewards[].id`). Los cosméticos además
 * siguen su propio flujo de modal vía player_unlockables.notified_at.
 */
router.post('/rewards/ack', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const raw = (req.body?.ids ?? []) as unknown;
  const ids = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === 'string' && v.length > 0).slice(0, 100)
    : [];
  if (ids.length === 0) return res.status(400).json({ ok: false, error: 'ids requerido' });

  try {
    const acked = await ackRewardGrants(playerId!, ids);
    return res.json({ ok: true, acked });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /season-pass/rewards/claim-all
 * Reclama todas las recompensas reclamables (nivel alcanzado, carril disponible,
 * no reclamadas). Devuelve la lista reclamada para la celebración.
 */
router.post('/rewards/claim-all', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  try {
    const season = await getActiveSeasonRow();
    if (!season) return res.status(503).json({ ok: false, error: 'Sin temporada activa' });
    const rewards = await claimAllRewards(playerId!, season);
    return res.json({ ok: true, rewards, count: rewards.length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /season-pass/rewards/:rewardId/claim
 * Reclama una recompensa concreta del track ya alcanzada.
 */
router.post('/rewards/:rewardId/claim', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  try {
    const season = await getActiveSeasonRow();
    if (!season) return res.status(503).json({ ok: false, error: 'Sin temporada activa' });
    const result = await claimSingleReward(playerId!, season, String(req.params.rewardId));
    if (!result.ok) {
      const status =
        result.code === 'not_found' ? 404 : result.code === 'needs_elite' ? 403 : 409;
      return res.status(status).json({ ok: false, error: result.code });
    }
    return res.json({ ok: true, reward: result.reward });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
