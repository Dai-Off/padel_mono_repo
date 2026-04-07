import { Router, Request, Response } from 'express';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { planPromotionRelegation } from '../services/leaguePromotionService';

const router = Router();
router.use(attachAuthContext);

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

/**
 * @openapi
 * /leagues/seasons:
 *   get:
 *     tags: [Leagues]
 *     summary: Listar temporadas de ligas por club
 *     description: Devuelve temporadas con sus divisiones y equipos para el club indicado.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Club propietario de las ligas.
 *     responses:
 *       200:
 *         description: Temporadas cargadas
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, seasons: [] }
 *       400: { description: Falta club_id }
 *       403: { description: Sin acceso al club }
 */
router.get('/seasons', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const clubId = String(req.query.club_id ?? '').trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });

  const supabase = getSupabaseServiceRoleClient();
  const { data: seasons, error } = await supabase
    .from('league_seasons')
    .select('id, club_id, name, closed, created_at, updated_at, league_divisions(id, season_id, code, label, sort_order, promote_count, relegate_count, league_division_teams(id, division_id, team_label, sort_order))')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });
  const normalized = (seasons ?? []).map((s: any) => ({
    ...s,
    league_divisions: (s.league_divisions ?? []).map((d: any) => ({
      ...d,
      name: d.label ?? d.code ?? '',
      league_teams: (d.league_division_teams ?? []).map((t: any) => ({
        id: t.id,
        division_id: t.division_id,
        name: t.team_label,
        sort_order: t.sort_order,
      })),
    })),
  }));
  return res.json({ ok: true, seasons: normalized });
});

/**
 * @openapi
 * /leagues/seasons:
 *   post:
 *     tags: [Leagues]
 *     summary: Crear temporada de liga
 *     description: Crea una temporada para un club y tres divisiones base.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, name]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               name: { type: string }
 *           examples:
 *             sample:
 *               value: { club_id: "9d6c8d6f-9132-4a50-96db-1d85fbc5f6e4", name: "Liga Invierno 2026" }
 *     responses:
 *       200: { description: Temporada creada }
 *       400: { description: Datos inválidos }
 *       403: { description: Sin acceso al club }
 */
router.post('/seasons', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const clubId = String(req.body?.club_id ?? '').trim();
  const name = String(req.body?.name ?? '').trim();
  if (!clubId || !name) return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });

  const supabase = getSupabaseServiceRoleClient();
  const { data: season, error } = await supabase
    .from('league_seasons')
    .insert({ club_id: clubId, name, closed: false })
    .select('id, club_id, name, closed, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });

  const divisions = [
    { season_id: season.id, code: 'primera', label: 'Primera', level_index: 0, sort_order: 1, promote_count: 0, relegate_count: 2 },
    { season_id: season.id, code: 'segunda', label: 'Segunda', level_index: 1, sort_order: 2, promote_count: 2, relegate_count: 2 },
    { season_id: season.id, code: 'tercera', label: 'Tercera', level_index: 2, sort_order: 3, promote_count: 2, relegate_count: 0 },
  ];
  const { error: divErr } = await supabase.from('league_divisions').insert(divisions);
  if (divErr) return res.status(500).json({ ok: false, error: divErr.message });

  return res.json({ ok: true, season });
});

/**
 * @openapi
 * /leagues/seasons/{seasonId}/teams:
 *   post:
 *     tags: [Leagues]
 *     summary: Añadir equipo a división
 *     description: Agrega un equipo/pareja dentro de una división concreta de la temporada.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: seasonId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [division_id, name]
 *             properties:
 *               division_id: { type: string, format: uuid }
 *               name: { type: string }
 *     responses:
 *       200: { description: Equipo añadido }
 *       400: { description: Datos inválidos }
 *       403: { description: Sin acceso al club }
 *       404: { description: Temporada no encontrada }
 */
