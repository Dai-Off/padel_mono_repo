import { apiFetchWithAuth } from './api';
import type {
  AdminCourse,
  AdminCourseWithLessons,
  AdminQuestion,
  AdminQuestionWithWarnings,
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

  async listAllCourses(filters?: {
    status?: string;
    club_id?: string;
    search?: string;
    order_by?: 'created_desc' | 'created_asc';
    elo_min?: number;
    elo_max?: number;
    page?: number;
    page_size?: number;
  }): Promise<{ data: AdminCourse[]; total: number; page: number; page_size: number }> {
    const q = new URLSearchParams();
    if (filters?.status) q.set('status', filters.status);
    if (filters?.club_id) q.set('club_id', filters.club_id);
    if (filters?.search) q.set('search', filters.search);
    if (filters?.order_by) q.set('order_by', filters.order_by);
    if (typeof filters?.elo_min === 'number') q.set('elo_min', String(filters.elo_min));
    if (typeof filters?.elo_max === 'number') q.set('elo_max', String(filters.elo_max));
    if (filters?.page) q.set('page', String(filters.page));
    if (filters?.page_size) q.set('page_size', String(filters.page_size));
    const qs = q.toString();
    const res = await apiFetchWithAuth<ApiOk<{
      data: AdminCourse[];
      meta?: { total?: number; page?: number; page_size?: number };
    }>>(`/admin/learning/courses${qs ? `?${qs}` : ''}`);
    return {
      data: res.data ?? [],
      total: res.meta?.total ?? 0,
      page: res.meta?.page ?? 1,
      page_size: res.meta?.page_size ?? 20,
    };
  },

  async listClubsWithContent(): Promise<Array<{ id: string; name: string }>> {
    const res = await apiFetchWithAuth<ApiOk<{ data: Array<{ id: string; name: string }> }>>('/admin/learning/clubs-with-content');
    return res.data ?? [];
  },

  async listAllQuestions(filters?: {
    club_id?: string;
    type?: QuestionType;
    area?: QuestionArea;
    status?: 'all' | 'draft' | 'published' | 'inactive';
    search?: string;
    order_by?: 'created_desc' | 'created_asc';
    elo_min?: number;
    elo_max?: number;
    page?: number;
    page_size?: number;
  }): Promise<{ data: AdminQuestion[]; total: number; page: number; page_size: number }> {
    const q = new URLSearchParams();
    if (typeof filters?.elo_min === 'number') q.set('elo_min', String(filters.elo_min));
    if (typeof filters?.elo_max === 'number') q.set('elo_max', String(filters.elo_max));
    if (filters?.club_id) q.set('club_id', filters.club_id);
    if (filters?.type) q.set('type', filters.type);
    if (filters?.area) q.set('area', filters.area);
    if (filters?.status && filters.status !== 'all') q.set('status', filters.status);
    if (filters?.search) q.set('search', filters.search);
    if (filters?.order_by) q.set('order_by', filters.order_by);
    if (filters?.page) q.set('page', String(filters.page));
    if (filters?.page_size) q.set('page_size', String(filters.page_size));
    const qs = q.toString();
    const res = await apiFetchWithAuth<ApiOk<{
      data: AdminQuestion[];
      meta?: { total?: number; page?: number; page_size?: number };
    }>>(`/admin/learning/questions${qs ? `?${qs}` : ''}`);
    return {
      data: res.data ?? [],
      total: res.meta?.total ?? 0,
      page: res.meta?.page ?? 1,
      page_size: res.meta?.page_size ?? 20,
    };
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

  // Trae todas las preguntas con avisos de calidad (todos los clubs o
  // filtrado por uno). No se pagina; si crece, paginamos en cliente.
  async getWarnings(clubId?: string): Promise<{ data: AdminQuestionWithWarnings[]; count: number }> {
    const q = clubId ? `?club_id=${encodeURIComponent(clubId)}` : '';
    const res = await apiFetchWithAuth<ApiOk<{ data: AdminQuestionWithWarnings[]; meta?: { count?: number } }>>(`/admin/learning/warnings${q}`);
    return { data: res.data ?? [], count: res.meta?.count ?? (res.data?.length ?? 0) };
  },

  // Endpoint ligero para mostrar burbuja sin traer toda la lista de pendientes.
  async getPendingCount(): Promise<number> {
    const res = await apiFetchWithAuth<{ ok: true; count: number }>('/admin/learning/pending-courses/count');
    return res.count ?? 0;
  },
};
