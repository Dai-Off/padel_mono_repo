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

const ENTRY_PLAYER_EMBED = 'player1:players!league_division_teams_player_id_1_fkey(id, first_name, last_name, email, elo_rating, avatar_url), player2:players!league_division_teams_player_id_2_fkey(id, first_name, last_name, email, elo_rating, avatar_url)';
const ENTRY_SELECT = `id, division_id, team_label, sort_order, player_id_1, player_id_2, ${ENTRY_PLAYER_EMBED}`;
const DIVISION_SELECT = `id, season_id, code, label, sort_order, promote_count, relegate_count, elo_min, elo_max, league_division_teams(${ENTRY_SELECT})`;

function normalizeEntry(t: any) {
  return {
    id: t.id,
    division_id: t.division_id,
    name: t.team_label,
    sort_order: t.sort_order,
    player_id_1: t.player_id_1 ?? null,
    player_id_2: t.player_id_2 ?? null,
    player1: t.player1 ?? null,
    player2: t.player2 ?? null,
  };
}

function normalizeSeason(s: any) {
  return {
    ...s,
    mode: s.mode ?? 'individual',
    league_divisions: (s.league_divisions ?? []).map((d: any) => ({
      ...d,
      name: d.label ?? d.code ?? '',
      elo_min: d.elo_min ?? null,
      elo_max: d.elo_max ?? null,
      league_teams: (d.league_division_teams ?? []).map(normalizeEntry),
    })),
  };
}

/**
 * @openapi
 * /leagues/seasons:
 *   get:
 *     tags: [Leagues]
 *     summary: Listar temporadas de ligas por club
 *     description: Devuelve temporadas con divisiones, entradas (jugadores/parejas) y datos de jugador embebidos.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
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
    .select(`id, club_id, name, closed, mode, created_at, updated_at, league_divisions(${DIVISION_SELECT})`)
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, seasons: (seasons ?? []).map(normalizeSeason) });
});

/**
 * @openapi
 * /leagues/seasons:
 *   post:
 *     tags: [Leagues]
 *     summary: Crear temporada de liga
 *     description: |
 *       Crea una temporada con divisiones configurables. Si no se envían, se crean tres por defecto.
 *       Cada división puede tener rango Elo para auto-ubicar jugadores.
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
 *               mode: { type: string, enum: [individual, pairs], description: 'individual o pairs' }
 *               divisions:
 *                 type: array
 *                 description: 'Divisiones personalizadas (label, elo_min, elo_max). Si se omite, se crean 3 por defecto.'
 *                 items:
 *                   type: object
 *                   properties:
 *                     label: { type: string }
 *                     elo_min: { type: integer, nullable: true }
 *                     elo_max: { type: integer, nullable: true }
 *                     promote_count: { type: integer }
 *                     relegate_count: { type: integer }
 *     responses:
 *       200: { description: Temporada creada }
 *       400: { description: Datos inválidos }
 *       403: { description: Sin acceso al club }
 */
router.post('/seasons', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const clubId = String(req.body?.club_id ?? '').trim();
  const name = String(req.body?.name ?? '').trim();
  const mode = req.body?.mode === 'pairs' ? 'pairs' : 'individual';
  if (!clubId || !name) return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });

  const supabase = getSupabaseServiceRoleClient();
  const { data: season, error } = await supabase
    .from('league_seasons')
    .insert({ club_id: clubId, name, closed: false, mode })
    .select('id, club_id, name, closed, mode, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });

  const customDivisions = Array.isArray(req.body?.divisions) ? req.body.divisions : null;
  const divisions = customDivisions
    ? customDivisions.map((d: any, i: number) => ({
        season_id: season.id,
        code: String(d.label ?? `div_${i + 1}`).toLowerCase().replace(/\s+/g, '_'),
        label: String(d.label ?? `División ${i + 1}`),
        level_index: i,
        sort_order: i + 1,
        promote_count: Number(d.promote_count ?? 0),
        relegate_count: Number(d.relegate_count ?? 0),
        elo_min: d.elo_min != null ? Number(d.elo_min) : null,
        elo_max: d.elo_max != null ? Number(d.elo_max) : null,
      }))
    : [
        { season_id: season.id, code: 'primera', label: 'Primera', level_index: 0, sort_order: 1, promote_count: 0, relegate_count: 2, elo_min: null, elo_max: null },
        { season_id: season.id, code: 'segunda', label: 'Segunda', level_index: 1, sort_order: 2, promote_count: 2, relegate_count: 2, elo_min: null, elo_max: null },
        { season_id: season.id, code: 'tercera', label: 'Tercera', level_index: 2, sort_order: 3, promote_count: 2, relegate_count: 0, elo_min: null, elo_max: null },
      ];
  const { error: divErr } = await supabase.from('league_divisions').insert(divisions);
  if (divErr) return res.status(500).json({ ok: false, error: divErr.message });

  return res.json({ ok: true, season });
});

