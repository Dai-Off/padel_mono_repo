import { Router, Request, Response, NextFunction } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';

const router = Router();
router.use(attachAuthContext);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authContext) {
    res.status(401).json({ ok: false, error: 'Token requerido. Envía Authorization: Bearer <access_token>.' });
    return;
  }
  next();
}

async function getPlayerFromAuth(authUserId: string): Promise<{ id: string; elo_rating: number } | null> {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('players')
    .select('id, elo_rating')
    .eq('auth_user_id', authUserId)
    .neq('status', 'deleted')
    .maybeSingle();
  return data as { id: string; elo_rating: number } | null;
}

// ---------------------------------------------------------------------------
// Selection algorithm types
// ---------------------------------------------------------------------------

interface QuestionRow {
  id: string;
  type: string;
  level: number;
  area: string;
  has_video: boolean;
  video_url: string | null;
  content: Record<string, unknown>;
}

interface HistoryEntry {
  question_id: string;
  answered_correctly: boolean;
  answered_at: string;
}

interface ScoredQuestion {
  question: QuestionRow;
  weight: number;
}

// ---------------------------------------------------------------------------
// Selection algorithm
// ---------------------------------------------------------------------------

const PESO_BASE = 100;
const LESSON_SIZE = 5;

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

function bonusFallada(history: HistoryEntry[]): number {
  if (!history.length) return 0;
  const failedOnce = history.some((h) => !h.answered_correctly);
  if (!failedOnce) return 0;
  const last = history[history.length - 1];
  return last.answered_correctly ? 25 : 50;
}

function bonusNovedad(history: HistoryEntry[]): number {
  return history.length === 0 ? 40 : 0;
}

function bonusTiempo(history: HistoryEntry[], now: Date): number {
  if (!history.length) return 30;
  const lastDate = new Date(history[history.length - 1].answered_at);
  return Math.min(daysBetween(lastDate, now) * 3, 30);
}

function penalizacionNivel(questionLevel: number, eloRating: number): number {
  const dist = Math.abs(questionLevel - eloRating);
  if (dist <= 0.5) return 0;
  return Math.min((dist - 0.5) * 40, 80);
}

function penalizacionRepeticion(history: HistoryEntry[]): number {
  return Math.min(history.length * 8, 60);
}

