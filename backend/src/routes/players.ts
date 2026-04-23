import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { calcEloPhase1, calcPhase2Result, calcFinalElo, eloToMu, getNextQuestionState, getPhase2Pool, type OnboardingAnswer } from '../services/onboardingService';
import { calcEloRating } from '../services/levelingService';
import { ligaFromEloWithBands } from '../services/matchmakingLeague';
import { getActiveMatchmakingSeasonId } from '../services/matchmakingSeasonService';
import { getMatchmakingLeagueConfigRows } from '../services/matchmakingLeagueConfigService';
import { getLastPeerFeedbackInsightForPlayer } from '../services/postMatchPeerFeedbackInsightService';
import { syncPlayerVector } from '../lib/mailer';

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
  'onboarding_completed',
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

type MmWl = { mm_wins: number; mm_losses: number; mm_draws: number };

const ZERO_MM_WL: MmWl = { mm_wins: 0, mm_losses: 0, mm_draws: 0 };

async function fetchPlayerMatchmakingWl(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  playerId: string
): Promise<MmWl> {
  try {
    const { data, error } = await supabase.rpc('player_matchmaking_record', { p_player_id: playerId });
    if (error) return ZERO_MM_WL;
    const rows = data as unknown;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row || typeof row !== 'object') return ZERO_MM_WL;
    const r = row as Record<string, unknown>;
    return {
      mm_wins: Number(r.wins ?? 0),
      mm_losses: Number(r.losses ?? 0),
      mm_draws: Number(r.draws ?? 0),
    };
  } catch {
    return ZERO_MM_WL;
  }
}

function withPublicPlayerAndMm(row: Row, wl: MmWl): Row {
  return { ...(toPublicPlayer(row) as Row), ...wl };
}

const SELECT_PUBLIC_INTERNAL = `
  id, created_at, updated_at, first_name, last_name, email, phone, status, auth_user_id, avatar_url, gender,
  mu, sigma, elo_rating, sp,
  matches_played_competitive, matches_played_friendly, matches_played_matchmaking,
  elo_last_updated_at, stripe_customer_id, consents,
  preferred_side, preferred_schedule_slots, preferred_days, preferred_play_style,
  preferred_match_duration_min, preferred_partner_level, favorite_clubs,
  notif_new_matches, notif_tournament_reminders, notif_class_updates, notif_chat_messages,
  liga, lps, mm_peak_liga
`;

const AVATAR_URL_MAX = 2048;

type AvatarNormalize =
  | { ok: true; mode: 'omit' }
  | { ok: true; mode: 'set'; value: string | null }
  | { ok: false; error: string };

function normalizeAvatarUrl(body: Record<string, unknown>): AvatarNormalize {
  if (!Object.prototype.hasOwnProperty.call(body, 'avatar_url')) return { ok: true, mode: 'omit' };
  const raw = body.avatar_url;
  if (raw === null) return { ok: true, mode: 'set', value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'avatar_url debe ser texto o null' };
  const t = raw.trim();
  if (!t) return { ok: true, mode: 'set', value: null };
  if (t.length > AVATAR_URL_MAX) return { ok: false, error: `avatar_url admite como máximo ${AVATAR_URL_MAX} caracteres` };
  if (!/^https?:\/\//i.test(t)) return { ok: false, error: 'avatar_url debe ser una URL http(s) absoluta' };
  return { ok: true, mode: 'set', value: t };
}

type PreferencesPatchNormalize =
  | { ok: true; hasAny: false; patch: Record<string, unknown> }
  | { ok: true; hasAny: true; patch: Record<string, unknown> }
  | { ok: false; error: string };

const PREF_SIDE = new Set(['right', 'left', 'both']);
const PREF_SLOTS = new Set(['morning', 'afternoon', 'evening', 'night']);
const PREF_DAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const PREF_STYLE = new Set(['competitive', 'social', 'learning', 'balanced']);
const PREF_PARTNER_LEVEL = new Set(['similar', 'higher', 'lower', 'any']);
const PREF_DURATION = new Set([60, 90, 120]);

function parseStringArray(value: unknown, field: string, maxItems: number): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return { ok: false, error: `${field} debe ser un arreglo` };
  if (value.length > maxItems) return { ok: false, error: `${field} admite como máximo ${maxItems} elementos` };
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return { ok: false, error: `${field} solo admite texto` };
    const v = item.trim();
    if (!v) return { ok: false, error: `${field} no admite valores vacíos` };
    out.push(v);
  }
  return { ok: true, value: Array.from(new Set(out)) };
}