/**
 * @openapi
 * /leagues/seasons/{seasonId}/entries:
 *   post:
 *     tags: [Leagues]
 *     summary: Añadir jugador o pareja a una división
 *     description: |
 *       Inscribe un jugador (individual) o pareja en la división indicada.
 *       Si la división tiene rango Elo, se valida que el jugador esté dentro del rango.
 *       El nombre se genera automáticamente a partir de los jugadores.
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
 *             required: [division_id, player_id_1]
 *             properties:
 *               division_id: { type: string, format: uuid }
 *               player_id_1: { type: string, format: uuid }
 *               player_id_2: { type: string, format: uuid, nullable: true, description: 'Solo en ligas de parejas' }
 *     responses:
 *       200: { description: Entrada añadida }
 *       400: { description: Datos inválidos o Elo fuera de rango }
 *       403: { description: Sin acceso al club }
 *       404: { description: Temporada no encontrada }
 *       409: { description: Jugador ya inscrito en esta temporada }
 */
router.post('/seasons/:seasonId/entries', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const seasonId = req.params.seasonId;
  const divisionId = String(req.body?.division_id ?? '').trim();
  const playerId1 = String(req.body?.player_id_1 ?? '').trim();
  const playerId2 = req.body?.player_id_2 ? String(req.body.player_id_2).trim() : null;
  if (!divisionId || !playerId1) return res.status(400).json({ ok: false, error: 'division_id y player_id_1 son obligatorios' });

  const supabase = getSupabaseServiceRoleClient();

  const { data: season, error: seasonErr } = await supabase
    .from('league_seasons')
    .select('id, club_id, closed, mode')
    .eq('id', seasonId)
    .maybeSingle();
  if (seasonErr) return res.status(500).json({ ok: false, error: seasonErr.message });
  if (!season) return res.status(404).json({ ok: false, error: 'Temporada no encontrada' });
  if (!canAccessClub(req, String((season as any).club_id))) {
    return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  }
  if ((season as any).closed) {
    return res.status(400).json({ ok: false, error: 'La temporada está cerrada' });
  }

  const isPairs = (season as any).mode === 'pairs';
  if (isPairs && !playerId2) {
    return res.status(400).json({ ok: false, error: 'Liga de parejas requiere player_id_2' });
  }

  const { data: division, error: divErr } = await supabase
    .from('league_divisions')
    .select('id, elo_min, elo_max')
    .eq('id', divisionId)
    .eq('season_id', seasonId)
    .maybeSingle();
  if (divErr) return res.status(500).json({ ok: false, error: divErr.message });
  if (!division) return res.status(404).json({ ok: false, error: 'División no encontrada en esta temporada' });

  const playerIds = [playerId1, ...(playerId2 ? [playerId2] : [])];
  const { data: players, error: plErr } = await supabase
    .from('players')
    .select('id, first_name, last_name, elo_rating')
    .in('id', playerIds);
  if (plErr) return res.status(500).json({ ok: false, error: plErr.message });
  if ((players ?? []).length !== playerIds.length) {
    return res.status(400).json({ ok: false, error: 'Uno o más jugadores no encontrados' });
  }

  const eloMin = (division as any).elo_min != null ? Number((division as any).elo_min) : null;
  const eloMax = (division as any).elo_max != null ? Number((division as any).elo_max) : null;
  for (const p of players ?? []) {
    const elo = Number((p as any).elo_rating ?? 0);
    if (eloMin != null && elo < eloMin) {
      return res.status(400).json({ ok: false, error: `El jugador ${(p as any).first_name} tiene Elo ${elo}, por debajo del mínimo ${eloMin} de esta división` });
    }
    if (eloMax != null && elo > eloMax) {
      return res.status(400).json({ ok: false, error: `El jugador ${(p as any).first_name} tiene Elo ${elo}, por encima del máximo ${eloMax} de esta división` });
    }
  }

  const allDivisionIds = (await supabase.from('league_divisions').select('id').eq('season_id', seasonId)).data ?? [];
  const divIds = allDivisionIds.map((d: any) => d.id);
  if (divIds.length > 0) {
    const { data: existing } = await supabase
      .from('league_division_teams')
      .select('id, player_id_1, player_id_2')
      .in('division_id', divIds)
      .or(`player_id_1.in.(${playerIds.join(',')}),player_id_2.in.(${playerIds.join(',')})`);
    if ((existing ?? []).length > 0) {
      return res.status(409).json({ ok: false, error: 'Uno de los jugadores ya está inscrito en esta temporada' });
    }
  }

  const p1 = (players ?? []).find((p: any) => p.id === playerId1) as any;
  const p2 = playerId2 ? (players ?? []).find((p: any) => p.id === playerId2) as any : null;
  const label = p2
    ? `${p1.first_name} ${p1.last_name} / ${p2.first_name} ${p2.last_name}`
    : `${p1.first_name} ${p1.last_name}`;

  const { data: maxRow } = await supabase
    .from('league_division_teams')
    .select('sort_order')
    .eq('division_id', divisionId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = Number((maxRow as any)?.sort_order ?? 0) + 1;

  const { data: entry, error: insErr } = await supabase
    .from('league_division_teams')
    .insert({
      division_id: divisionId,
      team_label: label,
      sort_order: sortOrder,
      player_id_1: playerId1,
      player_id_2: playerId2,
    })
    .select(ENTRY_SELECT)
    .single();
  if (insErr) return res.status(500).json({ ok: false, error: insErr.message });
  return res.json({ ok: true, entry: normalizeEntry(entry) });
});

