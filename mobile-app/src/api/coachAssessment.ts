import { API_URL } from '../config';
import { withLangQuery } from './backendLang';
import type { AppLocale } from '../i18n/constants';

export type CoachAssessment = {
  id: string;
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
  recommendation: string | null;
  stats?: {
    matchCount: number;
    matchesThisWeek?: number;
    matchesThisMonth?: number;
    completedObjectives: number;
    dailyLessonsThisWeek?: number;
    tournamentEnrolledCount?: number;
    tournamentPlayedCount?: number;
    classesAttendedCount?: number;
    coursesCompletedCount?: number;
    totalObjectives: number;
    improvementPercentage: number;
  };
  created_at: string;
};

export type CoachStats = NonNullable<CoachAssessment['stats']>;

type AssessmentResponse = {
  ok: boolean;
  assessment?: CoachAssessment;
  error?: string;
};

type CoachStatsResponse = {
  ok: boolean;
  stats?: CoachStats;
  error?: string;
};

/**
 * Obtiene la evaluación del Coach IA del jugador actual.
 */
export async function fetchMyCoachAssessment(
  token: string | null | undefined,
  locale?: AppLocale,
): Promise<CoachAssessment | null> {
  if (!token) return null;
  try {
    const res = await fetch(withLangQuery(`${API_URL}/coach-assessment/me`, locale), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as AssessmentResponse;
    if (json.ok && json.assessment) return json.assessment;
    return null;
  } catch (err) {
    console.error('[fetchMyCoachAssessment]', err);
    return null;
  }
}

/**
 * Obtiene las stats del Coach (contadores en vivo) por separado del radar (A1),
 * para que la tarjeta pinte el radar de inmediato y las cifras rellenen aparte.
 */
export async function fetchMyCoachStats(
  token: string | null | undefined,
): Promise<CoachStats | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/coach-assessment/me/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as CoachStatsResponse;
    if (json.ok && json.stats) return json.stats;
    return null;
  } catch (err) {
    console.error('[fetchMyCoachStats]', err);
    return null;
  }
}

/**
 * Envía las respuestas del cuestionario y obtiene el resultado calculado.
 */
export async function submitCoachAssessment(
  token: string | null | undefined,
  answers: { question_index: number; selected_option: number }[],
  locale?: AppLocale,
): Promise<CoachAssessment | null> {
  if (!token) return null;
  try {
    const res = await fetch(withLangQuery(`${API_URL}/coach-assessment`, locale), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ answers }),
    });
    const json = (await res.json()) as AssessmentResponse;
    if (json.ok && json.assessment) return json.assessment;
    throw new Error(json.error || 'Error al enviar la evaluación');
  } catch (err) {
    console.error('[submitCoachAssessment]', err);
    throw err;
  }
}
