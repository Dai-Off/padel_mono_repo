import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2, Upload, Video, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { learningContentService, validateVideo, VIDEO_LIMITS } from '../../../services/learningContent';
import { adminLearningService } from '../../../services/adminLearning';
import { PuzzleEditor } from './PuzzleEditor/PuzzleEditor';
import { validatePuzzleContentAll } from '../../../lib/puzzleValidator';
import type {
  Question,
  QuestionType,
  QuestionArea,
  QuestionContent,
  TestClassicContent,
  TrueFalseContent,
  MultiSelectContent,
  MatchColumnsContent,
  OrderSequenceContent,
  PuzzleContent,
} from '../../../types/learningContent';

const QUESTION_TYPES: QuestionType[] = ['test_classic', 'true_false', 'multi_select', 'match_columns', 'order_sequence', 'puzzle'];
const QUESTION_AREAS: QuestionArea[] = ['technique', 'tactics', 'physical', 'mental', 'rules'];

// Plantilla mínima válida para un puzzle nuevo (cumple validatePuzzleContent del backend).
const PUZZLE_TEMPLATE: PuzzleContent = {
  schema_version: 2,
  statement: '',
  initial_frame: {
    players: [
      { id: 1, team: 1, x: 3, y: 15, is_user: true },
      { id: 2, team: 1, x: 7, y: 15 },
      { id: 3, team: 2, x: 3, y: 5 },
      { id: 4, team: 2, x: 7, y: 5 },
    ],
    ball: { x: 5, y: 12 },
  },
  options: [
    { id: 1, text: 'Opción A', explanation: 'Explicación de la opción A', is_correct: true },
    { id: 2, text: 'Opción B', explanation: 'Explicación de la opción B', is_correct: false },
    { id: 3, text: 'Opción C', explanation: 'Explicación de la opción C', is_correct: false },
  ],
};

// Estado por defecto del contenido según tipo
function defaultContent(type: QuestionType): QuestionContent {
  switch (type) {
    case 'test_classic':
      return { question: '', options: ['', '', '', ''], correct_index: 0 } as TestClassicContent;
    case 'true_false':
      return { statement: '', correct_answer: true } as TrueFalseContent;
    case 'multi_select':
      return { question: '', options: ['', '', '', ''], correct_indices: [] } as MultiSelectContent;
    case 'match_columns':
      return { question: '', pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] } as MatchColumnsContent;
    case 'order_sequence':
      return { question: '', steps: ['', '', ''] } as OrderSequenceContent;
    case 'puzzle':
      return { ...PUZZLE_TEMPLATE } as PuzzleContent;
  }
}

interface Props {
  mode: 'create' | 'edit';
  question?: Question;
  clubId: string;
  onClose: () => void;
  onSaved: () => void;
  // Si true, el modal usa los endpoints admin (PUT /admin/learning/questions/:id)
  // y muestra la sección "Moderación" con checkbox "Avisar al club" + textarea.
  // Si false (default), se comporta como hasta ahora (modo club).
  useAdminEndpoints?: boolean;
}

// Plantilla por defecto cuando el admin marca "Avisar al club". Se rellena con
// la fecha del día y deja la razón en blanco para que el admin la complete.
function buildModerationNoteTemplate(): string {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  return `Modificado por admin el ${dd}/${mm}/${yyyy}. Razón: `;
}