/**
 * @openapi
 * /leagues/entries/{entryId}:
 *   delete:
 *     tags: [Leagues]
 *     summary: Eliminar entrada de liga
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Entrada eliminada }
 *       403: { description: Sin acceso al club }
 *       404: { description: Entrada no encontrada }
 */
router.delete('/entries/:entryId', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const entryId = req.params.entryId;
  const supabase = getSupabaseServiceRoleClient();

  const { data: entry, error: eErr } = await supabase
    .from('league_division_teams')
    .select('id, division_id')
    .eq('id', entryId)
    .maybeSingle();
  if (eErr) return res.status(500).json({ ok: false, error: eErr.message });
  if (!entry) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });

  const { data: div } = await supabase
    .from('league_divisions')
    .select('season_id')
    .eq('id', (entry as any).division_id)
    .maybeSingle();
  if (div) {
    const { data: season } = await supabase
      .from('league_seasons')
      .select('club_id')
      .eq('id', (div as any).season_id)
      .maybeSingle();
    if (season && !canAccessClub(req, String((season as any).club_id))) {
      return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
    }
  }

  const { error } = await supabase.from('league_division_teams').delete().eq('id', entryId);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true });
});

/**
 * @openapi
 * /leagues/seasons/{seasonId}/matches:
 *   get:
 *     tags: [Leagues]
 *     summary: Listar partidos de liga de una temporada
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: seasonId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Partidos de la temporada }
 */
router.get('/seasons/:seasonId/matches', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const seasonId = req.params.seasonId;
  const supabase = getSupabaseServiceRoleClient();

  const { data: season } = await supabase
    .from('league_seasons')
    .select('id, club_id')
    .eq('id', seasonId)
    .maybeSingle();
  if (!season) return res.status(404).json({ ok: false, error: 'Temporada no encontrada' });
  if (!canAccessClub(req, String((season as any).club_id))) {
    return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  }

  const { data: matches, error } = await supabase
    .from('league_matches')
    .select(`id, season_id, division_id, entry_a_id, entry_b_id, booking_id, round_number, status, winner_entry_id, sets, scheduled_at, played_at, created_at,
      entry_a:league_division_teams!league_matches_entry_a_id_fkey(id, team_label, player_id_1, player_id_2),
      entry_b:league_division_teams!league_matches_entry_b_id_fkey(id, team_label, player_id_1, player_id_2)`)
    .eq('season_id', seasonId)
    .order('round_number', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, matches: matches ?? [] });
});

/**
 * @openapi
 * /leagues/seasons/{seasonId}/matches:
 *   post:
 *     tags: [Leagues]
 *     summary: Crear partido de liga
 *     description: |
 *       Crea un partido entre dos entradas de la misma división.
 *       Opcionalmente puede vincularse a una reserva (booking_id) para reflejarse en la grilla.
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
 *             required: [division_id, entry_a_id, entry_b_id]
 *             properties:
 *               division_id: { type: string, format: uuid }
 *               entry_a_id: { type: string, format: uuid }
 *               entry_b_id: { type: string, format: uuid }
 *               round_number: { type: integer, default: 1 }
 *               booking_id: { type: string, format: uuid, nullable: true, description: 'Reserva en la grilla (opcional)' }
 *               scheduled_at: { type: string, format: date-time, nullable: true }
 *     responses:
 *       200: { description: Partido creado }
 *       400: { description: Datos inválidos }
 *       403: { description: Sin acceso al club }
 */
