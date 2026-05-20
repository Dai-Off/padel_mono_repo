import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, HelpCircle, Edit, Trash2, CheckSquare, Check, FileText, PowerOff, Send, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { adminLearningService } from '../../../services/adminLearning';
import { summarizeFeedback, summarizeAttempts } from '../../../services/learningContent';
import { ReviewDetailModal } from './ReviewDetailModal';
import { QuestionFormModal } from '../../Learning/Questions/QuestionFormModal';
import { QuestionStatsModal } from '../../Learning/Questions/QuestionStatsModal';
import { CourseStatsModal } from '../../Learning/Courses/CourseStatsModal';
import { FilterDropdown } from '../../Learning/Questions/FilterDropdown';
import { StatusSwitcher } from '../../Learning/Questions/StatusSwitcher';
import { SearchInput } from '../../Learning/Questions/SearchInput';
import { Paginator } from '../../Learning/Questions/Paginator';
import { usePageSizePref } from '../../Learning/Questions/usePageSizePref';
import { LevelFilter } from '../../Learning/Questions/LevelFilter';
import { BulkActionsBar, type BulkAction } from '../../Learning/Questions/BulkActionsBar';
import { WARNING_CHIP } from '../../Learning/Questions/warningChips';
import { WarningTypeFilter, type WarningFilter } from '../../Learning/Questions/WarningTypeFilter';
import type { AdminCourse, AdminQuestion, AdminQuestionWithWarnings } from '../../../types/adminLearning';
import type { Question, QuestionType, QuestionArea, CourseStatus, WarningKind } from '../../../types/learningContent';

const QUESTION_TYPES: QuestionType[] = ['test_classic', 'true_false', 'multi_select', 'match_columns', 'order_sequence', 'puzzle'];
const QUESTION_AREAS: QuestionArea[] = ['technique', 'tactics', 'physical', 'mental', 'rules'];
const COURSE_STATUSES: CourseStatus[] = ['draft', 'pending_review', 'active', 'inactive'];

const STATUS_STYLES: Record<CourseStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-600' },
  pending_review: { bg: 'bg-amber-50', text: 'text-amber-600' },
  active: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  inactive: { bg: 'bg-red-50', text: 'text-red-600' },
};

type SubTab = 'questions' | 'courses' | 'warnings';

interface ModerationTabProps {
  // Permite a la página padre mostrar el badge global sobre la tab de Moderación
  // sin tener que reabrir el sub-tab de Revisión.
  onPendingCountChange?: (count: number) => void;
  // Valor inicial conocido por el padre (que ya hizo el fetch en init).
  // Evita esperar a que el usuario entre en el sub-tab Revisión para pintar el badge.
  initialPendingCount?: number;
}

function extractPreview(q: AdminQuestion): string {
  const c = q.content;
  if ('question' in c && typeof c.question === 'string' && c.question.trim()) return c.question;
  if ('statement' in c && typeof c.statement === 'string') return c.statement;
  // Fallback para preguntas existentes sin enunciado: descripción genérica.
  if ('pairs' in c && Array.isArray(c.pairs)) return `${c.pairs.length} pares`;
  if ('steps' in c && Array.isArray(c.steps)) return `${c.steps.length} pasos`;
  return '—';
}