function normalizePreferencesPatch(body: Record<string, unknown>): PreferencesPatchNormalize {
  const patch: Record<string, unknown> = {};
  let hasAny = false;

  if (Object.prototype.hasOwnProperty.call(body, 'preferred_side')) {
    hasAny = true;
    if (typeof body.preferred_side !== 'string') return { ok: false, error: 'preferred_side debe ser texto' };
    const v = body.preferred_side.trim().toLowerCase();
    if (!PREF_SIDE.has(v)) return { ok: false, error: 'preferred_side inválido' };
    patch.preferred_side = v;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'preferred_schedule_slots')) {
    hasAny = true;
    const parsed = parseStringArray(body.preferred_schedule_slots, 'preferred_schedule_slots', 4);
    if (!parsed.ok) return parsed;
    const normalized = parsed.value.map((v) => v.toLowerCase());
    if (!normalized.every((v) => PREF_SLOTS.has(v))) return { ok: false, error: 'preferred_schedule_slots contiene valores inválidos' };
    patch.preferred_schedule_slots = Array.from(new Set(normalized));
  }

  if (Object.prototype.hasOwnProperty.call(body, 'preferred_days')) {
    hasAny = true;
    const parsed = parseStringArray(body.preferred_days, 'preferred_days', 7);
    if (!parsed.ok) return parsed;
    const normalized = parsed.value.map((v) => v.toLowerCase());
    if (!normalized.every((v) => PREF_DAYS.has(v))) return { ok: false, error: 'preferred_days contiene valores inválidos' };
    patch.preferred_days = Array.from(new Set(normalized));
  }

  if (Object.prototype.hasOwnProperty.call(body, 'preferred_play_style')) {
    hasAny = true;
    if (typeof body.preferred_play_style !== 'string') return { ok: false, error: 'preferred_play_style debe ser texto' };
    const v = body.preferred_play_style.trim().toLowerCase();
    if (!PREF_STYLE.has(v)) return { ok: false, error: 'preferred_play_style inválido' };
    patch.preferred_play_style = v;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'preferred_match_duration_min')) {
    hasAny = true;
    const v = Number(body.preferred_match_duration_min);
    if (!Number.isFinite(v) || !PREF_DURATION.has(v)) {
      return { ok: false, error: 'preferred_match_duration_min inválido' };
    }
    patch.preferred_match_duration_min = v;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'preferred_partner_level')) {
    hasAny = true;
    if (typeof body.preferred_partner_level !== 'string') return { ok: false, error: 'preferred_partner_level debe ser texto' };
    const v = body.preferred_partner_level.trim().toLowerCase();
    if (!PREF_PARTNER_LEVEL.has(v)) return { ok: false, error: 'preferred_partner_level inválido' };
    patch.preferred_partner_level = v;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'favorite_clubs')) {
    hasAny = true;
    const parsed = parseStringArray(body.favorite_clubs, 'favorite_clubs', 20);
    if (!parsed.ok) return parsed;
    patch.favorite_clubs = parsed.value.slice(0, 20);
  }

  const boolFields = [
    'notif_new_matches',
    'notif_tournament_reminders',
    'notif_class_updates',
    'notif_chat_messages',
  ] as const;

  for (const bf of boolFields) {
    if (Object.prototype.hasOwnProperty.call(body, bf)) {
      hasAny = true;
      if (typeof body[bf] !== 'boolean') return { ok: false, error: `${bf} debe ser boolean` };
      patch[bf] = body[bf];
    }
  }

  return { ok: true, hasAny, patch };
}

