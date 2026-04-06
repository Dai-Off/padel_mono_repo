import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { calcInitialMu, getNextQuestion, type OnboardingAnswer } from '../services/onboardingService';
import { calcEloRating } from '../services/levelingService';

const router = Router();

const PROTECTED_FIELDS = [
  'mu',
  'sigma',
  'beta',
  'streak_bonus',
  'beta_residuals',
  'elo_rating',
  'matches_played_competitive',
  'matches_played_friendly',
  'matches_played_matchmaking',
  'sp',
  'initial_rating_completed',
];

function hasProtectedKeys(body: Record<string, unknown>): boolean {
  return Object.keys(body).some((k) => PROTECTED_FIELDS.includes(k));
}

type Row = Record<string, unknown>;

function toPublicPlayer(row: Row): Row {
  const sigma = Number(row.sigma ?? 8.333);
  const fiabilidad = Math.max(0, Math.round((1 - sigma / 8.333) * 100));
  const mpc = Number(row.matches_played_competitive ?? 0);
  const mpf = Number(row.matches_played_friendly ?? 0);
  const mpm = Number(row.matches_played_matchmaking ?? 0);
  const {
    mu: _mu,
    sigma: _si,
    beta: _be,
    streak_bonus: _st,
    beta_residuals: _br,
    ...rest
  } = row;
  return {
    ...rest,
    elo_rating: row.elo_rating,
    sp: row.sp ?? 0,
    matches_played_total: mpc + mpf + mpm,
    matches_played_competitive: mpc,
    matches_played_friendly: mpf,
    matches_played_matchmaking: mpm,
    fiabilidad,
  };
}

const SELECT_PUBLIC_INTERNAL = `
  id, created_at, updated_at, first_name, last_name, email, phone, status, auth_user_id,
  mu, sigma, elo_rating, sp,
  matches_played_competitive, matches_played_friendly, matches_played_matchmaking,
  elo_last_updated_at, stripe_customer_id, consents
`;

/**
 * @openapi
 * /players/me:
 *   get:
 *     tags: [Players]
 *     summary: Perfil del jugador autenticado
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Incluye elo 0–7, sp, fiabilidad y contadores de partidos
 */
