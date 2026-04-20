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
    is_active?: 'true' | 'false' | 'all';
  }): Promise<AdminQuestion[]> {
    const q = new URLSearchParams();
    if (filters?.club_id) q.set('club_id', filters.club_id);
    if (filters?.type) q.set('type', filters.type);
    if (filters?.area) q.set('area', filters.area);
    if (filters?.is_active) q.set('is_active', filters.is_active);
    const qs = q.toString();
    const res = await apiFetchWithAuth<ApiOk<{ data: AdminQuestion[] }>>(`/admin/learning/questions${qs ? `?${qs}` : ''}`);
    return res.data ?? [];
  },

  async activateQuestion(id: string): Promise<void> {
    await apiFetchWithAuth(`/admin/learning/questions/${id}/activate`, { method: 'PATCH' });
  },

  async deactivateQuestion(id: string): Promise<void> {
    await apiFetchWithAuth(`/admin/learning/questions/${id}/deactivate`, { method: 'PATCH' });
  },

  // ---------------------------------------------------------------------------
  // Estadísticas
  // ---------------------------------------------------------------------------

  async getStats(): Promise<LearningStats> {
    const res = await apiFetchWithAuth<ApiOk<{ data: LearningStats }>>('/admin/learning/stats');
    return res.data;
  },
};