router.post('/seasons/:seasonId/teams', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const seasonId = req.params.seasonId;
  const divisionId = String(req.body?.division_id ?? '').trim();
  const name = String(req.body?.name ?? '').trim();
  if (!divisionId || !name) return res.status(400).json({ ok: false, error: 'division_id y name son obligatorios' });

  const supabase = getSupabaseServiceRoleClient();
  const { data: season, error: seasonErr } = await supabase
    .from('league_seasons')
    .select('id, club_id, closed')
    .eq('id', seasonId)
    .maybeSingle();
  if (seasonErr) return res.status(500).json({ ok: false, error: seasonErr.message });
  if (!season) return res.status(404).json({ ok: false, error: 'Temporada no encontrada' });
  if (!canAccessClub(req, String((season as { club_id: string }).club_id))) {
    return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  }
  if ((season as { closed: boolean }).closed) {
    return res.status(400).json({ ok: false, error: 'La temporada está cerrada' });
  }

  const { data: maxRow, error: maxErr } = await supabase
    .from('league_division_teams')
    .select('sort_order')
    .eq('division_id', divisionId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) return res.status(500).json({ ok: false, error: maxErr.message });
  const sortOrder = Number((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

  const { data: team, error } = await supabase
    .from('league_division_teams')
    .insert({ division_id: divisionId, team_label: name, sort_order: sortOrder })
    .select('id, division_id, team_label, sort_order, created_at')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({
    ok: true,
    team: team
      ? {
          id: (team as any).id,
          division_id: (team as any).division_id,
          name: (team as any).team_label,
          sort_order: (team as any).sort_order,
          created_at: (team as any).created_at,
        }
      : null,
  });
});

/**
 * @openapi
 * /leagues/seasons/{seasonId}/close-and-promote:
 *   post:
 *     tags: [Leagues]
 *     summary: Cerrar temporada y aplicar ascensos/descensos
 *     description: Calcula movimientos por división (promote_count/relegate_count), actualiza equipos y cierra la temporada.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: seasonId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Movimientos aplicados y temporada cerrada
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   moved: 4
 *       400: { description: Temporada ya cerrada }
 *       403: { description: Sin acceso al club }
 *       404: { description: Temporada no encontrada }
 */
router.post('/seasons/:seasonId/close-and-promote', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const seasonId = req.params.seasonId;
  const supabase = getSupabaseServiceRoleClient();

  const { data: season, error: seasonErr } = await supabase
    .from('league_seasons')
    .select('id, club_id, closed')
    .eq('id', seasonId)
    .maybeSingle();
  if (seasonErr) return res.status(500).json({ ok: false, error: seasonErr.message });
  if (!season) return res.status(404).json({ ok: false, error: 'Temporada no encontrada' });
  if (!canAccessClub(req, String((season as { club_id: string }).club_id))) {
    return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  }
  if ((season as { closed: boolean }).closed) {
    return res.status(400).json({ ok: false, error: 'La temporada ya está cerrada' });
  }

  const { data: divisions, error: divErr } = await supabase
    .from('league_divisions')
    .select('id, season_id, sort_order, promote_count, relegate_count')
    .eq('season_id', seasonId)
    .order('sort_order', { ascending: true });
  if (divErr) return res.status(500).json({ ok: false, error: divErr.message });

  const divisionIds = (divisions ?? []).map((d) => (d as { id: string }).id);
  const { data: teams, error: teamErr } = await supabase
    .from('league_division_teams')
    .select('id, team_label, sort_order, division_id')
    .in('division_id', divisionIds.length ? divisionIds : ['00000000-0000-0000-0000-000000000000']);
  if (teamErr) return res.status(500).json({ ok: false, error: teamErr.message });

  const planned = planPromotionRelegation(
    (divisions ?? []) as Array<{ id: string; season_id: string; sort_order: number; promote_count: number; relegate_count: number }>,
    ((teams ?? []) as Array<{ id: string; team_label: string; sort_order: number; division_id: string }>).map((t) => ({
      id: t.id,
      name: t.team_label,
      sort_order: t.sort_order,
      division_id: t.division_id,
    }))
  );

  for (const mv of planned) {
    const { error } = await supabase.from('league_division_teams').update({ division_id: mv.to_division_id }).eq('id', mv.team_id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
  }

  const { error: closeErr } = await supabase
    .from('league_seasons')
    .update({ closed: true })
    .eq('id', seasonId);
  if (closeErr) return res.status(500).json({ ok: false, error: closeErr.message });

  return res.json({ ok: true, moved: planned.length, movements: planned });
});

export default router;
