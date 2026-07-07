import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { requireAuth, getPlayerFromAuth, requireOnboarding } from './learningHelpers';
import {
  QuestionRow, HistoryEntry, LESSON_SIZE,
  selectQuestions, sanitizeContent, checkAnswer, getCorrectAnswer, timePenalty,
} from './learningAlgorithm';
import { getTodayRange } from './learningTimezone';
import { resolveLocale } from '../lib/locale';
import { localizeQuestionContent, ContentI18n } from '../lib/learningQuestionI18n';
import { updateIndividualStreak, updateSharedStreaks } from './learningStreaks';
import { evaluateMissionsAndBuildDelta } from '../services/seasonPassEngine';

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
    // Idioma del jugador (query ?lang= o Accept-Language; fallback 'es').
    const locale = resolveLocale(req);

    const { start, end } = getTodayRange(timezone);
    const supabase = getSupabaseServiceRoleClient();

    // ---------------------------------------------------------------------
    // FASE 1 — Solo metadatos ligeros (sin `content`).
    // El algoritmo de selección únicamente usa id/type/level/area + historial,
    // así que evitamos transferir el JSON `content` de TODO el banco para
    // acabar usando solo 5 preguntas. Las 4 consultas van en paralelo:
    //  - sesión de hoy (already_completed)
    //  - metadatos de preguntas publicadas
    //  - historial del jugador
    //  - ids de puzzles válidos (para excluir huérfanos antes de seleccionar)
    // ---------------------------------------------------------------------
    const [sessionRes, questionsRes, historyRes, puzzleIdsRes] = await Promise.all([
      supabase
        .from('learning_sessions')
        .select('id, correct_count, total_count, score, xp_earned, completed_at')
        .eq('player_id', player.id)
        .gte('completed_at', start)
        .lte('completed_at', end)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('learning_questions')
        // Solo se sirven preguntas publicadas. Drafts e inactivas se quedan fuera.
        .select('id, type, level, area, has_video, video_url')
        .eq('status', 'published'),
      supabase
        .from('learning_question_log')
        .select('question_id, answered_correctly, answered_at')
        .eq('player_id', player.id)
        .order('answered_at', { ascending: true }),
      supabase
        .from('learning_puzzles')
        .select('question_id'),
    ]);

    if (sessionRes.error) return res.status(500).json({ ok: false, error: sessionRes.error.message });
    if (questionsRes.error) return res.status(500).json({ ok: false, error: questionsRes.error.message });
    if (historyRes.error) return res.status(500).json({ ok: false, error: historyRes.error.message });
    if (puzzleIdsRes.error) return res.status(500).json({ ok: false, error: puzzleIdsRes.error.message });

    const todaySession = sessionRes.data;

    type QuestionMetaRow = {
      id: string; type: string; level: number; area: string;
      has_video: boolean; video_url: string | null;
    };
    const metaRows = (questionsRes.data ?? []) as QuestionMetaRow[];
    const history = (historyRes.data ?? []) as HistoryEntry[];

    if (metaRows.length === 0) {
      // Sin preguntas publicadas en absoluto. Mismo flag para que el mobile
      // muestre la pantalla "Lección no disponible" en vez de un error genérico.
      return res.json({ ok: true, already_completed: false, questions: [], not_enough_questions: true });
    }

    // Excluir puzzles huérfanos (type='puzzle' sin fila en learning_puzzles)
    // ANTES de seleccionar: el cliente crashearía al renderizarlos sin
    // initial_frame ni options. Basta con el set de ids válidos (consulta de
    // solo ids), sin traer el content de todos los puzzles.
    const validPuzzleIds = new Set((puzzleIdsRes.data ?? []).map((p) => String(p.question_id)));
    const questions: QuestionRow[] = metaRows
      .filter((m) => m.type !== 'puzzle' || validPuzzleIds.has(String(m.id)))
      .map((m) => ({
        id: m.id,
        type: m.type,
        level: m.level,
        area: m.area,
        has_video: m.has_video,
        video_url: m.video_url,
        content: {}, // se rellena en FASE 2 solo para las seleccionadas
      }));

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

    // ---------------------------------------------------------------------
    // FASE 2 — Traer el `content` pesado SOLO para las 5 seleccionadas.
    //  - learning_questions: content + club (para preguntas no-puzzle)
    //  - learning_puzzles: content del puzzle (vive en otra tabla)
    // ---------------------------------------------------------------------
    const selectedIds = selected.map((q) => q.id);
    const selectedPuzzleIds = selected.filter((q) => q.type === 'puzzle').map((q) => q.id);

    const [contentRes, puzzlesRes] = await Promise.all([
      supabase
        .from('learning_questions')
        .select('id, content, content_locale, content_i18n, clubs:created_by_club(name, city)')
        .in('id', selectedIds),
      selectedPuzzleIds.length > 0
        ? supabase
            .from('learning_puzzles')
            .select('question_id, statement, intro_frame, initial_frame, options, schema_version')
            .in('question_id', selectedPuzzleIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    if (contentRes.error) return res.status(500).json({ ok: false, error: contentRes.error.message });
    if (puzzlesRes.error) return res.status(500).json({ ok: false, error: puzzlesRes.error.message });

    const contentById = new Map(
      (contentRes.data ?? []).map((r: any) => [
        String(r.id),
        {
          content: (r.content ?? {}) as Record<string, unknown>,
          content_locale: (r.content_locale ?? null) as string | null,
          content_i18n: (r.content_i18n ?? {}) as ContentI18n,
          // supabase-js puede devolver el embed del club como objeto o como
          // array; normalizamos igual que en today-results.
          clubs: r.clubs as { name?: string; city?: string } | { name?: string; city?: string }[] | null,
        },
      ]),
    );
    const puzzleByQ = new Map((puzzlesRes.data ?? []).map((p: any) => [String(p.question_id), p]));

    // Sanitize content — remove correct answers
    const clientQuestions = selected.map((q) => {
      const extra = contentById.get(String(q.id));
      let content: Record<string, unknown>;
      if (q.type === 'puzzle') {
        const p = puzzleByQ.get(String(q.id));
        // Los huérfanos ya se excluyeron en FASE 1, pero por seguridad mergeamos
        // solo si existe la fila.
        content = p
          ? {
              schema_version: p.schema_version,
              statement: p.statement,
              intro_frame: p.intro_frame,
              initial_frame: p.initial_frame,
              options: p.options,
            }
          : {};
      } else {
        content = extra?.content ?? {};
      }
      // Traducir los campos de texto al idioma del jugador (fallback al
      // canónico). La clave de respuesta no se toca. Para puzzles la traducción
      // vive igualmente en learning_questions.content_i18n (extra).
      content = localizeQuestionContent(q.type, content, extra?.content_locale, extra?.content_i18n, locale);
      const clubRaw = extra?.clubs ?? null;
      const club = Array.isArray(clubRaw) ? (clubRaw[0] ?? null) : clubRaw;
      return {
        id: q.id,
        type: q.type,
        area: q.area,
        has_video: q.has_video,
        video_url: q.video_url,
        content: sanitizeContent(q.type, content),
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
    const locale = resolveLocale(req);
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
      content_locale: string | null;
      content_i18n: ContentI18n;
      created_by_club: string;
      clubs: { name: string; city: string } | { name: string; city: string }[] | null;
    };
    let questions: RawQ[] = [];
    if (logs.length > 0) {
      const questionIds = logs.map((l) => l.question_id);
      const { data: qData, error: qErr } = await supabase
        .from('learning_questions')
        .select('id, type, level, area, has_video, video_url, content, content_locale, content_i18n, created_by_club, clubs:created_by_club(name, city)')
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
        const localized = localizeQuestionContent(q.type, q.content, q.content_locale, q.content_i18n, locale);
        return {
          id: q.id,
          type: q.type,
          area: q.area,
          has_video: q.has_video,
          video_url: q.video_url,
          content: sanitizeContent(q.type, localized),
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
      },
      shared_streaks: [],
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /daily-lesson/localize
// Devuelve EXACTAMENTE las preguntas indicadas por question_ids (mismo orden),
// localizadas al idioma pedido. Sirve para re-entregar la lección actual en
// otro idioma SIN rebarajar ni reseleccionar (la selección normal es aleatoria).
// El cliente la usa al cambiar de idioma a media lección: conserva orden, ids,
// respuestas dadas y progreso. La clave de respuesta no cambia (índices/booleans).
router.post('/daily-lesson/localize', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req.authContext!.userId);
    if (!player) {
      return res.status(404).json({ ok: false, error: 'No se encontró jugador vinculado a tu cuenta' });
    }

    const locale = resolveLocale(req);
    const rawIds = req.body?.question_ids;
    const ids: string[] = Array.isArray(rawIds) ? rawIds.filter((x: unknown): x is string => typeof x === 'string') : [];
    if (ids.length === 0) return res.json({ ok: true, questions: [] });

    const supabase = getSupabaseServiceRoleClient();
    // Por ids, sin filtrar por status: una lección a medias puede contener una
    // pregunta que se haya despublicado entretanto; igual queremos servirla.
    const [contentRes, puzzlesRes] = await Promise.all([
      supabase
        .from('learning_questions')
        .select('id, type, area, has_video, video_url, content, content_locale, content_i18n, clubs:created_by_club(name, city)')
        .in('id', ids),
      supabase
        .from('learning_puzzles')
        .select('question_id, statement, intro_frame, initial_frame, options, schema_version')
        .in('question_id', ids),
    ]);

    if (contentRes.error) return res.status(500).json({ ok: false, error: contentRes.error.message });
    if (puzzlesRes.error) return res.status(500).json({ ok: false, error: puzzlesRes.error.message });

    const rowById = new Map((contentRes.data ?? []).map((r: any) => [String(r.id), r]));
    const puzzleByQ = new Map((puzzlesRes.data ?? []).map((p: any) => [String(p.question_id), p]));

    // Mantener el orden EXACTO de question_ids (= orden de la lección en curso).
    const questions = ids
      .map((id) => {
        const r = rowById.get(String(id));
        if (!r) return null;
        let content: Record<string, unknown>;
        if (r.type === 'puzzle') {
          const p = puzzleByQ.get(String(id));
          content = p
            ? {
                schema_version: p.schema_version,
                statement: p.statement,
                intro_frame: p.intro_frame,
                initial_frame: p.initial_frame,
                options: p.options,
              }
            : {};
        } else {
          content = (r.content ?? {}) as Record<string, unknown>;
        }
        content = localizeQuestionContent(r.type, content, r.content_locale, r.content_i18n as ContentI18n, locale);
        const clubRaw = r.clubs as { name?: string; city?: string } | { name?: string; city?: string }[] | null;
        const club = Array.isArray(clubRaw) ? (clubRaw[0] ?? null) : clubRaw;
        return {
          id: r.id,
          type: r.type,
          area: r.area,
          has_video: r.has_video,
          video_url: r.video_url,
          content: sanitizeContent(r.type, content),
          club_name: club?.name ?? null,
          club_city: club?.city ?? null,
        };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null);

    return res.json({ ok: true, questions });
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
      selected_answer: unknown;
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
        // Guardamos la respuesta concreta del jugador para poder calcular
        // distribución de respuestas en el panel de stats por pregunta.
        selected_answer: answer.selected_answer ?? null,
      });
    }

    // 1. Write the per-question log
    const { error: logErr } = await supabase.from('learning_question_log').insert(logRows);
    if (logErr) return res.status(500).json({ ok: false, error: logErr.message });

    // 2. Update individual streak
    const streak = await updateIndividualStreak(player.id, tz);

    // 3. Actualizar rachas compartidas
    const sharedStreaks = await updateSharedStreaks(player.id);

    // 4. Insert the session row. Learning XP is retired as a user-facing
    // concept (season pass SP is the single progression currency); the
    // NOT NULL column stays at 0 and old rows keep their historic values.
    const { data: sessionData, error: sessionErr } = await supabase
      .from('learning_sessions')
      .insert({
        player_id: player.id,
        correct_count: correctCount,
        total_count: LESSON_SIZE,
        score: totalScore,
        xp_earned: 0,
        timezone: tz,
      })
      .select('id, correct_count, total_count, score, completed_at')
      .single();

    if (sessionErr) return res.status(500).json({ ok: false, error: sessionErr.message });

    // 5. Instant celebration channel (plan §6.7): the mission engine grants
    // the SP (daily lesson is a fixed mission) and returns the delta so the
    // results screen celebrates in-place. Never fails the lesson.
    const seasonPassDelta = await evaluateMissionsAndBuildDelta(player.id, tz);

    return res.json({
      ok: true,
      session: sessionData,
      streak: {
        current: streak.current_streak,
        longest: streak.longest_streak,
      },
      shared_streaks: sharedStreaks.map((s) => ({
        id: s.id,
        partner_id: s.player_id_1 === player.id ? s.player_id_2 : s.player_id_1,
        current_streak: s.current_streak,
        longest_streak: s.longest_streak,
        both_completed_today: s.player1_completed_today && s.player2_completed_today,
      })),
      season_pass: seasonPassDelta,
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
