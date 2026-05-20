import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { requireAuth, getPlayerFromAuth, requireOnboarding } from './learningHelpers';
import {
  QuestionRow, HistoryEntry, LESSON_SIZE,
  selectQuestions, sanitizeContent, checkAnswer, getCorrectAnswer, timePenalty,
} from './learningAlgorithm';
import { getTodayRange } from './learningTimezone';
import {
  computeSeasonPassLessonSpDelta,
  getMultiplier,
  updateIndividualStreak,
  updateSharedStreaks,
} from './learningStreaks';
import { addSeasonPassSp } from '../services/seasonPassService';
import { getActiveSeasonRow } from '../services/seasonPassSeasonConfig';

const router = Router();

// GET /daily-lesson
router.get('/daily-lesson', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req.authContext!.userId);
    if (!player) {
      return res.status(404).json({ ok: false, error: 'No se encontró jugador vinculado a tu cuenta' });
    }
    const onboardingError = requireOnboarding(player);
    if (onboardingError) return res.status(403).json({ ok: false, error: onboardingError, requires_onboarding: true });

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

    // Fetch all active questions and user history in parallel (also needed for repeat)
    const [questionsRes, historyRes] = await Promise.all([
      supabase
        .from('learning_questions')
        .select('id, type, level, area, has_video, video_url, content, created_by_club, clubs:created_by_club(name, city)')
        // Solo se sirven preguntas publicadas. Drafts e inactivas se quedan fuera.
        .eq('status', 'published'),
      supabase
        .from('learning_question_log')
        .select('question_id, answered_correctly, answered_at')
        .eq('player_id', player.id)
        .order('answered_at', { ascending: true }),
    ]);

    if (questionsRes.error) return res.status(500).json({ ok: false, error: questionsRes.error.message });
    if (historyRes.error) return res.status(500).json({ ok: false, error: historyRes.error.message });

    let questions = (questionsRes.data ?? []) as QuestionRow[];
    const history = (historyRes.data ?? []) as HistoryEntry[];

    if (questions.length === 0) {
      // Sin preguntas publicadas en absoluto. Mismo flag para que el mobile
      // muestre la pantalla "Lección no disponible" en vez de un error genérico.
      return res.json({ ok: true, already_completed: false, questions: [], not_enough_questions: true });
    }

    // Para preguntas type='puzzle', el `content` está en learning_puzzles. Mergear.
    const puzzleIds = questions.filter((q) => q.type === 'puzzle').map((q) => q.id);
    if (puzzleIds.length > 0) {
      const { data: puzzles, error: puzzleErr } = await supabase
        .from('learning_puzzles')
        .select('question_id, statement, intro_frame, initial_frame, options, schema_version')
        .in('question_id', puzzleIds);
      if (puzzleErr) return res.status(500).json({ ok: false, error: puzzleErr.message });
      const byQ = new Map((puzzles ?? []).map((p) => [String(p.question_id), p]));
      const orphans: string[] = [];
      for (const q of questions) {
        if (q.type === 'puzzle') {
          const p = byQ.get(String(q.id));
          if (p) {
            q.content = {
              schema_version: p.schema_version,
              statement: p.statement,
              intro_frame: p.intro_frame,
              initial_frame: p.initial_frame,
              options: p.options,
            };
          } else {
            orphans.push(q.id);
          }
        }
      }
      // Excluir puzzles huérfanos (sin fila en learning_puzzles): el cliente
      // crashearía al intentar renderizarlos sin initial_frame ni options.
      if (orphans.length > 0) {
        console.warn('[daily-lesson] Puzzles huérfanos excluidos:', orphans);
        questions = questions.filter((q) => !orphans.includes(q.id));
      }
    }

    // Group history by question_id
    const historyByQuestion = new Map<string, HistoryEntry[]>();
    for (const h of history) {
      const list = historyByQuestion.get(h.question_id) ?? [];
      list.push(h);
      historyByQuestion.set(h.question_id, list);
    }

    const selected = selectQuestions(questions, historyByQuestion, player.elo_rating);

    // Si no hay suficientes preguntas para una lección completa, no servimos
    // una lección parcial — el mobile lo trataba como questions.length=N y
    // crasheaba al pasar de la posición N. Devolvemos un flag explícito para
    // que la app muestre una pantalla "Lección no disponible" amigable.
    if (selected.length < LESSON_SIZE) {
      return res.json({
        ok: true,
        already_completed: !!todaySession,
        session: todaySession ?? undefined,
        questions: [],
        not_enough_questions: true,
      });
    }

    // Sanitize content — remove correct answers
    const clientQuestions = selected.map((q) => {
      const raw = q as unknown as Record<string, unknown>;
      const club = raw.clubs as { name?: string; city?: string } | null;
      return {
        id: q.id,
        type: q.type,
        area: q.area,
        has_video: q.has_video,
        video_url: q.video_url,
        content: sanitizeContent(q.type, q.content),
        club_name: club?.name ?? null,
        club_city: club?.city ?? null,
      };
    });

    return res.json({
      ok: true,
      already_completed: !!todaySession,
      session: todaySession ?? undefined,
      questions: clientQuestions,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /daily-lesson/today-results
// Devuelve los resultados de la sesión de HOY (si existe), con el detalle por
// pregunta reconstruido desde learning_question_log. Permite al usuario ver
// su pantalla de resultados sin tener que rehacer la lección.
// Shape compatible con SubmitLessonResponse para reutilizar el render existente.
router.get('/daily-lesson/today-results', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req.authContext!.userId);
    if (!player) {
      return res.status(404).json({ ok: false, error: 'No se encontró jugador vinculado a tu cuenta' });
    }
    const onboardingError = requireOnboarding(player);
    if (onboardingError) return res.status(403).json({ ok: false, error: onboardingError, requires_onboarding: true });

    const timezone = String(req.query.timezone ?? 'UTC').trim() || 'UTC';
    const { start, end } = getTodayRange(timezone);
    const supabase = getSupabaseServiceRoleClient();

    // 1. Sesión de hoy. Si no hay, 404 (el botón no debería ser visible).
    const { data: todaySession, error: sErr } = await supabase
      .from('learning_sessions')
      .select('id, correct_count, total_count, score, xp_earned, completed_at')
      .eq('player_id', player.id)
      .gte('completed_at', start)
      .lte('completed_at', end)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sErr) return res.status(500).json({ ok: false, error: sErr.message });
    if (!todaySession) return res.status(404).json({ ok: false, error: 'No hay sesión de hoy' });

    // 2. Logs de respuestas de hoy (en orden cronológico).
    const { data: logsRaw, error: lErr } = await supabase
      .from('learning_question_log')
      .select('question_id, answered_correctly, answered_at')
      .eq('player_id', player.id)
      .gte('answered_at', start)
      .lte('answered_at', end)
      .order('answered_at', { ascending: true });

    if (lErr) return res.status(500).json({ ok: false, error: lErr.message });
    const logs = logsRaw ?? [];

    // 3. Preguntas que respondió en esos logs. Si no hay logs (datos antiguos),
    //    devolvemos arrays vacíos y el cliente muestra solo el resumen.
    type RawQ = {
      id: string;
      type: string;
      level: number;
      area: string;
      has_video: boolean;
      video_url: string | null;
      content: Record<string, unknown>;
      created_by_club: string;
      clubs: { name: string; city: string } | { name: string; city: string }[] | null;
    };
    let questions: RawQ[] = [];
    if (logs.length > 0) {
      const questionIds = logs.map((l) => l.question_id);
      const { data: qData, error: qErr } = await supabase
        .from('learning_questions')
        .select('id, type, level, area, has_video, video_url, content, created_by_club, clubs:created_by_club(name, city)')
        .in('id', questionIds);
      if (qErr) return res.status(500).json({ ok: false, error: qErr.message });
      questions = (qData ?? []) as RawQ[];

      // Mergear árbol de puzzles.
      const puzzleIds = questions.filter((q) => q.type === 'puzzle').map((q) => q.id);
      if (puzzleIds.length > 0) {
        const { data: puzzles, error: pErr } = await supabase
          .from('learning_puzzles')
          .select('question_id, statement, intro_frame, initial_frame, options, schema_version')
          .in('question_id', puzzleIds);
        if (pErr) return res.status(500).json({ ok: false, error: pErr.message });
        const byQ = new Map((puzzles ?? []).map((p) => [String(p.question_id), p]));
        for (const q of questions) {
          if (q.type === 'puzzle') {
            const p = byQ.get(String(q.id));
            if (p) {
              q.content = {
                schema_version: p.schema_version,
                statement: p.statement,
                intro_frame: p.intro_frame,
                initial_frame: p.initial_frame,
                options: p.options,
              };
            }
          }
        }
      }
    }

    // Ordenar las questions en el mismo orden que los logs (cronológico = orden
    // en que el usuario las contestó).
    const qById = new Map(questions.map((q) => [q.id, q]));
    const orderedQuestions = logs
      .map((l) => qById.get(l.question_id))
      .filter((q): q is RawQ => !!q)
      .map((q) => {
        const club = Array.isArray(q.clubs) ? q.clubs[0] : q.clubs;
        return {
          id: q.id,
          type: q.type,
          area: q.area,
          has_video: q.has_video,
          video_url: q.video_url,
          content: sanitizeContent(q.type, q.content),
          club_name: club?.name ?? null,
          club_city: club?.city ?? null,
        };
      });

    // 4. Reconstruir results[] (compat con SubmitLessonResponse).
    const results = logs.map((l) => ({
      question_id: l.question_id,
      correct: l.answered_correctly,
      correct_answer: null,
      points: l.answered_correctly ? 100 : 0,
    }));

    // 5. Streak data para el header de la pantalla de resultados.
    const { data: streakRow } = await supabase
      .from('learning_streaks')
      .select('current_streak, longest_streak')
      .eq('player_id', player.id)
      .maybeSingle();
    const current = streakRow?.current_streak ?? 0;
    const longest = streakRow?.longest_streak ?? 0;

    return res.json({
      ok: true,
      session: todaySession,
      questions: orderedQuestions,
      results,
      streak: {
        current,
        longest,
        multiplier: getMultiplier(current),
        xp_base: 0,
        xp_bonus: 0,
      },
      shared_streaks: [],
    });
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
    const onboardingError = requireOnboarding(player);
    if (onboardingError) return res.status(403).json({ ok: false, error: onboardingError, requires_onboarding: true });

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

    // Mergear árbol de learning_puzzles para preguntas type='puzzle' (contiene options con is_correct).
    const puzzleQuestionIds = Array.from(questionsById.values())
      .filter((q) => q.type === 'puzzle')
      .map((q) => q.id);
    if (puzzleQuestionIds.length > 0) {
      const { data: puzzles, error: pErr } = await supabase
        .from('learning_puzzles')
        .select('question_id, statement, intro_frame, initial_frame, options, schema_version')
        .in('question_id', puzzleQuestionIds);
      if (pErr) return res.status(500).json({ ok: false, error: pErr.message });
      const byQ = new Map((puzzles ?? []).map((p) => [String(p.question_id), p]));
      for (const q of questionsById.values()) {
        if (q.type === 'puzzle') {
          const p = byQ.get(String(q.id));
          if (p) {
            q.content = {
              schema_version: p.schema_version,
              statement: p.statement,
              intro_frame: p.intro_frame,
              initial_frame: p.initial_frame,
              options: p.options,
            };
          }
        }
      }
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
    const sharedStreaks = await updateSharedStreaks(player.id);

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

    let season_pass_sp_total: number | null = null;
    let season_pass_grant_error: string | null = null;
    try {
      const activeSeason = await getActiveSeasonRow();
      if (!activeSeason) {
        season_pass_grant_error = 'sin_temporada_activa';
      } else {
        const spGain = computeSeasonPassLessonSpDelta(activeSeason.lesson_sp_base, streak.current_streak);
        const r = await addSeasonPassSp(player.id, spGain);
        season_pass_sp_total = r.sp;
      }
    } catch (e) {
      season_pass_grant_error = (e as Error).message;
      console.warn('[season-pass] No se pudo sumar SP al pase:', season_pass_grant_error);
    }

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
      season_pass_sp_total,
      season_pass_grant_error,
      results,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /daily-lesson/feedback
// Recibe en bulk los votos like/dislike que el jugador ha dado en la pantalla
// de resultados de una lección. Cada voto se aplica al log MÁS RECIENTE del
// jugador para esa pregunta. Idempotente: re-enviar los mismos votos no rompe.
//
// Body: { votes: [{ question_id: string, vote: 'up' | 'down' | null }, ...] }
//
// Fire-and-forget desde mobile: si falla, el cliente no reintenta. La feature
// es secundaria (los datos de respuesta ya están guardados en learning_question_log).
router.post('/daily-lesson/feedback', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req.authContext!.userId);
    if (!player) {
      return res.status(404).json({ ok: false, error: 'No se encontró jugador vinculado a tu cuenta' });
    }

    const votes = (req.body?.votes ?? []) as Array<{ question_id: unknown; vote: unknown }>;
    if (!Array.isArray(votes) || votes.length === 0) {
      return res.json({ ok: true, applied: 0 });
    }

    const supabase = getSupabaseServiceRoleClient();

    // Para cada voto, localizamos el log más reciente del jugador para esa
    // pregunta y lo actualizamos. Hacemos las queries en paralelo (volumen
    // bajo: máximo 5 votos por lección).
    const results = await Promise.all(
      votes.map(async (entry) => {
        const qid = typeof entry?.question_id === 'string' ? entry.question_id : null;
        const voteRaw = entry?.vote;
        const vote: 'up' | 'down' | null =
          voteRaw === 'up' || voteRaw === 'down' ? voteRaw : voteRaw === null ? null : null;
        if (!qid) return { ok: false };

        // Localizamos el último log del jugador para esta pregunta.
        const { data: latestLog, error: findErr } = await supabase
          .from('learning_question_log')
          .select('id')
          .eq('player_id', player.id)
          .eq('question_id', qid)
          .order('answered_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (findErr || !latestLog) return { ok: false };

        const { error: updErr } = await supabase
          .from('learning_question_log')
          .update({ vote })
          .eq('id', latestLog.id);
        return { ok: !updErr };
      }),
    );

    const applied = results.filter((r) => r.ok).length;
    return res.json({ ok: true, applied });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
