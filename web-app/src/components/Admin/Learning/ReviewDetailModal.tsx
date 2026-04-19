import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, XCircle, Video, BookOpen, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { adminLearningService } from '../../../services/adminLearning';
import type { AdminCourse, AdminCourseWithLessons } from '../../../types/adminLearning';
import type { CourseStatus } from '../../../types/learningContent';

const STATUS_STYLES: Record<CourseStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending_review: 'bg-amber-100 text-amber-800',
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-red-100 text-red-700',
};

interface Props {
  course: AdminCourse;
  onClose: () => void;
  onActionDone: () => void;
  readOnly?: boolean;
}

export function ReviewDetailModal({ course, onClose, onActionDone, readOnly = false }: Props) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<AdminCourseWithLessons | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const canAct = !readOnly && (detail?.status ?? course.status) === 'pending_review';

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminLearningService.getCourseDetail(course.id);
      setDetail(data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [course.id]);

  useEffect(() => {
    loadDetail();
    setRejectMode(false);
    setRejectReason('');
  }, [loadDetail]);

  const handleApprove = async () => {
    setActionLoading('approve');
    try {
      await adminLearningService.approveCourse(course.id);
      toast.success(t('admin_learning_approve_success'));
      onActionDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    setActionLoading('reject');
    try {
      await adminLearningService.rejectCourse(course.id, rejectReason.trim() || undefined);
      toast.success(t('admin_learning_reject_success'));
      onClose();
      onActionDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          key={course.id}
          className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          {/* Header sticky */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-lg font-bold text-[#1A1A1A] truncate">{course.title}</h2>
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase shrink-0 ${STATUS_STYLES[detail?.status ?? course.status]}`}>
                {t(`learning_status_${detail?.status ?? course.status}`)}
              </span>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : detail ? (
            <div className="p-5 space-y-6 pb-24">
              {/* Info del curso */}
              <section>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> {t('admin_learning_club')}
                </h3>
                <p className="text-sm font-medium text-[#1A1A1A]">{detail.club_name}</p>
              </section>

              {detail.description && (
                <section>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    {t('learning_field_description')}
                  </h3>
                  <p className="text-sm text-gray-600">{detail.description}</p>
                </section>
              )}

              <div className="flex gap-4 text-sm text-gray-600">
                <span>{t('learning_level_short')} {detail.elo_min}–{detail.elo_max}</span>
                {detail.pedagogical_goal && <span>{detail.pedagogical_goal}</span>}
              </div>

              {/* Review notes (si fue rechazado anteriormente) */}
              {detail.review_notes && (
                <div className="bg-red-50 rounded-xl p-3 text-xs text-red-700">
                  <p className="font-bold mb-1">{t('admin_learning_review_notes')}</p>
                  <p>{detail.review_notes}</p>
                </div>
              )}

              {/* Lecciones */}
              <section>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" /> {t('learning_course_lessons')} ({detail.lessons.length})
                </h3>
                <div className="space-y-2">
                  {detail.lessons.map((lesson, i) => (
                    <div key={lesson.id} className="bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3">
                      <span className="text-[10px] font-bold text-gray-300 w-5 text-center shrink-0">{i + 1}</span>
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
                    </div>
                  ))}
                </div>
              </section>

              {/* Acciones */}
              {canAct && !rejectMode && (
                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={!!actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white bg-green-600 hover:bg-green-700 transition-all disabled:opacity-50"
                  >
                    {actionLoading === 'approve' ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    {t('admin_learning_approve')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectMode(true)}
                    disabled={!!actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    {t('admin_learning_reject')}
                  </button>
                </div>
              )}

              {/* Modo rechazo */}
              {canAct && rejectMode && (
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t('admin_learning_reject_reason')}
                    disabled={!!actionLoading}
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
                  />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setRejectMode(false); setRejectReason(''); }}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold text-[#1A1A1A] bg-gray-50 hover:bg-gray-100 transition-all"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={!!actionLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50"
                    >
                      {actionLoading === 'reject' ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      {t('admin_learning_reject')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
