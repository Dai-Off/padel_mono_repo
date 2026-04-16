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

export async function fetchStreak(
  token: string | null | undefined,
): Promise<StreakInfo | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Token requerido' };
  try {
    const res = await fetch(`${API_URL}/learning/streak`, {
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
