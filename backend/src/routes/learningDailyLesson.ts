import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { requireAuth, getPlayerFromAuth } from './learningHelpers';
import {
  QuestionRow, HistoryEntry, LESSON_SIZE,
  selectQuestions, sanitizeContent, checkAnswer, getCorrectAnswer, timePenalty,
} from './learningAlgorithm';
import { getTodayRange } from './learningTimezone';
import {
  getMultiplier, updateIndividualStreak, updateSharedStreaks,
} from './learningStreaks';

const router = Router();

// GET /daily-lesson
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

// POST /daily-lesson/complete
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

export default router;
