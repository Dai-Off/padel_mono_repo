import { API_URL } from '../config';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type QuestionType =
  | 'test_classic'
  | 'true_false'
  | 'multi_select'
  | 'match_columns'
  | 'order_sequence';

export type QuestionArea = 'technique' | 'tactics' | 'physical' | 'mental_vocabulary';

export type DailyLessonQuestion = {
  id: string;
  type: QuestionType;
  area: QuestionArea;
  has_video: boolean;
  video_url: string | null;
  content: Record<string, unknown>;
  club_name: string | null;
  club_city: string | null;
};

export type DailyLessonResponse = {
  ok: boolean;
  already_completed: boolean;
  questions: DailyLessonQuestion[];
  session?: {
    id: string;
    correct_count: number;
    total_count: number;
    score: number;
    xp_earned: number;
    completed_at: string;
  };
};

export type AnswerPayload = {
  question_id: string;
  selected_answer: unknown;
  response_time_ms: number;
};

export type QuestionResult = {
  question_id: string;
  correct: boolean;
  correct_answer: unknown;
  points: number;
};

export type SubmitLessonResponse = {
  ok: boolean;
  session: {
    id: string;
    correct_count: number;
    total_count: number;
    score: number;
    xp_earned: number;
    completed_at: string;
  };
  streak: {
    current: number;
    longest: number;
    multiplier: number;
    xp_base: number;
    xp_bonus: number;
  };
  shared_streaks: {
    id: string;
    partner_id: string;
    current_streak: number;
    longest_streak: number;
    both_completed_today: boolean;
  }[];
  results: QuestionResult[];
  error?: string;
};

export type StreakInfo = {
  ok: boolean;
  current_streak: number;
  longest_streak: number;
  multiplier: number;
  last_lesson_completed_at: string | null;
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function fetchDailyLesson(
  token: string | null | undefined,
  timezone = 'UTC',
): Promise<DailyLessonResponse | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(
      `${API_URL}/learning/daily-lesson?timezone=${encodeURIComponent(timezone)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al obtener lección' };
    return json as DailyLessonResponse;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function submitDailyLesson(
  token: string | null | undefined,
  timezone: string,
  answers: AnswerPayload[],
): Promise<SubmitLessonResponse | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/learning/daily-lesson/complete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ timezone, answers }),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al enviar respuestas' };
    return json as SubmitLessonResponse;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

// ---------------------------------------------------------------------------
// Cursos educativos (learning courses)
// ---------------------------------------------------------------------------

export type EducationalCourse = {
  id: string;
  title: string;
  description: string;
  banner_url: string | null;
  elo_min: number;
  elo_max: number;
  coach_name: string | null;
  is_certified: boolean;
  club_name: string | null;
  total_lessons: number;
  completed_lessons: number;
  is_completed: boolean;
  locked: boolean;
};

export async function fetchLearningCourses(
  token: string | null | undefined,
): Promise<{ ok: boolean; courses?: EducationalCourse[]; error?: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/learning/courses`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al obtener cursos' };
    return json;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export type CourseLesson = {
  id: string;
  order: number;
  title: string;
  description: string | null;
  video_url: string | null;
  duration_seconds: number | null;
  status: 'completed' | 'available' | 'locked';
};

export type CourseDetail = EducationalCourse & {
  pedagogical_goal: string | null;
  lessons: CourseLesson[];
};

export async function fetchCourseDetail(
  token: string | null | undefined,
  courseId: string,
): Promise<{ ok: boolean; course?: CourseDetail; error?: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/learning/courses/${courseId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al obtener curso' };
    return json;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function completeCourseLesson(
  token: string | null | undefined,
  courseId: string,
  lessonId: string,
): Promise<{ ok: boolean; lesson_completed?: boolean; course_completed?: boolean; completed_lessons?: number; total_lessons?: number; error?: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/learning/courses/${courseId}/complete-lesson`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lesson_id: lessonId }),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al completar lección' };
    return json;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

// ---------------------------------------------------------------------------
// Racha
// ---------------------------------------------------------------------------

export async function fetchStreak(
  token: string | null | undefined,
  timezone = 'UTC',
): Promise<StreakInfo | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/learning/streak?timezone=${encodeURIComponent(timezone)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al obtener racha' };
    return json as StreakInfo;
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}
