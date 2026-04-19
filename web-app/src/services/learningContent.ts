import { apiFetchWithAuth } from './api';
import { getSupabaseClient } from '../lib/supabase';
import type {
  Question,
  QuestionType,
  QuestionArea,
  QuestionContent,
  Course,
  CourseLesson,
  CourseWithLessons,
} from '../types/learningContent';

type ApiOk<T> = T & { ok: true };

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'mkv'];

// Límites por tipo de contenido
export const VIDEO_LIMITS = {
  question: { maxSizeMB: 30, maxDurationSec: 15 },
  course:   { maxSizeMB: 300, maxDurationSec: 420 }, // 7 minutos
};

/** Obtiene la duración de un video en segundos */
function getVideoDuration(file: File): Promise<number> {
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

  // ---------------------------------------------------------------------------
  // Preguntas
  // ---------------------------------------------------------------------------

  async listQuestions(
    clubId: string,
    filters?: { type?: QuestionType; area?: QuestionArea; is_active?: 'true' | 'false' | 'all' },
  ): Promise<Question[]> {
    const q = new URLSearchParams({ club_id: clubId });
    if (filters?.type) q.set('type', filters.type);
    if (filters?.area) q.set('area', filters.area);
    if (filters?.is_active) q.set('is_active', filters.is_active);
    const res = await apiFetchWithAuth<ApiOk<{ data: Question[] }>>(`/learning/questions?${q}`);
    return res.data ?? [];
  },

  async createQuestion(body: {
    club_id: string;
    type: QuestionType;
    level: number;
    area: QuestionArea;
    has_video: boolean;
    video_url?: string;
    content: QuestionContent;
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
      has_video: boolean;
      video_url: string;
      content: QuestionContent;
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

  // ---------------------------------------------------------------------------
  // Cursos
  // ---------------------------------------------------------------------------

  async listCourses(clubId: string): Promise<Course[]> {
    const res = await apiFetchWithAuth<ApiOk<{ data: Course[] }>>(`/learning/club-courses?club_id=${clubId}`);
    return res.data ?? [];
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
