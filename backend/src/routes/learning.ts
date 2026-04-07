import { Router, Request, Response, NextFunction } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';

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

function computeWeight(q: QuestionRow, history: HistoryEntry[], eloRating: number, now: Date): number {
  return (
    PESO_BASE +
    bonusFallada(history) +
    bonusNovedad(history) +
    bonusTiempo(history, now) -
    penalizacionNivel(q.level, eloRating) -
    penalizacionRepeticion(history)
  );
}

function selectQuestions(
  questions: QuestionRow[],
  historyByQuestion: Map<string, HistoryEntry[]>,
  eloRating: number,
): QuestionRow[] {
  if (questions.length === 0) return [];

  const now = new Date();

  const scored: ScoredQuestion[] = questions.map((q) => ({
    question: q,
    weight: computeWeight(q, historyByQuestion.get(q.id) ?? [], eloRating, now),
  }));

  scored.sort((a, b) => b.weight - a.weight);

  const selected: QuestionRow[] = [];
  const used = new Set<string>();

  // Rule: first question should be test_classic if available
  const firstClassic = scored.find((s) => s.question.type === 'test_classic' && !used.has(s.question.id));
  if (firstClassic) {
    selected.push(firstClassic.question);
    used.add(firstClassic.question.id);
  }

  // Fill remaining slots respecting variety rules
  for (const s of scored) {
    if (selected.length >= LESSON_SIZE) break;
    if (used.has(s.question.id)) continue;

    // No consecutive same type
    if (selected.length > 0 && selected[selected.length - 1].type === s.question.type) {
      // Try to find a different type with decent weight
      const alt = scored.find(
        (x) =>
          !used.has(x.question.id) &&
          x.question.type !== selected[selected.length - 1].type &&
          x.weight > 0,
      );
      if (alt) {
        selected.push(alt.question);
        used.add(alt.question.id);
        continue;
      }
    }

    selected.push(s.question);
    used.add(s.question.id);
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

function computeEloDelta(ratio: number): number {
  if (ratio >= 0.8) return 0.1;
  if (ratio >= 0.6) return 0.05;
  if (ratio >= 0.4) return 0;
  return -0.05;
}

// ---------------------------------------------------------------------------
// Timezone helper — check if user already completed today
// ---------------------------------------------------------------------------

function getTodayRange(timezone: string): { start: string; end: string } {
  // Calculate "today" boundaries in the user's timezone
  // Use Intl.DateTimeFormat to get the current date in the user's tz
  const now = new Date();
  let dateStr: string;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dateStr = formatter.format(now); // YYYY-MM-DD
  } catch {
    // Fallback to UTC if invalid timezone
    dateStr = now.toISOString().slice(0, 10);
  }

  // Build start/end of that day in UTC-equivalent for the timezone
  // We query using the timezone-aware approach: convert the date boundaries to UTC
  const startLocal = `${dateStr}T00:00:00`;
  const endLocal = `${dateStr}T23:59:59`;

  // Convert local boundaries to UTC using the timezone offset
  const startUtc = localToUtc(startLocal, timezone);
  const endUtc = localToUtc(endLocal, timezone);

  return { start: startUtc, end: endUtc };
}

function localToUtc(localDateTimeStr: string, timezone: string): string {
  // Create a date in UTC, then figure out the offset for the given timezone
  try {
    // Parse as if it were UTC
    const utcDate = new Date(localDateTimeStr + 'Z');
    // Get the timezone offset by comparing formatted dates
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const utcFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Use a reference point to calculate the offset
    const refDate = new Date('2026-01-15T12:00:00Z');
    const localParts = formatter.formatToParts(refDate);
    const utcParts = utcFormatter.formatToParts(refDate);

    const getVal = (parts: Intl.DateTimeFormatPart[], type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? 0);

    const localHour = getVal(localParts, 'hour');
    const utcHour = getVal(utcParts, 'hour');
    const localDay = getVal(localParts, 'day');
    const utcDay = getVal(utcParts, 'day');

    let offsetHours = localHour - utcHour;
    if (localDay > utcDay) offsetHours += 24;
    if (localDay < utcDay) offsetHours -= 24;

    // The local time in UTC = localTime - offset
    const result = new Date(utcDate.getTime() - offsetHours * 60 * 60 * 1000);
    return result.toISOString();
  } catch {
    return localDateTimeStr + 'Z';
  }
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
      .select('id, correct_count, total_count, score, xp_earned, elo_before, elo_after, completed_at')
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

    const xpEarned = Math.round(totalScore / 10);
    const ratio = correctCount / LESSON_SIZE;
    const eloDelta = computeEloDelta(ratio);
    const eloBefore = player.elo_rating;
    const eloAfter = Math.round((eloBefore + eloDelta) * 100) / 100;

    // Write to DB: log entries, session, elo update
    const [logRes, sessionRes, eloRes] = await Promise.all([
      supabase.from('learning_question_log').insert(logRows),
      supabase
        .from('learning_sessions')
        .insert({
          player_id: player.id,
          correct_count: correctCount,
          total_count: LESSON_SIZE,
          score: totalScore,
          xp_earned: xpEarned,
          elo_before: eloBefore,
          elo_after: eloAfter,
          timezone: tz,
        })
        .select('id, correct_count, total_count, score, xp_earned, elo_before, elo_after, completed_at')
        .single(),
      supabase
        .from('players')
        .update({ elo_rating: eloAfter, elo_last_updated_at: new Date().toISOString() })
        .eq('id', player.id),
    ]);

    if (logRes.error) return res.status(500).json({ ok: false, error: logRes.error.message });
    if (sessionRes.error) return res.status(500).json({ ok: false, error: sessionRes.error.message });
    if (eloRes.error) return res.status(500).json({ ok: false, error: eloRes.error.message });

    return res.json({
      ok: true,
      session: sessionRes.data,
      results,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
