import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { requireAuth, getPlayerFromAuth } from './learningHelpers';
import { getMultiplier } from './learningStreaks';
import { SharedStreakRow, lazyResetSharedStreak, normalizePair } from './learningStreaks';

const router = Router();

function isCourseLocked(elo: number, eloMin: number, eloMax: number): boolean {
  return elo < eloMin || elo > eloMax;
}

// ---------------------------------------------------------------------------
// Streak endpoints (player)
// ---------------------------------------------------------------------------

// GET /streak
router.get('/streak', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req);
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

// GET /shared-streaks
router.get('/shared-streaks', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req);
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

// POST /shared-streaks
router.post('/shared-streaks', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req);
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

    const { data: partnerData } = await supabase
      .from('players')
      .select('id, first_name, last_name, avatar_url')
      .eq('id', partner_id)
      .neq('status', 'deleted')
      .maybeSingle();

    if (!partnerData) {
      return res.status(404).json({ ok: false, error: 'No se encontró el jugador indicado' });
    }

    const [pid1, pid2] = normalizePair(player.id, partner_id);

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
// Course endpoints (player)
// ---------------------------------------------------------------------------

// GET /courses
router.get('/courses', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req);
    if (!player) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

    const supabase = getSupabaseServiceRoleClient();

    const { data: courses, error: coursesErr } = await supabase
      .from('learning_courses')
      .select('id, title, description, banner_url, elo_min, elo_max, coach_name, rating, is_certified, clubs(name)')
      .eq('status', 'active')
      .order('elo_min', { ascending: true });

    if (coursesErr) return res.status(500).json({ ok: false, error: coursesErr.message });
    if (!courses || courses.length === 0) return res.json({ ok: true, courses: [] });

    const courseIds = courses.map((c: any) => c.id);

    const { data: lessons, error: lessonsErr } = await supabase
      .from('learning_course_lessons')
      .select('id, course_id')
      .in('course_id', courseIds);

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
        coach_name: c.coach_name || null,
        rating: c.rating || 4.8,
        is_certified: c.is_certified || false,
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

// GET /courses/:id
router.get('/courses/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req);
    if (!player) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

    const supabase = getSupabaseServiceRoleClient();
    const courseId = req.params.id;

    const { data: course, error: courseErr } = await supabase
      .from('learning_courses')
      .select('id, title, description, banner_url, elo_min, elo_max, pedagogical_goal, coach_name, rating, is_certified, clubs(name)')
      .eq('id', courseId)
      .eq('status', 'active')
      .maybeSingle();

    if (courseErr) return res.status(500).json({ ok: false, error: courseErr.message });
    if (!course) return res.status(404).json({ ok: false, error: 'Curso no encontrado' });

    const locked = isCourseLocked(player.elo_rating, course.elo_min, course.elo_max);

    if (locked) {
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
          coach_name: course.coach_name || null,
          rating: course.rating || 4.8,
          is_certified: course.is_certified || false,
          club_name: (course as any).clubs?.name || null,
          locked: true,
          total_lessons: count || 0,
        },
      });
    }

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
        coach_name: course.coach_name || null,
        rating: course.rating || 4.8,
        is_certified: course.is_certified || false,
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

// POST /courses/:id/complete-lesson
router.post('/courses/:id/complete-lesson', requireAuth, async (req: Request, res: Response) => {
  try {
    const player = await getPlayerFromAuth(req);
    if (!player) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

    const { lesson_id } = req.body;
    if (!lesson_id) return res.status(400).json({ ok: false, error: 'lesson_id es requerido' });

    const supabase = getSupabaseServiceRoleClient();
    const courseId = req.params.id;

    const { data: course, error: courseErr } = await supabase
      .from('learning_courses')
      .select('id, elo_min, elo_max, status')
      .eq('id', courseId)
      .maybeSingle();

    if (courseErr) return res.status(500).json({ ok: false, error: courseErr.message });
    if (!course || course.status !== 'active') return res.status(404).json({ ok: false, error: 'Curso no encontrado' });

    if (isCourseLocked(player.elo_rating, course.elo_min, course.elo_max)) {
      return res.status(403).json({ ok: false, error: 'Nivel insuficiente para este curso' });
    }

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

    const { error: upsertErr } = await supabase
      .from('learning_course_progress')
      .upsert(
        { player_id: player.id, lesson_id },
        { onConflict: 'player_id,lesson_id' }
      );

    if (upsertErr) return res.status(500).json({ ok: false, error: upsertErr.message });

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

export default router;
