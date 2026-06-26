import { getSupabaseServiceRoleClient } from '../lib/supabase';

export interface CoachAnswer {
  question_index: number;
  selected_option: number; // Index of the selected option (0-3)
}

export interface CoachAssessmentResult {
  level_number: number;
  level_name: string;
  skills: {
    technical: number;
    physical: number;
    mental: number;
    tactical: number;
  };
  strengths: string[];
  improvements: string[];
  recommendation: string;
  stats?: {
    matchCount: number;
    matchesThisWeek: number;
    matchesThisMonth: number;
    completedObjectives: number;
    dailyLessonsThisWeek: number;
    tournamentEnrolledCount: number;
    tournamentPlayedCount: number;
    classesAttendedCount: number;
    coursesCompletedCount: number;
    totalObjectives: number;
    improvementPercentage: number;
  };
}

function startOfLocalWeek(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfLocalMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function countCompletedMatchesSince(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  playerId: string,
  since: Date,
): Promise<number> {
  const { data: mpRows, error: mpErr } = await supabase
    .from('match_players')
    .select('match_id')
    .eq('player_id', playerId);
  if (mpErr || !mpRows?.length) return 0;

  const matchIds = [...new Set(mpRows.map((r) => String((r as { match_id: string }).match_id)))];
  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .select('id, status, booking_id')
    .in('id', matchIds)
    .eq('status', 'completed');
  if (mErr || !matches?.length) return 0;

  const bookingIds = [
    ...new Set(
      matches
        .map((m) => (m as { booking_id?: string | null }).booking_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  if (bookingIds.length === 0) return 0;

  const sinceIso = since.toISOString();
  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select('id, start_at')
    .in('id', bookingIds)
    .gte('start_at', sinceIso);
  if (bErr || !bookings?.length) return 0;

  const recentBookingIds = new Set(bookings.map((b) => String((b as { id: string }).id)));
  return matches.filter((m) => recentBookingIds.has(String((m as { booking_id?: string }).booking_id ?? '')))
    .length;
}

async function countTournamentPlayed(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  playerId: string,
  now: Date,
): Promise<number> {
  const { data: rows, error } = await supabase
    .from('tournament_inscriptions')
    .select('tournament_id, tournaments!inner(end_at, status)')
    .or(`player_id_1.eq.${playerId},player_id_2.eq.${playerId}`)
    .eq('status', 'confirmed');
  if (error || !rows?.length) return 0;

  return rows.filter((row) => {
    const t = (row as { tournaments?: { end_at?: string | null } }).tournaments;
    const endAt = t?.end_at ? new Date(t.end_at) : null;
    return endAt != null && Number.isFinite(endAt.getTime()) && endAt.getTime() < now.getTime();
  }).length;
}

async function countCoursesWithProgress(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  playerId: string,
): Promise<number> {
  const { data: progressRows, error } = await supabase
    .from('learning_course_progress')
    .select('lesson_id, learning_course_lessons!inner(course_id)')
    .eq('player_id', playerId);
  if (error || !progressRows?.length) return 0;

  const courseIds = new Set<string>();
  for (const row of progressRows) {
    const lesson = (row as { learning_course_lessons?: { course_id?: string } }).learning_course_lessons;
    const courseId = lesson?.course_id;
    if (courseId) courseIds.add(String(courseId));
  }
  return courseIds.size;
}

// Weights for each question (from the implementation plan)
// Indices 0-5 correspond to the 6 questions in the mobile app COACH_QUESTIONS
const WEIGHTS = [
  { technical: 0.3, physical: 0.2, mental: 0.2, tactical: 0.3 }, // Experience (Time playing)
  { technical: 0.2, physical: 0.5, mental: 0.1, tactical: 0.2 }, // Frequency
  { technical: 0.7, physical: 0.0, mental: 0.1, tactical: 0.2 }, // Technical Level self-eval
  { technical: 0.6, physical: 0.2, mental: 0.1, tactical: 0.1 }, // Serve
  { technical: 0.1, physical: 0.0, mental: 0.3, tactical: 0.6 }, // Strategy
  { technical: 0.1, physical: 0.2, mental: 0.4, tactical: 0.3 }, // Competition
];

const SKILL_NAMES = {
  technical: 'Técnico',
  physical: 'Físico',
  mental: 'Mental',
  tactical: 'Táctico',
};

type SkillSet = CoachAssessmentResult['skills'];

/**
 * Deriva nivel + fortalezas + áreas de mejora + recomendación a partir de las
 * 4 skills (0-100). Reutilizado por el cálculo del cuestionario y por el radar
 * dinámico (ELO + learning).
 */
function resultMetaFromSkills(skills: SkillSet): Omit<CoachAssessmentResult, 'skills' | 'stats'> {
  const avg = (skills.technical + skills.physical + skills.mental + skills.tactical) / 4;

  let level_number = 1;
  let level_name = 'Principiante';
  if (avg > 80) {
    level_number = 5;
    level_name = 'Élite';
  } else if (avg > 60) {
    level_number = 4;
    level_name = 'Profesional';
  } else if (avg > 40) {
    level_number = 3;
    level_name = 'Avanzado';
  } else if (avg > 20) {
    level_number = 2;
    level_name = 'Intermedio';
  }

  const sortedSkills = (Object.entries(skills) as Array<[keyof SkillSet, number]>).sort((a, b) => b[1] - a[1]);

  const strengths = sortedSkills.slice(0, 2).map(([key]) => {
    if (key === 'mental') return 'Control mental y enfoque';
    if (key === 'technical') return 'Consistencia técnica';
    if (key === 'physical') return 'Condición física y resistencia';
    if (key === 'tactical') return 'Lectura táctica del juego';
    return SKILL_NAMES[key];
  });

  const improvements = sortedSkills.slice(2, 4).map(([key]) => {
    if (key === 'mental') return 'Gestión de la presión';
    if (key === 'technical') return 'Refinamiento de golpes complejos';
    if (key === 'physical') return 'Velocidad y explosividad';
    if (key === 'tactical') return 'Estrategia ante diferentes rivales';
    return SKILL_NAMES[key];
  });

  const lowestSkill = sortedSkills[3][0];
  let recommendation = '';
  switch (lowestSkill) {
    case 'technical':
      recommendation = 'Tu fuerte es el aspecto mental y táctico. Enfócate en perfeccionar tu técnica de golpes específicos como la víbora o el rulo para subir de nivel.';
      break;
    case 'physical':
      recommendation = 'Tienes una gran base técnica y táctica. Trabajar en tu explosividad y resistencia física te permitirá mantener el ritmo en partidos largos.';
      break;
    case 'mental':
      recommendation = 'Técnicamente eres muy sólido. Trabajar en la gestión de puntos clave y mantener la concentración te ayudará a cerrar partidos difíciles.';
      break;
    case 'tactical':
      recommendation = 'Posees buenas condiciones físicas y técnicas. Aprender a leer mejor el posicionamiento de los rivales te permitirá ganar más puntos con menos esfuerzo.';
      break;
    default:
      recommendation = 'Sigue entrenando de forma regular para equilibrar todas tus dimensiones de juego.';
  }

  return { level_number, level_name, strengths, improvements, recommendation };
}

export function calculateAssessment(answers: CoachAnswer[]): CoachAssessmentResult {
  const scores = {
    technical: 0,
    physical: 0,
    mental: 0,
    tactical: 0,
  };

  const totalWeights = {
    technical: 0,
    physical: 0,
    mental: 0,
    tactical: 0,
  };

  // Calculate weighted scores for each dimension
  answers.forEach((ans) => {
    const weight = WEIGHTS[ans.question_index];
    if (!weight) return;

    const normalizedValue = ans.selected_option / 3; // Max option index is 3 (4 options total)

    (Object.keys(weight) as Array<keyof typeof weight>).forEach((dim) => {
      scores[dim] += normalizedValue * weight[dim];
      totalWeights[dim] += weight[dim];
    });
  });

  // Final skills (0-100)
  const skills = {
    technical: Math.round((scores.technical / totalWeights.technical) * 100) || 25,
    physical: Math.round((scores.physical / totalWeights.physical) * 100) || 25,
    mental: Math.round((scores.mental / totalWeights.mental) * 100) || 25,
    tactical: Math.round((scores.tactical / totalWeights.tactical) * 100) || 25,
  };

  return { skills, ...resultMetaFromSkills(skills) };
}

/**
 * Obtiene estadísticas reales del jugador para la sección de Coach
 */
async function getPlayerStats(playerId: string) {
  const supabase = getSupabaseServiceRoleClient();
  const now = new Date();
  const weekStart = startOfLocalWeek(now);
  const monthStart = startOfLocalMonth(now);
  const weekStartIso = weekStart.toISOString();
  const monthStartIso = monthStart.toISOString();

  const [
    matchCountRes,
    completedObjectivesRes,
    dailyLessonsThisWeekRes,
    tournamentEnrolledRes,
    classesAttendedRes,
    matchesThisWeek,
    matchesThisMonth,
    tournamentPlayedCount,
    coursesCompletedCount,
  ] = await Promise.all([
    supabase.from('match_players').select('*', { count: 'exact', head: true }).eq('player_id', playerId),
    supabase.from('learning_sessions').select('*', { count: 'exact', head: true }).eq('player_id', playerId),
    supabase
      .from('learning_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .gte('completed_at', weekStartIso),
    supabase
      .from('tournament_inscriptions')
      .select('*', { count: 'exact', head: true })
      .or(`player_id_1.eq.${playerId},player_id_2.eq.${playerId}`)
      .in('status', ['confirmed', 'pending']),
    supabase
      .from('club_school_course_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .eq('status', 'active'),
    countCompletedMatchesSince(supabase, playerId, weekStart),
    countCompletedMatchesSince(supabase, playerId, monthStart),
    countTournamentPlayed(supabase, playerId, now),
    countCoursesWithProgress(supabase, playerId),
  ]);

  const improvementPercentage = 0;

  return {
    matchCount: matchCountRes.count || 0,
    matchesThisWeek,
    matchesThisMonth,
    completedObjectives: completedObjectivesRes.count || 0,
    dailyLessonsThisWeek: dailyLessonsThisWeekRes.count || 0,
    tournamentEnrolledCount: tournamentEnrolledRes.count || 0,
    tournamentPlayedCount,
    classesAttendedCount: classesAttendedRes.count || 0,
    coursesCompletedCount,
    totalObjectives: 10,
    improvementPercentage,
  };
}

export async function saveAssessment(playerId: string, answers: CoachAnswer[], result: CoachAssessmentResult) {
  const supabase = getSupabaseServiceRoleClient();
  
  const { data, error } = await supabase
    .from('coach_assessments')
    .upsert({
      player_id: playerId,
      answers,
      level_number: result.level_number,
      level_name: result.level_name,
      skills: result.skills,
      strengths: result.strengths,
      improvements: result.improvements,
      recommendation: result.recommendation,
    })
    .select()
    .single();

  if (error) throw error;
  
  const stats = await getPlayerStats(playerId);
  return { ...data, stats };
}

// ─── Radar dinámico (ELO base + learning por área) ───
const DYNAMIC_SPREAD = 40; // S: separación máx por learning (±SPREAD/2 por área)
const DYNAMIC_MIN_SAMPLES = 8; // N_MIN: preguntas por área para fiarnos del dato
// Pequeño "shape" base para que un radar sin datos de learning no sea un cuadrado plano
const BASE_OFFSETS: SkillSet = { technical: 4, physical: -2, mental: 1, tactical: -3 };
// Área de learning (BD) -> skill del radar; 'rules' se ignora (no es una dimensión)
const LEARNING_AREA_TO_SKILL: Record<string, keyof SkillSet> = {
  technique: 'technical',
  tactics: 'tactical',
  physical: 'physical',
  mental: 'mental',
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Calcula las 4 skills del radar a partir de señales reales:
 *  - Base: ELO normalizado a 0-100 (lo que de verdad importa).
 *  - Forma: rendimiento por área en learning (technique/tactics/physical/mental).
 * 50% de aciertos en un área = neutro; dominarla la sube, fallarla la baja
 * (ponderado por confianza según nº de preguntas). El feedback post-partido se
 * incorporará en el futuro como otra señal (ver plan).
 */
async function computeDynamicSkills(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  playerId: string,
): Promise<SkillSet> {
  const { data: pl } = await supabase
    .from('players')
    .select('elo_rating')
    .eq('id', playerId)
    .maybeSingle();
  const elo = Number((pl as { elo_rating?: number } | null)?.elo_rating ?? 0);
  const base = clamp((elo / 7) * 100, 0, 100);

  const { data: logRows } = await supabase
    .from('learning_question_log')
    .select('answered_correctly, learning_questions!inner(area)')
    .eq('player_id', playerId);

  const agg: Record<keyof SkillSet, { correct: number; total: number }> = {
    technical: { correct: 0, total: 0 },
    physical: { correct: 0, total: 0 },
    mental: { correct: 0, total: 0 },
    tactical: { correct: 0, total: 0 },
  };
  for (const row of logRows ?? []) {
    const r = row as {
      answered_correctly: boolean;
      learning_questions?: { area?: string } | { area?: string }[] | null;
    };
    const lq = Array.isArray(r.learning_questions) ? r.learning_questions[0] : r.learning_questions;
    const skill = lq?.area ? LEARNING_AREA_TO_SKILL[lq.area] : undefined;
    if (!skill) continue;
    agg[skill].total += 1;
    if (r.answered_correctly) agg[skill].correct += 1;
  }

  const skills = {} as SkillSet;
  (Object.keys(agg) as Array<keyof SkillSet>).forEach((skill) => {
    let value = base + BASE_OFFSETS[skill];
    const { correct, total } = agg[skill];
    if (total > 0) {
      const acc = correct / total;
      const confidence = Math.min(1, total / DYNAMIC_MIN_SAMPLES);
      value += (acc - 0.5) * DYNAMIC_SPREAD * confidence;
    }
    skills[skill] = Math.round(clamp(value, 10, 100));
  });

  return skills;
}

/**
 * Recalcula el assessment del jugador desde señales reales (ELO + learning),
 * lo persiste (upsert) y lo devuelve con stats. Mantiene el radar fresco al
 * cambiar el ELO (partidos) o el rendimiento en learning, y crea la fila si no
 * existía (p.ej. usuarios sembrados a mano sin pasar por el onboarding).
 */
export async function recomputeAndGetAssessment(playerId: string) {
  const supabase = getSupabaseServiceRoleClient();

  const skills = await computeDynamicSkills(supabase, playerId);
  const meta = resultMetaFromSkills(skills);

  // Preservar answers existentes (si las hubiera) para no perder datos.
  const { data: existing } = await supabase
    .from('coach_assessments')
    .select('answers')
    .eq('player_id', playerId)
    .maybeSingle();

  const { data, error } = await supabase
    .from('coach_assessments')
    .upsert(
      {
        player_id: playerId,
        answers: (existing as { answers?: unknown } | null)?.answers ?? [],
        level_number: meta.level_number,
        level_name: meta.level_name,
        skills,
        strengths: meta.strengths,
        improvements: meta.improvements,
        recommendation: meta.recommendation,
      },
      { onConflict: 'player_id' },
    )
    .select()
    .single();
  if (error) throw error;

  const stats = await getPlayerStats(playerId);
  return { ...data, stats };
}

export async function getPlayerAssessment(playerId: string) {
  const supabase = getSupabaseServiceRoleClient();
  
  const { data, error } = await supabase
    .from('coach_assessments')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const stats = await getPlayerStats(playerId);
  return { ...data, stats };
}
