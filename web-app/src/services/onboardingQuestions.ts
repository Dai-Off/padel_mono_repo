import { apiFetchWithAuth } from './api';

export type QuestionType = 'single' | 'multi' | 'order';

export interface OnboardingQuestion {
    id: string;
    question_key: string;
    phase: number;
    pool: string | null;
    text: string;
    type: QuestionType;
    options: any;
    display_order: number;
    is_active: boolean;
    created_at: string;
}

interface ListResponse {
    ok: boolean;
    questions: OnboardingQuestion[];
    error?: string;
}

interface SingleResponse {
    ok: boolean;
    question: OnboardingQuestion;
    error?: string;
}

export const onboardingQuestionsService = {
    list: async (params?: { phase?: number; pool?: string; is_active?: string }): Promise<OnboardingQuestion[]> => {
        const query = new URLSearchParams();
        if (params?.phase) query.set('phase', String(params.phase));
        if (params?.pool) query.set('pool', params.pool);
        query.set('is_active', params?.is_active ?? 'all');
        const qs = query.toString();
        const res = await apiFetchWithAuth<ListResponse>(`/onboarding-questions${qs ? `?${qs}` : ''}`);
        if (!res.ok) throw new Error(res.error || 'Error al cargar preguntas');
        return res.questions;
    },

    create: async (data: Partial<OnboardingQuestion>): Promise<OnboardingQuestion> => {
        const res = await apiFetchWithAuth<SingleResponse>('/onboarding-questions', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(res.error || 'Error al crear pregunta');
        return res.question;
    },

    update: async (id: string, data: Partial<OnboardingQuestion>): Promise<OnboardingQuestion> => {
        const res = await apiFetchWithAuth<SingleResponse>(`/onboarding-questions/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(res.error || 'Error al actualizar pregunta');
        return res.question;
    },

    deactivate: async (id: string): Promise<void> => {
        const res = await apiFetchWithAuth<{ ok: boolean; error?: string }>(`/onboarding-questions/${id}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error(res.error || 'Error al desactivar pregunta');
    },
};
