import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { learningContentService } from '../../../services/learningContent';
import { QuestionFormModal } from './QuestionFormModal';
import type { Question, QuestionType, QuestionArea } from '../../../types/learningContent';

const QUESTION_TYPES: QuestionType[] = ['test_classic', 'true_false', 'multi_select', 'match_columns', 'order_sequence'];
const QUESTION_AREAS: QuestionArea[] = ['technique', 'tactics', 'physical', 'mental', 'rules'];

// Extraer texto legible del contenido de la pregunta
function extractPreview(q: Question): string {
  const c = q.content as Record<string, unknown>;
  if ('question' in c && typeof c.question === 'string') return c.question;
  if ('statement' in c && typeof c.statement === 'string') return c.statement;
  if ('pairs' in c && Array.isArray(c.pairs)) return `${c.pairs.length} pares`;
  if ('steps' in c && Array.isArray(c.steps)) return `${c.steps.length} pasos`;
  return '—';
}

export function QuestionsTab({ clubId }: { clubId: string }) {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<QuestionType | 'all'>('all');
  const [areaFilter, setAreaFilter] = useState<QuestionArea | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'true' | 'false'>('all');
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; question?: Question } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: { type?: QuestionType; area?: QuestionArea; is_active?: 'true' | 'false' | 'all' } = {};
      if (typeFilter !== 'all') filters.type = typeFilter;
      if (areaFilter !== 'all') filters.area = areaFilter;
      filters.is_active = statusFilter;
      const list = await learningContentService.listQuestions(clubId, filters);
      setQuestions(list);
    } catch (e) {
      toast.error((e as Error).message || t('learning_save_error'));
    } finally {
      setLoading(false);
    }
  }, [clubId, typeFilter, areaFilter, statusFilter, t]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const total = questions.length;
    const active = questions.filter((q) => q.is_active).length;
    return { total, active };
  }, [questions]);

  const handleToggleActive = async (q: Question) => {
    try {
      if (q.is_active) {
        await learningContentService.deactivateQuestion(q.id);
        toast.success(t('learning_deactivate_success'));
      } else {
        await learningContentService.activateQuestion(q.id);
        toast.success(t('learning_save_success'));
      }
      load();
    } catch (e) {
      toast.error((e as Error).message || t('learning_save_error'));
    }
  };

  const handleSaved = () => {
    setModal(null);
    load();
  };

  return (
    <div className="space-y-5">
      {/* Header + botón crear */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-[#1A1A1A]">{t('learning_tab_questions')}</h2>
        <button
          type="button"
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E31E24] text-white rounded-xl text-xs font-bold hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('learning_add_question')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.total}</p>
          <p className="text-[10px] text-gray-400">{t('learning_tab_questions')}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-lg font-black text-[#1A1A1A]">{stats.active}</p>
          <p className="text-[10px] text-gray-400">{t('learning_filter_active')}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        {/* Tipo */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${typeFilter === 'all' ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A]'}`}
          >
            {t('learning_filter_all_types')}
          </button>
          {QUESTION_TYPES.map((qt) => (
            <button
              key={qt}
              onClick={() => setTypeFilter(qt)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${typeFilter === qt ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A]'}`}
            >
              {t(`learning_type_${qt}`)}
            </button>
          ))}
        </div>

        {/* Área */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setAreaFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${areaFilter === 'all' ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A]'}`}
          >
            {t('learning_filter_all_areas')}
          </button>
          {QUESTION_AREAS.map((qa) => (
            <button
              key={qa}
              onClick={() => setAreaFilter(qa)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${areaFilter === qa ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A]'}`}
            >
              {t(`learning_area_${qa}`)}
            </button>
          ))}
        </div>

        {/* Estado */}
        <div className="flex flex-wrap gap-1.5">
          {([
            { key: 'all', label: t('learning_filter_all_status') },
            { key: 'true', label: t('learning_filter_active') },
            { key: 'false', label: t('learning_filter_inactive') },
          ] as const).map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${statusFilter === s.key ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A]'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de preguntas */}
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
              transition={{ delay: i * 0.03 }}
              className={`bg-white rounded-2xl border p-4 space-y-3 ${q.is_active ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}
            >
              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-bold">
                  {t(`learning_type_${q.type}`)}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-bold">
                  {t(`learning_area_${q.area}`)}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold">
                  Lv. {q.level}
                </span>
                {!q.is_active && (
                  <span className="px-2 py-0.5 rounded-lg bg-red-50 text-red-500 text-[10px] font-bold">
                    {t('learning_filter_inactive')}
                  </span>
                )}
              </div>

              {/* Preview del contenido */}
              <div className="flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                <p className="text-xs text-[#1A1A1A] line-clamp-2">{extractPreview(q)}</p>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModal({ mode: 'edit', question: q })}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-50 text-[#1A1A1A] text-[10px] font-bold hover:bg-gray-100 transition-all"
                >
                  <Edit className="w-3 h-3" />
                  {t('learning_edit_question')}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={q.is_active}
                  onClick={() => handleToggleActive(q)}
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

      {/* Modal crear/editar */}
      {modal && (
        <QuestionFormModal
          mode={modal.mode}
          question={modal.question}
          clubId={clubId}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
