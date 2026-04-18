import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Edit, Trash2, Video, Send, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { learningContentService } from '../../../services/learningContent';
import { CourseFormModal } from './CourseFormModal';
import { LessonFormModal } from './LessonFormModal';
import type { Course, CourseLesson, CourseWithLessons, CourseStatus } from '../../../types/learningContent';

const STATUS_STYLES: Record<CourseStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-600' },
  pending_review: { bg: 'bg-amber-50', text: 'text-amber-600' },
  active: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
};

interface Props {
  course: Course;
  clubId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function CourseDetailModal({ course, clubId, onClose, onUpdated }: Props) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<CourseWithLessons | null>(null);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [lessonModal, setLessonModal] = useState<{ mode: 'create' | 'edit'; lesson?: CourseLesson } | null>(null);

  const isDraft = (detail?.status ?? course.status) === 'draft';

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const data = await learningContentService.getCourse(course.id);
      setDetail(data);
    } catch (e) {
      toast.error((e as Error).message || t('learning_save_error'));
    } finally {
      setLoading(false);
    }
  }, [course.id, t]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const handleDeleteLesson = async (lesson: CourseLesson) => {
    if (!confirm(t('learning_delete_lesson_confirm'))) return;
    try {
      await learningContentService.deleteLesson(course.id, lesson.id);
      toast.success(t('learning_delete_success'));
      loadDetail();
    } catch (e) {
      toast.error((e as Error).message || t('learning_save_error'));
    }
  };

  const handleSubmitForReview = async () => {
    if (!detail) return;
    if (detail.lessons.length < 2) {
      return toast.error(t('learning_min_lessons_warning'));
    }
    if (!confirm(t('learning_submit_confirm'))) return;
    try {
      await learningContentService.submitCourse(course.id);
      toast.success(t('learning_submit_success'));
      onUpdated();
    } catch (e) {
      toast.error((e as Error).message || t('learning_save_error'));
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '';
    const min = Math.round(seconds / 60);
    return `${min} min`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center overflow-y-auto py-20 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl w-full max-w-2xl shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <h3 className="text-sm font-bold text-[#1A1A1A] truncate">{detail?.title ?? course.title}</h3>
            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 ${STATUS_STYLES[detail?.status ?? course.status].bg} ${STATUS_STYLES[detail?.status ?? course.status].text}`}>
              {t(`learning_status_${detail?.status ?? course.status}`)}
            </span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 shrink-0">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : detail ? (
          <div className="p-5 space-y-5">
            {/* Info del curso */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              {detail.description && (
                <p className="text-xs text-gray-600">{detail.description}</p>
              )}
              <div className="flex items-center gap-4 text-[10px] text-gray-400">
                <span>ELO {detail.elo_min}–{detail.elo_max}</span>
                {detail.pedagogical_goal && <span>{detail.pedagogical_goal}</span>}
              </div>
              {isDraft && (
                <button
                  type="button"
                  onClick={() => setEditModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white text-[#1A1A1A] text-[10px] font-bold hover:bg-gray-100 transition-all border border-gray-200"
                >
                  <Edit className="w-3 h-3" />
                  {t('learning_edit_course')}
                </button>
              )}
            </div>

            {/* No editable */}
            {!isDraft && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-xs">
                <Lock className="w-3.5 h-3.5" />
                {t('learning_course_not_editable')}
              </div>
            )}

            {/* Lecciones */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#1A1A1A]">
                  {t('learning_course_lessons')} ({detail.lessons.length})
                </h4>
                {isDraft && (
                  <button
                    type="button"
                    onClick={() => setLessonModal({ mode: 'create' })}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#E31E24] text-white text-[10px] font-bold hover:opacity-90"
                  >
                    <Plus className="w-3 h-3" />
                    {t('learning_add_lesson')}
                  </button>
                )}
              </div>

              {detail.lessons.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-xs">{t('learning_empty_lessons')}</p>
              ) : (
                <div className="space-y-2">
                  {detail.lessons.map((lesson, i) => (
                    <div
                      key={lesson.id}
                      className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3"
                    >
                      {/* Número de orden */}
                      <span className="text-[10px] font-bold text-gray-300 w-5 text-center shrink-0">{i + 1}</span>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[#1A1A1A] truncate">{lesson.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {lesson.video_url && <Video className="w-3 h-3 text-indigo-500" />}
                          {lesson.duration_seconds && (
                            <span className="text-[10px] text-gray-400">{formatDuration(lesson.duration_seconds)}</span>
                          )}
                          {lesson.description && (
                            <span className="text-[10px] text-gray-400 truncate">{lesson.description}</span>
                          )}
                        </div>
                      </div>

                      {/* Acciones */}
                      {isDraft && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setLessonModal({ mode: 'edit', lesson })}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#1A1A1A] transition-all"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLesson(lesson)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Enviar a revisión */}
            {isDraft && (
              <div className="pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleSubmitForReview}
                  disabled={detail.lessons.length < 2}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-3.5 h-3.5" />
                  {t('learning_submit_review')}
                </button>
                {detail.lessons.length < 2 && (
                  <p className="text-[10px] text-gray-400 text-center mt-2">{t('learning_min_lessons_warning')}</p>
                )}
              </div>
            )}
          </div>
        ) : null}
      </motion.div>

      {/* Modal editar curso */}
      {editModal && detail && (
        <CourseFormModal
          mode="edit"
          course={detail}
          clubId={clubId}
          onClose={() => setEditModal(false)}
          onSaved={() => { setEditModal(false); loadDetail(); }}
        />
      )}

      {/* Modal crear/editar lección */}
      {lessonModal && (
        <LessonFormModal
          mode={lessonModal.mode}
          lesson={lessonModal.lesson}
          courseId={course.id}
          clubId={clubId}
          onClose={() => setLessonModal(null)}
          onSaved={() => { setLessonModal(null); loadDetail(); }}
        />
      )}
    </div>
  );
}
