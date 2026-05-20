import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit, HelpCircle, Trash2, AlertTriangle, CheckSquare, Check, FileText, PowerOff, Send, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { learningContentService, hasUnreadNotes, summarizeFeedback, summarizeAttempts } from '../../../services/learningContent';
import { QuestionFormModal } from './QuestionFormModal';
import { QuestionStatsModal } from './QuestionStatsModal';
import { FilterDropdown } from './FilterDropdown';
import { StatusSwitcher } from './StatusSwitcher';
import { SearchInput } from './SearchInput';
import { Paginator } from './Paginator';
import { usePageSizePref } from './usePageSizePref';
import { BulkActionsBar, type BulkAction } from './BulkActionsBar';
import { LevelFilter } from './LevelFilter';
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
  // Aviso al padre de que el contenido del club ha cambiado (editar, borrar,
  // cambio de estado). Útil para refrescar contadores que dependen del estado
  // global (ej. avisos abiertos).
  onContentChanged?: () => void;
}

export function QuestionsTab({ clubId, onUnreadCountChange, onContentChanged }: QuestionsTabProps) {
  const { t } = useTranslation();
  // URL params como fuente de verdad para filtros + paginación. Permite linkar
  // a vistas concretas y conserva estado entre refrescos del navegador.
  const [searchParams, setSearchParams] = useSearchParams();
  const typeFilter = (searchParams.get('type') ?? 'all') as QuestionType | 'all';
  const areaFilter = (searchParams.get('area') ?? 'all') as QuestionArea | 'all';
  const statusFilter = (searchParams.get('status') ?? 'published') as 'all' | 'draft' | 'published' | 'inactive';
  const videoFilter = (searchParams.get('video') ?? 'all') as 'all' | 'with_video' | 'without_video';
  const search = searchParams.get('q') ?? '';
  const orderBy = (searchParams.get('order') ?? 'created_desc') as 'created_desc' | 'created_asc';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const levelMin = searchParams.get('lmin') ? Number(searchParams.get('lmin')) : null;
  const levelMax = searchParams.get('lmax') ? Number(searchParams.get('lmax')) : null;
  const levelRange = levelMin !== null && levelMax !== null ? { min: levelMin, max: levelMax } : null;

  // Helper para mutar query params manteniendo el resto. Cualquier cambio de
  // filtro resetea a page=1.
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

  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  // Preferencia por club: un admin con varios clubs puede preferir distintos
  // tamaños de página según el volumen de cada uno.
  const [pageSize, setPageSize] = usePageSizePref(`questions:club:${clubId}`);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; question?: Question } | null>(null);
  const [statsQuestion, setStatsQuestion] = useState<Question | null>(null);
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

  // Salimos de selección al paginar — las cards de la nueva página no muestran
  // check y mantener IDs huérfanos en el contador es confuso.
  useEffect(() => {
    if (selectionMode) exitSelectionMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Ref a un setter externo (lo provee LearningContentView) para que el badge
  // sobre la tab "Preguntas" use el contador EXACTO calculado por el backend,
  // independientemente de los filtros que el usuario tenga aplicados aquí.
  const onUnreadCountChangeRef = useRef<((n: number) => void) | undefined>();

  // Variante silent: no marca loading=true para evitar que la lista se vacíe
  // y el scroll salte arriba tras una acción puntual.
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const filters: Parameters<typeof learningContentService.listQuestions>[1] = {
        status: statusFilter,
        order_by: orderBy,
        page,
        page_size: pageSize,
      };
      if (typeFilter !== 'all') filters.type = typeFilter;
      if (areaFilter !== 'all') filters.area = areaFilter;
      if (search) filters.search = search;
      if (levelRange) { filters.elo_min = levelRange.min; filters.elo_max = levelRange.max; }
      const { data, unread_count, total } = await learningContentService.listQuestions(clubId, filters);
      setQuestions(data);
      setTotal(total);
      onUnreadCountChangeRef.current?.(unread_count);
    } catch (e) {
      toast.error((e as Error).message || t('learning_save_error'));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [clubId, typeFilter, areaFilter, statusFilter, search, orderBy, page, pageSize, levelRange, t]);

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
      onContentChanged?.();
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
      onContentChanged?.();
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
    onContentChanged?.();
  };

  // Helper genérico para acciones bulk (club). Patrón idéntico al de admin.
  const runBulk = async (
    label: string,
    fn: (id: string, q: Question) => Promise<unknown>,
    optimisticPatch?: (q: Question) => Partial<Question>,
  ) => {
    const items = questions.filter((q) => selectedIds.has(q.id));
    if (items.length === 0) return;
    const snapshot = new Map(items.map((q) => [q.id, q]));
    if (optimisticPatch) {
      for (const q of items) patchLocal(q.id, optimisticPatch(q));
    }
    const results = await Promise.allSettled(items.map((q) => fn(q.id, q)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const ko = results.length - ok;
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
    onContentChanged?.();
  };

  const handleBulkPublish = () => runBulk(
    'Publicadas',
    (id, q) => q.status === 'inactive'
      ? learningContentService.activateQuestion(id)
      : learningContentService.updateQuestion(id, { status: 'published' }),
    () => ({ status: 'published' }),
  );
  const handleBulkDraft = () => runBulk(
    'Movidas a borrador',
    (id) => learningContentService.updateQuestion(id, { status: 'draft' }),
    () => ({ status: 'draft' }),
  );
  const handleBulkInactivate = () => runBulk(
    'Desactivadas',
    (id, q) => q.status === 'published'
      ? learningContentService.deactivateQuestion(id)
      : learningContentService.updateQuestion(id, { status: 'inactive' }),
    () => ({ status: 'inactive' }),
  );
  const handleBulkDelete = async () => {
    const items = questions.filter((q) => selectedIds.has(q.id) && q.status !== 'published');
    if (items.length === 0) {
      toast.error('Solo se pueden borrar borradores o inactivas. Quita las publicadas de la selección o cambia su estado primero.');
      return;
    }
    const ok = window.confirm(`¿Borrar definitivamente ${items.length} pregunta${items.length === 1 ? '' : 's'}?\n\nEsta acción no se puede deshacer.`);
    if (!ok) return;
    const snapshot = questions;
    setQuestions((prev) => prev.filter((q) => !items.some((it) => it.id === q.id)));
    const results = await Promise.allSettled(items.map((q) => learningContentService.deleteQuestion(q.id)));
    const succ = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - succ;
    if (fail === 0) toast.success(`Borradas: ${succ}/${items.length}`);
    else { setQuestions(snapshot); toast.error(`Borradas: ${succ}/${items.length} (${fail} fallos)`); }
    exitSelectionMode();
    onContentChanged?.();
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

      {/* Dos filas: filtros arriba y abajo orden + buscador + selección. */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-gray-400 uppercase mr-1">Filtros:</span>
          <FilterDropdown
            label="Tipo"
            value={typeFilter}
            allValue="all"
            options={[
              { value: 'all' as const, label: t('learning_filter_all_types') },
              ...QUESTION_TYPES.map((qt) => ({ value: qt, label: t(`learning_type_${qt}`) })),
            ]}
            onChange={(v) => updateParam({ type: v === 'all' ? null : v })}
          />
          <FilterDropdown
            label="Área"
            value={areaFilter}
            allValue="all"
            options={[
              { value: 'all' as const, label: t('learning_filter_all_areas') },
              ...QUESTION_AREAS.map((qa) => ({ value: qa, label: t(`learning_area_${qa}`) })),
            ]}
            onChange={(v) => updateParam({ area: v === 'all' ? null : v })}
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
            onChange={(v) => updateParam({ status: v === 'published' ? null : v })}
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
            onChange={(v) => updateParam({ video: v === 'all' ? null : v })}
          />
          <LevelFilter
            value={levelRange}
            onChange={(r) => updateParam({ lmin: r ? String(r.min) : null, lmax: r ? String(r.max) : null })}
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
            onChange={(v) => updateParam({ order: v === 'created_desc' ? null : v })}
          />
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
            const checked = selectedIds.has(q.id);
            return (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={selectionMode ? () => toggleSelect(q.id) : undefined}
              className={`bg-white rounded-2xl border-2 p-4 space-y-3 ${
                selectionMode
                  ? `cursor-pointer ${checked ? 'border-indigo-400 bg-indigo-50/30' : 'border-gray-100 hover:border-gray-200'}`
                  : unread
                    ? 'border-amber-300 shadow-sm'
                    : q.status === 'published'
                      ? 'border-gray-100'
                      : 'border-gray-100 opacity-60'
              }`}
            >
              {/* Badges (sin chip de estado: vive en el StatusSwitcher abajo). */}
              <div className="flex items-center gap-2 flex-wrap">
                {selectionMode && (
                  <span className="flex items-center justify-center w-5 h-5 rounded-md border-2 border-indigo-300 bg-white">
                    {checked && <Check className="w-3 h-3 text-indigo-500" />}
                  </span>
                )}
                {unread && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-bold">
                    <AlertTriangle className="w-3 h-3" />
                    Notas nuevas
                  </span>
                )}
                {selectionMode && (
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                    q.status === 'published' ? 'bg-emerald-50 text-emerald-700' :
                    q.status === 'draft' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
                  }`}>
                    {q.status === 'published' ? 'Publicada' : q.status === 'draft' ? 'Borrador' : 'Inactiva'}
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
                const at = summarizeAttempts(q);
                const fb = summarizeFeedback(q);
                // Stats solo si hay muestra suficiente. Por debajo del umbral
                // no enseñamos nada para no inducir señal falsa.
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

              {/* Acciones: ocultas en modo selección. */}
              {!selectionMode && (
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
                <button
                  type="button"
                  onClick={() => setStatsQuestion(q)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-50 text-[#1A1A1A] text-[10px] font-bold hover:bg-gray-100 transition-all"
                  title="Ver estadísticas detalladas"
                >
                  <BarChart3 className="w-3 h-3" />
                  Stats
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
              )}
            </motion.div>
            );
          })}
        </div>
      )}

      {/* Paginador: solo si hay más de una página. */}
      <Paginator
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => updateParam({ page: p === 1 ? null : String(p) }, false)}
        onPageSizeChange={(s) => { setPageSize(s); updateParam({}); }}
      />

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

      {statsQuestion && (
        <QuestionStatsModal
          questionId={statsQuestion.id}
          onClose={() => setStatsQuestion(null)}
        />
      )}
    </div>
  );
}
