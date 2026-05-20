import { apiFetchWithAuth } from './api';
import { getSupabaseClient } from '../lib/supabase';
import type {
  Question,
  QuestionWithWarnings,
  QuestionType,
  QuestionArea,
  QuestionContent,
  Course,
  CourseLesson,
  CourseWithLessons,
} from '../types/learningContent';

type ApiOk<T> = T & { ok: true };

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'mkv'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const BANNER_MAX_SIZE_MB = 5;

// Límites por tipo de contenido
export const VIDEO_LIMITS = {
  question: { maxSizeMB: 30, maxDurationSec: 15 },
  course:   { maxSizeMB: 300, maxDurationSec: 420 }, // 7 minutos
};

/**
 * Devuelve true si la pregunta tiene una nota de moderación que el club aún
 * no ha visto. Una nota se considera "no vista" si:
 *  - moderation_notes no es null/vacío, Y
 *  - notes_seen_at es null, O notes_seen_at < last_admin_edit_at
 *    (el admin editó tras la última vez que el club abrió la pregunta).
 */
export function hasUnreadNotes(q: Pick<Question, 'moderation_notes' | 'notes_seen_at' | 'last_admin_edit_at'>): boolean {
  if (!q.moderation_notes) return false;
  if (!q.notes_seen_at) return true;
  if (!q.last_admin_edit_at) return false;
  return new Date(q.notes_seen_at).getTime() < new Date(q.last_admin_edit_at).getTime();
}

// Umbral mínimo de votos para mostrar el % de positividad en card. Por debajo
// se muestra solo el conteo bruto (👍 N · 👎 M) para no inducir a interpretar
// ruido como señal.
export const FEEDBACK_MIN_VOTES = 10;

// Umbral mínimo de respuestas para mostrar el % de acierto en card. Por
// debajo, mostramos "Pocas respuestas" para no inducir falsa señal.
export const ATTEMPTS_MIN_FOR_RATE = 20;

/**
 * Resumen de respuestas/aciertos para pintar en card. Si attempts < umbral,
 * success_pct = null (mostrar "Pocas respuestas" en su lugar).
 */
export function summarizeAttempts(q: Pick<Question, 'attempts_count' | 'correct_count'>): {
  attempts: number;
  correct: number;
  success_pct: number | null;
} {
  const attempts = q.attempts_count ?? 0;
  const correct = q.correct_count ?? 0;
  const success_pct = attempts >= ATTEMPTS_MIN_FOR_RATE ? Math.round((correct / attempts) * 100) : null;
  return { attempts, correct, success_pct };
}

/**
 * Resumen de la valoración (like/dislike) para pintar en una card. Devuelve
 * los conteos y, si supera el umbral mínimo, el % de positividad redondeado.
 */
export function summarizeFeedback(q: Pick<Question, 'feedback_up' | 'feedback_down'>): {
  up: number;
  down: number;
  total: number;
  positive_pct: number | null;
} {
  const up = q.feedback_up ?? 0;
  const down = q.feedback_down ?? 0;
  const total = up + down;
  const positive_pct = total >= FEEDBACK_MIN_VOTES ? Math.round((up / total) * 100) : null;
  return { up, down, total, positive_pct };
}

/** Obtiene la duración de un video en segundos */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer el video'));
    };
  });
}

/**
 * Valida tamaño y duración de un video. Lanza error si excede los límites.
 */
export async function validateVideo(file: File, limits: { maxSizeMB: number; maxDurationSec: number }): Promise<void> {
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > limits.maxSizeMB) {
    throw new Error(`El video supera el límite de ${limits.maxSizeMB}MB (${sizeMB.toFixed(1)}MB)`);
  }
  const duration = await getVideoDuration(file);
  if (duration > limits.maxDurationSec) {
    const maxLabel = limits.maxDurationSec >= 60
      ? `${Math.floor(limits.maxDurationSec / 60)} min`
      : `${limits.maxDurationSec}s`;
    throw new Error(`El video supera el límite de ${maxLabel} (${Math.ceil(duration)}s)`);
  }
}

async function uploadVideo(bucket: string, folder: string, file: File): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase no configurado');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('Inicia sesión para subir archivos');

  const ext = file.name.split('.').pop()?.toLowerCase();
  const safeExt = ext && VIDEO_EXTENSIONS.includes(ext) ? ext : 'mp4';
  const fileName = `${Date.now()}.${safeExt}`;
  const path = `${folder}/${fileName}`;

  const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return pub.publicUrl;
}