router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user?.email) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
    }
    const email = String(user.email).trim().toLowerCase();
    const { data: player, error: errPlayer } = await supabase
      .from('players')
      .select(SELECT_PUBLIC_INTERNAL)
      .eq('email', email)
      .maybeSingle();
    if (errPlayer) return res.status(500).json({ ok: false, error: errPlayer.message });
    if (!player) return res.status(404).json({ ok: false, error: 'No existe jugador con tu email' });
    return res.json({ ok: true, player: toPublicPlayer(player as Row) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /players/manual:
 *   post:
 *     tags: [Players]
 *     summary: Alta manual en club
 */
router.post('/manual', async (req: Request, res: Response) => {
  const { first_name, last_name, phone, email } = req.body ?? {};

  const firstName = typeof first_name === 'string' ? first_name.trim() : '';
  const lastName = typeof last_name === 'string' ? last_name.trim() : '';
  const phoneStr = typeof phone === 'string' ? phone.trim() : '';

  if (!firstName || !lastName || !phoneStr) {
    return res.status(400).json({
      ok: false,
      error: 'first_name, last_name y phone son obligatorios',
    });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: existingByPhone } = await supabase
      .from('players')
      .select('id')
      .eq('phone', phoneStr)
      .neq('status', 'deleted')
      .maybeSingle();
    if (existingByPhone) {
      return res.status(409).json({ ok: false, error: 'Ya existe un usuario con este teléfono' });
    }

    const emailStr = typeof email === 'string' ? email.trim().toLowerCase() : null;
    if (emailStr) {
      const { data: existingByEmail } = await supabase
        .from('players')
        .select('id')
        .eq('email', emailStr)
        .neq('status', 'deleted')
        .maybeSingle();
      if (existingByEmail) {
        return res.status(409).json({ ok: false, error: 'Ya existe un usuario con este correo' });
      }
    }

    const { data, error } = await supabase
      .from('players')
      .insert([
        {
          first_name: firstName,
          last_name: lastName,
          phone: phoneStr,
          email: emailStr,
          auth_user_id: null,
          initial_rating_completed: true,
        },
      ])
      .select(SELECT_PUBLIC_INTERNAL)
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ ok: false, error: 'Ya existe un usuario con este teléfono o correo' });
      }
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(201).json({ ok: true, player: toPublicPlayer((data ?? {}) as Row) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

/**
 * @openapi
 * /players/onboarding:
 *   post:
 *     tags: [Players]
 *     summary: Completar cuestionario de nivelación inicial
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [answers]
 *             properties:
 *               answers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [question_id, value]
 *     responses:
 *       200: { description: Nivel asignado }
 *       400: { description: Faltan respuestas; puede incluir next_question }
 *       409: { description: Ya completado }
 */
router.post('/onboarding', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const answers = req.body?.answers as OnboardingAnswer[] | undefined;
  if (!Array.isArray(answers)) {
    return res.status(400).json({ ok: false, error: 'answers debe ser un array' });
  }

  const next = await getNextQuestion(answers);
  if (next) {
    return res.status(400).json({ ok: false, error: 'Cuestionario incompleto', next_question: next });
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data: pl, error: e1 } = await supabase
    .from('players')
    .select('initial_rating_completed')
    .eq('id', playerId)
    .maybeSingle();
  if (e1) return res.status(500).json({ ok: false, error: e1.message });
  if ((pl as { initial_rating_completed?: boolean } | null)?.initial_rating_completed) {
    return res.status(409).json({ ok: false, error: 'Nivelación inicial ya completada' });
  }

  const mu = await calcInitialMu(answers);
  const sigma = 8.333;
  const elo = calcEloRating(mu, sigma);
  const now = new Date().toISOString();

  const { error: e2 } = await supabase
    .from('players')
    .update({
      mu,
      sigma,
      elo_rating: elo,
      initial_rating_completed: true,
      updated_at: now,
    })
    .eq('id', playerId);

  if (e2) return res.status(500).json({ ok: false, error: e2.message });

  await supabase.from('onboarding_answers').insert({
    player_id: playerId,
    answers,
    mu_assigned: mu,
  });

  return res.json({ ok: true, elo_rating: elo, message: 'Nivel inicial asignado' });
});

/**
 * @openapi
 * /players/{id}/stats:
 *   get:
 *     tags: [Players]
 *     summary: Estadísticas agregadas del jugador
 */
router.get('/:id/stats', async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getSupabaseServiceRoleClient();

  const { data: pl, error: e1 } = await supabase
    .from('players')
    .select('elo_rating, sigma, matches_played_competitive, matches_played_friendly, matches_played_matchmaking')
    .eq('id', id)
    .maybeSingle();
  if (e1) return res.status(500).json({ ok: false, error: e1.message });
  if (!pl) return res.status(404).json({ ok: false, error: 'Player not found' });

  const { data: hist } = await supabase
    .from('match_players')
    .select('result')
    .eq('player_id', id)
    .in('result', ['win', 'loss'])
    .order('created_at', { ascending: false })
    .limit(50);

  const results = (hist ?? []).map((h: { result: string }) => h.result);
  let winStreak = 0;
  let lossStreak = 0;
  for (const r of results) {
    if (r === 'win') {
      if (lossStreak) break;
      winStreak++;
    } else {
      if (winStreak) break;
      lossStreak++;
    }
  }
  const last20 = results.slice(0, 20);
  const wins = last20.filter((r) => r === 'win').length;
  const winRateLast20 = last20.length ? wins / last20.length : 0;
  const sigma = Number((pl as { sigma?: number }).sigma ?? 8.333);
  const fiabilidad = Math.max(0, Math.round((1 - sigma / 8.333) * 100));

  return res.json({
    ok: true,
    win_streak: winStreak,
    loss_streak: lossStreak,
    win_rate_last_20: Math.round(winRateLast20 * 100) / 100,
    matches_played_competitive: Number((pl as { matches_played_competitive?: number }).matches_played_competitive ?? 0),
    matches_played_friendly: Number((pl as { matches_played_friendly?: number }).matches_played_friendly ?? 0),
    matches_played_matchmaking: Number((pl as { matches_played_matchmaking?: number }).matches_played_matchmaking ?? 0),
    elo_rating: (pl as { elo_rating?: number }).elo_rating,
    fiabilidad,
  });
});

/**
 * @openapi
 * /players/{id}/feedback-summary:
 *   get:
 *     tags: [Players]
 *     summary: Resumen de feedback recibido (solo informativo)
 */
router.get('/:id/feedback-summary', async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getSupabaseServiceRoleClient();

  const { data: pl, error: e1 } = await supabase.from('players').select('elo_rating').eq('id', id).maybeSingle();
  if (e1) return res.status(500).json({ ok: false, error: e1.message });
  if (!pl) return res.status(404).json({ ok: false, error: 'Player not found' });

  const { data: rows } = await supabase.from('match_feedback').select('level_ratings');
  const perceived: number[] = [];
  for (const row of rows ?? []) {
    const lr = (row as { level_ratings?: unknown }).level_ratings;
    if (!Array.isArray(lr)) continue;
    for (const x of lr) {
      if (!x || typeof x !== 'object') continue;
      const o = x as Record<string, unknown>;
      if (String(o.player_id) !== id) continue;
      const p = Number(o.perceived);
      if ([-1, 0, 1].includes(p)) perceived.push(p);
    }
  }

  const avg = perceived.length ? perceived.reduce((a, b) => a + b, 0) / perceived.length : 0;
  const adjustment = avg > 0.25 ? 0.5 : avg < -0.25 ? -0.5 : 0;
  const elo = Number((pl as { elo_rating?: number }).elo_rating ?? 0);
  const perceivedEloEstimate = Math.round((elo + adjustment) * 10) / 10;

  return res.json({
    ok: true,
    average_perceived_level: Math.round(avg * 100) / 100,
    total_ratings: perceived.length,
    vs_elo_rating: elo,
    perceived_elo_estimate: perceivedEloEstimate,
    difference: Math.round((perceivedEloEstimate - elo) * 10) / 10,
  });
});

