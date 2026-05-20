import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit, HelpCircle, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { learningContentService, hasUnreadNotes, summarizeFeedback } from '../../../services/learningContent';
import { QuestionFormModal } from './QuestionFormModal';
import { FilterDropdown } from './FilterDropdown';
import { StatusSwitcher } from './StatusSwitcher';
import type { Question, QuestionType, QuestionArea, QuestionStatus } from '../../../types/learningContent';

const QUESTION_TYPES: QuestionType[] = ['test_classic', 'true_false', 'multi_select', 'match_columns', 'order_sequence', 'puzzle'];
const QUESTION_AREAS: QuestionArea[] = ['technique', 'tactics', 'physical', 'mental', 'rules'];

// Extraer texto legible del contenido de la pregunta
function extractPreview(q: Question): string {
  if (q.type === 'puzzle') {
    const c = q.content as { statement?: string };
    return c.statement ?? '—';
  }
  const c = q.content;
  if ('question' in c && typeof c.question === 'string') return c.question;
  if ('statement' in c && typeof c.statement === 'string') return c.statement;
  if ('pairs' in c && Array.isArray(c.pairs)) return `${c.pairs.length} pares`;
  if ('steps' in c && Array.isArray(c.steps)) return `${c.steps.length} pasos`;
  return '—';
}

interface QuestionsTabProps {
  clubId: string;
  // Permite a la página padre (LearningContentView) pintar un badge sobre la
  // tab "Preguntas" con el contador de preguntas con nota de moderación no vista.
  onUnreadCountChange?: (count: number) => void;
}

