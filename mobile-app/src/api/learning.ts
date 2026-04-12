import { API_URL } from "../config";

export type QuestionType =
  | "test_classic"
  | "true_false"
  | "multi_select"
  | "match_columns"
  | "order_sequence";
export type QuestionArea =
  | "technique"
  | "tactics"
  | "physical"
  | "mental_vocabulary";

export interface Question {
  id: string;
  type: QuestionType;
  area: QuestionArea;
  has_video: boolean;
  video_url: string | null;
  content: any;
}

export interface DailyLessonResponse {
  ok: boolean;
  already_completed: boolean;
  questions?: Question[];
  session?: {
    id: string;
    correct_count: number;
    total_count: number;
    score: number;
    xp_earned: number;
    completed_at: string;
  };
  weekly_progress?: boolean[];
  bonus_text?: string;
  error?: string;
}

export interface LessonAnswer {
  question_id: string;
  selected_answer: any;
  response_time_ms: number;
}

export interface LessonCompletionResponse {
  ok: boolean;
  session?: any;
  streak?: {
    current: number;
    longest: number;
    multiplier: number;
    xp_base: number;
    xp_bonus: number;
  };
  shared_streaks?: any[];
  results?: {
    question_id: string;
    correct: boolean;
    correct_answer: any;
    points: number;
  }[];
  error?: string;
}

export interface EducationalCourse {
  id: string;
  title: string;
  description: string;
  banner_url: string | null;
  elo_min: number;
  elo_max: number;
  coach_name: string | null;
  rating: number;
  is_certified: boolean;
  club_name: string | null;
  total_lessons: number;
  completed_lessons: number;
  is_completed: boolean;
  locked: boolean;
}

export interface LearningCoursesResponse {
  ok: boolean;
  courses?: EducationalCourse[];
  error?: string;
}

export async function fetchLearningCourses(
  token: string,
): Promise<LearningCoursesResponse> {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  try {
    const res = await fetch(`${API_URL}/learning/courses`, { headers });
    const json = await res.json();
    return json;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function fetchDailyLesson(
  token: string,
  timezone: string = "Europe/Madrid",
): Promise<DailyLessonResponse> {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  try {
    const res = await fetch(
      `${API_URL}/learning/daily-lesson?timezone=${encodeURIComponent(timezone)}`,
      { headers },
    );
    const json = await res.json();
    return json;
  } catch (err) {
    return {
      ok: false,
      already_completed: false,
      error: (err as Error).message,
    };
  }
}

export async function submitDailyLesson(
  token: string,
  answers: LessonAnswer[],
  timezone: string = "Europe/Madrid",
): Promise<LessonCompletionResponse> {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  try {
    const res = await fetch(`${API_URL}/learning/daily-lesson/complete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ answers, timezone }),
    });
    const json = await res.json();
    return json;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
