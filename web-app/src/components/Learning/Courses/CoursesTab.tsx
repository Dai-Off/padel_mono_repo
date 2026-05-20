import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, BookOpen, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { learningContentService } from '../../../services/learningContent';
import { clubStaffService } from '../../../services/clubStaff';
import { CourseFormModal } from './CourseFormModal';
import { CourseDetailModal } from './CourseDetailModal';
import { CourseStatsModal } from './CourseStatsModal';
import { FilterDropdown } from '../Questions/FilterDropdown';
import { LevelFilter } from '../Questions/LevelFilter';
import { SearchInput } from '../Questions/SearchInput';
import { Paginator } from '../Questions/Paginator';
import { usePageSizePref } from '../Questions/usePageSizePref';
import type { Course, CourseStatus } from '../../../types/learningContent';
import type { ClubStaffMember } from '../../../types/clubStaff';

const COURSE_STATUSES_ALL: CourseStatus[] = ['draft', 'pending_review', 'active', 'inactive'];

const STATUS_STYLES: Record<CourseStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-600' },
  pending_review: { bg: 'bg-amber-50', text: 'text-amber-600' },
  active: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  inactive: { bg: 'bg-red-50', text: 'text-red-600' },
};

export function CoursesTab({ clubId }: { clubId: string }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('cstatus') ?? 'all';
  const search = searchParams.get('cq') ?? '';
  const orderBy = (searchParams.get('corder') ?? 'created_desc') as 'created_desc' | 'created_asc';
  const page = Math.max(1, parseInt(searchParams.get('cpage') ?? '1', 10) || 1);
  const levelMin = searchParams.get('cmin') ? Number(searchParams.get('cmin')) : null;
  const levelMax = searchParams.get('cmax') ? Number(searchParams.get('cmax')) : null;
  const levelRange = levelMin !== null && levelMax !== null ? { min: levelMin, max: levelMax } : null;

  const updateParam = useCallback((patch: Record<string, string | null>, resetPage = true) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (resetPage) next.delete('cpage');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [courses, setCourses] = useState<Course[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = usePageSizePref('courses:club');
  const [staff, setStaff] = useState<ClubStaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [detailCourse, setDetailCourse] = useState<Course | null>(null);
  const [statsCourse, setStatsCourse] = useState<Course | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: Parameters<typeof learningContentService.listCourses>[1] = {
        order_by: orderBy,
        page,
        page_size: pageSize,
      };
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (search) filters.search = search;
      if (levelRange) { filters.elo_min = levelRange.min; filters.elo_max = levelRange.max; }
      const [coursesRes, staffList] = await Promise.all([
        learningContentService.listCourses(clubId, filters),
        clubStaffService.list(clubId),
      ]);
      setCourses(coursesRes.data);
      setTotal(coursesRes.total);
      setStaff(staffList);
    } catch (e) {
      toast.error((e as Error).message || t('learning_save_error'));
    } finally {
      setLoading(false);
    }
  }, [clubId, statusFilter, search, orderBy, page, pageSize, levelRange, t]);

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

      {/* Dos filas: filtros arriba y abajo orden + buscador. */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-gray-400 uppercase mr-1">Filtros:</span>
          <FilterDropdown
            label="Estado"
            value={statusFilter}
            allValue="all"
            options={[
              { value: 'all', label: t('learning_filter_all_status') },
              ...COURSE_STATUSES_ALL.map((s) => ({ value: s, label: t(`learning_status_${s}`) })),
            ]}
            onChange={(v) => updateParam({ cstatus: v === 'all' ? null : v })}
          />
          <LevelFilter
            value={levelRange}
            onChange={(r) => updateParam({ cmin: r ? String(r.min) : null, cmax: r ? String(r.max) : null })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-gray-400 uppercase mr-1">Ordenar por:</span>
          <FilterDropdown
            label="Orden"
            hideLabel
            value={orderBy}
            allValue="created_desc"
            options={[
              { value: 'created_desc', label: 'Más recientes' },
              { value: 'created_asc', label: 'Más antiguas' },
            ]}
            onChange={(v) => updateParam({ corder: v === 'created_desc' ? null : v })}
          />
          <div className="ml-auto">
            <SearchInput
              value={search}
              onChange={(v) => updateParam({ cq: v || null })}
              placeholder="Buscar curso..."
            />
          </div>
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
          {courses.map((course, i) => {
            const isPending = course.status === 'pending_review';
            return (
            <motion.div
              key={course.id}
              onClick={() => setDetailCourse(course)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`bg-white rounded-2xl border-2 p-4 text-left space-y-3 transition-all cursor-pointer ${
                isPending ? 'border-amber-300 shadow-sm' : 'border-gray-100 hover:border-gray-200'
              }`}
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
              <div className="flex items-center justify-between gap-3 text-[10px] text-gray-400 flex-wrap">
                <span className="flex items-center gap-3 flex-wrap">
                  <span>{course.lesson_count} {course.lesson_count === 1 ? t('learning_lessons_count').replace('{{count}}', '1') : t('learning_lessons_count_plural').replace('{{count}}', String(course.lesson_count))}</span>
                  <span>{t('learning_level_short')} {course.elo_min}–{course.elo_max}</span>
                  {course.staff_id && staffMap[course.staff_id] && (
                    <span>{staffMap[course.staff_id]}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setStatsCourse(course); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 text-[#1A1A1A] text-[10px] font-bold hover:bg-gray-100 transition-all"
                  title="Ver estadísticas detalladas"
                >
                  <BarChart3 className="w-3 h-3" />
                  Stats
                </button>
              </div>
            </motion.div>
            );
          })}
        </div>
      )}

      <Paginator
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => updateParam({ cpage: p === 1 ? null : String(p) }, false)}
        onPageSizeChange={(s) => { setPageSize(s); updateParam({}); }}
      />

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

      {statsCourse && (
        <CourseStatsModal
          courseId={statsCourse.id}
          courseTitle={statsCourse.title}
          onClose={() => setStatsCourse(null)}
        />
      )}
    </div>
  );
}
