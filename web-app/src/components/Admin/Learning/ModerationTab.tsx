import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Edit, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { adminLearningService } from '../../../services/adminLearning';
import { ReviewDetailModal } from './ReviewDetailModal';
import type { AdminCourse, AdminQuestion } from '../../../types/adminLearning';
import type { QuestionType, QuestionArea, CourseStatus } from '../../../types/learningContent';

const QUESTION_TYPES: QuestionType[] = ['test_classic', 'true_false', 'multi_select', 'match_columns', 'order_sequence'];
const QUESTION_AREAS: QuestionArea[] = ['technique', 'tactics', 'physical', 'mental', 'rules'];
const COURSE_STATUSES: CourseStatus[] = ['draft', 'pending_review', 'active'];

const STATUS_STYLES: Record<CourseStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-600' },
  pending_review: { bg: 'bg-amber-50', text: 'text-amber-600' },
  active: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
};

type SubTab = 'questions' | 'courses';

function extractPreview(q: AdminQuestion): string {
  const c = q.content as Record<string, unknown>;
  if ('question' in c && typeof c.question === 'string') return c.question;
  if ('statement' in c && typeof c.statement === 'string') return c.statement;
  if ('pairs' in c && Array.isArray(c.pairs)) return `${c.pairs.length} pares`;
  if ('steps' in c && Array.isArray(c.steps)) return `${c.steps.length} pasos`;
  return '—';
}

