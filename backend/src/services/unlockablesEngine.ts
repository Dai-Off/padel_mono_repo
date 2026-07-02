/**
 * Motor de desbloqueables (unlockables): evalúa las reglas del catálogo
 * (`unlockables`) contra señales reales del jugador y otorga lo que corresponda
 * en `player_unlockables`. Genérico para las 5 clases; en Fase 2 se cablean
 * logros (trophy/badge). Nunca revoca (los logros son permanentes).
 *
 * Cursos: en v1 se DERIVAN de learning (no se materializan en unlockables); el
 * conteo de cursos completados alimenta los logros tipo `courses_completed`.
 */
import { getSupabaseServiceRoleClient } from '../lib/supabase';

type Supa = ReturnType<typeof getSupabaseServiceRoleClient>;

export interface UnlockableRow {
  id: string;
  kind: 'trophy' | 'badge' | 'course' | 'title' | 'frame';
  title: string;
  description: string | null;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  icon: string | null;
  animation_type: string | null;
  style: string | null;
  sport: string | null;
  unlock_type: string;
  unlock_value: string | null;
  sort_order: number;
}

export interface PlayerSignals {
  matches: number;
  wins: number;
  winStreakMax: number;
  level: number;
  coursesCompleted: number;
  completedCourseIds: string[];
  dailyLessonStreak: number;
}

export interface CompletedCourse {
  courseId: string;
  title: string;
  description: string | null;
  completedAt: string | null;
}

// ─── Cursos completados (todas las lecciones del curso hechas) ───
export async function getCompletedCourses(supabase: Supa, playerId: string): Promise<CompletedCourse[]> {
  // Lecciones del jugador completadas (con su curso)
  const { data: progress } = await supabase
    .from('learning_course_progress')
    .select('completed_at, learning_course_lessons!inner(id, course_id)')
    .eq('player_id', playerId);
  if (!progress?.length) return [];

  type ProgRow = { completed_at: string | null; learning_course_lessons?: { id: string; course_id: string } | { id: string; course_id: string }[] | null };
  const doneByCourse = new Map<string, { lessonIds: Set<string>; lastAt: string | null }>();
  for (const row of progress as ProgRow[]) {
    const l = Array.isArray(row.learning_course_lessons) ? row.learning_course_lessons[0] : row.learning_course_lessons;
    if (!l?.course_id) continue;
    const entry = doneByCourse.get(l.course_id) ?? { lessonIds: new Set<string>(), lastAt: null };
    entry.lessonIds.add(l.id);
    if (row.completed_at && (!entry.lastAt || row.completed_at > entry.lastAt)) entry.lastAt = row.completed_at;
    doneByCourse.set(l.course_id, entry);
  }

  const courseIds = [...doneByCourse.keys()];
  if (!courseIds.length) return [];

  // Total de lecciones por curso
  const { data: lessons } = await supabase
    .from('learning_course_lessons')
    .select('id, course_id')
    .in('course_id', courseIds);
  const totalByCourse = new Map<string, number>();
  for (const l of lessons ?? []) {
    const o = l as { course_id: string };
    totalByCourse.set(o.course_id, (totalByCourse.get(o.course_id) ?? 0) + 1);
  }

  // Cursos con TODAS las lecciones completadas
  const completedIds = courseIds.filter((cid) => {
    const total = totalByCourse.get(cid) ?? 0;
    return total > 0 && (doneByCourse.get(cid)?.lessonIds.size ?? 0) >= total;
  });
  if (!completedIds.length) return [];

  const { data: courses } = await supabase
    .from('learning_courses')
    .select('id, title, description')
    .in('id', completedIds);
  const meta = new Map((courses ?? []).map((c) => [(c as { id: string }).id, c as { id: string; title: string; description: string | null }]));

  return completedIds.map((cid) => ({
    courseId: cid,
    title: meta.get(cid)?.title ?? 'Curso',
    description: meta.get(cid)?.description ?? null,
    completedAt: doneByCourse.get(cid)?.lastAt ?? null,
  }));
}