router.post('/seasons/:seasonId/matches', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const seasonId = req.params.seasonId;
  const divisionId = String(req.body?.division_id ?? '').trim();
  const entryAId = String(req.body?.entry_a_id ?? '').trim();
  const entryBId = String(req.body?.entry_b_id ?? '').trim();
  const roundNumber = Math.max(1, Number(req.body?.round_number ?? 1));
  const bookingId = req.body?.booking_id ? String(req.body.booking_id).trim() : null;
  const scheduledAt = req.body?.scheduled_at ? String(req.body.scheduled_at) : null;

  if (!divisionId || !entryAId || !entryBId) {
    return res.status(400).json({ ok: false, error: 'division_id, entry_a_id y entry_b_id son obligatorios' });
  }
  if (entryAId === entryBId) {
    return res.status(400).json({ ok: false, error: 'Las dos entradas deben ser distintas' });
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data: season } = await supabase
    .from('league_seasons')
    .select('id, club_id, closed')
    .eq('id', seasonId)
    .maybeSingle();
  if (!season) return res.status(404).json({ ok: false, error: 'Temporada no encontrada' });
  if (!canAccessClub(req, String((season as any).club_id))) {
    return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  }

  const { data: match, error } = await supabase
    .from('league_matches')
    .insert({
      season_id: seasonId,
      division_id: divisionId,
      entry_a_id: entryAId,
      entry_b_id: entryBId,
      round_number: roundNumber,
      booking_id: bookingId,
      scheduled_at: scheduledAt,
      status: 'scheduled',
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, match });
});

/**
 * @openapi
 * /leagues/matches/{matchId}/result:
 *   post:
 *     tags: [Leagues]
 *     summary: Registrar resultado de partido de liga
 *     description: |
 *       Registra sets y ganador. Actualiza sort_order de las entradas
 *       (ganador sube, perdedor baja) para reflejar la clasificación.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [winner_entry_id, sets]
 *             properties:
 *               winner_entry_id: { type: string, format: uuid }
 *               sets:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     games_a: { type: integer }
 *                     games_b: { type: integer }
 *     responses:
 *       200: { description: Resultado registrado }
 *       400: { description: Datos inválidos }
 *       404: { description: Partido no encontrado }
 */
router.post('/matches/:matchId/result', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const matchId = req.params.matchId;
  const winnerEntryId = String(req.body?.winner_entry_id ?? '').trim();
  const sets = Array.isArray(req.body?.sets) ? req.body.sets : [];
  if (!winnerEntryId) return res.status(400).json({ ok: false, error: 'winner_entry_id es obligatorio' });

  const supabase = getSupabaseServiceRoleClient();
  const { data: match, error: mErr } = await supabase
    .from('league_matches')
    .select('id, entry_a_id, entry_b_id, division_id, season_id')
    .eq('id', matchId)
    .maybeSingle();
  if (mErr) return res.status(500).json({ ok: false, error: mErr.message });
  if (!match) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });

  if (winnerEntryId !== (match as any).entry_a_id && winnerEntryId !== (match as any).entry_b_id) {
    return res.status(400).json({ ok: false, error: 'winner_entry_id debe ser una de las dos entradas del partido' });
  }

  const { data: season } = await supabase
    .from('league_seasons')
    .select('club_id')
    .eq('id', (match as any).season_id)
    .maybeSingle();
  if (season && !canAccessClub(req, String((season as any).club_id))) {
    return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  }

  const { error: upErr } = await supabase
    .from('league_matches')
    .update({
      winner_entry_id: winnerEntryId,
      sets,
      status: 'played',
      played_at: new Date().toISOString(),
    })
    .eq('id', matchId);
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

  // Reorder entries: winner improves position if loser was ranked higher
  const loserId = winnerEntryId === (match as any).entry_a_id ? (match as any).entry_b_id : (match as any).entry_a_id;
  const { data: both } = await supabase
    .from('league_division_teams')
    .select('id, sort_order')
    .in('id', [winnerEntryId, loserId]);
  if (both && both.length === 2) {
    const winner = both.find((e: any) => e.id === winnerEntryId) as any;
    const loser = both.find((e: any) => e.id === loserId) as any;
    if (winner && loser && winner.sort_order > loser.sort_order) {
      await supabase.from('league_division_teams').update({ sort_order: loser.sort_order }).eq('id', winnerEntryId);
      await supabase.from('league_division_teams').update({ sort_order: winner.sort_order }).eq('id', loserId);
    }
  }

  return res.json({ ok: true });
});

/**
 * @openapi
 * /leagues/seasons/{seasonId}/close-and-promote:
 *   post:
 *     tags: [Leagues]
 *     summary: Cerrar temporada y aplicar ascensos/descensos
 *     description: Calcula movimientos por división (promote_count/relegate_count), actualiza entradas y cierra la temporada.
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
 *                 value: { ok: true, moved: 4 }
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
