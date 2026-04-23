import { API_URL } from '../config';

export type OnboardingAnswerPayload = { question_key: string; value: unknown };

export type OnboardingQuestionPayload = {
  id: string;
  question_key: string;
  phase: number;
  pool?: string | null;
  text: string;
  type: 'single' | 'multi' | 'order';
  options: unknown;
  display_order: number;
};

export type OnboardingNextState =
  | { type: 'question'; question: OnboardingQuestionPayload }
  | {
      type: 'phase2';
      questions: OnboardingQuestionPayload[];
      elo_phase1: number;
      pool_assigned: string;
    }
  | { type: 'complete' };

type NextResponse = { ok: boolean; state?: OnboardingNextState; error?: string };
type SubmitResponse = { ok: boolean; elo_rating?: number; message?: string; error?: string };

export async function fetchOnboardingNext(
  token: string,
  answers: OnboardingAnswerPayload[],
): Promise<OnboardingNextState> {
  const qs = encodeURIComponent(JSON.stringify(answers));
  const res = await fetch(`${API_URL}/players/onboarding/next?answers=${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as NextResponse;
  if (!res.ok || !json.ok || !json.state) {
    throw new Error(json.error || 'No se pudo cargar el cuestionario');
  }
  return json.state;
}

export async function submitPlayerOnboarding(
  token: string,
  answers: OnboardingAnswerPayload[],
): Promise<{ elo_rating: number; message?: string }> {
  const res = await fetch(`${API_URL}/players/onboarding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ answers }),
  });
  const json = (await res.json()) as SubmitResponse;
  if (res.status === 409) {
    throw new Error(json.error || 'La nivelación inicial ya está completada');
  }
  if (!res.ok || !json.ok || json.elo_rating === undefined) {
    throw new Error(json.error || 'No se pudo guardar tu nivel');
  }
  return { elo_rating: Number(json.elo_rating), message: json.message };
}