function computeWeight(
  q: QuestionRow,
  history: HistoryEntry[],
  eloRating: number,
  now: Date,
  ignoreLevelPenalty: boolean,
): number {
  return (
    PESO_BASE +
    bonusFallada(history) +
    bonusNovedad(history) +
    bonusTiempo(history, now) -
    (ignoreLevelPenalty ? 0 : penalizacionNivel(q.level, eloRating)) -
    penalizacionRepeticion(history)
  );
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function pickFromScored(scored: ScoredQuestion[]): QuestionRow[] {
  const selected: QuestionRow[] = [];
  const used = new Set<string>();
  const areas = new Set<string>();

  // First slot: prefer test_classic if any candidate has positive weight
  const firstClassic = scored.find((s) => s.question.type === 'test_classic');
  if (firstClassic) {
    selected.push(firstClassic.question);
    used.add(firstClassic.question.id);
    areas.add(firstClassic.question.area);
  }

  while (selected.length < LESSON_SIZE) {
    const remainingSlots = LESSON_SIZE - selected.length;
    const last = selected[selected.length - 1];
    // Force a new area if this is the last slot and we still only have one area
    const needNewArea = areas.size < 2 && remainingSlots === 1;

    const candidates = scored.filter((s) => !used.has(s.question.id));
    if (candidates.length === 0) break;

    const findFirst = (predicate: (q: QuestionRow) => boolean) =>
      candidates.find((c) => predicate(c.question));

    const next: ScoredQuestion =
      (needNewArea ? findFirst((q) => !areas.has(q.area)) : undefined) ??
      (last ? findFirst((q) => q.type !== last.type) : undefined) ??
      candidates[0];

    selected.push(next.question);
    used.add(next.question.id);
    areas.add(next.question.area);
  }

  return selected;
}

function selectQuestions(
  questions: QuestionRow[],
  historyByQuestion: Map<string, HistoryEntry[]>,
  eloRating: number,
): QuestionRow[] {
  if (questions.length === 0) return [];

  const now = new Date();

  const buildScored = (ignoreLevelPenalty: boolean): ScoredQuestion[] =>
    questions
      .map((q) => ({
        question: q,
        weight: computeWeight(q, historyByQuestion.get(q.id) ?? [], eloRating, now, ignoreLevelPenalty),
      }))
      .sort((a, b) => b.weight - a.weight);

  let selected = pickFromScored(buildScored(false));

  // Fallback: not enough questions after applying level penalty → retry ignoring it
  if (selected.length < LESSON_SIZE && questions.length >= LESSON_SIZE) {
    selected = pickFromScored(buildScored(true));
  }

  // Final shuffle, keeping the first slot fixed (test_classic rule)
  if (selected.length > 1) {
    const rest = selected.slice(1);
    shuffleInPlace(rest);
    selected = [selected[0], ...rest];
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Content sanitization — remove correct answers before sending to client
// ---------------------------------------------------------------------------

function sanitizeContent(type: string, content: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...content };
  switch (type) {
    case 'test_classic':
      delete clean.correct_index;
      break;
    case 'true_false':
      delete clean.correct_answer;
      break;
    case 'multi_select':
      delete clean.correct_indices;
      break;
    // match_columns and order_sequence: the correct order IS the stored order,
    // so we shuffle before sending
    case 'match_columns': {
      const pairs = clean.pairs as { left: string; right: string }[];
      if (Array.isArray(pairs)) {
        const rights = pairs.map((p) => p.right);
        // Fisher-Yates shuffle for the right column
        for (let i = rights.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rights[i], rights[j]] = [rights[j], rights[i]];
        }
        clean.lefts = pairs.map((p) => p.left);
        clean.rights_shuffled = rights;
        delete clean.pairs;
      }
      break;
    }
    case 'order_sequence': {
      const steps = clean.steps as string[];
      if (Array.isArray(steps)) {
        const shuffled = [...steps];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        clean.steps_shuffled = shuffled;
        delete clean.steps;
      }
      break;
    }
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Answer checking
// ---------------------------------------------------------------------------

function checkAnswer(type: string, content: Record<string, unknown>, selectedAnswer: unknown): boolean {
  switch (type) {
    case 'test_classic':
      return selectedAnswer === (content as { correct_index: number }).correct_index;

    case 'true_false':
      return selectedAnswer === (content as { correct_answer: boolean }).correct_answer;

    case 'multi_select': {
      const correct = [...((content as { correct_indices: number[] }).correct_indices)].sort();
      const selected = Array.isArray(selectedAnswer) ? [...selectedAnswer].sort() : [];
      return JSON.stringify(correct) === JSON.stringify(selected);
    }

    case 'match_columns': {
      // Client sends array of right-column indices matching the left-column order
      // Correct answer is [0, 1, 2, ...] (pairs are stored in correct order)
      const pairs = (content as { pairs: unknown[] }).pairs;
      if (!Array.isArray(selectedAnswer) || selectedAnswer.length !== pairs.length) return false;
      return selectedAnswer.every((val, idx) => val === idx);
    }

    case 'order_sequence': {
      // Client sends array of step indices in the order they chose
      // Correct answer is [0, 1, 2, ...] (steps are stored in correct order)
      const steps = (content as { steps: unknown[] }).steps;
      if (!Array.isArray(selectedAnswer) || selectedAnswer.length !== steps.length) return false;
      return selectedAnswer.every((val, idx) => val === idx);
    }

    default:
      return false;
  }
}

function getCorrectAnswer(type: string, content: Record<string, unknown>): unknown {
  switch (type) {
    case 'test_classic':
      return (content as { correct_index: number }).correct_index;
    case 'true_false':
      return (content as { correct_answer: boolean }).correct_answer;
    case 'multi_select':
      return (content as { correct_indices: number[] }).correct_indices;
    case 'match_columns': {
      const pairs = (content as { pairs: unknown[] }).pairs;
      return Array.from({ length: pairs.length }, (_, i) => i);
    }
    case 'order_sequence': {
      const steps = (content as { steps: unknown[] }).steps;
      return Array.from({ length: steps.length }, (_, i) => i);
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function timePenalty(responseTimeMs: number): number {
  if (responseTimeMs < 5000) return 0;
  if (responseTimeMs >= 10000) return 30;
  // Linear between 5000-10000
  return Math.round(((responseTimeMs - 5000) / 5000) * 30);
}

// ---------------------------------------------------------------------------
// Timezone helper — check if user already completed today
// ---------------------------------------------------------------------------

/**
 * Format a UTC instant as the wall-clock time it represents in `timezone`.
 * Returns ISO-like string "YYYY-MM-DDTHH:mm:ss" (no offset).
 */
function formatInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  // Some runtimes return "24" for midnight; normalize to "00".
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}

/**
 * Convert a wall-clock time (YYYY-MM-DDTHH:mm:ss) interpreted in `timezone`
 * into the corresponding UTC instant. Two-pass to handle DST transitions
 * correctly: each pass measures the drift between the guess (parsed as UTC)
 * and what that instant actually looks like in the target timezone, then
 * corrects by that drift.
 */
function zonedTimeToUtc(localDateTime: string, timezone: string): Date {
  const parseAsUtc = (s: string) => new Date(s + 'Z');
  const targetMs = parseAsUtc(localDateTime).getTime();

  // First pass
  let guess = new Date(targetMs);
  let drift = parseAsUtc(formatInTimeZone(guess, timezone)).getTime() - targetMs;
  guess = new Date(targetMs - drift);

  // Second pass — needed when the first guess crosses a DST boundary
  drift = parseAsUtc(formatInTimeZone(guess, timezone)).getTime() - targetMs;
  guess = new Date(guess.getTime() - drift);

  return guess;
}

/**
 * Returns the local calendar day ("YYYY-MM-DD") for `date` in `timezone`.
 * Falls back to UTC date if the timezone string is invalid.
 */
function dayKeyInTz(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Returns the day key immediately before `dayKey` ("YYYY-MM-DD" → "YYYY-MM-DD").
 * Date-only arithmetic via UTC is safe (no DST involved).
 */
function previousDayKey(dayKey: string): string {
  const d = new Date(dayKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getTodayRange(timezone: string): { start: string; end: string } {
  const now = new Date();
  const dateStr = dayKeyInTz(now, timezone);
  let timezoneIsValid = true;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  } catch {
    timezoneIsValid = false;
  }
  if (!timezoneIsValid) {
    return { start: `${dateStr}T00:00:00.000Z`, end: `${dateStr}T23:59:59.999Z` };
  }
  const start = zonedTimeToUtc(`${dateStr}T00:00:00`, timezone).toISOString();
  const end = zonedTimeToUtc(`${dateStr}T23:59:59`, timezone).toISOString();
  return { start, end };
}

// ---------------------------------------------------------------------------
// Streak logic
// ---------------------------------------------------------------------------

/**
 * Streak → XP/SP multiplier (per spec section 5.7).
 * Exported so other modules of the backend (matches, Coach IA, Season Pass)
 * can apply the same multiplier to their own rewards without going through
 * an HTTP hop. Pair with `getPlayerStreakMultiplier` when you only have a
 * playerId at hand.
 */
export function getMultiplier(currentStreak: number): number {
  if (currentStreak <= 2) return 0;
  if (currentStreak <= 7) return 0.5;
  if (currentStreak <= 20) return 1.0;
  if (currentStreak <= 45) return 1.5;
  return 2.0;
}

interface StreakState {
  current_streak: number;
  longest_streak: number;
  last_lesson_completed_at: string;
}

/**
 * Reads the current streak row, evaluates it against today's local day in the
 * given timezone, increments / resets accordingly, and upserts the result.
 *
 * - lastKey === todayKey  → no-op (defensive; complete handler already blocks
 *   double submission via existingSession check).
 * - lastKey === yesterday → current_streak += 1.
 * - else (gap or first ever) → current_streak = 1.
 */
async function updateIndividualStreak(
  playerId: string,
  timezone: string,
): Promise<StreakState> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: existing, error: readErr } = await supabase
    .from('learning_streaks')
    .select('current_streak, longest_streak, last_lesson_completed_at')
    .eq('player_id', playerId)
    .maybeSingle();

  if (readErr) throw new Error(readErr.message);

  const now = new Date();
  const todayKey = dayKeyInTz(now, timezone);
  const yesterdayKey = previousDayKey(todayKey);

  let current = 1;
  let longest = 0;

  if (existing) {
    longest = existing.longest_streak ?? 0;
    if (existing.last_lesson_completed_at) {
      const lastKey = dayKeyInTz(new Date(existing.last_lesson_completed_at), timezone);
      if (lastKey === todayKey) {
        // Already counted today — return as-is.
        return {
          current_streak: existing.current_streak,
          longest_streak: existing.longest_streak,
          last_lesson_completed_at: existing.last_lesson_completed_at,
        };
      }
      if (lastKey === yesterdayKey) {
        current = (existing.current_streak ?? 0) + 1;
      } else {
        current = 1;
      }
    }
  }

  if (current > longest) longest = current;

  const nowIso = now.toISOString();

  const { error: upsertErr } = await supabase
    .from('learning_streaks')
    .upsert(
      {
        player_id: playerId,
        current_streak: current,
        longest_streak: longest,
        last_lesson_completed_at: nowIso,
      },
      { onConflict: 'player_id' },
    );

  if (upsertErr) throw new Error(upsertErr.message);

  return {
    current_streak: current,
    longest_streak: longest,
    last_lesson_completed_at: nowIso,
  };
}

// ---------------------------------------------------------------------------
// Shared streak helpers
// ---------------------------------------------------------------------------

interface SharedStreakRow {
  id: string;
  player_id_1: string;
  player_id_2: string;
  current_streak: number;
  longest_streak: number;
  player1_completed_today: boolean;
  player2_completed_today: boolean;
  last_both_completed_at: string | null;
  timezone: string;
}

/**
 * Normaliza el par de UUIDs para que player_id_1 < player_id_2.
 * Esto garantiza unicidad en la tabla (unique constraint).
 */
function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Reset lazy: evalúa si las flags y la racha necesitan resetearse
 * comparando last_both_completed_at con la fecha actual en la timezone
 * de la racha. Muta el objeto in-place y devuelve true si hubo cambios.
 */
function lazyResetSharedStreak(row: SharedStreakRow): boolean {
  const now = new Date();
  const todayKey = dayKeyInTz(now, row.timezone);

  // Si nunca completaron juntos, no hay referencia temporal para saber si
  // las flags son de hoy o de otro día. No resetear — el peor caso es que
  // un flag de un día anterior persista, pero current_streak sigue en 0.
  if (!row.last_both_completed_at) {
    return false;
  }

  const lastKey = dayKeyInTz(new Date(row.last_both_completed_at), row.timezone);

  if (lastKey === todayKey) {
    // Ambos ya completaron hoy — no tocar nada
    return false;
  }

  const yesterdayKey = previousDayKey(todayKey);
  let changed = false;

  if (lastKey !== yesterdayKey) {
    // Gap > 1 día → resetear racha y flags
    row.current_streak = 0;
    changed = true;
  }

  // Si estamos en un nuevo día (ayer o más), resetear flags
  if (row.player1_completed_today || row.player2_completed_today) {
    row.player1_completed_today = false;
    row.player2_completed_today = false;
    changed = true;
  }

  return changed;
}

/**
 * Busca todas las rachas compartidas del jugador, aplica lazy reset,
 * marca su flag como completada, y si ambos completaron incrementa la racha.
 * Se llama desde POST /daily-lesson/complete.
 */
async function updateSharedStreaks(
  playerId: string,
  _timezone: string,
): Promise<SharedStreakRow[]> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: rows, error } = await supabase
    .from('learning_shared_streaks')
    .select('id, player_id_1, player_id_2, current_streak, longest_streak, player1_completed_today, player2_completed_today, last_both_completed_at, timezone')
    .or(`player_id_1.eq.${playerId},player_id_2.eq.${playerId}`);

  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const updated: SharedStreakRow[] = [];

  for (const row of rows as SharedStreakRow[]) {
    // 1. Aplicar reset lazy
    lazyResetSharedStreak(row);

    // 2. Marcar flag del jugador que acaba de completar
    const isPlayer1 = row.player_id_1 === playerId;

    // Defensa: si el flag ya está marcado, no volver a procesar
    const alreadyMarked = isPlayer1 ? row.player1_completed_today : row.player2_completed_today;
    if (alreadyMarked) {
      updated.push(row);
      continue;
    }

    if (isPlayer1) {
      row.player1_completed_today = true;
    } else {
      row.player2_completed_today = true;
    }

    // 3. Si ambos completaron hoy → incrementar racha
    if (row.player1_completed_today && row.player2_completed_today) {
      row.current_streak += 1;
      if (row.current_streak > row.longest_streak) {
        row.longest_streak = row.current_streak;
      }
      row.last_both_completed_at = new Date().toISOString();
    }

    // 4. Persistir
    const { error: updateErr } = await supabase
      .from('learning_shared_streaks')
      .update({
        current_streak: row.current_streak,
        longest_streak: row.longest_streak,
        player1_completed_today: row.player1_completed_today,
        player2_completed_today: row.player2_completed_today,
        last_both_completed_at: row.last_both_completed_at,
      })
      .eq('id', row.id);

    if (updateErr) throw new Error(updateErr.message);

    updated.push(row);
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /learning/daily-lesson
 * Returns 5 questions selected by the algorithm for the authenticated user.
 * Query params: timezone (default 'UTC')
 */
router.get('/daily-lesson', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req.authContext!.userId);
    if (!player) {
      return res.status(404).json({ ok: false, error: 'No se encontró jugador vinculado a tu cuenta' });
    }

    const timezone = String(req.query.timezone ?? 'UTC').trim() || 'UTC';

    // Check if already completed today
    const { start, end } = getTodayRange(timezone);
    const supabase = getSupabaseServiceRoleClient();

    const { data: todaySession, error: sessionErr } = await supabase
      .from('learning_sessions')
      .select('id, correct_count, total_count, score, xp_earned, completed_at')
      .eq('player_id', player.id)
      .gte('completed_at', start)
      .lte('completed_at', end)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionErr) return res.status(500).json({ ok: false, error: sessionErr.message });

    if (todaySession) {
      return res.json({ ok: true, already_completed: true, session: todaySession });
    }

    // Fetch all active questions and user history in parallel
    const [questionsRes, historyRes] = await Promise.all([
      supabase
        .from('learning_questions')
        .select('id, type, level, area, has_video, video_url, content')
        .eq('is_active', true),
      supabase
        .from('learning_question_log')
        .select('question_id, answered_correctly, answered_at')
        .eq('player_id', player.id)
        .order('answered_at', { ascending: true }),
    ]);

    if (questionsRes.error) return res.status(500).json({ ok: false, error: questionsRes.error.message });
    if (historyRes.error) return res.status(500).json({ ok: false, error: historyRes.error.message });

    const questions = (questionsRes.data ?? []) as QuestionRow[];
    const history = (historyRes.data ?? []) as HistoryEntry[];

    if (questions.length === 0) {
      return res.json({ ok: true, already_completed: false, questions: [] });
    }

    // Group history by question_id
    const historyByQuestion = new Map<string, HistoryEntry[]>();
    for (const h of history) {
      const list = historyByQuestion.get(h.question_id) ?? [];
      list.push(h);
      historyByQuestion.set(h.question_id, list);
    }

    const selected = selectQuestions(questions, historyByQuestion, player.elo_rating);

    // Sanitize content — remove correct answers
    const clientQuestions = selected.map((q) => ({
      id: q.id,
      type: q.type,
      area: q.area,
      has_video: q.has_video,
      video_url: q.video_url,
      content: sanitizeContent(q.type, q.content),
    }));

    return res.json({ ok: true, already_completed: false, questions: clientQuestions });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /learning/daily-lesson/complete
 * Records the result of a completed daily lesson.
 * Body: { timezone: string, answers: [{ question_id, selected_answer, response_time_ms }] }
 */
router.post('/daily-lesson/complete', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req.authContext!.userId);
    if (!player) {
      return res.status(404).json({ ok: false, error: 'No se encontró jugador vinculado a tu cuenta' });
    }

    const { timezone, answers } = req.body ?? {};
    const tz = String(timezone ?? 'UTC').trim() || 'UTC';

    // Validate answers array
    if (!Array.isArray(answers) || answers.length !== LESSON_SIZE) {
      return res.status(400).json({ ok: false, error: `Se requieren exactamente ${LESSON_SIZE} respuestas` });
    }

    for (const a of answers) {
      if (!a.question_id || a.response_time_ms == null || Number(a.response_time_ms) <= 0) {
        return res.status(400).json({ ok: false, error: 'Cada respuesta requiere question_id y response_time_ms > 0' });
      }
    }

    // Check if already completed today
    const { start, end } = getTodayRange(tz);
    const supabase = getSupabaseServiceRoleClient();

    const { data: existingSession } = await supabase
      .from('learning_sessions')
      .select('id')
      .eq('player_id', player.id)
      .gte('completed_at', start)
      .lte('completed_at', end)
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      return res.status(409).json({ ok: false, error: 'Ya completaste la lección de hoy' });
    }

    // Load the questions from DB
    const questionIds = answers.map((a: { question_id: string }) => a.question_id);
    const { data: questionsData, error: qErr } = await supabase
      .from('learning_questions')
      .select('id, type, content')
      .in('id', questionIds);

    if (qErr) return res.status(500).json({ ok: false, error: qErr.message });

    const questionsById = new Map(
      (questionsData ?? []).map((q: { id: string; type: string; content: Record<string, unknown> }) => [q.id, q]),
    );

    if (questionsById.size !== LESSON_SIZE) {
      return res.status(400).json({ ok: false, error: 'Uno o más question_id no son válidos' });
    }

    // Grade each answer
    const results: {
      question_id: string;
      correct: boolean;
      correct_answer: unknown;
      points: number;
    }[] = [];
    const logRows: {
      player_id: string;
      question_id: string;
      answered_correctly: boolean;
      response_time_ms: number;
    }[] = [];

    let totalScore = 0;
    let correctCount = 0;

    for (const answer of answers as { question_id: string; selected_answer: unknown; response_time_ms: number }[]) {
      const question = questionsById.get(answer.question_id)!;
      const isCorrect = checkAnswer(question.type, question.content, answer.selected_answer);
      const penalty = timePenalty(answer.response_time_ms);
      const points = isCorrect ? 100 - penalty : 0;

      if (isCorrect) correctCount++;
      totalScore += points;

      results.push({
        question_id: answer.question_id,
        correct: isCorrect,
        correct_answer: getCorrectAnswer(question.type, question.content),
        points,
      });

      logRows.push({
        player_id: player.id,
        question_id: answer.question_id,
        answered_correctly: isCorrect,
        response_time_ms: answer.response_time_ms,
      });
    }

    const baseXp = Math.round(totalScore / 10);

    // 1. Write the per-question log
    const { error: logErr } = await supabase.from('learning_question_log').insert(logRows);
    if (logErr) return res.status(500).json({ ok: false, error: logErr.message });

    // 2. Update individual streak (post-update value drives the multiplier)
    const streak = await updateIndividualStreak(player.id, tz);
    const multiplier = getMultiplier(streak.current_streak);
    const xpFinal = Math.round(baseXp * (1 + multiplier));

    // 3. Actualizar rachas compartidas
    const sharedStreaks = await updateSharedStreaks(player.id, tz);

    // 4. Insert the session row with the boosted XP
    const { data: sessionData, error: sessionErr } = await supabase
      .from('learning_sessions')
      .insert({
        player_id: player.id,
        correct_count: correctCount,
        total_count: LESSON_SIZE,
        score: totalScore,
        xp_earned: xpFinal,
        timezone: tz,
      })
      .select('id, correct_count, total_count, score, xp_earned, completed_at')
      .single();

    if (sessionErr) return res.status(500).json({ ok: false, error: sessionErr.message });

    return res.json({
      ok: true,
      session: sessionData,
      streak: {
        current: streak.current_streak,
        longest: streak.longest_streak,
        multiplier,
        xp_base: baseXp,
        xp_bonus: xpFinal - baseXp,
      },
      shared_streaks: sharedStreaks.map((s) => ({
        id: s.id,
        partner_id: s.player_id_1 === player.id ? s.player_id_2 : s.player_id_1,
        current_streak: s.current_streak,
        longest_streak: s.longest_streak,
        both_completed_today: s.player1_completed_today && s.player2_completed_today,
      })),
      results,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /learning/streak
 * Returns the authenticated player's individual streak + active multiplier.
 * Pure read — does not evaluate or reset the streak. The stored current_streak
 * is the value persisted at the last completed lesson; it only changes when
 * the next lesson is completed.
 */
router.get('/streak', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req.authContext!.userId);
    if (!player) {
      return res.status(404).json({ ok: false, error: 'No se encontró jugador vinculado a tu cuenta' });
    }

    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('learning_streaks')
      .select('current_streak, longest_streak, last_lesson_completed_at')
      .eq('player_id', player.id)
      .maybeSingle();

    if (error) return res.status(500).json({ ok: false, error: error.message });

    if (!data) {
      return res.json({
        ok: true,
        current_streak: 0,
        longest_streak: 0,
        multiplier: 0,
        last_lesson_completed_at: null,
      });
    }

    return res.json({
      ok: true,
      current_streak: data.current_streak,
      longest_streak: data.longest_streak,
      multiplier: getMultiplier(data.current_streak),
      last_lesson_completed_at: data.last_lesson_completed_at,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /learning/shared-streaks
 * Devuelve las rachas compartidas del jugador autenticado.
 * Aplica reset lazy a cada racha antes de devolverla.
 */
router.get('/shared-streaks', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req.authContext!.userId);
    if (!player) {
      return res.status(404).json({ ok: false, error: 'No se encontró jugador vinculado a tu cuenta' });
    }

    const supabase = getSupabaseServiceRoleClient();

    const { data: rows, error } = await supabase
      .from('learning_shared_streaks')
      .select('id, player_id_1, player_id_2, current_streak, longest_streak, player1_completed_today, player2_completed_today, last_both_completed_at, timezone')
      .or(`player_id_1.eq.${player.id},player_id_2.eq.${player.id}`);

    if (error) return res.status(500).json({ ok: false, error: error.message });

    const streaks = [];

    for (const row of (rows ?? []) as SharedStreakRow[]) {
      const changed = lazyResetSharedStreak(row);
      if (changed) {
        await supabase
          .from('learning_shared_streaks')
          .update({
            current_streak: row.current_streak,
            longest_streak: row.longest_streak,
            player1_completed_today: row.player1_completed_today,
            player2_completed_today: row.player2_completed_today,
          })
          .eq('id', row.id);
      }

      const isPlayer1 = row.player_id_1 === player.id;
      const partnerId = isPlayer1 ? row.player_id_2 : row.player_id_1;

      // Obtener nombre del compañero
      const { data: partner } = await supabase
        .from('players')
        .select('id, first_name, last_name, avatar_url')
        .eq('id', partnerId)
        .maybeSingle();

      streaks.push({
        id: row.id,
        partner: partner
          ? { id: partner.id, first_name: partner.first_name, last_name: partner.last_name, avatar_url: partner.avatar_url }
          : { id: partnerId, first_name: null, last_name: null, avatar_url: null },
        current_streak: row.current_streak,
        longest_streak: row.longest_streak,
        my_completed_today: isPlayer1 ? row.player1_completed_today : row.player2_completed_today,
        partner_completed_today: isPlayer1 ? row.player2_completed_today : row.player1_completed_today,
      });
    }

    return res.json({ ok: true, shared_streaks: streaks });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /learning/shared-streaks
 * Crea una racha compartida con otro jugador.
 * Body: { partner_id: string }
 */
router.post('/shared-streaks', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req.authContext!.userId);
    if (!player) {
      return res.status(404).json({ ok: false, error: 'No se encontró jugador vinculado a tu cuenta' });
    }

    const { partner_id } = req.body ?? {};
    if (!partner_id || typeof partner_id !== 'string') {
      return res.status(400).json({ ok: false, error: 'partner_id es obligatorio' });
    }

    if (partner_id === player.id) {
      return res.status(400).json({ ok: false, error: 'No puedes crear una racha contigo mismo' });
    }

    const supabase = getSupabaseServiceRoleClient();

    // Verificar que el partner existe
    const { data: partnerData } = await supabase
      .from('players')
      .select('id, first_name, last_name, avatar_url')
      .eq('id', partner_id)
      .neq('status', 'deleted')
      .maybeSingle();

    if (!partnerData) {
      return res.status(404).json({ ok: false, error: 'No se encontró el jugador indicado' });
    }

    // Normalizar orden para respetar el unique constraint
    const [pid1, pid2] = normalizePair(player.id, partner_id);

    // Verificar que no exista ya
    const { data: existing } = await supabase
      .from('learning_shared_streaks')
      .select('id')
      .eq('player_id_1', pid1)
      .eq('player_id_2', pid2)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ ok: false, error: 'Ya existe una racha compartida con este jugador' });
    }

    const { data: created, error: insertErr } = await supabase
      .from('learning_shared_streaks')
      .insert({
        player_id_1: pid1,
        player_id_2: pid2,
        current_streak: 0,
        longest_streak: 0,
        player1_completed_today: false,
        player2_completed_today: false,
        timezone: 'UTC',
      })
      .select('id, player_id_1, player_id_2, current_streak, longest_streak, created_at')
      .single();

    if (insertErr) return res.status(500).json({ ok: false, error: insertErr.message });

    return res.status(201).json({
      ok: true,
      shared_streak: {
        id: created.id,
        partner: {
          id: partnerData.id,
          first_name: partnerData.first_name,
          last_name: partnerData.last_name,
          avatar_url: partnerData.avatar_url,
        },
        current_streak: created.current_streak,
        longest_streak: created.longest_streak,
        created_at: created.created_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Cursos — endpoints de jugador
// ---------------------------------------------------------------------------

function isCourseLocked(elo: number, eloMin: number, eloMax: number): boolean {
  return elo < eloMin || elo > eloMax;
}

// GET /learning/courses — lista cursos activos con progreso y locked
router.get('/courses', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req.authContext!.userId);
    if (!player) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

    const supabase = getSupabaseServiceRoleClient();

    // Cursos activos con nombre del club
    const { data: courses, error: coursesErr } = await supabase
      .from('learning_courses')
      .select('id, title, description, banner_url, elo_min, elo_max, clubs(name)')
      .eq('status', 'active')
      .order('elo_min', { ascending: true });

    if (coursesErr) return res.status(500).json({ ok: false, error: coursesErr.message });
    if (!courses || courses.length === 0) return res.json({ ok: true, courses: [] });

    const courseIds = courses.map((c: any) => c.id);

    // Lecciones por curso
    const { data: lessons, error: lessonsErr } = await supabase
      .from('learning_course_lessons')
      .select('id, course_id')
      .in('course_id', courseIds);

    if (lessonsErr) return res.status(500).json({ ok: false, error: lessonsErr.message });

    // Progreso del jugador
    const lessonIds = (lessons || []).map((l: any) => l.id);
    let completedSet = new Set<string>();
    if (lessonIds.length > 0) {
      const { data: progress, error: progressErr } = await supabase
        .from('learning_course_progress')
        .select('lesson_id')
        .eq('player_id', player.id)
        .in('lesson_id', lessonIds);

      if (progressErr) return res.status(500).json({ ok: false, error: progressErr.message });
      completedSet = new Set((progress || []).map((p: any) => p.lesson_id));
    }

    // Contar por curso
    const lessonsByCourse: Record<string, string[]> = {};
    for (const l of (lessons || [])) {
      const lid = (l as any).id;
      const cid = (l as any).course_id;
      if (!lessonsByCourse[cid]) lessonsByCourse[cid] = [];
      lessonsByCourse[cid].push(lid);
    }

    const result = courses.map((c: any) => {
      const courseLessons = lessonsByCourse[c.id] || [];
      const completedCount = courseLessons.filter((lid: string) => completedSet.has(lid)).length;
      const totalLessons = courseLessons.length;
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        banner_url: c.banner_url,
        elo_min: c.elo_min,
        elo_max: c.elo_max,
        club_name: c.clubs?.name || null,
        total_lessons: totalLessons,
        completed_lessons: completedCount,
        is_completed: totalLessons > 0 && completedCount === totalLessons,
        locked: isCourseLocked(player.elo_rating, c.elo_min, c.elo_max),
      };
    });

    return res.json({ ok: true, courses: result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /learning/courses/:id — detalle con lecciones y estados
router.get('/courses/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req.authContext!.userId);
    if (!player) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

    const supabase = getSupabaseServiceRoleClient();
    const courseId = req.params.id;

    const { data: course, error: courseErr } = await supabase
      .from('learning_courses')
      .select('id, title, description, banner_url, elo_min, elo_max, pedagogical_goal, clubs(name)')
      .eq('id', courseId)
      .eq('status', 'active')
      .maybeSingle();

    if (courseErr) return res.status(500).json({ ok: false, error: courseErr.message });
    if (!course) return res.status(404).json({ ok: false, error: 'Curso no encontrado' });

    const locked = isCourseLocked(player.elo_rating, course.elo_min, course.elo_max);

    // Si bloqueado, devolver info básica sin lecciones
    if (locked) {
      // Contar lecciones totales
      const { count } = await supabase
        .from('learning_course_lessons')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', courseId);

      return res.json({
        ok: true,
        course: {
          id: course.id,
          title: course.title,
          description: course.description,
          banner_url: course.banner_url,
          elo_min: course.elo_min,
          elo_max: course.elo_max,
          pedagogical_goal: course.pedagogical_goal,
          club_name: (course as any).clubs?.name || null,
          locked: true,
          total_lessons: count || 0,
        },
      });
    }

    // Curso desbloqueado: lecciones + progreso
    const { data: lessons, error: lessonsErr } = await supabase
      .from('learning_course_lessons')
      .select('id, order, title, description, video_url, duration_seconds')
      .eq('course_id', courseId)
      .order('order', { ascending: true });

    if (lessonsErr) return res.status(500).json({ ok: false, error: lessonsErr.message });

    const lessonIds = (lessons || []).map((l: any) => l.id);
    let completedSet = new Set<string>();
    if (lessonIds.length > 0) {
      const { data: progress, error: progressErr } = await supabase
        .from('learning_course_progress')
        .select('lesson_id')
        .eq('player_id', player.id)
        .in('lesson_id', lessonIds);

      if (progressErr) return res.status(500).json({ ok: false, error: progressErr.message });
      completedSet = new Set((progress || []).map((p: any) => p.lesson_id));
    }

    // Determinar estado de cada lección
    const lessonsWithStatus = (lessons || []).map((l: any, i: number) => {
      let status: string;
      if (completedSet.has(l.id)) {
        status = 'completed';
      } else if (i === 0 || completedSet.has((lessons as any[])[i - 1].id)) {
        status = 'available';
      } else {
        status = 'locked';
      }
      return {
        id: l.id,
        order: l.order,
        title: l.title,
        description: l.description,
        video_url: l.video_url,
        duration_seconds: l.duration_seconds,
        status,
      };
    });

    const completedCount = completedSet.size;
    const totalLessons = (lessons || []).length;

    return res.json({
      ok: true,
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        banner_url: course.banner_url,
        elo_min: course.elo_min,
        elo_max: course.elo_max,
        pedagogical_goal: course.pedagogical_goal,
        club_name: (course as any).clubs?.name || null,
        locked: false,
        total_lessons: totalLessons,
        completed_lessons: completedCount,
        is_completed: totalLessons > 0 && completedCount === totalLessons,
        lessons: lessonsWithStatus,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /learning/courses/:id/complete-lesson — marcar lección completada
router.post('/courses/:id/complete-lesson', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req.authContext!.userId);
    if (!player) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

    const { lesson_id } = req.body;
    if (!lesson_id) return res.status(400).json({ ok: false, error: 'lesson_id es requerido' });

    const supabase = getSupabaseServiceRoleClient();
    const courseId = req.params.id;

    // Obtener curso
    const { data: course, error: courseErr } = await supabase
      .from('learning_courses')
      .select('id, elo_min, elo_max, status')
      .eq('id', courseId)
      .maybeSingle();

    if (courseErr) return res.status(500).json({ ok: false, error: courseErr.message });
    if (!course || course.status !== 'active') return res.status(404).json({ ok: false, error: 'Curso no encontrado' });

    // Validar nivel
    if (isCourseLocked(player.elo_rating, course.elo_min, course.elo_max)) {
      return res.status(403).json({ ok: false, error: 'Nivel insuficiente para este curso' });
    }

    // Validar que la lección pertenece al curso
    const { data: allLessons, error: lessonsErr } = await supabase
      .from('learning_course_lessons')
      .select('id, order')
      .eq('course_id', courseId)
      .order('order', { ascending: true });

    if (lessonsErr) return res.status(500).json({ ok: false, error: lessonsErr.message });

    const lessonIndex = (allLessons || []).findIndex((l: any) => l.id === lesson_id);
    if (lessonIndex === -1) {
      return res.status(400).json({ ok: false, error: 'La lección no pertenece a este curso' });
    }

    // Validar que la lección anterior está completada (si no es la primera)
    if (lessonIndex > 0) {
      const prevLessonId = (allLessons as any[])[lessonIndex - 1].id;
      const { data: prevProgress } = await supabase
        .from('learning_course_progress')
        .select('id')
        .eq('player_id', player.id)
        .eq('lesson_id', prevLessonId)
        .maybeSingle();

      if (!prevProgress) {
        return res.status(400).json({ ok: false, error: 'Debes completar la lección anterior primero' });
      }
    }

    // Upsert progreso
    const { error: upsertErr } = await supabase
      .from('learning_course_progress')
      .upsert(
        { player_id: player.id, lesson_id },
        { onConflict: 'player_id,lesson_id' }
      );

    if (upsertErr) return res.status(500).json({ ok: false, error: upsertErr.message });

    // Contar progreso actualizado
    const lessonIds = (allLessons || []).map((l: any) => l.id);
    const { data: progress } = await supabase
      .from('learning_course_progress')
      .select('lesson_id')
      .eq('player_id', player.id)
      .in('lesson_id', lessonIds);

    const completedLessons = (progress || []).length;
    const totalLessons = (allLessons || []).length;

    return res.json({
      ok: true,
      lesson_completed: true,
      course_completed: totalLessons > 0 && completedLessons === totalLessons,
      completed_lessons: completedLessons,
      total_lessons: totalLessons,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * Internal helper for other backend modules (matches, Coach IA, Season Pass).
 * Reads the player's current streak and returns the active multiplier.
 * Returns 0 (no bonus) if the player has no streak row yet.
 *
 * Prefer importing this function over making an HTTP call to `/learning/...`
 * from another router — keeps the call in-process and avoids exposing a
 * public lookup endpoint by playerId.
 */
// ---------------------------------------------------------------------------
// Club management helpers
// ---------------------------------------------------------------------------

const VALID_QUESTION_TYPES = ['test_classic', 'true_false', 'multi_select', 'match_columns', 'order_sequence'] as const;
const VALID_AREAS = ['technique', 'tactics', 'physical', 'mental_vocabulary'] as const;

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

function validateQuestionContent(type: string, content: unknown): string | null {
  if (!content || typeof content !== 'object') return 'content es obligatorio y debe ser un objeto';
  const c = content as Record<string, unknown>;

  switch (type) {
    case 'test_classic': {
      if (!c.question || typeof c.question !== 'string') return 'content.question debe ser un string no vacío';
      if (!Array.isArray(c.options) || c.options.length !== 4 || !c.options.every((o: unknown) => typeof o === 'string' && o.length > 0))
        return 'content.options debe ser un array de 4 strings no vacíos';
      if (typeof c.correct_index !== 'number' || !Number.isInteger(c.correct_index) || c.correct_index < 0 || c.correct_index > 3)
        return 'content.correct_index debe ser un entero entre 0 y 3';
      return null;
    }
    case 'true_false': {
      if (!c.statement || typeof c.statement !== 'string') return 'content.statement debe ser un string no vacío';
      if (typeof c.correct_answer !== 'boolean') return 'content.correct_answer debe ser un booleano';
      return null;
    }
    case 'multi_select': {
      if (!c.question || typeof c.question !== 'string') return 'content.question debe ser un string no vacío';
      if (!Array.isArray(c.options) || c.options.length !== 4 || !c.options.every((o: unknown) => typeof o === 'string' && o.length > 0))
        return 'content.options debe ser un array de 4 strings no vacíos';
      if (!Array.isArray(c.correct_indices) || c.correct_indices.length < 2 || c.correct_indices.length > 3)
        return 'content.correct_indices debe ser un array de 2 a 3 enteros';
      const indices = c.correct_indices as number[];
      if (!indices.every((i: number) => Number.isInteger(i) && i >= 0 && i <= 3))
        return 'Cada valor en correct_indices debe ser un entero entre 0 y 3';
      if (new Set(indices).size !== indices.length)
        return 'correct_indices no puede tener valores duplicados';
      return null;
    }
    case 'match_columns': {
      if (!Array.isArray(c.pairs) || c.pairs.length < 3 || c.pairs.length > 5)
        return 'content.pairs debe ser un array de 3 a 5 objetos';
      for (const pair of c.pairs as Record<string, unknown>[]) {
        if (!pair || typeof pair.left !== 'string' || !pair.left || typeof pair.right !== 'string' || !pair.right)
          return 'Cada par debe tener left y right como strings no vacíos';
      }
      return null;
    }
    case 'order_sequence': {
      if (!Array.isArray(c.steps) || c.steps.length < 3 || c.steps.length > 6)
        return 'content.steps debe ser un array de 3 a 6 strings';
      if (!c.steps.every((s: unknown) => typeof s === 'string' && (s as string).length > 0))
        return 'Cada step debe ser un string no vacío';
      return null;
    }
    default:
      return `Tipo de pregunta desconocido: ${type}`;
  }
}

async function getCourseForClubEdit(
  req: Request,
  courseId: string,
  requireDraft: boolean,
): Promise<{ course: any } | { error: string; status: number }> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: course, error } = await supabase
    .from('learning_courses')
    .select('id, club_id, title, description, banner_url, elo_min, elo_max, pedagogical_goal, status, created_at, updated_at')
    .eq('id', courseId)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 };
  if (!course) return { error: 'Curso no encontrado', status: 404 };
  if (!canAccessClub(req, course.club_id)) {
    return { error: 'No tienes acceso a este club', status: 403 };
  }
  if (requireDraft && course.status !== 'draft') {
    return { error: 'Solo se puede modificar un curso en estado draft', status: 400 };
  }
  return { course };
}

// ---------------------------------------------------------------------------
// Preguntas — gestión de club (requireClubOwnerOrAdmin)
// ---------------------------------------------------------------------------

// POST /learning/questions — crear pregunta
router.post('/questions', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const { club_id, type, level, area, has_video, video_url, content } = req.body ?? {};

    if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
    if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

    if (!VALID_QUESTION_TYPES.includes(type)) {
      return res.status(400).json({ ok: false, error: `type debe ser uno de: ${VALID_QUESTION_TYPES.join(', ')}` });
    }
    if (!VALID_AREAS.includes(area)) {
      return res.status(400).json({ ok: false, error: `area debe ser uno de: ${VALID_AREAS.join(', ')}` });
    }
    if (level == null || typeof level !== 'number' || level < 0) {
      return res.status(400).json({ ok: false, error: 'level debe ser un número >= 0' });
    }
    if (has_video && (!video_url || typeof video_url !== 'string')) {
      return res.status(400).json({ ok: false, error: 'video_url es obligatorio cuando has_video es true' });
    }

    const contentError = validateQuestionContent(type, content);
    if (contentError) return res.status(400).json({ ok: false, error: contentError });

    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('learning_questions')
      .insert({
        type,
        level,
        area,
        has_video: !!has_video,
        video_url: has_video ? video_url : null,
        content,
        created_by_club: club_id,
        is_active: true,
      })
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PUT /learning/questions/:id — actualizar pregunta
router.put('/questions/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const questionId = req.params.id;

    const { data: existing, error: fetchErr } = await supabase
      .from('learning_questions')
      .select('id, created_by_club, type')
      .eq('id', questionId)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    if (!canAccessClub(req, existing.created_by_club)) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    const { type, level, area, has_video, video_url, content } = req.body ?? {};
    const updates: Record<string, unknown> = {};

    const effectiveType = type ?? existing.type;

    if (type !== undefined) {
      if (!VALID_QUESTION_TYPES.includes(type)) {
        return res.status(400).json({ ok: false, error: `type debe ser uno de: ${VALID_QUESTION_TYPES.join(', ')}` });
      }
      updates.type = type;
    }
    if (area !== undefined) {
      if (!VALID_AREAS.includes(area)) {
        return res.status(400).json({ ok: false, error: `area debe ser uno de: ${VALID_AREAS.join(', ')}` });
      }
      updates.area = area;
    }
    if (level !== undefined) {
      if (typeof level !== 'number' || level < 0) {
        return res.status(400).json({ ok: false, error: 'level debe ser un número >= 0' });
      }
      updates.level = level;
    }
    if (has_video !== undefined) {
      updates.has_video = !!has_video;
      if (has_video && (!video_url && !updates.video_url)) {
        // Necesita video_url si se activa has_video
      }
    }
    if (video_url !== undefined) {
      updates.video_url = video_url;
    }
    if (content !== undefined) {
      const contentError = validateQuestionContent(effectiveType, content);
      if (contentError) return res.status(400).json({ ok: false, error: contentError });
      updates.content = content;
    }

    // Validar has_video + video_url combinados
    const finalHasVideo = updates.has_video !== undefined ? updates.has_video : undefined;
    if (finalHasVideo === true) {
      const finalVideoUrl = updates.video_url;
      if (!finalVideoUrl || typeof finalVideoUrl !== 'string') {
        return res.status(400).json({ ok: false, error: 'video_url es obligatorio cuando has_video es true' });
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'No se enviaron campos para actualizar' });
    }

    const { data, error } = await supabase
      .from('learning_questions')
      .update(updates)
      .eq('id', questionId)
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PATCH /learning/questions/:id/deactivate — desactivar pregunta
router.patch('/questions/:id/deactivate', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const questionId = req.params.id;

    const { data: existing, error: fetchErr } = await supabase
      .from('learning_questions')
      .select('id, created_by_club')
      .eq('id', questionId)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    if (!canAccessClub(req, existing.created_by_club)) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    const { error } = await supabase
      .from('learning_questions')
      .update({ is_active: false })
      .eq('id', questionId);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: { id: questionId, is_active: false } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /learning/questions — listar preguntas del club
router.get('/questions', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const clubId = req.query.club_id as string;
    if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio como query param' });
    if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

    const supabase = getSupabaseServiceRoleClient();
    let query = supabase
      .from('learning_questions')
      .select('*')
      .eq('created_by_club', clubId)
      .order('created_at', { ascending: false });

    const { type, area, is_active } = req.query;
    if (type) query = query.eq('type', type as string);
    if (area) query = query.eq('area', area as string);
    // Default: solo activas; si se pasa is_active=false explícitamente, mostrar inactivas
    if (is_active === 'false') {
      query = query.eq('is_active', false);
    } else if (is_active === 'all') {
      // No filtrar por is_active
    } else {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Cursos — gestión de club (requireClubOwnerOrAdmin)
// ---------------------------------------------------------------------------

// POST /learning/courses — crear curso en draft
router.post('/courses', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const { club_id, title, description, banner_url, elo_min, elo_max, pedagogical_goal } = req.body ?? {};

    if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
    if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ ok: false, error: 'title es obligatorio' });
    }
    if (elo_min != null && elo_max != null && Number(elo_min) > Number(elo_max)) {
      return res.status(400).json({ ok: false, error: 'elo_min no puede ser mayor que elo_max' });
    }

    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('learning_courses')
      .insert({
        club_id,
        title: title.trim(),
        description: description || null,
        banner_url: banner_url || null,
        elo_min: elo_min ?? 0,
        elo_max: elo_max ?? 7,
        pedagogical_goal: pedagogical_goal || null,
        status: 'draft',
      })
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PUT /learning/courses/:id — actualizar curso (solo en draft)
router.put('/courses/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const result = await getCourseForClubEdit(req, req.params.id, true);
    if ('error' in result) return res.status(result.status).json({ ok: false, error: result.error });

    const { title, description, banner_url, elo_min, elo_max, pedagogical_goal } = req.body ?? {};
    const updates: Record<string, unknown> = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ ok: false, error: 'title no puede estar vacío' });
      }
      updates.title = title.trim();
    }
    if (description !== undefined) updates.description = description || null;
    if (banner_url !== undefined) updates.banner_url = banner_url || null;
    if (elo_min !== undefined) updates.elo_min = elo_min;
    if (elo_max !== undefined) updates.elo_max = elo_max;
    if (pedagogical_goal !== undefined) updates.pedagogical_goal = pedagogical_goal || null;

    // Validar rango elo con valores finales
    const finalMin = updates.elo_min ?? result.course.elo_min;
    const finalMax = updates.elo_max ?? result.course.elo_max;
    if (Number(finalMin) > Number(finalMax)) {
      return res.status(400).json({ ok: false, error: 'elo_min no puede ser mayor que elo_max' });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'No se enviaron campos para actualizar' });
    }

    updates.updated_at = new Date().toISOString();

    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('learning_courses')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /learning/courses/:id/lessons — añadir lección a curso (solo en draft)
router.post('/courses/:id/lessons', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const result = await getCourseForClubEdit(req, req.params.id, true);
    if ('error' in result) return res.status(result.status).json({ ok: false, error: result.error });

    const { title, description, video_url, duration_seconds } = req.body ?? {};
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ ok: false, error: 'title es obligatorio' });
    }

    const supabase = getSupabaseServiceRoleClient();

    // Calcular order
    const { data: maxRow } = await supabase
      .from('learning_course_lessons')
      .select('order')
      .eq('course_id', req.params.id)
      .order('order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxRow?.order ?? 0) + 1;

    const { data, error } = await supabase
      .from('learning_course_lessons')
      .insert({
        course_id: req.params.id,
        order: nextOrder,
        title: title.trim(),
        description: description || null,
        video_url: video_url || null,
        duration_seconds: duration_seconds ?? null,
      })
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PUT /learning/courses/:id/lessons/:lessonId — actualizar lección (solo en draft)
router.put('/courses/:id/lessons/:lessonId', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const result = await getCourseForClubEdit(req, req.params.id, true);
    if ('error' in result) return res.status(result.status).json({ ok: false, error: result.error });

    const supabase = getSupabaseServiceRoleClient();
    const { lessonId } = req.params;

    // Verificar que la lección pertenece al curso
    const { data: lesson, error: lessonErr } = await supabase
      .from('learning_course_lessons')
      .select('id')
      .eq('id', lessonId)
      .eq('course_id', req.params.id)
      .maybeSingle();

    if (lessonErr) return res.status(500).json({ ok: false, error: lessonErr.message });
    if (!lesson) return res.status(404).json({ ok: false, error: 'Lección no encontrada en este curso' });

    const { title, description, video_url, duration_seconds } = req.body ?? {};
    const updates: Record<string, unknown> = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ ok: false, error: 'title no puede estar vacío' });
      }
      updates.title = title.trim();
    }
    if (description !== undefined) updates.description = description || null;
    if (video_url !== undefined) updates.video_url = video_url || null;
    if (duration_seconds !== undefined) updates.duration_seconds = duration_seconds;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'No se enviaron campos para actualizar' });
    }

    const { data, error } = await supabase
      .from('learning_course_lessons')
      .update(updates)
      .eq('id', lessonId)
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// DELETE /learning/courses/:id/lessons/:lessonId — eliminar lección (solo en draft)
router.delete('/courses/:id/lessons/:lessonId', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const result = await getCourseForClubEdit(req, req.params.id, true);
    if ('error' in result) return res.status(result.status).json({ ok: false, error: result.error });

    const supabase = getSupabaseServiceRoleClient();
    const { lessonId } = req.params;

    // Verificar que la lección pertenece al curso
    const { data: lesson, error: lessonErr } = await supabase
      .from('learning_course_lessons')
      .select('id')
      .eq('id', lessonId)
      .eq('course_id', req.params.id)
      .maybeSingle();

    if (lessonErr) return res.status(500).json({ ok: false, error: lessonErr.message });
    if (!lesson) return res.status(404).json({ ok: false, error: 'Lección no encontrada en este curso' });

    // Eliminar
    const { error: deleteErr } = await supabase
      .from('learning_course_lessons')
      .delete()
      .eq('id', lessonId);

    if (deleteErr) return res.status(500).json({ ok: false, error: deleteErr.message });

    // Re-ordenar lecciones restantes
    const { data: remaining } = await supabase
      .from('learning_course_lessons')
      .select('id')
      .eq('course_id', req.params.id)
      .order('order', { ascending: true });

    for (let i = 0; i < (remaining || []).length; i++) {
      await supabase
        .from('learning_course_lessons')
        .update({ order: i + 1 })
        .eq('id', remaining![i].id);
    }

    return res.json({ ok: true, data: { id: lessonId, deleted: true } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /learning/courses/:id/submit — enviar curso a revisión
router.post('/courses/:id/submit', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const result = await getCourseForClubEdit(req, req.params.id, true);
    if ('error' in result) return res.status(result.status).json({ ok: false, error: result.error });

    const supabase = getSupabaseServiceRoleClient();

    // Contar lecciones
    const { count, error: countErr } = await supabase
      .from('learning_course_lessons')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', req.params.id);

    if (countErr) return res.status(500).json({ ok: false, error: countErr.message });

    if ((count ?? 0) < 2) {
      return res.status(400).json({ ok: false, error: 'El curso debe tener al menos 2 lecciones para enviarse a revisión' });
    }

    const { data, error } = await supabase
      .from('learning_courses')
      .update({ status: 'pending_review', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('id, status, updated_at')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Internal helpers for other backend modules
// ---------------------------------------------------------------------------

export async function getPlayerStreakMultiplier(playerId: string): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('learning_streaks')
    .select('current_streak')
    .eq('player_id', playerId)
    .maybeSingle();
  return getMultiplier(data?.current_streak ?? 0);
}

export default router;