export function ModerationTab({ onPendingCountChange, initialPendingCount = 0 }: ModerationTabProps = {}) {
  const { t } = useTranslation();
  // Default 'questions' (lo que el admin verá la mayoría de las veces).
  // Revisión vive aquí dentro porque suele estar vacía y no merece su propia tab.
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('questions');
  const [pendingCount, setPendingCount] = useState(initialPendingCount);
  const [warningsCount, setWarningsCount] = useState(0);

  const handlePendingChange = (count: number) => {
    setPendingCount(count);
    onPendingCountChange?.(count);
  };

  // Fetch del count de avisos al montar para alimentar el badge sin tener
  // que entrar a la sub-tab. Refresca cuando el usuario vuelva a montar.
  useEffect(() => {
    adminLearningService.getWarnings()
      .then((r) => setWarningsCount(r.count))
      .catch(() => {});
  }, []);

  // Revisión de cursos (pending_review) ahora vive como destacado dentro de
  // "Cursos". El badge sobre la sub-tab "Cursos" muestra el conteo.
  const subTabs: { key: SubTab; label: string; badge?: number }[] = [
    { key: 'questions', label: t('learning_tab_questions') },
    { key: 'courses', label: t('learning_tab_courses'), badge: pendingCount > 0 ? pendingCount : undefined },
    { key: 'warnings', label: 'Avisos', badge: warningsCount > 0 ? warningsCount : undefined },
  ];

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === tab.key ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
            }`}
          >
            {tab.label}
            {tab.badge && (
              <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold min-w-[18px] text-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <motion.div key={activeSubTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
        {activeSubTab === 'questions' && <QuestionsModeration />}
        {activeSubTab === 'courses' && <CoursesModeration onPendingCountChange={handlePendingChange} />}
        {activeSubTab === 'warnings' && <WarningsView onCountChange={setWarningsCount} />}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: Moderación de preguntas
// ---------------------------------------------------------------------------

function QuestionsModeration() {
  const { t } = useTranslation();
  // URL params como fuente de verdad para filtros + paginación.
  const [searchParams, setSearchParams] = useSearchParams();
  const typeFilter = (searchParams.get('type') ?? 'all') as QuestionType | 'all';
  const areaFilter = (searchParams.get('area') ?? 'all') as QuestionArea | 'all';
  const statusFilter = (searchParams.get('status') ?? 'all') as 'all' | 'draft' | 'published' | 'inactive';
  const clubFilter = searchParams.get('club') ?? 'all';
  const videoFilter = (searchParams.get('video') ?? 'all') as 'all' | 'with_video' | 'without_video';
  const search = searchParams.get('q') ?? '';
  const orderBy = (searchParams.get('order') ?? 'created_desc') as 'created_desc' | 'created_asc';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const levelMin = searchParams.get('lmin') ? Number(searchParams.get('lmin')) : null;
  const levelMax = searchParams.get('lmax') ? Number(searchParams.get('lmax')) : null;
  const levelRange = levelMin !== null && levelMax !== null ? { min: levelMin, max: levelMax } : null;

  const updateParam = useCallback((patch: Record<string, string | null>, resetPage = true) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (resetPage) next.delete('page');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = usePageSizePref('questions:admin');
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  // Modo selección múltiple. Cuando está activo, las cards muestran checkbox
  // en lugar de los botones de acción individuales y aparece la barra de
  // acciones bulk en el fondo.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // Lista de clubs con contenido: una llamada dedicada (no depende del listing
  // paginado, que solo trae 30 a la vez).
  useEffect(() => {
    adminLearningService.listClubsWithContent()
      .then((list) => setClubs(list))
      .catch(() => {});
  }, []);

  // Variante con flag `silent`: cuando silent=true, NO se marca loading=true,
  // evitando que la lista se vacíe y el spinner provoque "salto arriba" del
  // scroll. Lo usamos tras acciones puntuales (ej. cerrar el modal de edición).
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const filters: Parameters<typeof adminLearningService.listAllQuestions>[0] = {
        status: statusFilter,
        order_by: orderBy,
        page,
        page_size: pageSize,
      };
      if (typeFilter !== 'all') filters.type = typeFilter;
      if (areaFilter !== 'all') filters.area = areaFilter;
      if (clubFilter !== 'all') filters.club_id = clubFilter;
      if (search) filters.search = search;
      if (levelRange) { filters.elo_min = levelRange.min; filters.elo_max = levelRange.max; }
      const { data, total } = await adminLearningService.listAllQuestions(filters);
      setQuestions(data);
      setTotal(total);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [typeFilter, areaFilter, statusFilter, clubFilter, search, orderBy, page, pageSize, levelRange]);

  useEffect(() => { load(); }, [load]);

  // Filtro client-side de vídeo aplicado tras cargar.
  const visibleQuestions = questions.filter((q) => {
    if (videoFilter === 'with_video') return !!q.has_video;
    if (videoFilter === 'without_video') return !q.has_video;
    return true;
  });

  // Estado de los modales auxiliares de moderación.
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [statsQuestion, setStatsQuestion] = useState<AdminQuestion | null>(null);
  // Cuando el admin pide cambiar a 'draft' o 'inactive' desde el StatusSwitcher,
  // mostramos un mini-modal con checkbox "Avisar al club" + nota opcional.
  const [statusPrompt, setStatusPrompt] = useState<{ q: AdminQuestion; target: 'draft' | 'inactive' } | null>(null);

  // Helper: actualiza un item en el listado sin tocar el resto. Usado para
  // optimistic updates que preservan el scroll.
  const patchLocal = (id: string, patch: Partial<AdminQuestion>) => {
    setQuestions((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };
  const removeLocal = (id: string) => {
    setQuestions((prev) => prev.filter((x) => x.id !== id));
  };

  // Cambio de estado directo a 'published' (sin nota). Lo usamos cuando el
  // admin elige "Publicada" en el StatusSwitcher. Si la pregunta venía de
  // 'draft', el backend valida el contenido y puede devolver 400. Optimistic.
  const handlePublish = async (q: AdminQuestion) => {
    const prev = q.status;
    patchLocal(q.id, { status: 'published' });
    try {
      await adminLearningService.activateQuestion(q.id);
      toast.success(t('learning_save_success'));
    } catch (e) {
      patchLocal(q.id, { status: prev }); // revert
      toast.error((e as Error).message);
      // Si el contenido del borrador no era válido, abrimos el editor para
      // que el admin lo arregle. Reconocemos el error 400 por el texto del
      // backend ("contenido incompleto").
      const msg = (e as Error).message ?? '';
      if (prev === 'draft' && /incompleto/i.test(msg)) {
        setEditing(q);
      }
    }
  };

  // Helper genérico para acciones bulk: dispara `fn(id)` en paralelo para
  // todos los IDs seleccionados, hace patch local optimista y muestra un toast
  // con resumen ("4/5 aplicadas"). Si una falla, revierte solo esa.
  const runBulk = async (
    label: string,
    fn: (id: string, q: AdminQuestion) => Promise<void>,
    optimisticPatch?: (q: AdminQuestion) => Partial<AdminQuestion>,
  ) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const items = questions.filter((q) => selectedIds.has(q.id));
    const snapshot = new Map(items.map((q) => [q.id, q]));

    if (optimisticPatch) {
      for (const q of items) patchLocal(q.id, optimisticPatch(q));
    }

    const results = await Promise.allSettled(items.map((q) => fn(q.id, q)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const ko = results.length - ok;

    // Revert solo los que fallaron.
    if (ko > 0 && optimisticPatch) {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const orig = snapshot.get(items[i].id);
          if (orig) patchLocal(items[i].id, orig);
        }
      });
    }

    if (ko === 0) toast.success(`${label}: ${ok}/${items.length}`);
    else toast.error(`${label}: ${ok}/${items.length} (${ko} fallos)`);
    exitSelectionMode();
  };

  const handleBulkPublish = () => runBulk(
    'Publicadas',
    (id) => adminLearningService.activateQuestion(id),
    () => ({ status: 'published' }),
  );
  const handleBulkDraft = () => runBulk(
    'Movidas a borrador',
    (id) => adminLearningService.moveQuestionToDraft(id, null),
    () => ({ status: 'draft' }),
  );
  const handleBulkInactivate = () => runBulk(
    'Desactivadas',
    (id) => adminLearningService.deactivateQuestion(id),
    () => ({ status: 'inactive' }),
  );
  const handleBulkDelete = async () => {
    const n = selectedIds.size;
    if (n === 0) return;
    const firstOk = window.confirm(`¿Borrar definitivamente ${n} pregunta${n === 1 ? '' : 's'}?\n\nEsta acción no se puede deshacer.`);
    if (!firstOk) return;
    const secondOk = window.confirm('Confirmación final: el borrado es irreversible. ¿Continuar?');
    if (!secondOk) return;
    const ids = Array.from(selectedIds);
    const snapshot = questions;
    setQuestions((prev) => prev.filter((q) => !selectedIds.has(q.id)));
    const results = await Promise.allSettled(ids.map((id) => adminLearningService.deleteQuestion(id)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const ko = results.length - ok;
    if (ko === 0) toast.success(`Borradas: ${ok}/${ids.length}`);
    else { setQuestions(snapshot); toast.error(`Borradas: ${ok}/${ids.length} (${ko} fallos)`); }
    exitSelectionMode();
  };

  // Borrado forzado (admin). Doble confirm si la pregunta está published.
  // Optimistic: la quitamos local primero; si falla, la insertamos de vuelta.
  const handleDelete = async (q: AdminQuestion) => {
    const preview = extractPreview(q).slice(0, 60);
    const firstOk = window.confirm(`¿Borrar definitivamente "${preview}"?\n\nEsta acción no se puede deshacer.`);
    if (!firstOk) return;
    if (q.status === 'published') {
      const secondOk = window.confirm('La pregunta está publicada y se está sirviendo en lecciones. ¿Seguro que quieres borrarla sin despublicarla primero?');
      if (!secondOk) return;
    }
    const snapshot = questions;
    removeLocal(q.id);
    try {
      await adminLearningService.deleteQuestion(q.id);
      toast.success('Pregunta borrada definitivamente');
    } catch (e) {
      setQuestions(snapshot); // revert al snapshot completo
      toast.error((e as Error).message);
    }
  };

  // Opciones de los dropdowns: prefijamos siempre con la opción "todos/as".
  const clubOptions = [
    { value: 'all', label: t('admin_learning_all_clubs') },
    ...clubs.map((c) => ({ value: c.id, label: c.name })),
  ];
  const typeOptions: { value: QuestionType | 'all'; label: string }[] = [
    { value: 'all', label: t('learning_filter_all_types') },
    ...QUESTION_TYPES.map((qt) => ({ value: qt, label: t(`learning_type_${qt}`) })),
  ];
  const areaOptions: { value: QuestionArea | 'all'; label: string }[] = [
    { value: 'all', label: t('learning_filter_all_areas') },
    ...QUESTION_AREAS.map((qa) => ({ value: qa, label: t(`learning_area_${qa}`) })),
  ];
  const statusOptions: { value: 'all' | 'draft' | 'published' | 'inactive'; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'published', label: 'Publicadas' },
    { value: 'draft', label: 'Borradores' },
    { value: 'inactive', label: 'Inactivas' },
  ];
  const videoOptions: { value: 'all' | 'with_video' | 'without_video'; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'with_video', label: 'Con vídeo' },
    { value: 'without_video', label: 'Sin vídeo' },
  ];

  const orderOptions: { value: 'created_desc' | 'created_asc'; label: string }[] = [
    { value: 'created_desc', label: 'Más recientes' },
    { value: 'created_asc', label: 'Más antiguas' },
  ];

  return (
    <div className="space-y-4">
      {/* Dos filas: filtros arriba (categorías) y abajo orden + buscador + selección. */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-gray-400 uppercase mr-1">Filtros:</span>
          <FilterDropdown label="Club" value={clubFilter} allValue="all" options={clubOptions}
            onChange={(v) => updateParam({ club: v === 'all' ? null : v })} />
          <FilterDropdown label="Tipo" value={typeFilter} allValue="all" options={typeOptions}
            onChange={(v) => updateParam({ type: v === 'all' ? null : v })} />
          <FilterDropdown label="Área" value={areaFilter} allValue="all" options={areaOptions}
            onChange={(v) => updateParam({ area: v === 'all' ? null : v })} />
          <FilterDropdown label="Estado" value={statusFilter} allValue="all" options={statusOptions}
            onChange={(v) => updateParam({ status: v === 'all' ? null : v })} />
          <FilterDropdown label="Vídeo" value={videoFilter} allValue="all" options={videoOptions}
            onChange={(v) => updateParam({ video: v === 'all' ? null : v })} />
          <LevelFilter
            value={levelRange}
            onChange={(r) => updateParam({ lmin: r ? String(r.min) : null, lmax: r ? String(r.max) : null })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-gray-400 uppercase mr-1">Ordenar por:</span>
          <FilterDropdown label="Orden" hideLabel value={orderBy} allValue="created_desc" options={orderOptions}
            onChange={(v) => updateParam({ order: v === 'created_desc' ? null : v })} />
          <div className="ml-auto flex items-center gap-1.5">
            <SearchInput
              value={search}
              onChange={(v) => updateParam({ q: v || null })}
              placeholder="Buscar pregunta..."
            />
            <button
              type="button"
              onClick={() => { if (selectionMode) exitSelectionMode(); else setSelectionMode(true); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                selectionMode ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100'
              }`}
              title="Seleccionar varias preguntas para acciones bulk"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              {selectionMode ? 'Cancelar' : 'Seleccionar varias'}
            </button>
          </div>
        </div>
      </div>

      {/* Barra sticky de acciones bulk en modo selección (encima de la lista). */}
      {selectionMode && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          onCancel={exitSelectionMode}
          actions={[
            { key: 'publish', label: 'Publicar', icon: <Send className="w-3 h-3" />, variant: 'success', onClick: handleBulkPublish },
            { key: 'draft', label: 'A borrador', icon: <FileText className="w-3 h-3" />, variant: 'warning', onClick: handleBulkDraft },
            { key: 'inactivate', label: 'Desactivar', icon: <PowerOff className="w-3 h-3" />, variant: 'neutral', onClick: handleBulkInactivate },
            { key: 'delete', label: 'Borrar', icon: <Trash2 className="w-3 h-3" />, variant: 'danger', onClick: handleBulkDelete },
          ] satisfies BulkAction[]}
        />
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visibleQuestions.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">{t('learning_empty_questions')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleQuestions.map((q, i) => {
            const checked = selectedIds.has(q.id);
            return (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              onClick={selectionMode ? () => toggleSelect(q.id) : undefined}
              className={`bg-white rounded-2xl border p-4 space-y-3 ${
                selectionMode
                  ? `cursor-pointer ${checked ? 'border-indigo-400 bg-indigo-50/30' : 'border-gray-100 hover:border-gray-200'}`
                  : q.status === 'published' ? 'border-gray-100' : 'border-gray-100 opacity-60'
              }`}
            >
              {/* Cabecera de chips: tipo / área / nivel / club. El estado vive
                  en el StatusSwitcher de abajo (no duplicamos el chip). */}
              <div className="flex items-center gap-2 flex-wrap">
                {selectionMode && (
                  <span className="flex items-center justify-center w-5 h-5 rounded-md border-2 border-indigo-300 bg-white">
                    {checked && <Check className="w-3 h-3 text-indigo-500" />}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-bold">{t(`learning_type_${q.type}`)}</span>
                <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-bold">{t(`learning_area_${q.area}`)}</span>
                <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold">Lv. {q.level}</span>
                <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600 text-[10px] font-bold">{q.club_name}</span>
                {selectionMode && (
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                    q.status === 'published' ? 'bg-emerald-50 text-emerald-700' :
                    q.status === 'draft' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
                  }`}>
                    {q.status === 'published' ? 'Publicada' : q.status === 'draft' ? 'Borrador' : 'Inactiva'}
                  </span>
                )}
              </div>
              <div className="flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                <p className="text-xs text-[#1A1A1A] line-clamp-2">{extractPreview(q)}</p>
              </div>
              {(() => {
                const at = summarizeAttempts(q);
                const fb = summarizeFeedback(q);
                const showAttempts = at.success_pct !== null;
                if (!showAttempts && fb.total === 0) return null;
                return (
                  <div className="flex items-center gap-x-2 gap-y-1 text-[10px] text-gray-400 flex-wrap">
                    {showAttempts && (
                      <span>{at.attempts} respuestas · <span className="font-semibold text-gray-500">{at.success_pct}% acierto</span></span>
                    )}
                    {showAttempts && fb.total > 0 && <span>·</span>}
                    {fb.total > 0 && (
                      <>
                        <span>👍 {fb.up} · 👎 {fb.down}</span>
                        {fb.positive_pct !== null && <span className="font-semibold text-gray-500">({fb.positive_pct}%)</span>}
                      </>
                    )}
                  </div>
                );
              })()}
              {!selectionMode && (
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <StatusSwitcher
                  status={q.status}
                  onPickPublished={() => handlePublish(q)}
                  onPickDraft={() => setStatusPrompt({ q, target: 'draft' })}
                  onPickInactive={() => setStatusPrompt({ q, target: 'inactive' })}
                />
                <button
                  type="button"
                  onClick={() => setEditing(q)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-50 text-[#1A1A1A] text-[10px] font-bold hover:bg-gray-100 transition-all"
                  title="Editar pregunta como admin"
                >
                  <Edit className="w-3 h-3" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setStatsQuestion(q)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-50 text-[#1A1A1A] text-[10px] font-bold hover:bg-gray-100 transition-all"
                  title="Ver estadísticas detalladas"
                >
                  <BarChart3 className="w-3 h-3" />
                  Stats
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(q)}
                  className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100 transition-all"
                  title="Borrar definitivamente"
                >
                  <Trash2 className="w-3 h-3" />
                  Borrar
                </button>
              </div>
              )}
            </motion.div>
            );
          })}
        </div>
      )}

      <Paginator
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => updateParam({ page: p === 1 ? null : String(p) }, false)}
        onPageSizeChange={(s) => { setPageSize(s); updateParam({}); }}
      />

      {/* Modal de edición admin. Al cerrar tras guardar hacemos un refresh
          silencioso (sin spinner) para que el scroll no salte. */}
      {editing && (
        <QuestionFormModal
          mode="edit"
          question={editing as unknown as Question}
          clubId={editing.club_id}
          useAdminEndpoints
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load({ silent: true }); }}
        />
      )}

      {/* Modal de estadísticas detalladas de la pregunta. */}
      {statsQuestion && (
        <QuestionStatsModal
          questionId={statsQuestion.id}
          useAdminEndpoint
          onClose={() => setStatsQuestion(null)}
        />
      )}

      {/* Mini-prompt: pasar a borrador o inactiva con nota opcional. Patch
          local optimista para evitar el salto del scroll. */}
      {statusPrompt && (
        <StatusChangePromptModal
          question={statusPrompt.q}
          target={statusPrompt.target}
          onClose={() => setStatusPrompt(null)}
          onConfirmed={(notes) => {
            patchLocal(statusPrompt.q.id, {
              status: statusPrompt.target,
              moderation_notes: notes,
              last_admin_edit_at: new Date().toISOString(),
            });
            setStatusPrompt(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: Moderación de cursos
// ---------------------------------------------------------------------------

function CoursesModeration({ onPendingCountChange }: { onPendingCountChange: (n: number) => void }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('cstatus') ?? 'all';
  const clubFilter = searchParams.get('cclub') ?? 'all';
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

  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = usePageSizePref('courses:admin');
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminCourse | null>(null);
  const [statsCourse, setStatsCourse] = useState<AdminCourse | null>(null);

  useEffect(() => {
    adminLearningService.listClubsWithContent().then((list) => setClubs(list)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: Parameters<typeof adminLearningService.listAllCourses>[0] = {
        order_by: orderBy,
        page,
        page_size: pageSize,
      };
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (clubFilter !== 'all') filters.club_id = clubFilter;
      if (search) filters.search = search;
      if (levelRange) {
        filters.elo_min = levelRange.min;
        filters.elo_max = levelRange.max;
      }
      const { data, total } = await adminLearningService.listAllCourses(filters);
      setCourses(data);
      setTotal(total);
      // Conteo de pendientes para alimentar el badge sobre la sub-tab.
      // Lo pedimos con una query ligera dedicada para que sea independiente
      // de los filtros activos.
      const pending = await adminLearningService.getPendingCount();
      onPendingCountChange(pending);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, clubFilter, search, orderBy, page, pageSize, levelRange, onPendingCountChange]);

  useEffect(() => { load(); }, [load]);

  const courseClubOptions = [
    { value: 'all', label: t('admin_learning_all_clubs') },
    ...clubs.map((c) => ({ value: c.id, label: c.name })),
  ];
  const courseStatusOptions = [
    { value: 'all', label: t('learning_filter_all_status') },
    ...COURSE_STATUSES.map((s) => ({ value: s, label: t(`learning_status_${s}`) })),
  ];
  const orderOptions: { value: 'created_desc' | 'created_asc'; label: string }[] = [
    { value: 'created_desc', label: 'Más recientes' },
    { value: 'created_asc', label: 'Más antiguas' },
  ];

  return (
    <div className="space-y-4">
      {/* Dos filas: filtros arriba y abajo orden + buscador. */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-gray-400 uppercase mr-1">Filtros:</span>
          <FilterDropdown label="Club" value={clubFilter} allValue="all" options={courseClubOptions}
            onChange={(v) => updateParam({ cclub: v === 'all' ? null : v })} />
          <FilterDropdown label="Estado" value={statusFilter} allValue="all" options={courseStatusOptions}
            onChange={(v) => updateParam({ cstatus: v === 'all' ? null : v })} />
          <LevelFilter
            value={levelRange}
            onChange={(r) => updateParam({ cmin: r ? String(r.min) : null, cmax: r ? String(r.max) : null })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterDropdown label="Orden" value={orderBy} allValue="created_desc" options={orderOptions}
            onChange={(v) => updateParam({ corder: v === 'created_desc' ? null : v })} />
          <div className="ml-auto">
            <SearchInput
              value={search}
              onChange={(v) => updateParam({ cq: v || null })}
              placeholder="Buscar curso..."
            />
          </div>
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
          {courses.map((course, i) => {
            const isPending = course.status === 'pending_review';
            return (
              <motion.div
                key={course.id}
                onClick={() => setSelected(course)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`bg-white rounded-2xl border-2 p-4 text-left space-y-3 transition-all cursor-pointer ${
                  isPending ? 'border-amber-300 shadow-sm' : 'border-gray-100 hover:border-gray-200'
                }`}
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
                <div className="flex items-center justify-between gap-3 text-[10px] text-gray-400">
                  <span className="flex items-center gap-3">
                    <span>{course.lesson_count} {course.lesson_count === 1 ? t('learning_lessons_count').replace('{{count}}', '1') : t('learning_lessons_count_plural').replace('{{count}}', String(course.lesson_count))}</span>
                    <span>{t('learning_level_short')} {course.elo_min}–{course.elo_max}</span>
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

      {selected && (
        <ReviewDetailModal
          course={selected}
          onClose={() => setSelected(null)}
          onActionDone={() => { setSelected(null); load(); }}
          readOnly={selected.status !== 'pending_review'}
        />
      )}

      {statsCourse && (
        <CourseStatsModal
          courseId={statsCourse.id}
          courseTitle={statsCourse.title}
          useAdminEndpoint
          onClose={() => setStatsCourse(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini-modal: cambiar estado a 'draft' o 'inactive' con nota opcional al club
// ---------------------------------------------------------------------------

function buildModerationNoteTemplate(): string {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  return `Modificado por admin el ${dd}/${mm}/${yyyy}. Razón: `;
}

function StatusChangePromptModal({
  question,
  target,
  onClose,
  onConfirmed,
}: {
  question: AdminQuestion;
  target: 'draft' | 'inactive';
  onClose: () => void;
  // Pasa las notas finales (o null si no se quería avisar) para que el padre
  // pueda hacer patch local sin re-fetch.
  onConfirmed: (notes: string | null) => void;
}) {
  const [notify, setNotify] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleToggle = (next: boolean) => {
    setNotify(next);
    if (next && !notes.trim()) setNotes(buildModerationNoteTemplate());
  };

  const titleByTarget = target === 'draft' ? 'Pasar pregunta a borrador' : 'Desactivar pregunta';
  const descByTarget =
    target === 'draft'
      ? 'La pregunta dejará de servirse en las lecciones hasta que el club la republique.'
      : 'La pregunta dejará de servirse en las lecciones pero conservará el contenido (se puede reactivar).';
  const ctaByTarget = target === 'draft' ? 'Pasar a borrador' : 'Desactivar';

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const finalNotes = notify && notes.trim() ? notes.trim() : null;
      if (target === 'draft') {
        await adminLearningService.moveQuestionToDraft(question.id, finalNotes);
        toast.success('Pregunta movida a borrador');
      } else {
        await adminLearningService.deactivateQuestion(question.id, finalNotes);
        toast.success('Pregunta desactivada');
      }
      onConfirmed(finalNotes);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl w-full max-w-md shadow-xl"
      >
        <div className="p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#1A1A1A]">{titleByTarget}</h3>
          <p className="text-xs text-gray-600">{descByTarget}</p>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-[#1A1A1A]">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => handleToggle(e.target.checked)}
              className="rounded"
            />
            <span className="font-semibold">Avisar al club</span>
          </label>
          {notify && (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Explica qué debe revisar el club"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs resize-none"
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#1A1A1A] bg-gray-50 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? '...' : ctaByTarget}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-tab "Avisos": lista de preguntas que disparan al menos un warning
// ---------------------------------------------------------------------------

function WarningsView({ onCountChange }: { onCountChange: (n: number) => void }) {
  const [items, setItems] = useState<AdminQuestionWithWarnings[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [filter, setFilter] = useState<WarningFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, count } = await adminLearningService.getWarnings();
      setItems(data);
      onCountChange(count);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  // Contadores por tipo: una pregunta con N warnings cuenta en N categorías.
  // Eso permite que el contador "Calidad (3)" muestre exactamente 3 preguntas
  // aunque alguna de ellas también esté en "Difíciles".
  const counts: Record<WarningKind, number> = { too_easy: 0, too_hard: 0, low_quality: 0 };
  for (const q of items) for (const w of q.warnings) counts[w]++;
  const visible = filter === 'all' ? items : items.filter((q) => q.warnings.includes(filter));

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (items.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-sm">Sin avisos. Todo bajo control.</div>;
  }

  return (
    <div className="space-y-3">
      <WarningTypeFilter value={filter} onChange={setFilter} counts={counts} />
      {visible.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">Sin avisos de este tipo.</div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visible.map((q) => (
          <div key={q.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {q.warnings.map((w) => (
                <span
                  key={w}
                  title={WARNING_CHIP[w].description}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${WARNING_CHIP[w].bg} ${WARNING_CHIP[w].text}`}
                >
                  {WARNING_CHIP[w].icon} {WARNING_CHIP[w].label}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[10px] text-gray-500">
              <span>{q.club_name}</span>
              <span>·</span>
              <span>Lv. {q.level}</span>
              <span>·</span>
              <span className={
                q.status === 'published' ? 'text-emerald-600' :
                q.status === 'draft' ? 'text-amber-600' : 'text-red-500'
              }>
                {q.status === 'published' ? 'Publicada' : q.status === 'draft' ? 'Borrador' : 'Inactiva'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEditing(q)}
              className="w-full text-left text-xs text-[#1A1A1A] line-clamp-2 hover:underline"
            >
              {extractPreview(q)}
            </button>
            {(q.attempts_count ?? 0) > 0 && (
              <div className="text-[10px] text-gray-400">
                {q.attempts_count} respuestas · {Math.round(((q.correct_count ?? 0) / (q.attempts_count ?? 1)) * 100)}% acierto
                {(q.feedback_up ?? 0) + (q.feedback_down ?? 0) > 0 && (
                  <> · 👍 {q.feedback_up} · 👎 {q.feedback_down}</>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      {editing && (
        <QuestionFormModal
          mode="edit"
          question={editing as unknown as Question}
          clubId={editing.club_id}
          useAdminEndpoints
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
