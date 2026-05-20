import { apiFetchWithAuth } from './api';
import type {
  AdminCourse,
  AdminCourseWithLessons,
  AdminQuestion,
  LearningStats,
} from '../types/adminLearning';
import type { QuestionType, QuestionArea } from '../types/learningContent';

type ApiOk<T> = T & { ok: true };

export const WEMATCH_CLUB_ID = 'ec0bc05c-f21b-465b-82b0-6bd75d1f4163';

export const adminLearningService = {
  // ---------------------------------------------------------------------------
  // Cola de revisión
  // ---------------------------------------------------------------------------

  async getPendingCourses(): Promise<AdminCourse[]> {
    const res = await apiFetchWithAuth<ApiOk<{ data: AdminCourse[] }>>('/admin/learning/pending-courses');
    return res.data ?? [];
  },

  async getCourseDetail(id: string): Promise<AdminCourseWithLessons> {
    const res = await apiFetchWithAuth<ApiOk<{ data: AdminCourseWithLessons }>>(`/admin/learning/courses/${id}`);
    return res.data;
  },

  async approveCourse(id: string): Promise<void> {
    await apiFetchWithAuth(`/admin/learning/courses/${id}/approve`, { method: 'POST' });
  },

  async rejectCourse(id: string, reason?: string): Promise<void> {
    await apiFetchWithAuth(`/admin/learning/courses/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? '' }),
    });
  },

  // ---------------------------------------------------------------------------
  // Moderación global
  // ---------------------------------------------------------------------------

  async listAllCourses(filters?: { status?: string; club_id?: string }): Promise<AdminCourse[]> {
    const q = new URLSearchParams();
    if (filters?.status) q.set('status', filters.status);
    if (filters?.club_id) q.set('club_id', filters.club_id);
    const qs = q.toString();
    const res = await apiFetchWithAuth<ApiOk<{ data: AdminCourse[] }>>(`/admin/learning/courses${qs ? `?${qs}` : ''}`);
    return res.data ?? [];
  },

  async listAllQuestions(filters?: {
    club_id?: string;
    type?: QuestionType;
    area?: QuestionArea;
    status?: 'all' | 'draft' | 'published' | 'inactive';
  }): Promise<AdminQuestion[]> {
    const q = new URLSearchParams();
    if (filters?.club_id) q.set('club_id', filters.club_id);
    if (filters?.type) q.set('type', filters.type);
    if (filters?.area) q.set('area', filters.area);
    if (filters?.status && filters.status !== 'all') q.set('status', filters.status);
    const qs = q.toString();
    const res = await apiFetchWithAuth<ApiOk<{ data: AdminQuestion[] }>>(`/admin/learning/questions${qs ? `?${qs}` : ''}`);
    return res.data ?? [];
  },

  async activateQuestion(id: string, moderationNotes?: string | null): Promise<void> {
    const body = moderationNotes !== undefined ? JSON.stringify({ moderation_notes: moderationNotes }) : undefined;
    await apiFetchWithAuth(`/admin/learning/questions/${id}/activate`, {
      method: 'PATCH',
      ...(body ? { body } : {}),
    });
  },

  async deactivateQuestion(id: string, moderationNotes?: string | null): Promise<void> {
    const body = moderationNotes !== undefined ? JSON.stringify({ moderation_notes: moderationNotes }) : undefined;
    await apiFetchWithAuth(`/admin/learning/questions/${id}/deactivate`, {
      method: 'PATCH',
      ...(body ? { body } : {}),
    });
  },

  // Edición completa de cualquier pregunta como admin. Acepta moderation_notes
  // opcional. `last_admin_edit_at` lo escribe el backend.
  async updateQuestion(id: string, body: Record<string, unknown>): Promise<void> {
    await apiFetchWithAuth(`/admin/learning/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  // Pasa una pregunta published|inactive a draft. moderation_notes opcional.
  async moveQuestionToDraft(id: string, moderationNotes?: string | null): Promise<void> {
    await apiFetchWithAuth(`/admin/learning/questions/${id}/draft`, {
      method: 'PATCH',
      body: JSON.stringify({ moderation_notes: moderationNotes ?? null }),
    });
  },

  // Actualiza solo moderation_notes (sin tocar estado).
  async updateModerationNotes(id: string, moderationNotes: string | null): Promise<void> {
    await apiFetchWithAuth(`/admin/learning/questions/${id}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ moderation_notes: moderationNotes }),
    });
  },

  // Borrado forzado. No requiere que la pregunta esté en draft/inactive.
  async deleteQuestion(id: string): Promise<void> {
    await apiFetchWithAuth(`/admin/learning/questions/${id}`, { method: 'DELETE' });
  },

  // ---------------------------------------------------------------------------
  // Estadísticas
  // ---------------------------------------------------------------------------

  async getStats(): Promise<LearningStats> {
    const res = await apiFetchWithAuth<ApiOk<{ data: LearningStats }>>('/admin/learning/stats');
    return res.data;
  },

  // Endpoint ligero para mostrar burbuja sin traer toda la lista de pendientes.
  async getPendingCount(): Promise<number> {
    const res = await apiFetchWithAuth<{ ok: true; count: number }>('/admin/learning/pending-courses/count');
    return res.count ?? 0;
  },
};