export function QuestionFormModal({ mode, question, clubId, onClose, onSaved, useAdminEndpoints = false }: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  // Campos comunes
  const [type, setType] = useState<QuestionType>(question?.type ?? 'test_classic');
  const [level, setLevel] = useState<number | null>(question?.level ?? null);
  const [area, setArea] = useState<QuestionArea>(question?.area ?? 'technique');
  const [videoUrl, setVideoUrl] = useState(question?.video_url ?? '');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Contenido (se resetea al cambiar tipo en modo crear)
  const [content, setContent] = useState<QuestionContent>(
    question?.content ?? defaultContent(type),
  );

  // Sección "Moderación" (solo admin). Si la pregunta ya trae una nota,
  // arrancamos con el checkbox activado y la nota cargada para que el admin
  // pueda editarla o limpiarla.
  const [notifyClub, setNotifyClub] = useState<boolean>(!!question?.moderation_notes);
  const [moderationNotes, setModerationNotes] = useState<string>(question?.moderation_notes ?? '');

  const handleTypeChange = (newType: QuestionType) => {
    if (newType === type) return;
    setType(newType);
    // Siempre resetear contenido al cambiar tipo (el contenido anterior no es compatible)
    setContent(defaultContent(newType));
    // Los puzzles son siempre tácticos por definición.
    if (newType === 'puzzle') setArea('tactics');
  };

  const [dragging, setDragging] = useState(false);
  const [validating, setValidating] = useState(false);

  const processVideoFile = async (file: File) => {
    setValidating(true);
    try {
      await validateVideo(file, VIDEO_LIMITS.question);
      setVideoFile(file);
      setVideoUrl(file.name);
    } catch (e) {
      toast.error((e as Error).message);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setValidating(false);
    }
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processVideoFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) processVideoFile(file);
  };

  const removeVideo = () => {
    setVideoFile(null);
    setVideoUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Validación mínima — se exige siempre, incluso al guardar como borrador.
  // El nivel es necesario para que el algoritmo de scheduling pueda colocar
  // la pregunta cuando se publique. Sin nivel no tiene sentido siquiera el draft.
  const validateMinimal = (): string | null => {
    if (level == null) {
      return 'El nivel es obligatorio';
    }
    if (level < 0.5 || level > 6.5) {
      return 'El nivel debe estar entre 0.5 y 6.5';
    }
    return null;
  };

  // Validación completa por tipo — se exige al publicar. Para draft se salta.
  const validateFull = (): string | null => {
    switch (type) {
      case 'test_classic': {
        const c = content as TestClassicContent;
        if (!c.question.trim()) return t('learning_field_question');
        if (c.options.some((o) => !o.trim())) return t('learning_field_options');
        return null;
      }
      case 'true_false': {
        const c = content as TrueFalseContent;
        if (!c.statement.trim()) return t('learning_field_statement');
        return null;
      }
      case 'multi_select': {
        const c = content as MultiSelectContent;
        if (!c.question.trim()) return t('learning_field_question');
        if (c.options.some((o) => !o.trim())) return t('learning_field_options');
        if (c.correct_indices.length < 2 || c.correct_indices.length > 3) return t('learning_field_correct_answer');
        return null;
      }
      case 'match_columns': {
        const c = content as MatchColumnsContent;
        if (!c.question?.trim()) return t('learning_field_question');
        if (c.pairs.some((p) => !p.left.trim() || !p.right.trim()))
          return `${t('learning_field_pair_left')} / ${t('learning_field_pair_right')}`;
        return null;
      }
      case 'order_sequence': {
        const c = content as OrderSequenceContent;
        if (!c.question?.trim()) return t('learning_field_question');
        if (c.steps.some((s) => !s.trim())) return t('learning_field_step');
        return null;
      }
      case 'puzzle': {
        const all = validatePuzzleContentAll(content as PuzzleContent);
        if (all.length > 0) {
          const first = all[0].message;
          return all.length === 1
            ? first
            : `${first} (y ${all.length - 1} error${all.length - 1 === 1 ? '' : 'es'} más; revisa el banner del editor)`;
        }
        return null;
      }
    }
    return null;
  };

  // Errores del puzzle (en vivo). El banner del editor decide cuándo mostrarlos
  // (no aparece hasta el primer intento de publicar — ver hasAttemptedPublish).
  const puzzleErrors = useMemo(() => {
    if (type !== 'puzzle') return [];
    return validatePuzzleContentAll(content as PuzzleContent);
  }, [type, content]);

  // hasAttemptedPublish: se activa al primer click de "Publicar" con errores.
  // A partir de ahí, el banner del editor permanece visible y actualiza en vivo
  // hasta que se resuelven o se cierra el modal. Sirve para no asustar al
  // usuario nada más crear el puzzle con errores que aún no ha tenido tiempo
  // de empezar a corregir.
  const [hasAttemptedPublish, setHasAttemptedPublish] = useState(false);

  const handleSave = async (saveMode: 'draft' | 'publish') => {
    const minimalErr = validateMinimal();
    if (minimalErr) {
      // Si era un intento de Publicar, activamos hasAttemptedPublish para que
      // a partir de ahora el input del nivel se pinte en rojo en vivo. En
      // borrador no, porque el usuario solo quería pausar el trabajo.
      if (saveMode === 'publish') setHasAttemptedPublish(true);
      return toast.error(minimalErr);
    }

    if (saveMode === 'publish') {
      const fullErr = validateFull();
      if (fullErr) {
        // Primer intento fallido de publicar: activamos el banner del editor
        // para que se vean todos los errores en contexto (lista + dots en tabs).
        // No spammeamos un toast en puzzle — el banner es la fuente de verdad.
        setHasAttemptedPublish(true);
        if (type === 'puzzle') return;
        return toast.error(fullErr);
      }
    }

    // Edge case: si la pregunta ya está publicada (o inactive con contenido
    // válido) y el usuario pulsa "Guardar borrador", confirmamos. Es destructivo:
    // la pregunta deja de estar accesible vía el toggle, vuelve a estado draft.
    if (saveMode === 'draft' && mode === 'edit' && question && question.status !== 'draft') {
      const ok = window.confirm(
        'Esto revertirá la pregunta a borrador y dejará de aparecer en las lecciones. ¿Continuar?',
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      // Vídeo opcional para todos los tipos (incluido puzzle desde el Bloque 4).
      let finalVideoUrl = videoUrl;

      if (videoFile) {
        setUploading(true);
        finalVideoUrl = await learningContentService.uploadQuestionVideo(clubId, videoFile);
        setUploading(false);
      }

      const baseBody: Record<string, unknown> = {
        club_id: clubId,
        type,
        level: level as number,
        area,
        video_url: finalVideoUrl || null,
        content,
        status: saveMode === 'draft' ? 'draft' : 'published',
      };

      // Si el admin está editando y marcó "Avisar al club", añadimos la nota.
      // Si no marcó, ponemos null explícitamente para limpiar una nota previa.
      if (useAdminEndpoints) {
        baseBody.moderation_notes = notifyClub && moderationNotes.trim() ? moderationNotes.trim() : null;
      }

      if (mode === 'create') {
        // Crear siempre va al endpoint del club (el club es siempre el dueño del contenido).
        await learningContentService.createQuestion(baseBody as Parameters<typeof learningContentService.createQuestion>[0]);
      } else if (question) {
        if (useAdminEndpoints) {
          await adminLearningService.updateQuestion(question.id, baseBody);
        } else {
          await learningContentService.updateQuestion(question.id, baseBody as Parameters<typeof learningContentService.updateQuestion>[1]);
        }
      }
      if (saveMode === 'draft') {
        toast.success('Guardado como borrador', {
          style: { background: '#fef3c7', color: '#92400e' },
        });
      } else {
        toast.success(t('learning_save_success'));
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || t('learning_save_error'));
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  // Cuando el admin marca/desmarca "Avisar al club":
  //   - Al marcar y la nota está vacía: precargamos plantilla.
  //   - Al desmarcar: NO borramos la nota (por si vuelven a marcar — se conserva
  //     en memoria local). Al guardar, si está desmarcado, se enviará null.
  const handleToggleNotify = (next: boolean) => {
    setNotifyClub(next);
    if (next && !moderationNotes.trim()) {
      setModerationNotes(buildModerationNoteTemplate());
    }
  };

  // Enter dentro de un input no debe disparar nada (los botones son explícitos).
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const isPuzzle = type === 'puzzle';
  return (
    <div className={`fixed inset-0 z-[100] bg-black/40 flex items-start justify-center overflow-y-auto px-4 ${isPuzzle ? 'pt-6 pb-6' : 'py-20'}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-white rounded-2xl w-full shadow-xl ${isPuzzle ? 'max-w-6xl' : 'max-w-lg'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-sm font-bold text-[#1A1A1A]">
            {mode === 'create' ? t('learning_add_question') : t('learning_edit_question')}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
          {/* Banner de notas de moderación. En modo club es informativo (read-only).
              En modo admin se gestiona desde la sección de moderación de abajo, así
              que no se muestra aquí para no duplicar. */}
          {!useAdminEndpoints && question?.moderation_notes && (
            <div className="flex gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-amber-700 uppercase">Notas del equipo de moderación</p>
                <p className="text-xs text-amber-800 mt-0.5 whitespace-pre-wrap">{question.moderation_notes}</p>
              </div>
            </div>
          )}

          {/* Tipo */}
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_type')}</label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            >
              {QUESTION_TYPES.map((qt) => (
                <option key={qt} value={qt}>{t(`learning_type_${qt}`)}</option>
              ))}
            </select>
          </div>

          {/* Área y Nivel — los puzzles son siempre tácticos, ocultamos el selector de área */}
          <div className={type === 'puzzle' ? '' : 'grid grid-cols-2 gap-3'}>
            {type !== 'puzzle' && (
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_area')}</label>
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value as QuestionArea)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                >
                  {QUESTION_AREAS.map((qa) => (
                    <option key={qa} value={qa}>{t(`learning_area_${qa}`)}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_level')}</label>
              <input
                type="number"
                min={0.5}
                max={6.5}
                step={0.5}
                value={level ?? ''}
                placeholder="0.5 - 6.5"
                onChange={(e) => {
                  if (e.target.value === '') {
                    setLevel(null);
                    return;
                  }
                  const val = Number(e.target.value);
                  // Solo permitir incrementos de 0.5 dentro del rango [0.5, 6.5].
                  const rounded = Math.round(val * 2) / 2;
                  setLevel(Math.max(0.5, Math.min(6.5, rounded)));
                }}
                // El borde rojo solo aparece tras el primer intento de Publicar.
                // Antes, el campo se ve neutro para no asustar al crear el puzzle.
                className={`w-full rounded-xl border px-3 py-2 text-sm ${
                  hasAttemptedPublish && (level == null || level < 0.5 || level > 6.5)
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200'
                }`}
              />
            </div>
          </div>

          {/* Vídeo opcional. Para puzzles, el vídeo se reproduce en el
              mobile antes de mostrar la pregunta (paridad con el resto de
              tipos). Si no se sube, el puzzle sigue funcionando con su
              intro_frame → initial_frame habitual. */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
              {t('learning_field_video')}
              <span className="text-gray-300 font-normal ml-1">
                (máx {VIDEO_LIMITS.question.maxSizeMB}MB, {VIDEO_LIMITS.question.maxDurationSec}s)
              </span>
              {type === 'puzzle' && (
                <span className="text-gray-300 font-normal ml-1">— opcional, intro previa</span>
              )}
            </label>
            {validating ? (
              <div className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-indigo-200 text-xs font-bold text-indigo-400">
                <div className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
                {t('learning_validating_video')}
              </div>
            ) : videoUrl ? (
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <Video className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="text-xs text-[#1A1A1A] truncate flex-1">
                  {videoFile ? videoFile.name : videoUrl.split('/').pop()}
                </span>
                <button
                  type="button"
                  onClick={removeVideo}
                  className="p-1 text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); }}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full flex items-center justify-center gap-2 py-5 rounded-xl border-2 border-dashed text-xs font-bold cursor-pointer transition-all ${
                  dragging
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-500'
                    : 'border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-500'
                }`}
              >
                <Upload className="w-4 h-4" />
                {t('learning_video_dropzone')}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleVideoSelect}
              className="hidden"
            />
          </div>

          {/* Separador */}
          <div className="border-t border-gray-100" />

          {/* Contenido dinámico según tipo */}
          {type === 'test_classic' && (
            <TestClassicFields
              content={content as TestClassicContent}
              onChange={(c) => setContent(c)}
              t={t}
            />
          )}
          {type === 'true_false' && (
            <TrueFalseFields
              content={content as TrueFalseContent}
              onChange={(c) => setContent(c)}
              t={t}
            />
          )}
          {type === 'multi_select' && (
            <MultiSelectFields
              content={content as MultiSelectContent}
              onChange={(c) => setContent(c)}
              t={t}
            />
          )}
          {type === 'match_columns' && (
            <MatchColumnsFields
              content={content as MatchColumnsContent}
              onChange={(c) => setContent(c)}
              t={t}
            />
          )}
          {type === 'order_sequence' && (
            <OrderSequenceFields
              content={content as OrderSequenceContent}
              onChange={(c) => setContent(c)}
              t={t}
            />
          )}
          {type === 'puzzle' && (
            <PuzzleEditor
              content={content as PuzzleContent}
              onChange={(c) => setContent(c)}
              showErrors={hasAttemptedPublish}
            />
          )}

          {/* Sección "Moderación" — solo en modo admin editando. Permite enviar
              una nota al club explicando por qué se ha modificado la pregunta. */}
          {useAdminEndpoints && mode === 'edit' && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
              <h4 className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Moderación</h4>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[#1A1A1A]">
                <input
                  type="checkbox"
                  checked={notifyClub}
                  onChange={(e) => handleToggleNotify(e.target.checked)}
                  className="rounded"
                />
                <span className="font-semibold">Avisar al club</span>
                <span className="text-[10px] text-gray-500">(añade una nota visible cuando el club edite la pregunta)</span>
              </label>
              {notifyClub && (
                <textarea
                  value={moderationNotes}
                  onChange={(e) => setModerationNotes(e.target.value)}
                  rows={3}
                  placeholder="Explica por qué se ha cambiado o qué debe revisar el club"
                  className="w-full rounded-xl border border-indigo-200 px-3 py-2 text-xs resize-none bg-white"
                />
              )}
            </div>
          )}

          {/* Botones */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#1A1A1A] bg-gray-50 hover:bg-gray-100 transition-all"
            >
              {t('cancel')}
            </button>
            {/* Guardar borrador: siempre disponible (no valida contenido).
                Útil para pausar trabajo en progreso sin perder lo hecho. */}
            <button
              type="button"
              disabled={saving || uploading}
              onClick={() => handleSave('draft')}
              title="Guarda el progreso sin validar contenido. No aparecerá en lecciones."
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '...' : 'Guardar borrador'}
            </button>
            {/* Publicar: siempre clicable. Si hay errores, al pulsar se activa
                el banner del editor (no deshabilitamos el botón para evitar el
                patrón "gris sin razón"). El contador con número de errores solo
                aparece después del primer intento de publicar. */}
            <button
              type="button"
              disabled={saving || uploading}
              onClick={() => handleSave('publish')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#E31E24] hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading
                ? `${t('learning_field_video')}...`
                : saving
                  ? '...'
                  : hasAttemptedPublish && type === 'puzzle' && puzzleErrors.length > 0
                    ? `Publicar (${puzzleErrors.length} error${puzzleErrors.length === 1 ? '' : 'es'})`
                    : 'Publicar'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes de contenido por tipo
// ---------------------------------------------------------------------------

type TFn = (key: string) => string;

function TestClassicFields({ content, onChange, t }: { content: TestClassicContent; onChange: (c: TestClassicContent) => void; t: TFn }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_question')}</label>
        <textarea
          value={content.question}
          onChange={(e) => onChange({ ...content, question: e.target.value })}
          rows={2}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_options')}</label>
        <div className="space-y-2">
          {content.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct_index"
                checked={content.correct_index === i}
                onChange={() => onChange({ ...content, correct_index: i as 0 | 1 | 2 | 3 })}
              />
              <input
                type="text"
                value={opt}
                onChange={(e) => {
                  const opts = [...content.options] as [string, string, string, string];
                  opts[i] = e.target.value;
                  onChange({ ...content, options: opts });
                }}
                placeholder={`${t('learning_field_option').replace('{{n}}', String(i + 1))}`}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrueFalseFields({ content, onChange, t }: { content: TrueFalseContent; onChange: (c: TrueFalseContent) => void; t: TFn }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_statement')}</label>
        <textarea
          value={content.statement}
          onChange={(e) => onChange({ ...content, statement: e.target.value })}
          rows={2}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_correct_answer')}</label>
        <div className="flex gap-2">
          {[true, false].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => onChange({ ...content, correct_answer: val })}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                content.correct_answer === val
                  ? 'bg-[#1A1A1A] text-white'
                  : 'bg-gray-50 text-[#1A1A1A]'
              }`}
            >
              {val ? t('learning_field_true') : t('learning_field_false')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MultiSelectFields({ content, onChange, t }: { content: MultiSelectContent; onChange: (c: MultiSelectContent) => void; t: TFn }) {
  const toggleIndex = (i: number) => {
    const indices = content.correct_indices.includes(i)
      ? content.correct_indices.filter((x) => x !== i)
      : content.correct_indices.length >= 3
        ? content.correct_indices
        : [...content.correct_indices, i];
    onChange({ ...content, correct_indices: indices });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_question')}</label>
        <textarea
          value={content.question}
          onChange={(e) => onChange({ ...content, question: e.target.value })}
          rows={2}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_options')}</label>
        <div className="space-y-2">
          {content.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={content.correct_indices.includes(i)}
                onChange={() => toggleIndex(i)}
                className="rounded"
              />
              <input
                type="text"
                value={opt}
                onChange={(e) => {
                  const opts = [...content.options] as [string, string, string, string];
                  opts[i] = e.target.value;
                  onChange({ ...content, options: opts });
                }}
                placeholder={`${t('learning_field_option').replace('{{n}}', String(i + 1))}`}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchColumnsFields({ content, onChange, t }: { content: MatchColumnsContent; onChange: (c: MatchColumnsContent) => void; t: TFn }) {
  const updatePair = (i: number, side: 'left' | 'right', value: string) => {
    const pairs = content.pairs.map((p, idx) => (idx === i ? { ...p, [side]: value } : p));
    onChange({ ...content, pairs });
  };

  const addPair = () => {
    if (content.pairs.length >= 5) return;
    onChange({ ...content, pairs: [...content.pairs, { left: '', right: '' }] });
  };

  const removePair = (i: number) => {
    if (content.pairs.length <= 3) return;
    onChange({ ...content, pairs: content.pairs.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_question')}</label>
        <textarea
          value={content.question ?? ''}
          onChange={(e) => onChange({ ...content, question: e.target.value })}
          rows={2}
          placeholder="Relaciona cada elemento de la izquierda con el de la derecha"
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
        />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-gray-500 uppercase">{t('learning_field_pair_left')} / {t('learning_field_pair_right')}</label>
        {content.pairs.length < 5 && (
          <button
            type="button"
            onClick={addPair}
            className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-3 h-3" />
            {t('learning_field_add_pair')}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {content.pairs.map((pair, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={pair.left}
              onChange={(e) => updatePair(i, 'left', e.target.value)}
              placeholder={t('learning_field_pair_left')}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            <span className="text-gray-300 text-xs">&rarr;</span>
            <input
              type="text"
              value={pair.right}
              onChange={(e) => updatePair(i, 'right', e.target.value)}
              placeholder={t('learning_field_pair_right')}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            {content.pairs.length > 3 && (
              <button type="button" onClick={() => removePair(i)} className="p-1 text-red-400 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderSequenceFields({ content, onChange, t }: { content: OrderSequenceContent; onChange: (c: OrderSequenceContent) => void; t: TFn }) {
  const updateStep = (i: number, value: string) => {
    const steps = content.steps.map((s, idx) => (idx === i ? value : s));
    onChange({ ...content, steps });
  };

  const addStep = () => {
    if (content.steps.length >= 6) return;
    onChange({ ...content, steps: [...content.steps, ''] });
  };

  const removeStep = (i: number) => {
    if (content.steps.length <= 3) return;
    onChange({ ...content, steps: content.steps.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{t('learning_field_question')}</label>
        <textarea
          value={content.question ?? ''}
          onChange={(e) => onChange({ ...content, question: e.target.value })}
          rows={2}
          placeholder="Ordena correctamente los siguientes pasos"
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
        />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-gray-500 uppercase">{t('learning_field_step')}</label>
        {content.steps.length < 6 && (
          <button
            type="button"
            onClick={addStep}
            className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-3 h-3" />
            {t('learning_field_add_step')}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {content.steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 w-5 text-center">{i + 1}</span>
            <input
              type="text"
              value={step}
              onChange={(e) => updateStep(i, e.target.value)}
              placeholder={`${t('learning_field_step')} ${i + 1}`}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            {content.steps.length > 3 && (
              <button type="button" onClick={() => removeStep(i)} className="p-1 text-red-400 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