export function ModerationTab() {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('questions');

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-1.5">
        {(['questions', 'courses'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === tab ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
            }`}
          >
            {tab === 'questions' ? t('learning_tab_questions') : t('learning_tab_courses')}
          </button>
        ))}
      </div>

      <motion.div key={activeSubTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
        {activeSubTab === 'questions' && <QuestionsModeration />}
        {activeSubTab === 'courses' && <CoursesModeration />}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: Moderación de preguntas
// ---------------------------------------------------------------------------

function QuestionsModeration() {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<QuestionType | 'all'>('all');
  const [areaFilter, setAreaFilter] = useState<QuestionArea | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'true' | 'false'>('all');
  const [clubFilter, setClubFilter] = useState<string>('all');

  // Cargar lista de clubs una vez (sin filtro de club)
  useEffect(() => {
    adminLearningService.listAllQuestions().then((all) => {
      const map = new Map<string, string>();
      for (const q of all) {
        if (q.club_id && q.club_name) map.set(q.club_id, q.club_name);
      }
      setClubs(Array.from(map.entries()).map(([id, name]) => ({ id, name })));
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: { type?: QuestionType; area?: QuestionArea; is_active?: 'true' | 'false' | 'all'; club_id?: string } = {};
      if (typeFilter !== 'all') filters.type = typeFilter;
      if (areaFilter !== 'all') filters.area = areaFilter;
      filters.is_active = statusFilter;
      if (clubFilter !== 'all') filters.club_id = clubFilter;
      const list = await adminLearningService.listAllQuestions(filters);
      setQuestions(list);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, areaFilter, statusFilter, clubFilter]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (q: AdminQuestion) => {
    try {
      if (q.is_active) {
        await adminLearningService.deactivateQuestion(q.id);
        toast.success(t('learning_deactivate_success'));
      } else {
        await adminLearningService.activateQuestion(q.id);
        toast.success(t('learning_save_success'));
      }
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        {/* Club */}
        <select
          value={clubFilter}
          onChange={(e) => setClubFilter(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        >
          <option value="all">{t('admin_learning_all_clubs')}</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Tipo */}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setTypeFilter('all')} className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${typeFilter === 'all' ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A]'}`}>
            {t('learning_filter_all_types')}
          </button>
          {QUESTION_TYPES.map((qt) => (
            <button key={qt} onClick={() => setTypeFilter(qt)} className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${typeFilter === qt ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A]'}`}>
              {t(`learning_type_${qt}`)}
            </button>
          ))}
        </div>

        {/* Área */}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setAreaFilter('all')} className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${areaFilter === 'all' ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A]'}`}>
            {t('learning_filter_all_areas')}
          </button>
          {QUESTION_AREAS.map((qa) => (
            <button key={qa} onClick={() => setAreaFilter(qa)} className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${areaFilter === qa ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A]'}`}>
              {t(`learning_area_${qa}`)}
            </button>
          ))}
        </div>

        {/* Estado */}
        <div className="flex flex-wrap gap-1.5">
          {([{ key: 'all', label: t('learning_filter_all_status') }, { key: 'true', label: t('learning_filter_active') }, { key: 'false', label: t('learning_filter_inactive') }] as const).map((s) => (
            <button key={s.key} onClick={() => setStatusFilter(s.key)} className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${statusFilter === s.key ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A]'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">{t('learning_empty_questions')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {questions.map((q, i) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className={`bg-white rounded-2xl border p-4 space-y-3 ${q.is_active ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-bold">{t(`learning_type_${q.type}`)}</span>
                <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-bold">{t(`learning_area_${q.area}`)}</span>
                <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold">Lv. {q.level}</span>
                <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600 text-[10px] font-bold">{q.club_name}</span>
              </div>
              <div className="flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                <p className="text-xs text-[#1A1A1A] line-clamp-2">{extractPreview(q)}</p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  role="switch"
                  aria-checked={q.is_active}
                  onClick={() => handleToggle(q)}
                  className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                  style={{ backgroundColor: q.is_active ? '#22C55E' : '#D1D5DB' }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                    style={{ transform: q.is_active ? 'translateX(16px)' : 'translateX(0)' }}
                  />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: Moderación de cursos
// ---------------------------------------------------------------------------

function CoursesModeration() {
  const { t } = useTranslation();
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clubFilter, setClubFilter] = useState<string>('all');
  const [selected, setSelected] = useState<AdminCourse | null>(null);

  // Cargar lista de clubs una vez (sin filtro de club)
  useEffect(() => {
    adminLearningService.listAllCourses().then((all) => {
      const map = new Map<string, string>();
      for (const c of all) {
        if (c.club_id && c.club_name) map.set(c.club_id, c.club_name);
      }
      setClubs(Array.from(map.entries()).map(([id, name]) => ({ id, name })));
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: { status?: string; club_id?: string } = {};
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (clubFilter !== 'all') filters.club_id = clubFilter;
      const list = await adminLearningService.listAllCourses(filters);
      setCourses(list);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, clubFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={clubFilter}
            onChange={(e) => setClubFilter(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="all">{t('admin_learning_all_clubs')}</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="all">{t('learning_filter_all_status')}</option>
            {COURSE_STATUSES.map((s) => (
              <option key={s} value={s}>{t(`learning_status_${s}`)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">{t('learning_empty_courses')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {courses.map((course, i) => (
            <motion.button
              key={course.id}
              type="button"
              onClick={() => setSelected(course)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="bg-white rounded-2xl border border-gray-100 p-4 text-left space-y-3 hover:border-gray-200 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen className="w-4 h-4 text-indigo-500 shrink-0" />
                  <h3 className="text-xs font-bold text-[#1A1A1A] truncate">{course.title}</h3>
                </div>
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 ${STATUS_STYLES[course.status].bg} ${STATUS_STYLES[course.status].text}`}>
                  {t(`learning_status_${course.status}`)}
                </span>
              </div>
              <p className="text-[10px] text-gray-500">{course.club_name}</p>
              <div className="flex items-center gap-3 text-[10px] text-gray-400">
                <span>{course.lesson_count} {course.lesson_count === 1 ? t('learning_lessons_count').replace('{{count}}', '1') : t('learning_lessons_count_plural').replace('{{count}}', String(course.lesson_count))}</span>
                <span>Nv. {course.elo_min}–{course.elo_max}</span>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {selected && (
        <ReviewDetailModal
          course={selected}
          onClose={() => setSelected(null)}
          onActionDone={() => { setSelected(null); load(); }}
          readOnly={selected.status !== 'pending_review'}
        />
      )}
    </div>
  );
}