/**
 * @openapi
 * /players/me:
 *   get:
 *     tags: [Players]
 *     summary: Perfil del jugador autenticado
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Incluye elo 0–7, sp, fiabilidad, contadores, liga MM (liga, lps, mm_peak_liga), record MM confirmado (mm_wins, mm_losses, mm_draws)
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
    let { data: player, error: errPlayer } = await supabase
      .from('players')
      .select(SELECT_PUBLIC_INTERNAL)
      .eq('email', email)
      .maybeSingle();
    if (errPlayer) return res.status(500).json({ ok: false, error: errPlayer.message });
    /** Fallback: cuenta auth vs fila `players.email` pueden desalinearse; `auth_user_id` es la ancla estable. */
    if (!player && user.id) {
      const byAuth = await supabase
        .from('players')
        .select(SELECT_PUBLIC_INTERNAL)
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (byAuth.error) return res.status(500).json({ ok: false, error: byAuth.error.message });
      player = byAuth.data;
    }
    if (!player) {
      return res.status(404).json({ ok: false, error: 'No existe jugador asociado a esta cuenta' });
    }
    const pid = String((player as Row).id);
    const wl = await fetchPlayerMatchmakingWl(supabase, pid);
    return res.json({ ok: true, player: withPublicPlayerAndMm(player as Row, wl) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /players/me:
 *   patch:
 *     tags: [Players]
 *     summary: Actualizar perfil del jugador autenticado
 *     description: |
 *       Actualiza nombre y/o foto de perfil (`avatar_url`, URL pública tras subir al bucket `player-avatars`).
 *       Si envías `first_name` o `last_name`, ambos son obligatorios y no vacíos, y debe existir teléfono
 *       (en el cuerpo como `phone` o ya guardado en el jugador); sin teléfono no se actualizan los nombres.
 *       Puedes enviar solo `avatar_url` (o `null` para quitarla) sin cambiar el nombre.
 *       Puedes enviar `phone` (texto no vacío) para actualizar el teléfono de contacto; debe ser único entre jugadores activos.
 *       Con nombres, también se sincroniza `user_metadata.full_name` en Auth.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 80
 *                 example: Ana
 *               last_name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 80
 *                 example: García López
 *               avatar_url:
 *                 type: string
 *                 nullable: true
 *                 description: URL pública (http/https), máx. 2048 caracteres; null borra la foto
 *                 example: https://xxx.supabase.co/storage/v1/object/public/player-avatars/...
 *               phone:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 40
 *                 description: Teléfono de contacto (único si ya existe en otro jugador)
 *                 example: "+34600111222"
 *           examples:
 *             names:
 *               value: { first_name: "Ana", last_name: "García López" }
 *             avatar:
 *               value: { avatar_url: "https://example.com/storage/v1/object/public/player-avatars/u/avatar.jpg" }
 *     responses:
 *       200:
 *         description: Perfil actualizado
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, player: {} }
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: Token inválido o ausente
 *       404:
 *         description: No hay jugador asociado a esta cuenta
 *       500:
 *         description: Error interno
 */
router.patch('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }

  const body = req.body ?? {};
  const hasFirst = Object.prototype.hasOwnProperty.call(body, 'first_name');
  const hasLast = Object.prototype.hasOwnProperty.call(body, 'last_name');
  const firstRaw = typeof body.first_name === 'string' ? body.first_name.trim() : '';
  const lastRaw = typeof body.last_name === 'string' ? body.last_name.trim() : '';

  let firstFinal: string | null = null;
  let lastFinal: string | null = null;
  if (hasFirst || hasLast) {
    if (!firstRaw || !lastRaw) {
      return res.status(400).json({ ok: false, error: 'first_name y last_name son obligatorios juntos (texto no vacío)' });
    }
    if (firstRaw.length > 80 || lastRaw.length > 80) {
      return res.status(400).json({ ok: false, error: 'first_name y last_name admiten como máximo 80 caracteres' });
    }
    firstFinal = firstRaw;
    lastFinal = lastRaw;
  }

  const avatarNorm = normalizeAvatarUrl(body as Record<string, unknown>);
  if (!avatarNorm.ok) {
    return res.status(400).json({ ok: false, error: avatarNorm.error });
  }

  const hasPhone = Object.prototype.hasOwnProperty.call(body, 'phone');
  let phoneFinal: string | null = null;
  if (hasPhone) {
    if (body.phone === null || body.phone === undefined) {
      return res.status(400).json({ ok: false, error: 'phone no puede ser null; omite el campo si no quieres cambiarlo' });
    }
    if (typeof body.phone !== 'string') {
      return res.status(400).json({ ok: false, error: 'phone debe ser texto' });
    }
    const ph = body.phone.trim();
    if (ph.length < 5 || ph.length > 40) {
      return res.status(400).json({ ok: false, error: 'phone debe tener entre 5 y 40 caracteres' });
    }
    phoneFinal = ph;
  }

  const prefsNorm = normalizePreferencesPatch(body as Record<string, unknown>);
  if (!prefsNorm.ok) {
    return res.status(400).json({ ok: false, error: prefsNorm.error });
  }

  if (!firstFinal && avatarNorm.mode === 'omit' && !hasPhone && !prefsNorm.hasAny) {
    return res.status(400).json({
      ok: false,
      error: 'Envía first_name y last_name, y/o avatar_url, y/o phone, y/o preferencias',
    });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(token);
    if (authErr || !user?.id) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
    }

    const email = user.email ? String(user.email).trim().toLowerCase() : '';

    const { data: byAuth, error: e1 } = await supabase
      .from('players')
      .select('id')
      .eq('auth_user_id', user.id)
      .neq('status', 'deleted')
      .maybeSingle();
    if (e1) return res.status(500).json({ ok: false, error: e1.message });

    let playerId: string | null = (byAuth as { id?: string } | null)?.id ?? null;
    if (!playerId && email) {
      const { data: byEmail, error: e2 } = await supabase
        .from('players')
        .select('id')
        .eq('email', email)
        .neq('status', 'deleted')
        .maybeSingle();
      if (e2) return res.status(500).json({ ok: false, error: e2.message });
      playerId = (byEmail as { id?: string } | null)?.id ?? null;
    }

    if (!playerId) {
      return res.status(404).json({ ok: false, error: 'No existe jugador vinculado a esta cuenta' });
    }

    const { data: curPhoneRow } = await supabase.from('players').select('phone').eq('id', playerId).maybeSingle();
    const curPhoneTrim = String((curPhoneRow as { phone?: string | null } | null)?.phone ?? '').trim();
    if (firstFinal && lastFinal) {
      const effectivePhone = phoneFinal !== null ? phoneFinal : curPhoneTrim;
      if (effectivePhone.length < 5) {
        return res.status(400).json({
          ok: false,
          error: 'El teléfono de contacto es obligatorio para mantener el nombre completo; envía phone (5–40 caracteres)',
        });
      }
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    if (firstFinal && lastFinal) {
      patch.first_name = firstFinal;
      patch.last_name = lastFinal;
    }
    if (avatarNorm.mode === 'set') {
      patch.avatar_url = avatarNorm.value;
    }
    if (phoneFinal !== null) {
      const { data: dupPhone, error: dupErr } = await supabase
        .from('players')
        .select('id')
        .eq('phone', phoneFinal)
        .neq('id', playerId)
        .neq('status', 'deleted')
        .maybeSingle();
      if (dupErr) return res.status(500).json({ ok: false, error: dupErr.message });
      if (dupPhone) {
        return res.status(409).json({ ok: false, error: 'Ya existe otro jugador con este teléfono' });
      }
      patch.phone = phoneFinal;
    }
    Object.assign(patch, prefsNorm.patch);

    const { data: updated, error: upErr } = await supabase.from('players').update(patch).eq('id', playerId).select(SELECT_PUBLIC_INTERNAL).maybeSingle();

    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });
    if (!updated) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

    if (firstFinal && lastFinal) {
      const fullName = `${firstFinal} ${lastFinal}`.trim();
      const { error: metaErr } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { ...(typeof user.user_metadata === 'object' && user.user_metadata ? user.user_metadata : {}), full_name: fullName },
      });
      if (metaErr) {
        console.error('[PATCH /players/me] auth metadata sync:', metaErr.message);
      }
    }

    if (prefsNorm.hasAny) {
      const syncRes = await syncPlayerVector(playerId);
      if (!syncRes.sent) {
        console.error('[PATCH /players/me] sync-player-vector failed:', syncRes.error ?? 'unknown');
      }
    }

    const wl = await fetchPlayerMatchmakingWl(supabase, playerId);
    return res.json({ ok: true, player: withPublicPlayerAndMm(updated as Row, wl) });
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
          onboarding_completed: true,
          gender: req.body?.gender ?? 'male',
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

    return res.status(201).json({ ok: true, player: withPublicPlayerAndMm((data ?? {}) as Row, ZERO_MM_WL) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

/**
 * @openapi
 * /players/onboarding/next:
 *   get:
 *     tags: [Players]
 *     summary: Obtener la siguiente pregunta del cuestionario
 *     security: [{ bearerAuth: [] }]
 */
router.get('/onboarding/next', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  try {
    let answers: OnboardingAnswer[] = [];
    if (req.query.answers) {
      answers = JSON.parse(req.query.answers as string);
    }
    const state = await getNextQuestionState(answers);
    return res.json({ ok: true, state });
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
 *     summary: Completar cuestionario de nivelación inicial Fase 1 y 2
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
 *                   required: [question_key, value]
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
    return res.status(400).json({ ok: false, error: 'answers debe ser un array con question_key y value' });
  }

  // Verificamos estado (si le falta Fase 2, no debería procesar todo, a menos que P1 < 2)
  const state = await getNextQuestionState(answers);
  if (state.type === 'question') {
    return res.status(400).json({ ok: false, error: 'Cuestionario de Fase 1 incompleto', state });
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data: pl, error: e1 } = await supabase
    .from('players')
    .select('onboarding_completed')
    .eq('id', playerId)
    .maybeSingle();

  if (e1) return res.status(500).json({ ok: false, error: e1.message });
  if ((pl as { onboarding_completed?: boolean } | null)?.onboarding_completed) {
    return res.status(409).json({ ok: false, error: 'Nivelación inicial ya completada' });
  }

  // Separar respuestas (solo p1 a p99 son de fase 1)
  const phase1Ans = answers.filter(a => /^p\d+[a-z]?$/.test(a.question_key));
  const phase2Ans = answers.filter(a => !/^p\d+[a-z]?$/.test(a.question_key));

  // Calculos
  const eloPhase1 = await calcEloPhase1(phase1Ans);
  const p1Val = phase1Ans.find(a => a.question_key === 'p1')?.value;
  
  let finalElo = eloPhase1;
  let pool = null;
  let phase2Score = null;

  if (p1Val >= 2) {
    // Aplica fase 2
    pool = await getPhase2Pool(eloPhase1);
    const p2Result = await calcPhase2Result(phase2Ans);
    finalElo = await calcFinalElo(eloPhase1, p2Result.adjustment);
    phase2Score = p2Result.score;
  } else {
    // Floor/Ceil para fase 1 directa sin fase 2
    finalElo = await calcFinalElo(eloPhase1, 0);
  }

  const muToSave = eloToMu(finalElo);
  const now = new Date().toISOString();
  const leagueBands = await getMatchmakingLeagueConfigRows(supabase);
  const assignedLiga = ligaFromEloWithBands(finalElo, leagueBands);
  let leagueSeasonId: string | null = null;
  try {
    leagueSeasonId = await getActiveMatchmakingSeasonId(supabase);
  } catch {
    /* sin tabla de temporadas aún */
  }

  const updatePayload: Record<string, unknown> = {
    mu: muToSave,
    elo_rating: finalElo,
    liga: assignedLiga,
    lps: 0,
    mm_peak_liga: assignedLiga,
    onboarding_completed: true,
    updated_at: now,
  };
  if (leagueSeasonId) updatePayload.league_season_id = leagueSeasonId;

  const { error: e2 } = await supabase.from('players').update(updatePayload).eq('id', playerId);

  if (e2) return res.status(500).json({ ok: false, error: e2.message });

  // Guardar respuestas de Onboarding
  await supabase.from('onboarding_answers').insert({
    player_id: playerId,
    answers,
    elo_assigned: finalElo,
    elo_phase1: eloPhase1,
    pool_assigned: pool,
    phase2_score: phase2Score,
  });

  return res.json({ ok: true, elo_rating: finalElo, message: 'Nivel inicial asignado' });
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
 * /players/{id}/last-peer-feedback-insight:
 *   get:
 *     tags: [Players]
 *     summary: Tarjeta perfil — insight desde el último feedback de un compañero
 *     description: |
 *       Toma el **último partido** (por fecha de feedback) en el que compañeros (`reviewer_id` ≠ jugador)
 *       enviaron `match_feedback` con una entrada en `level_ratings` para ese jugador.
 *       Agrupa **hasta 3 valoraciones distintas** (una por compañero) del mismo `match_id` y genera
 *       la tarjeta: «Recomendación IA», fortalezas y a mejorar (OpenAI si `OPENAI_API_KEY` está configurada;
 *       si no hay clave o falla la API, plantillas locales). `insight_source` indica `openai` o `template`.
 *       Solo el propio jugador autenticado puede consultar su `id` (privacidad).
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/last-peer-feedback-insight', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const { id } = req.params;
  if (id !== playerId) {
    return res.status(403).json({ ok: false, error: 'Solo puedes consultar el insight de tu propio perfil' });
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data: exists, error: e0 } = await supabase.from('players').select('id').eq('id', id).maybeSingle();
  if (e0) return res.status(500).json({ ok: false, error: e0.message });
  if (!exists) return res.status(404).json({ ok: false, error: 'Player not found' });

  const insight = await getLastPeerFeedbackInsightForPlayer(supabase, id);
  return res.json(insight);
});

/**
 * @openapi
 * /players:
 *   get:
 *     tags: [Players]
 *     summary: Listar jugadores
 *     description: Sin `q` devuelve los últimos jugadores. Con `q`, filtra por nombre (nombre/apellido) o teléfono (no por email).
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Texto de búsqueda (nombre, apellido o teléfono)
 */
router.get('/', async (req: Request, res: Response) => {
  const query = req.query.q as string | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const terms = String(query ?? '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const searchFetchLimit = terms.length <= 1 ? 80 : 160;
    let q = supabase
      .from('players')
      .select(
        `id, created_at, first_name, last_name, email, phone, status, auth_user_id,
         mu, sigma, elo_rating, sp, matches_played_competitive, matches_played_friendly, matches_played_matchmaking`
      )
      .order('created_at', { ascending: false })
      .limit(terms.length ? searchFetchLimit : 50);

    if (terms.length) {
      const orExpr = terms
        .flatMap((t) => [`first_name.ilike.%${t}%`, `last_name.ilike.%${t}%`, `phone.ilike.%${t}%`])
        .join(',');
      q = q.or(orExpr);
    }

    const { data, error } = await q;

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    let players = (data ?? []).map((row) => toPublicPlayer(row as Row));
    if (terms.length) {
      players = players.filter((p) => {
        const full = `${String(p.first_name ?? '')} ${String(p.last_name ?? '')}`.toLowerCase();
        const phone = String(p.phone ?? '').toLowerCase();
        const phoneDigits = phone.replace(/\D/g, '');
        return terms.every((t) => {
          if (full.includes(t)) return true;
          if (phone.includes(t)) return true;
          const td = t.replace(/\D/g, '');
          if (td.length > 0 && phoneDigits.includes(td)) return true;
          return false;
        });
      });
      players = players.slice(0, 50);
    }
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

    const wl = await fetchPlayerMatchmakingWl(supabase, id);
    return res.json({ ok: true, player: withPublicPlayerAndMm(data as Row, wl) });
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

  const { first_name, last_name, email, phone, gender } = body;

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
          gender: gender ?? 'male',
          onboarding_completed: false,
        },
      ])
      .select(SELECT_PUBLIC_INTERNAL)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(201).json({ ok: true, player: withPublicPlayerAndMm((data ?? {}) as Row, ZERO_MM_WL) });
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

  const { first_name, last_name, email, phone, status, gender } = body;

  const update: Record<string, unknown> = {};
  if (first_name !== undefined) update.first_name = first_name;
  if (last_name !== undefined) update.last_name = last_name;
  if (email !== undefined) update.email = email;
  if (phone !== undefined) update.phone = phone;
  if (status !== undefined) update.status = status;
  if (gender !== undefined) update.gender = gender;
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

    const wl = await fetchPlayerMatchmakingWl(supabase, id);
    return res.json({ ok: true, player: withPublicPlayerAndMm(data as Row, wl) });
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
