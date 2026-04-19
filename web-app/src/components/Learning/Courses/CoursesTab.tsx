import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { learningContentService } from '../../../services/learningContent';
import { clubStaffService } from '../../../services/clubStaff';
import { CourseFormModal } from './CourseFormModal';
import { CourseDetailModal } from './CourseDetailModal';
import type { Course, CourseStatus } from '../../../types/learningContent';
import type { ClubStaffMember } from '../../../types/clubStaff';

const STATUS_STYLES: Record<CourseStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-600' },
  pending_review: { bg: 'bg-amber-50', text: 'text-amber-600' },
  active: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
};

export function CoursesTab({ clubId }: { clubId: string }) {
  const { t } = useTranslation();
  const [courses, setCourses] = useState<Course[]>([]);
  const [staff, setStaff] = useState<ClubStaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [detailCourse, setDetailCourse] = useState<Course | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, staffList] = await Promise.all([
        learningContentService.listCourses(clubId),
        clubStaffService.list(clubId),
      ]);
      setCourses(list);
      setStaff(staffList);
    } catch (e) {
      toast.error((e as Error).message || t('learning_save_error'));
    } finally {
      setLoading(false);
    }
  }, [clubId, t]);

  const staffMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of staff) map[s.id] = s.name;
    return map;
  }, [staff]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => ({
    total: courses.length,
    draft: courses.filter((c) => c.status === 'draft').length,
    pending: courses.filter((c) => c.status === 'pending_review').length,
    active: courses.filter((c) => c.status === 'active').length,
  }), [courses]);

  return (
    <div className="space-y-5">
      {/* Header + botón crear */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-[#1A1A1A]">{t('learning_tab_courses')}</h2>
        <button
          type="button"
          onClick={() => setCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E31E24] text-white rounded-xl text-xs font-bold hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('learning_add_course')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.total}</p>
          <p className="text-[10px] text-gray-400">{t('learning_tab_courses')}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.draft}</p>
          <p className="text-[10px] text-gray-400">{t('learning_status_draft')}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.pending}</p>
          <p className="text-[10px] text-gray-400">{t('learning_status_pending_review')}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.active}</p>
          <p className="text-[10px] text-gray-400">{t('learning_status_active')}</p>
        </div>
      </div>

      {/* Lista de cursos */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">{t('learning_empty_courses')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {courses.map((course, i) => (
            <motion.button
              key={course.id}
              type="button"
              onClick={() => setDetailCourse(course)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-white rounded-2xl border border-gray-100 p-4 text-left space-y-3 hover:border-gray-200 transition-all"
            >
              {/* Título + status */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-500 shrink-0" />
                  <h3 className="text-xs font-bold text-[#1A1A1A] line-clamp-1">{course.title}</h3>
                </div>
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 ${STATUS_STYLES[course.status].bg} ${STATUS_STYLES[course.status].text}`}>
                  {t(`learning_status_${course.status}`)}
                </span>
              </div>

              {/* Descripción */}
              {course.description && (
                <p className="text-[10px] text-gray-500 line-clamp-2">{course.description}</p>
              )}

              {/* Meta */}
              <div className="flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
                <span>{course.lesson_count} {course.lesson_count === 1 ? t('learning_lessons_count').replace('{{count}}', '1') : t('learning_lessons_count_plural').replace('{{count}}', String(course.lesson_count))}</span>
                <span>Nv. {course.elo_min}–{course.elo_max}</span>
                {course.staff_id && staffMap[course.staff_id] && (
                  <span>{staffMap[course.staff_id]}</span>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* Modal crear curso */}
      {createModal && (
        <CourseFormModal
          mode="create"
          clubId={clubId}
          onClose={() => setCreateModal(false)}
          onSaved={() => { setCreateModal(false); load(); }}
        />
      )}

      {/* Modal detalle curso */}
      {detailCourse && (
        <CourseDetailModal
          course={detailCourse}
          clubId={clubId}
          staffName={detailCourse.staff_id ? staffMap[detailCourse.staff_id] : undefined}
          onClose={() => setDetailCourse(null)}
          onUpdated={() => { setDetailCourse(null); load(); }}
        />
      )}
    </div>
  );
}