export const learningContentService = {
  // ---------------------------------------------------------------------------
  // Upload de videos
  // ---------------------------------------------------------------------------

  /** Sube video para una pregunta de lección diaria (máx 30MB, 15s) */
  async uploadQuestionVideo(clubId: string, file: File): Promise<string> {
    await validateVideo(file, VIDEO_LIMITS.question);
    return uploadVideo('learning-daily-lessons', `${clubId}/questions`, file);
  },

  /** Sube video para una lección de curso (máx 300MB, 7min) */
  async uploadCourseVideo(clubId: string, courseId: string, file: File): Promise<string> {
    await validateVideo(file, VIDEO_LIMITS.course);
    return uploadVideo('learning-courses', `${clubId}/${courseId}`, file);
  },

  /** Sube imagen de banner para un curso (máx 5MB) */
  async uploadCourseBanner(clubId: string, file: File): Promise<string> {
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > BANNER_MAX_SIZE_MB) {
      throw new Error(`La imagen supera el límite de ${BANNER_MAX_SIZE_MB}MB (${sizeMB.toFixed(1)}MB)`);
    }
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase no configurado');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) throw new Error('Inicia sesión para subir archivos');

    const ext = file.name.split('.').pop()?.toLowerCase();
    const safeExt = ext && IMAGE_EXTENSIONS.includes(ext) ? ext : 'jpg';
    const fileName = `${Date.now()}.${safeExt}`;
    const path = `${clubId}/banners/${fileName}`;

    const { error: upErr } = await supabase.storage.from('learning-courses').upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabase.storage.from('learning-courses').getPublicUrl(path);
    return pub.publicUrl;
  },

  // ---------------------------------------------------------------------------
  // Preguntas
  // ---------------------------------------------------------------------------

  async listQuestions(
    clubId: string,
    filters?: {
      type?: QuestionType;
      area?: QuestionArea;
      // 'all' devuelve todas; los valores concretos filtran. Default backend:
      // 'published'. Si quieres ver borradores o inactivas, pásalo explícito.
      status?: 'all' | 'draft' | 'published' | 'inactive';
      search?: string;
      order_by?: 'created_desc' | 'created_asc';
      elo_min?: number;
      elo_max?: number;
      page?: number;
      page_size?: number;
    },
  ): Promise<{ data: Question[]; unread_count: number; total: number; page: number; page_size: number }> {
    const q = new URLSearchParams({ club_id: clubId });
    if (filters?.type) q.set('type', filters.type);
    if (filters?.area) q.set('area', filters.area);
    if (filters?.status) q.set('status', filters.status);
    if (filters?.search) q.set('search', filters.search);
    if (filters?.order_by) q.set('order_by', filters.order_by);
    if (typeof filters?.elo_min === 'number') q.set('elo_min', String(filters.elo_min));
    if (typeof filters?.elo_max === 'number') q.set('elo_max', String(filters.elo_max));
    if (filters?.page) q.set('page', String(filters.page));
    if (filters?.page_size) q.set('page_size', String(filters.page_size));
    const res = await apiFetchWithAuth<ApiOk<{
      data: Question[];
      meta?: { unread_count?: number; total?: number; page?: number; page_size?: number };
    }>>(`/learning/questions?${q}`);
    return {
      data: res.data ?? [],
      unread_count: res.meta?.unread_count ?? 0,
      total: res.meta?.total ?? 0,
      page: res.meta?.page ?? 1,
      page_size: res.meta?.page_size ?? 20,
    };
  },

  async createQuestion(body: {
    club_id: string;
    type: QuestionType;
    level: number;
    area: QuestionArea;
    video_url?: string | null;
    content: QuestionContent;
    // 'draft' o 'published'. 'inactive' no aplica al crear (se llega vía toggle).
    status?: 'draft' | 'published';
  }): Promise<Question> {
    const res = await apiFetchWithAuth<ApiOk<{ data: Question }>>('/learning/questions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.data;
  },

  async updateQuestion(
    id: string,
    body: Partial<{
      type: QuestionType;
      level: number;
      area: QuestionArea;
      video_url: string | null;
      content: QuestionContent;
      status: 'draft' | 'published' | 'inactive';
    }>,
  ): Promise<Question> {
    const res = await apiFetchWithAuth<ApiOk<{ data: Question }>>(`/learning/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return res.data;
  },

  async deactivateQuestion(id: string): Promise<void> {
    await apiFetchWithAuth(`/learning/questions/${id}/deactivate`, { method: 'PATCH' });
  },

  async activateQuestion(id: string): Promise<void> {
    await apiFetchWithAuth(`/learning/questions/${id}/activate`, { method: 'PATCH' });
  },

  // Borrado permanente. El backend exige que la pregunta esté ya desactivada.
  async deleteQuestion(id: string): Promise<void> {
    await apiFetchWithAuth(`/learning/questions/${id}`, { method: 'DELETE' });
  },

  // Estadísticas locales del club + benchmark con la media global. Protegido
  // por canAccessClub en el backend.
  async getClubStats(clubId: string): Promise<import('../types/adminLearning').ClubLearningStats> {
    const res = await apiFetchWithAuth<ApiOk<{ data: import('../types/adminLearning').ClubLearningStats }>>(`/learning/clubs/${clubId}/stats`);
    return res.data;
  },

  // Stats detalladas de una pregunta del club.
  async getQuestionStats(id: string): Promise<import('../types/adminLearning').QuestionDetailStats> {
    const res = await apiFetchWithAuth<ApiOk<{ data: import('../types/adminLearning').QuestionDetailStats }>>(`/learning/questions/${id}/stats`);
    return res.data;
  },

  // Stats detalladas de un curso del club.
  async getCourseStats(id: string): Promise<import('../types/adminLearning').CourseDetailStats> {
    const res = await apiFetchWithAuth<ApiOk<{ data: import('../types/adminLearning').CourseDetailStats }>>(`/learning/club-courses/${id}/stats`);
    return res.data;
  },

  // Trae las preguntas del club con al menos un aviso de calidad. Devuelve
  // la lista enriquecida con el array `warnings` por cada pregunta. No se
  // pagina; el panel muestra todas. Si crece mucho, lo paginamos en cliente.
  async getClubWarnings(clubId: string): Promise<{ data: QuestionWithWarnings[]; count: number }> {
    const res = await apiFetchWithAuth<ApiOk<{ data: QuestionWithWarnings[]; meta?: { count?: number } }>>(`/learning/clubs/${clubId}/warnings`);
    return { data: res.data ?? [], count: res.meta?.count ?? (res.data?.length ?? 0) };
  },

  // Marca como vistas las notas de moderación de una pregunta. Devuelve el
  // contador total de preguntas del club con nota pendiente tras el update
  // para que el badge se actualice sin re-fetch del listing.
  async acknowledgeQuestionNotes(id: string): Promise<{ unread_count: number }> {
    const res = await apiFetchWithAuth<ApiOk<{ unread_count?: number }>>(
      `/learning/questions/${id}/acknowledge-notes`,
      { method: 'PATCH' },
    );
    return { unread_count: res.unread_count ?? 0 };
  },

  // ---------------------------------------------------------------------------
  // Cursos
  // ---------------------------------------------------------------------------

  async listCourses(
    clubId: string,
    filters?: {
      status?: string;
      search?: string;
      order_by?: 'created_desc' | 'created_asc';
      elo_min?: number;
      elo_max?: number;
      page?: number;
      page_size?: number;
    },
  ): Promise<{ data: Course[]; total: number; page: number; page_size: number }> {
    const q = new URLSearchParams({ club_id: clubId });
    if (filters?.status) q.set('status', filters.status);
    if (filters?.search) q.set('search', filters.search);
    if (filters?.order_by) q.set('order_by', filters.order_by);
    if (typeof filters?.elo_min === 'number') q.set('elo_min', String(filters.elo_min));
    if (typeof filters?.elo_max === 'number') q.set('elo_max', String(filters.elo_max));
    if (filters?.page) q.set('page', String(filters.page));
    if (filters?.page_size) q.set('page_size', String(filters.page_size));
    const res = await apiFetchWithAuth<ApiOk<{
      data: Course[];
      meta?: { total?: number; page?: number; page_size?: number };
    }>>(`/learning/club-courses?${q}`);
    return {
      data: res.data ?? [],
      total: res.meta?.total ?? 0,
      page: res.meta?.page ?? 1,
      page_size: res.meta?.page_size ?? 20,
    };
  },

  async getCourse(courseId: string): Promise<CourseWithLessons> {
    const res = await apiFetchWithAuth<ApiOk<{ data: CourseWithLessons }>>(`/learning/club-courses/${courseId}`);
    return res.data;
  },

  async createCourse(body: {
    club_id: string;
    title: string;
    description?: string | null;
    banner_url?: string | null;
    elo_min?: number;
    elo_max?: number;
    pedagogical_goal?: string | null;
    staff_id?: string | null;
  }): Promise<Course> {
    const res = await apiFetchWithAuth<ApiOk<{ data: Course }>>('/learning/courses', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.data;
  },

  async updateCourse(
    id: string,
    body: Partial<{
      title: string;
      description: string | null;
      banner_url: string | null;
      elo_min: number;
      elo_max: number;
      pedagogical_goal: string | null;
      staff_id: string | null;
    }>,
  ): Promise<Course> {
    const res = await apiFetchWithAuth<ApiOk<{ data: Course }>>(`/learning/courses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // Lecciones
  // ---------------------------------------------------------------------------

  async addLesson(
    courseId: string,
    body: {
      title: string;
      description?: string | null;
      video_url?: string | null;
      duration_seconds?: number | null;
    },
  ): Promise<CourseLesson> {
    const res = await apiFetchWithAuth<ApiOk<{ data: CourseLesson }>>(`/learning/courses/${courseId}/lessons`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.data;
  },

  async updateLesson(
    courseId: string,
    lessonId: string,
    body: Partial<{
      title: string;
      description: string | null;
      video_url: string | null;
      duration_seconds: number | null;
    }>,
  ): Promise<CourseLesson> {
    const res = await apiFetchWithAuth<ApiOk<{ data: CourseLesson }>>(
      `/learning/courses/${courseId}/lessons/${lessonId}`,
      { method: 'PUT', body: JSON.stringify(body) },
    );
    return res.data;
  },

  async deleteLesson(courseId: string, lessonId: string): Promise<void> {
    await apiFetchWithAuth(`/learning/courses/${courseId}/lessons/${lessonId}`, { method: 'DELETE' });
  },

  async submitCourse(courseId: string): Promise<void> {
    await apiFetchWithAuth(`/learning/courses/${courseId}/submit`, { method: 'POST' });
  },
};