/**
 * @openapi
 * /players:
 *   get:
 *     tags: [Players]
 *     summary: Listar jugadores
 */
router.get('/', async (req: Request, res: Response) => {
  const query = req.query.q as string | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();

    let q = supabase
      .from('players')
      .select(
        `id, created_at, first_name, last_name, email, phone, status, auth_user_id,
         mu, sigma, elo_rating, sp, matches_played_competitive, matches_played_friendly, matches_played_matchmaking`
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (query) {
      q = q.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`);
    }

    const { data, error } = await q;

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    const players = (data ?? []).map((row) => toPublicPlayer(row as Row));
    return res.json({ ok: true, players });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

/**
 * @openapi
 * /players/{id}:
 *   get:
 *     tags: [Players]
 *     summary: Detalle jugador
 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error } = await supabase.from('players').select(SELECT_PUBLIC_INTERNAL).eq('id', id).maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    if (!data) {
      return res.status(404).json({ ok: false, error: 'Player not found' });
    }

    return res.json({ ok: true, player: toPublicPlayer(data as Row) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

/**
 * @openapi
 * /players:
 *   post:
 *     tags: [Players]
 *     summary: Crear jugador
 */
router.post('/', async (req: Request, res: Response) => {
  const body = req.body ?? {};
  if (hasProtectedKeys(body)) {
    return res.status(400).json({ ok: false, error: 'Campo no editable' });
  }

  const { first_name, last_name, email, phone } = body;

  if (!first_name || !last_name || !email) {
    return res.status(400).json({
      ok: false,
      error: 'first_name, last_name y email son obligatorios',
    });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from('players')
      .insert([
        {
          first_name,
          last_name,
          email,
          phone: phone ?? null,
          initial_rating_completed: false,
        },
      ])
      .select(SELECT_PUBLIC_INTERNAL)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(201).json({ ok: true, player: toPublicPlayer((data ?? {}) as Row) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

/**
 * @openapi
 * /players/{id}:
 *   put:
 *     tags: [Players]
 *     summary: Actualizar jugador
 */
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body ?? {};

  if (hasProtectedKeys(body)) {
    return res.status(400).json({ ok: false, error: 'Campo no editable' });
  }

  const { first_name, last_name, email, phone, status } = body;

  const update: Record<string, unknown> = {};
  if (first_name !== undefined) update.first_name = first_name;
  if (last_name !== undefined) update.last_name = last_name;
  if (email !== undefined) update.email = email;
  if (phone !== undefined) update.phone = phone;
  if (status !== undefined) update.status = status;
  update.updated_at = new Date().toISOString();

  if (Object.keys(update).length === 1) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from('players')
      .update(update)
      .eq('id', id)
      .select(SELECT_PUBLIC_INTERNAL)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    if (!data) {
      return res.status(404).json({ ok: false, error: 'Player not found' });
    }

    return res.json({ ok: true, player: toPublicPlayer(data as Row) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

/**
 * @openapi
 * /players/{id}:
 *   delete:
 *     tags: [Players]
 *     summary: Borrado lógico
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from('players')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status')
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    if (!data) {
      return res.status(404).json({ ok: false, error: 'Player not found' });
    }

    return res.json({ ok: true, player: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

export default router;
