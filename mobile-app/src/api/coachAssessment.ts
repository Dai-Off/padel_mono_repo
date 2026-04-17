import { API_URL } from '../config';

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
    completedObjectives: number;
    totalObjectives: number;
    improvementPercentage: number;
  };
  created_at: string;
};

type AssessmentResponse = {
  ok: boolean;
  assessment?: CoachAssessment;
  error?: string;
};

/**
 * Obtiene la evaluación del Coach IA del jugador actual.
 */
export async function fetchMyCoachAssessment(token: string | null | undefined): Promise<CoachAssessment | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/coach-assessment/me`, {
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
 * Envía las respuestas del cuestionario y obtiene el resultado calculado.
 */
export async function submitCoachAssessment(
  token: string | null | undefined,
  answers: { question_index: number; selected_option: number }[]
): Promise<CoachAssessment | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/coach-assessment`, {
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
