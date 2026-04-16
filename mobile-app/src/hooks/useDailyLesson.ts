import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchDailyLesson,
  fetchStreak,
  type DailyLessonQuestion,
  type DailyLessonResponse,
  type StreakInfo,
} from '../api/dailyLessons';

// ---------------------------------------------------------------------------
// useDailyLesson
// ---------------------------------------------------------------------------

type DailyLessonState = {
  questions: DailyLessonQuestion[];
  alreadyCompleted: boolean;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useDailyLesson(timezone = 'UTC'): DailyLessonState {
  const { session } = useAuth();
  const [questions, setQuestions] = useState<DailyLessonQuestion[]>([]);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    fetchDailyLesson(session?.access_token, timezone)
      .then((res) => {
        if (!mounted) return;
        if (!res.ok) {
          setError('error' in res ? res.error : 'Error desconocido');
          return;
        }
        const data = res as DailyLessonResponse;
        setAlreadyCompleted(data.already_completed);
        setQuestions(data.questions ?? []);
      })
      .catch(() => {
        if (mounted) setError('Error de conexión');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session?.access_token, timezone]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  return { questions, alreadyCompleted, loading, error, reload: load };
}

// ---------------------------------------------------------------------------
// useStreak
// ---------------------------------------------------------------------------

type StreakState = {
  currentStreak: number;
  longestStreak: number;
  multiplier: number;
  lastCompleted: string | null;
  loading: boolean;
};

export function useStreak(): StreakState {
  const { session } = useAuth();
  const [state, setState] = useState<StreakState>({
    currentStreak: 0,
    longestStreak: 0,
    multiplier: 0,
    lastCompleted: null,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;

    fetchStreak(session?.access_token)
      .then((res) => {
        if (!mounted) return;
        if (res.ok) {
          const data = res as StreakInfo;
          setState({
            currentStreak: data.current_streak,
            longestStreak: data.longest_streak,
            multiplier: data.multiplier,
            lastCompleted: data.last_lesson_completed_at,
            loading: false,
          });
        } else {
          setState((prev) => ({ ...prev, loading: false }));
        }
      })
      .catch(() => {
        if (mounted) setState((prev) => ({ ...prev, loading: false }));
      });

    return () => {
      mounted = false;
    };
  }, [session?.access_token]);

  return state;
}