// ─── Señales del jugador ───
export async function computeSignals(supabase: Supa, playerId: string): Promise<PlayerSignals> {
  const [{ data: mp }, { data: pl }, { data: streak }, completedCourses] = await Promise.all([
    supabase.from('match_players').select('result, created_at').eq('player_id', playerId).order('created_at', { ascending: true }),
    supabase.from('players').select('elo_rating').eq('id', playerId).maybeSingle(),
    supabase.from('learning_streaks').select('longest_streak').eq('player_id', playerId).maybeSingle(),
    getCompletedCourses(supabase, playerId),
  ]);

  // Solo partidos con resultado decidido (no 'pending'/'invited').
  const played = (mp ?? []).filter(
    (r) => r.result === 'win' || r.result === 'loss' || r.result === 'draw',
  ) as { result: string }[];
  const matches = played.length;
  const wins = played.filter((r) => r.result === 'win').length;
  let winStreakMax = 0;
  let cur = 0;
  for (const r of played) {
    if (r.result === 'win') {
      cur += 1;
      if (cur > winStreakMax) winStreakMax = cur;
    } else {
      cur = 0;
    }
  }

  return {
    matches,
    wins,
    winStreakMax,
    level: Number((pl as { elo_rating?: number } | null)?.elo_rating ?? 0),
    coursesCompleted: completedCourses.length,
    completedCourseIds: completedCourses.map((c) => c.courseId),
    dailyLessonStreak: Number((streak as { longest_streak?: number } | null)?.longest_streak ?? 0),
  };
}

function ruleMet(u: UnlockableRow, s: PlayerSignals): boolean {
  const v = Number(u.unlock_value);
  switch (u.unlock_type) {
    case 'matches':
      return s.matches >= v;
    case 'wins':
      return s.wins >= v;
    case 'win_streak':
      return s.winStreakMax >= v;
    case 'level':
      return s.level >= v;
    case 'courses_completed':
      return s.coursesCompleted >= v;
    case 'daily_lesson_streak':
      return s.dailyLessonStreak >= v;
    case 'course':
      return u.unlock_value != null && s.completedCourseIds.includes(u.unlock_value);
    case 'manual':
    default:
      return false;
  }
}

/**
 * Evalúa y otorga los desbloqueables que el jugador haya conseguido. Devuelve los
 * RECIÉN otorgados (con su info de catálogo) para el modal. **Se otorga por EVENTO,
 * NO on-read.**
 *
 * ⚠️ CONVENCIÓN (importante): llama a esta función tras CUALQUIER acción que cambie
 * una señal de logro. Las lecturas (perfil / vitrina / unlocks-pending) NO deben
 * re-evaluar: solo leen lo ya otorgado. Al crear un logro con una señal nueva, hay
 * que añadir su disparador en la acción que cambia esa señal.
 *
 * Disparadores actuales (acción → señal):
 *  - Cierre de partido matchmaking (`levelingService.runLevelingPipeline`) → matches / wins / win_streak / level.
 *  - Fin de lección diaria (`routes/learningDailyLesson`) → daily_lesson_streak.
 *  - Completar lección de curso (`routes/learningCourses`) → courses_completed.
 *  - (Futuro) torneos ganados, compañeros distintos, etc. → añadir aquí su disparador.
 */
export async function evaluateAndGrant(supabase: Supa, playerId: string): Promise<UnlockableRow[]> {
  const [{ data: catalog }, { data: owned }] = await Promise.all([
    supabase
      .from('unlockables')
      .select('id, kind, title, description, rarity, icon, animation_type, style, sport, unlock_type, unlock_value, sort_order')
      .eq('is_active', true)
      // 'manual' (recompensa/pendiente) y 'default' (implícito) no se auto-otorgan ni notifican.
      .not('unlock_type', 'in', '("manual","default")'),
    supabase.from('player_unlockables').select('unlockable_id').eq('player_id', playerId),
  ]);

  const ownedIds = new Set((owned ?? []).map((o) => (o as { unlockable_id: string }).unlockable_id));
  const items = (catalog ?? []) as UnlockableRow[];
  if (!items.length) return [];

  const signals = await computeSignals(supabase, playerId);

  const toGrant = items.filter((u) => !ownedIds.has(u.id) && ruleMet(u, signals));
  if (!toGrant.length) return [];

  const rows = toGrant.map((u) => ({ player_id: playerId, unlockable_id: u.id }));
  // upsert ignorando duplicados: si otra petición concurrente ya insertó alguno,
  // no falla el lote entero (insert sí lo haría ante un conflicto de PK).
  const { error } = await supabase
    .from('player_unlockables')
    .upsert(rows, { onConflict: 'player_id,unlockable_id', ignoreDuplicates: true });
  if (error) {
    console.error('[unlockablesEngine] grant upsert error:', error.message);
  }
  return toGrant;
}

/**
 * Otorga por evento a varios jugadores a la vez (p.ej. los 4 de un partido).
 * Best-effort: nunca lanza (no debe romper el pipeline/evento). Fire-and-forget.
 */
export async function evaluateAndGrantForPlayers(supabase: Supa, playerIds: string[]): Promise<void> {
  const ids = [...new Set(playerIds.filter((id) => typeof id === 'string' && id.length > 0))];
  await Promise.all(
    ids.map((id) =>
      evaluateAndGrant(supabase, id).catch((e) =>
        console.error('[evaluateAndGrantForPlayers]', id, e instanceof Error ? e.message : e),
      ),
    ),
  );
}