export function QuestionsTab({ clubId, onUnreadCountChange }: QuestionsTabProps) {
  // Mantenemos la callback en un ref para no provocar re-runs del useCallback
  // de `load` cuando el padre la cambie por re-render.
  // (El ref se sincroniza vía useEffect debajo.)
  const { t } = useTranslation();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<QuestionType | 'all'>('all');
  const [areaFilter, setAreaFilter] = useState<QuestionArea | 'all'>('all');
  // Filtro único de estado. Default 'published' (contenido vivo).
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'inactive'>('published');
  // Filtro tri-estado de vídeo (client-side sobre has_video).
  const [videoFilter, setVideoFilter] = useState<'all' | 'with_video' | 'without_video'>('all');
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; question?: Question } | null>(null);

  // Ref a un setter externo (lo provee LearningContentView) para que el badge
  // sobre la tab "Preguntas" use el contador EXACTO calculado por el backend,
  // independientemente de los filtros que el usuario tenga aplicados aquí.
  const onUnreadCountChangeRef = useRef<((n: number) => void) | undefined>();

  // Variante silent: no marca loading=true para evitar que la lista se vacíe
  // y el scroll salte arriba tras una acción puntual.
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const filters: {
        type?: QuestionType;
        area?: QuestionArea;
        status?: 'all' | 'draft' | 'published' | 'inactive';
      } = {};
      if (typeFilter !== 'all') filters.type = typeFilter;
      if (areaFilter !== 'all') filters.area = areaFilter;
      filters.status = statusFilter;
      const { data, unread_count } = await learningContentService.listQuestions(clubId, filters);
      setQuestions(data);
      // El meta.unread_count es total del club, sin importar filtros locales.
      onUnreadCountChangeRef.current?.(unread_count);
    } catch (e) {
      toast.error((e as Error).message || t('learning_save_error'));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [clubId, typeFilter, areaFilter, statusFilter, t]);

  // Sincronizamos la callback recibida del padre con el ref usado por `load`.
  useEffect(() => { onUnreadCountChangeRef.current = onUnreadCountChange; }, [onUnreadCountChange]);

  useEffect(() => { load(); }, [load]);

  // Helpers locales para optimistic updates (sin re-fetch).
  const patchLocal = (id: string, patch: Partial<Question>) => {
    setQuestions((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };
  const removeLocal = (id: string) => {
    setQuestions((prev) => prev.filter((x) => x.id !== id));
  };

  const stats = useMemo(() => {
    const total = questions.length;
    const published = questions.filter((q) => q.status === 'published').length;
    return { total, published };
  }, [questions]);

  // Filtro client-side de vídeo aplicado tras cargar.
  const visibleQuestions = useMemo(() => questions.filter((q) => {
    if (videoFilter === 'with_video') return !!q.has_video;
    if (videoFilter === 'without_video') return !q.has_video;
    return true;
  }), [questions, videoFilter]);

  // Cambio de estado genérico desde el StatusSwitcher. Decide qué endpoint
  // llamar según la transición. Optimistic. Si publicar desde draft falla por
  // validación de contenido, abrimos el modal para que el usuario lo arregle.
  const handleChangeStatus = async (q: Question, target: QuestionStatus) => {
    if (target === q.status) return;
    // Pasar a draft desde published es destructivo (deja de servirse en lecciones).
    if (target === 'draft' && q.status === 'published') {
      const ok = window.confirm(
        'Esto revertirá la pregunta a borrador y dejará de aparecer en las lecciones. ¿Continuar?',
      );
      if (!ok) return;
    }

    const prev = q.status;
    patchLocal(q.id, { status: target });
    try {
      if (target === 'published') {
        if (prev === 'inactive') {
          await learningContentService.activateQuestion(q.id);
        } else {
          // draft → published: PUT con status='published' lo valida.
          await learningContentService.updateQuestion(q.id, { status: 'published' });
        }
      } else if (target === 'inactive') {
        if (prev === 'published') {
          await learningContentService.deactivateQuestion(q.id);
        } else {
          // draft → inactive: PUT con status='inactive' (raro pero válido).
          await learningContentService.updateQuestion(q.id, { status: 'inactive' });
        }
      } else {
        // target === 'draft': PUT con status='draft' desde published o inactive.
        await learningContentService.updateQuestion(q.id, { status: 'draft' });
      }
      toast.success(t('learning_save_success'));
    } catch (e) {
      patchLocal(q.id, { status: prev }); // revert
      const msg = (e as Error).message ?? '';
      toast.error(msg || t('learning_save_error'));
      // Si la transición draft → published falló por validación, abrimos el
      // editor para que el usuario corrija el contenido.
      if (target === 'published' && prev === 'draft') {
        setModal({ mode: 'edit', question: q });
      }
    }
  };

  // Borrado permanente. Disponible para drafts e inactives (no publicadas).
  // Optimistic: la quitamos local primero; si falla, restauramos snapshot.
  const handleDelete = async (q: Question) => {
    if (q.status === 'published') return;
    const ok = window.confirm(
      `¿Borrar definitivamente "${extractPreview(q).slice(0, 60)}"?\n\nEsta acción no se puede deshacer.`,
    );
    if (!ok) return;
    const snapshot = questions;
    removeLocal(q.id);
    try {
      await learningContentService.deleteQuestion(q.id);
      toast.success('Pregunta borrada definitivamente');
    } catch (e) {
      setQuestions(snapshot);
      toast.error((e as Error).message || 'Error al borrar');
    }
  };

  // Tras guardar desde el modal, hacemos silent refresh para evitar el spinner
  // (preserva scroll). El cambio puede afectar a múltiples campos, así que un
  // re-fetch es más seguro que intentar patch local.
  const handleSaved = () => {
    setModal(null);
    load({ silent: true });
  };

  // Al abrir el modal de edición, si la pregunta tiene una nota de moderación
  // no vista, la marcamos como vista. El backend devuelve el contador total
  // actualizado, que propagamos al padre para que el badge sea fiel a BBDD
  // (sin estimaciones client-side).
  const handleOpenEdit = (q: Question) => {
    if (hasUnreadNotes(q)) {
      const now = new Date().toISOString();
      patchLocal(q.id, { notes_seen_at: now });
      learningContentService.acknowledgeQuestionNotes(q.id)
        .then(({ unread_count }) => { onUnreadCountChangeRef.current?.(unread_count); })
        .catch(() => {
          // Silencioso: si falla, la próxima recarga reconciliará el estado.
        });
    }
    setModal({ mode: 'edit', question: q });
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
          <p className="text-lg font-black text-[#1A1A1A]">{stats.published}</p>
          <p className="text-[10px] text-gray-400">Publicadas</p>
        </div>
      </div>

      {/* Filtros compactos: dropdowns en una sola fila horizontal. */}
      <div className="flex flex-wrap gap-1.5 bg-white rounded-2xl border border-gray-100 p-3">
        <FilterDropdown
          label="Tipo"
          value={typeFilter}
          allValue="all"
          options={[
            { value: 'all' as const, label: t('learning_filter_all_types') },
            ...QUESTION_TYPES.map((qt) => ({ value: qt, label: t(`learning_type_${qt}`) })),
          ]}
          onChange={setTypeFilter}
        />
        <FilterDropdown
          label="Área"
          value={areaFilter}
          allValue="all"
          options={[
            { value: 'all' as const, label: t('learning_filter_all_areas') },
            ...QUESTION_AREAS.map((qa) => ({ value: qa, label: t(`learning_area_${qa}`) })),
          ]}
          onChange={setAreaFilter}
        />
        <FilterDropdown
          label="Estado"
          value={statusFilter}
          allValue="all"
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'published', label: 'Publicadas' },
            { value: 'draft', label: 'Borradores' },
            { value: 'inactive', label: 'Inactivas' },
          ]}
          onChange={setStatusFilter}
        />
        <FilterDropdown
          label="Vídeo"
          value={videoFilter}
          allValue="all"
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'with_video', label: 'Con vídeo' },
            { value: 'without_video', label: 'Sin vídeo' },
          ]}
          onChange={setVideoFilter}
        />
      </div>

      {/* Lista de preguntas */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visibleQuestions.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">{t('learning_empty_questions')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleQuestions.map((q, i) => {
            const unread = hasUnreadNotes(q);
            return (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`bg-white rounded-2xl border-2 p-4 space-y-3 ${
                unread
                  ? 'border-amber-300 shadow-sm'
                  : q.status === 'published'
                    ? 'border-gray-100'
                    : 'border-gray-100 opacity-60'
              }`}
            >
              {/* Badges (sin chip de estado: vive en el StatusSwitcher abajo). */}
              <div className="flex items-center gap-2 flex-wrap">
                {unread && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-bold">
                    <AlertTriangle className="w-3 h-3" />
                    Notas nuevas
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-bold">
                  {t(`learning_type_${q.type}`)}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-bold">
                  {t(`learning_area_${q.area}`)}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold">
                  Lv. {q.level}
                </span>
              </div>

              {/* Preview del contenido */}
              <div className="flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                <p className="text-xs text-[#1A1A1A] line-clamp-2">{extractPreview(q)}</p>
              </div>

              {/* Valoración (like / dislike) — agregados del último voto por
                  jugador. El % solo aparece a partir del umbral mínimo. */}
              {(() => {
                const fb = summarizeFeedback(q);
                if (fb.total === 0) return null;
                return (
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <span>👍 {fb.up}</span>
                    <span>·</span>
                    <span>👎 {fb.down}</span>
                    {fb.positive_pct !== null && (
                      <>
                        <span>·</span>
                        <span className="font-semibold text-gray-500">{fb.positive_pct}% positivo</span>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Acciones */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <StatusSwitcher
                  status={q.status}
                  onPickPublished={() => handleChangeStatus(q, 'published')}
                  onPickDraft={() => handleChangeStatus(q, 'draft')}
                  onPickInactive={() => handleChangeStatus(q, 'inactive')}
                />
                <button
                  type="button"
                  onClick={() => handleOpenEdit(q)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-50 text-[#1A1A1A] text-[10px] font-bold hover:bg-gray-100 transition-all"
                >
                  <Edit className="w-3 h-3" />
                  {t('learning_edit_question')}
                </button>
                {/* Borrar: drafts o inactivas. Las published deben pasar antes
                    a borrador/inactiva desde el StatusSwitcher. */}
                {q.status !== 'published' && (
                  <button
                    type="button"
                    onClick={() => handleDelete(q)}
                    className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100 transition-all"
                    title="Borrar definitivamente"
                  >
                    <Trash2 className="w-3 h-3" />
                    Borrar
                  </button>
                )}
              </div>
            </motion.div>
            );
          })}
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
